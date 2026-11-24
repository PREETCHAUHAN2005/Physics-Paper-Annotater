import taxonomy from "@/lib/data/taxonomy.json";
import type { DemoState } from "@/lib/demo-store";
import type { FinalRecord, InsightsStats, Job, JobComparison, QualityStats, TaxonomyStats } from "@/lib/types";

function finalsFor(state: DemoState, jobId: string) {
  const ids = new Set(state.units.filter((unit) => unit.jobId === jobId).map((unit) => unit.id));
  return state.finals.filter((record) => ids.has(record.unitId));
}
const average = (records: FinalRecord[]) => records.length ? records.reduce((total, item) => total + item.confidence, 0) / records.length : 0;
function distribution(records: FinalRecord[], field: "chapter" | "difficulty" | "bloom" | "language") {
  const result: Record<string, number> = {};
  for (const item of records) result[item.payload[field]] = (result[item.payload[field]] ?? 0) + 1;
  return result;
}
const unmeasured = () => ({ value: 0, label: "Not measured in rule mode", tone: "warn" as const, n: 0 });

export function qualityFor(state: DemoState, job: Job): QualityStats {
  const records = finalsFor(state, job.id);
  const units = state.units.filter((unit) => unit.jobId === job.id);
  const latency: QualityStats["latency"] = {};
  for (const unit of units) for (const draft of state.drafts[unit.id] ?? []) {
    const value = draft.latencyMs ?? 0;
    const previous = latency[draft.agent];
    if (!previous) latency[draft.agent] = { avg: value, min: value, max: value, count: 1, p95: value };
    else latency[draft.agent] = { avg: (previous.avg * previous.count + value) / (previous.count + 1), min: Math.min(previous.min, value), max: Math.max(previous.max, value), count: previous.count + 1, p95: Math.max(previous.max, value) };
  }
  const events: Record<string, number> = {};
  for (const event of state.events.filter((item) => item.jobId === job.id)) events[event.kind] = (events[event.kind] ?? 0) + 1;
  return {
    job, totals: { units: units.length, finals: records.length, auto: 0, human: records.length, reviewed: records.filter((item) => item.reviewerAction).length, honeypots: 0 },
    rates: { autoRate: 0, hoursSaved: 0, manualMinutes: 0, actualMinutes: 0 },
    kappa: { chapter: unmeasured(), difficulty: unmeasured() },
    honeypot: { perAgent: {}, total: 0, pass: 0, fail: 0 }, events,
    distributions: { chapter: distribution(records, "chapter"), difficulty: distribution(records, "difficulty"), bloom: distribution(records, "bloom"), language: distribution(records, "language") },
    latency,
    confidenceBuckets: [{ label: "0–0.4", count: records.filter((item) => item.confidence < 0.4).length }, { label: "0.4–0.6", count: records.filter((item) => item.confidence >= 0.4 && item.confidence < 0.6).length }, { label: "0.6–0.8", count: records.filter((item) => item.confidence >= 0.6).length }],
    avgConfByChapter: Object.entries(distribution(records, "chapter")).map(([chapter, count]) => ({ chapter, count, avg: average(records.filter((item) => item.payload.chapter === chapter)) })),
  };
}

function comparisons(state: DemoState): JobComparison[] {
  return state.jobs.map((job) => {
    const records = finalsFor(state, job.id);
    return { id: job.id, filename: job.filename, status: job.status, unitCount: job.unitCount, finals: records.length, auto: 0, human: records.length, reviewed: job.reviewedCount, autoRate: 0, avgConfidence: average(records), honeypots: 0, honeypotPass: 0, honeypotFail: 0, honeypotAccuracy: 0, kappaChapter: unmeasured(), distDifficulty: distribution(records, "difficulty") };
  });
}

function taxonomyStats(state: DemoState): TaxonomyStats {
  const records = state.finals;
  const chapters = taxonomy.chapters.map((name) => {
    const matching = records.filter((item) => item.payload.chapter === name);
    const concepts: Record<string, number> = {};
    for (const item of matching) for (const concept of item.payload.concepts) concepts[concept] = (concepts[concept] ?? 0) + 1;
    return { name, count: matching.length, autoCount: 0, humanCount: matching.length, avgConfidence: average(matching), autoRate: 0, difficulties: distribution(matching, "difficulty"), blooms: distribution(matching, "bloom"), topConcepts: Object.entries(concepts).map(([concept, count]) => ({ concept, count })).sort((a, b) => b.count - a.count).slice(0, 5) };
  });
  return { chapters, totalChapters: chapters.length, coveredChapters: chapters.filter((item) => item.count).length, totalQuestions: records.length };
}

function insights(state: DemoState): InsightsStats {
  let cumulativeUnits = 0;
  let cumulativeHuman = 0;
  const trends = [...state.jobs].reverse().map((job) => {
    const records = finalsFor(state, job.id);
    cumulativeUnits += job.unitCount;
    cumulativeHuman += records.length;
    return { jobId: job.id, filename: job.filename, createdAt: job.createdAt, units: job.unitCount, auto: 0, human: records.length, reviewed: job.reviewedCount, autoRate: 0, avgConfidence: average(records), honeypotAccuracy: 0, kappa: 0, hoursSaved: 0, cumulativeUnits, cumulativeAuto: 0, cumulativeHuman, cumulativeHours: 0 };
  });
  return {
    summary: { totalJobs: state.jobs.length, totalUnits: state.units.length, totalAuto: 0, totalHuman: state.finals.length, overallAutoRate: 0, overallAvgConf: average(state.finals), totalHoursSaved: 0 },
    trends,
    distributions: { difficulty: distribution(state.finals, "difficulty"), bloom: distribution(state.finals, "bloom"), language: distribution(state.finals, "language") },
  };
}

export function aggregateRequest(state: DemoState, url: URL): unknown {
  switch (url.pathname) {
    case "/api/health": return { status: "healthy", jobs: state.jobs.length, activeJobs: state.jobs.filter((job) => job.status === "labeling").length, totalUnits: state.units.length, pendingUnits: state.units.filter((unit) => unit.status === "pending").length, labeledUnits: state.units.filter((unit) => unit.status === "labeled").length, reviewedUnits: state.units.filter((unit) => unit.status === "reviewed").length, agentsAvailable: 5, dbConnected: true };
    case "/api/compare": return { jobs: comparisons(state) };
    case "/api/taxonomy": return taxonomyStats(state);
    case "/api/insights": return insights(state);
    case "/api/activity": {
      const events = state.events.filter((event) => (!url.searchParams.get("jobId") || event.jobId === url.searchParams.get("jobId")) && (!url.searchParams.get("kind") || event.kind === url.searchParams.get("kind")))
        .map((event) => ({ ...event, jobFilename: state.jobs.find((job) => job.id === event.jobId)?.filename, stem: state.units.find((unit) => unit.id === event.unitId)?.stem }));
      return { events, total: events.length, kinds: [...new Set(state.events.map((event) => event.kind))] };
    }
    case "/api/search": {
      const query = url.searchParams.get("q")?.trim() ?? "";
      if (query.length < 2) return { results: [], total: 0, query };
      const results = state.finals.flatMap((record) => {
        const unit = state.units.find((item) => item.id === record.unitId);
        const fields = { stem: record.payload.stem, chapter: record.payload.chapter, concepts: record.payload.concepts.join(" "), difficulty: record.payload.difficulty, language: record.payload.language };
        const matchedFields = Object.entries(fields).filter(([, value]) => value.toLowerCase().includes(query.toLowerCase())).map(([field]) => field);
        return unit && matchedFields.length ? [{ ...record, finalId: record.id, jobId: unit.jobId, matchedFields }] : [];
      });
      return { results, total: results.length, query };
    }
    default: throw new Error("This demo operation is unavailable: " + url.pathname);
  }
}
