import { CHAPTERS, UnitAnnotation as AnnotationSchema } from "@/lib/schemas";
import { SAMPLE_PAPERS } from "@/lib/data/sample-papers";
import { extractOptions, requireSegments } from "@/lib/questions";
import { heuristicDifficulty, heuristicLanguage, heuristicMath, taxonomyEvidence } from "@/lib/heuristics";
import { mutateState, readState, type DemoState } from "@/lib/demo-store";
import type { Draft, FinalRecord, Job, PipelineEvent, UnitAnnotation } from "@/lib/types";

const listeners = new Map<string, Set<(event: PipelineEvent) => void>>();
const running = new Map<string, Promise<void>>();
const emit = (jobId: string, type: string, data: Record<string, unknown>) => {
  const event = { jobId, type, ts: Date.now(), data };
  for (const handler of listeners.get(jobId) ?? []) handler(event);
};

export function subscribeDemo(jobId: string, handler: (event: PipelineEvent) => void): () => void {
  const handlers = listeners.get(jobId) ?? new Set();
  handlers.add(handler);
  listeners.set(jobId, handlers);
  void readState().then((state) => {
    if (!handlers.has(handler)) return;
    const job = state.jobs.find((item) => item.id === jobId);
    if (!job) return;
    const units = state.units.filter((unit) => unit.jobId === jobId);
    handler({ jobId, type: "snapshot", ts: Date.now(), data: {
      units: units.map((unit) => {
        const final = state.finals.find((item) => item.unitId === unit.id);
        return { ...unit, draftCount: state.drafts[unit.id]?.length ?? 0, route: final?.route ?? null, confidence: final?.confidence ?? null };
      }),
    } });
    handler({ jobId, type: "job:progress", ts: Date.now(), data: { done: state.finals.filter((item) => units.some((unit) => unit.id === item.unitId)).length, total: units.length } });
    handler({ jobId, type: "job:status", ts: Date.now(), data: { status: job.status === "labeling" && !running.has(jobId) ? "pending" : job.status, total: job.unitCount, auto: job.autoCount, human: job.humanCount } });
  }).catch(() => handler({ jobId, type: "job:status", ts: Date.now(), data: { status: "failed", error: "Cannot load saved pipeline state." } }));
  return () => {
    handlers.delete(handler);
    if (!handlers.size) listeners.delete(jobId);
  };
}

function getJob(state: DemoState, id: string): Job {
  const job = state.jobs.find((item) => item.id === id);
  if (!job) throw new Error("Paper not found. Select a saved paper.");
  return job;
}

function addEvent(state: DemoState, jobId: string, kind: string, detail: string, unitId: string | null = null, seq: number | null = null) {
  state.events.unshift({ id: crypto.randomUUID(), type: kind, jobId, unitId, seq, kind, detail, createdAt: new Date().toISOString() });
  state.events = state.events.slice(0, 1000);
}

export type CreatePaperInput = { mode: "sample" | "paste" | "file"; paperId?: string; text?: string; filename?: string };

async function createPaper(body: CreatePaperInput) {
  return mutateState((state) => {
    let specs: { seq: number; page: number; stem: string; rawText: string; options: string[] | null; label?: string }[];
    let filename: string;
    if (body.mode === "sample") {
      const paper = SAMPLE_PAPERS.find((item) => item.id === body.paperId);
      if (!paper) throw new Error("Choose a valid sample paper.");
      filename = paper.filename;
      specs = paper.units.map((unit) => ({ ...unit, rawText: unit.stem }));
    } else {
      if (typeof body.text !== "string") throw new Error("Paper text is required.");
      filename = String(body.filename || "physics-paper.txt").slice(0, 160);
      specs = requireSegments(body.text).map((segment) => ({ ...segment, options: extractOptions(segment.stem) }));
    }
    const job: Job = {
      id: crypto.randomUUID(), filename, source: body.mode === "sample" ? "sample" : body.mode === "file" ? "file" : "paste",
      status: "pending", unitCount: specs.length, autoCount: 0, humanCount: 0, reviewedCount: 0, createdAt: new Date().toISOString(),
    };
    state.jobs.unshift(job);
    state.units.push(...specs.map((spec) => ({
      id: crypto.randomUUID(), jobId: job.id, seq: spec.seq, page: spec.page, rawText: spec.rawText, stem: spec.stem,
      sourceLabel: spec.label ?? String(spec.seq), optionsJson: spec.options ? JSON.stringify(spec.options) : null,
      isHoneypot: false, attempt: 0, status: "pending",
    })));
    addEvent(state, job.id, "paper_created", "Created " + specs.length + " questions; all source questions preserved.");
    return { job };
  });
}

async function executePipeline(jobId: string) {
  try {
    await mutateState((state) => {
      getJob(state, jobId).status = "labeling";
      addEvent(state, jobId, "pipeline_started", "Browser rule stages started; no model calls.");
    });
    emit(jobId, "job:status", { status: "labeling" });
    const initial = await readState();
    const units = initial.units.filter((unit) => unit.jobId === jobId);
    let done = initial.finals.filter((final) => units.some((unit) => unit.id === final.unitId)).length;
    for (const unit of units) {
      if (initial.finals.some((item) => item.unitId === unit.id)) continue;
      const start = performance.now();
      emit(jobId, "unit:start", { unitId: unit.id, seq: unit.seq, attempt: 1 });
      const stem = unit.stem || unit.rawText;
      const evidence = taxonomyEvidence(stem);
      const difficulty = heuristicDifficulty(stem);
      const math = heuristicMath(stem);
      const language = heuristicLanguage(stem);
      const checks = { passed: evidence.chapter !== "Unclassified" && !evidence.ambiguous, failures: evidence.chapter === "Unclassified" ? ["No supported topic keywords found. Choose the chapter during review."] : evidence.ambiguous ? ["Multiple plausible topics; reviewer must choose."] : [] };
      const annotation: UnitAnnotation = {
        unit_id: unit.id, stem, options: unit.optionsJson ? JSON.parse(unit.optionsJson) : null, subject: "physics",
        chapter: evidence.chapter, concepts: evidence.concepts, ...difficulty, ...math, ...language,
        confidence: evidence.evidenceScore, agreement: 0, route: "human",
      };
      const outputs: [Draft["agent"], object][] = [
        ["taxonomy", { chapter: evidence.chapter, concepts: evidence.concepts, alternatives: evidence.alternatives }],
        ["difficulty", difficulty], ["math", math], ["language", language], ["critic", checks],
      ];
      const drafts = outputs.map(([agent, payload]) => {
        emit(jobId, "agent:start", { unitId: unit.id, agent, sampleIdx: 0 });
        const draft: Draft = { id: crypto.randomUUID(), agent, sampleIdx: 0, attempt: 1, payload: { ...payload, __engine: "rules-v1" }, latencyMs: Math.max(0, Math.round(performance.now() - start)), createdAt: new Date().toISOString() };
        emit(jobId, "agent:done", { unitId: unit.id, agent, sampleIdx: 0, ok: true, latencyMs: draft.latencyMs });
        return draft;
      });
      await mutateState((state) => {
        const saved = state.units.find((item) => item.id === unit.id);
        if (!saved) throw new Error("Paper was removed during annotation.");
        saved.status = "labeled";
        saved.attempt = 1;
        state.drafts[unit.id] = drafts;
        state.finals = state.finals.filter((item) => item.unitId !== unit.id);
        state.finals.push({ id: crypto.randomUUID(), unitId: unit.id, seq: unit.seq, isHoneypot: false, payload: annotation, confidence: annotation.confidence, agreement: 0, route: "human", reviewedBy: null, reviewerAction: null, reviewNote: null });
        getJob(state, jobId).humanCount = state.finals.filter((item) => units.some((u) => u.id === item.unitId)).length;
        addEvent(state, jobId, checks.passed ? "rule_suggestion" : "needs_review", JSON.stringify({ engine: "rules-v1", chapter: annotation.chapter, failures: checks.failures }), unit.id, unit.seq);
      });
      emit(jobId, "unit:merge", { unitId: unit.id, seq: unit.seq, mergedChapter: annotation.chapter, mergedDifficulty: annotation.difficulty });
      emit(jobId, "critic:done", { unitId: unit.id, ...checks });
      emit(jobId, "unit:route", { unitId: unit.id, seq: unit.seq, route: "human", confidence: annotation.confidence, agreement: 0 });
      emit(jobId, "job:progress", { done: ++done, total: units.length });
      await new Promise((resolve) => setTimeout(resolve, 0)); // yield for UI paint, not artificial progress
    }
    await mutateState((state) => {
      const job = getJob(state, jobId);
      job.status = job.reviewedCount === job.unitCount ? "done" : "review";
      job.autoCount = 0;
      job.humanCount = units.length;
      addEvent(state, jobId, "pipeline_finished", "All suggestions saved. Human review is required before export.");
    });
    emit(jobId, "job:status", { status: "review", auto: 0, human: units.length, total: units.length });
  } catch (error) {
    await mutateState((state) => { const job = state.jobs.find((item) => item.id === jobId); if (job) job.status = "failed"; });
    emit(jobId, "job:status", { status: "failed", error: error instanceof Error ? error.message : "Annotation failed." });
    throw error;
  }
}

export function runDemoPipeline(jobId: string): Promise<void> {
  const existing = running.get(jobId);
  if (existing) return existing;
  const work = async () => {
    if (typeof navigator !== "undefined" && navigator.locks) {
      return navigator.locks.request("annotateiq-pipeline-" + jobId, { ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error("This paper is already running in another tab.");
        await executePipeline(jobId);
      });
    }
    await executePipeline(jobId);
  };
  const task = work().finally(() => running.delete(jobId));
  running.set(jobId, task);
  return task;
}

export function paperFinals(state: DemoState, id: string): FinalRecord[] {
  const ids = new Set(state.units.filter((unit) => unit.jobId === id).map((unit) => unit.id));
  return state.finals.filter((item) => ids.has(item.unitId)).sort((a, b) => a.seq - b.seq);
}

async function reviewUnit(unitId: string, body: { action?: string; editedPayload?: unknown; note?: string; reviewer?: string }) {
  if (!["accept", "edit", "reject"].includes(body.action ?? "")) throw new Error("Choose accept, edit, or reject.");
  return mutateState((state) => {
    const unit = state.units.find((item) => item.id === unitId);
    const final = state.finals.find((item) => item.unitId === unitId);
    if (!unit || !final) throw new Error("Run the pipeline before reviewing.");
    const action = body.action as "accept" | "edit" | "reject";
    if (action === "edit") {
      const edited = AnnotationSchema.parse(body.editedPayload);
      if (!CHAPTERS.includes(edited.chapter)) throw new Error("Choose one of the 29 supported chapters.");
      // Preserve source text, identity, measured fields and routing.
      final.payload = { ...edited, unit_id: unit.id, stem: unit.stem || unit.rawText, options: final.payload.options, confidence: final.confidence, agreement: final.agreement, route: final.route };
    }
    if (action === "accept" && !CHAPTERS.includes(final.payload.chapter)) throw new Error("This question is unclassified. Edit it and choose a supported chapter first.");
    final.reviewerAction = action;
    final.reviewedBy = String(body.reviewer || "reviewer").slice(0, 80);
    final.reviewNote = body.note?.slice(0, 2000) ?? null;
    unit.status = "reviewed";
    const job = getJob(state, unit.jobId);
    const finals = paperFinals(state, job.id);
    job.reviewedCount = finals.filter((item) => item.reviewerAction).length;
    job.status = finals.length === job.unitCount && job.reviewedCount === job.unitCount ? "done" : "review";
    addEvent(state, job.id, "review_" + action, final.reviewNote || action, unitId, unit.seq);
    return { ok: true };
  });
}

export async function demoRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const parsed = new URL(url, "https://annotateiq.local");
  const parts = parsed.pathname.split("/").filter(Boolean);
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
  if (parts[1] === "jobs" && parts.length === 2 && method === "POST") return await createPaper(body) as T;
  if (parts[1] === "units" && parts[3] === "review" && method === "POST") return await reviewUnit(parts[2], body) as T;
  if (parts[1] === "jobs" && parts[3] === "run" && method === "POST") {
    await runDemoPipeline(parts[2]);
    return { ok: true, job: getJob(await readState(), parts[2]) } as T;
  }
  if (parts[1] === "jobs" && (method === "DELETE" || parts[3] === "reset")) {
    if (running.has(parts[2])) throw new Error("Wait for this paper to finish before resetting or deleting it.");
    return await mutateState((state) => {
      const job = getJob(state, parts[2]);
      const ids = new Set(state.units.filter((unit) => unit.jobId === job.id).map((unit) => unit.id));
      state.finals = state.finals.filter((item) => !ids.has(item.unitId));
      for (const id of ids) delete state.drafts[id];
      state.events = state.events.filter((item) => item.jobId !== job.id);
      if (method === "DELETE") {
        state.jobs = state.jobs.filter((item) => item.id !== job.id);
        state.units = state.units.filter((item) => item.jobId !== job.id);
      } else {
        Object.assign(job, { status: "pending", autoCount: 0, humanCount: 0, reviewedCount: 0 });
        state.units.filter((unit) => ids.has(unit.id)).forEach((unit) => { unit.status = "pending"; unit.attempt = 0; });
      }
      return { ok: true };
    }) as T;
  }
  const state = await readState();
  if (parts[1] === "jobs") {
    if (parts.length === 2) return { jobs: state.jobs.map((job) => job.status === "labeling" && !running.has(job.id) ? { ...job, status: "pending" } : job) } as T;
    const job = getJob(state, parts[2]);
    const finals = paperFinals(state, job.id);
    const units = state.units.filter((unit) => unit.jobId === job.id);
    switch (parts[3]) {
      case undefined: return { job } as T;
      case "units": return { units: units.map((unit) => ({ ...unit, final: finals.find((item) => item.unitId === unit.id) ?? null })) } as T;
      case "finals": return { finals } as T;
      case "drafts": {
        const unit = units.find((item) => item.id === parts[4]);
        if (!unit) throw new Error("Question not found in this paper.");
        return { unit: { ...unit, options: unit.optionsJson ? JSON.parse(unit.optionsJson) : null, goldPayload: null }, drafts: state.drafts[unit.id] ?? [], final: finals.find((item) => item.unitId === unit.id) ?? null } as T;
      }
      case "review": {
        const all = finals.filter((item) => item.route === "human");
        const queue = all.filter((item) => !parsed.searchParams.has("unreviewed") || !item.reviewerAction).map((item) => ({ ...item, stem: item.payload.stem, options: item.payload.options }));
        return { queue, total: all.length, reviewed: all.filter((item) => item.reviewerAction).length } as T;
      }
      case "honeypots": return { honeypots: [], total: 0 } as T;
      case "quality": {
        const { qualityFor } = await import("@/lib/demo-stats");
        return qualityFor(state, job) as T;
      }
    }
  }
  const { aggregateRequest } = await import("@/lib/demo-stats");
  return aggregateRequest(state, parsed) as T;
}
