import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { segmentText, extractOptions, requireSegments } from "../src/lib/questions";
import { heuristicTaxonomy, heuristicDifficulty, heuristicMath, heuristicLanguage } from "../src/lib/heuristics";
import { demoRequest } from "../src/lib/demo-engine";
import { readState, mutateState } from "../src/lib/demo-store";
import { exportRecords, isExportable } from "../src/lib/exports";
import type { FinalRecord, Job, Unit } from "../src/lib/types";

const call = demoRequest;
test("question boundaries preserve duplicates, source labels, options, and PDF page numbers", () => {
  const input = "Instructions\nQ.1) A resistor obeys Ohm's law.\n(a) 2 (b) 4 (c) 6 (d) 8\n2. A capacitor stores charge.\n\f\nQuestion 1: A convex lens forms an image.\n3.14 is a decimal, not a new question.";
  const parts = segmentText(input);
  assert.equal(parts.length, 3);
  assert.deepEqual(parts.map((part) => part.seq), [1, 2, 3]);
  assert.deepEqual(parts.map((part) => part.label), ["1", "2", "1"]);
  assert.equal(parts[2].page, 2);
  assert.match(parts[0].rawText, /Ohm/);
  assert.deepEqual(extractOptions(parts[0].stem), ["2", "4", "6", "8"]);
  assert.match(parts[2].stem, /3.14/);
  assert.equal(extractOptions("A. is a point in a diagram."), null);
});

test("invalid, empty, oversized, or excessive input fails explicitly", () => {
  assert.throws(() => requireSegments("a paper with no question numbers"), /No numbered/);
  assert.throws(() => segmentText("x".repeat(250_001)), /250,000/);
  assert.throws(() => segmentText(Array.from({ length: 201 }, (_, i) => i + 1 + ". A resistor has resistance.").join("\n")), /200 questions/);
  assert.equal(segmentText("1.234 is a value.\n2.56 is another value.").length, 0);
});

test("rule suggestions are deterministic and unsupported text is unclassified", () => {
  const text = "Find the resistance of an ohmic resistor in a circuit.";
  for (let i = 0; i < 30; i++) {
    assert.deepEqual(heuristicTaxonomy(text, 2), heuristicTaxonomy(text, 0));
    assert.deepEqual(heuristicDifficulty(text, 2), heuristicDifficulty(text, 0));
  }
  assert.equal(heuristicTaxonomy(text).chapter, "Current Electricity");
  assert.equal(heuristicTaxonomy("Which object is shown in the missing diagram?").chapter, "Unclassified");
  assert.deepEqual(heuristicMath("A pendulum has length 2 m.").latex, []);
  assert.deepEqual(heuristicMath("Use $V = IR$ to find resistance.").latex, ["V = IR"]);
  assert.equal(heuristicLanguage("विद्युत धारा और प्रतिरोध का संबंध क्या है").language, "hi");
});

test("external questions survive create, annotation, persistence, and reruns", async () => {
  const text = "1. A resistor has resistance 5 ohm in a circuit.\n2. Find the focal length of a convex lens.\n3. A capacitor stores charge in a dielectric.";
  const { job } = await call<{ job: Job }>("/api/jobs", { method: "POST", body: JSON.stringify({ mode: "file", text, filename: "external.txt" }) });
  const before = await call<{ units: Unit[] }>("/api/jobs/" + job.id + "/units");
  assert.equal(before.units.length, 3);
  assert.ok(before.units.every((unit) => !unit.isHoneypot));
  assert.equal(before.units[0].rawText, segmentText(text)[0].rawText);
  await Promise.all([call("/api/jobs/" + job.id + "/run", { method: "POST" }), call("/api/jobs/" + job.id + "/run", { method: "POST" })]);
  const first = await call<{ finals: FinalRecord[] }>("/api/jobs/" + job.id + "/finals");
  assert.equal(first.finals.length, 3);
  assert.ok(first.finals.every((record) => record.route === "human" && record.confidence <= 0.8 && record.agreement === 0));
  assert.ok(first.finals.every((record) => !isExportable(record)));
  await call("/api/jobs/" + job.id + "/run", { method: "POST" });
  const second = await call<{ finals: FinalRecord[] }>("/api/jobs/" + job.id + "/finals");
  assert.deepEqual(first, second);
  assert.equal((await readState()).jobs.find((item) => item.id === job.id)?.status, "review");

  await call("/api/units/" + first.finals[0].unitId + "/review", { method: "POST", body: JSON.stringify({ action: "accept" }) });
  await call("/api/units/" + first.finals[1].unitId + "/review", { method: "POST", body: JSON.stringify({ action: "reject" }) });
  await call("/api/units/" + first.finals[2].unitId + "/review", { method: "POST", body: JSON.stringify({ action: "accept" }) });
  const { finals } = await call<{ finals: FinalRecord[] }>("/api/jobs/" + job.id + "/finals");
  assert.equal(JSON.parse(exportRecords(finals, "json")).length, 2);
  assert.equal(exportRecords(finals, "jsonl").split("\n").length, 2);
  assert.equal((await readState()).jobs.find((item) => item.id === job.id)?.status, "done");
  await call("/api/jobs/" + job.id + "/reset", { method: "POST" });
  assert.equal((await call<{ finals: FinalRecord[] }>("/api/jobs/" + job.id + "/finals")).finals.length, 0);
  assert.equal((await call<{ units: Unit[] }>("/api/jobs/" + job.id + "/units")).units[0].rawText, before.units[0].rawText);
  await call("/api/jobs/" + job.id, { method: "DELETE" });
  assert.equal((await readState()).units.filter((unit) => unit.jobId === job.id).length, 0);
});

test("review edits enforce the taxonomy and preserve source identity", async () => {
  const { job } = await call<{ job: Job }>("/api/jobs", { method: "POST", body: JSON.stringify({ mode: "paste", text: "1. Explain the device shown in this diagram.", filename: "unmatched.txt" }) });
  await call("/api/jobs/" + job.id + "/run", { method: "POST" });
  const record = (await call<{ finals: FinalRecord[] }>("/api/jobs/" + job.id + "/finals")).finals[0];
  assert.equal(record.payload.chapter, "Unclassified");
  await assert.rejects(call("/api/units/" + record.unitId + "/review", { method: "POST", body: JSON.stringify({ action: "accept" }) }), /unclassified/);
  await assert.rejects(call("/api/units/" + record.unitId + "/review", { method: "POST", body: JSON.stringify({ action: "edit", editedPayload: { ...record.payload, chapter: "Made up topic" } }) }), /29 supported/);
  await call("/api/units/" + record.unitId + "/review", { method: "POST", body: JSON.stringify({ action: "edit", editedPayload: { ...record.payload, chapter: "Current Electricity", stem: "replaced", unit_id: "tampered", confidence: 1, route: "auto" } }) });
  const saved = (await call<{ finals: FinalRecord[] }>("/api/jobs/" + job.id + "/finals")).finals[0];
  assert.equal(saved.payload.stem, record.payload.stem);
  assert.equal(saved.payload.unit_id, record.unitId);
  assert.equal(saved.payload.confidence, 0);
  assert.equal(saved.payload.route, "human");
  assert.equal(saved.payload.chapter, "Current Electricity");
});

test("exports exclude rejected and test rows, escape CSV, and retain provenance", () => {
  const payload = { unit_id: "id", stem: "=HYPERLINK(\"test\")", subject: "physics" as const, options: null, chapter: "Current Electricity", concepts: ["ohm"], difficulty: "easy" as const, bloom: "remember" as const, difficulty_rationale: "estimate", latex: [], has_equation: false, language: "en" as const, code_mix_ratio: 0, confidence: 0.5, agreement: 0, route: "human" as const };
  const record: FinalRecord = { id: "f", unitId: "id", seq: 1, isHoneypot: false, payload, confidence: 0.5, agreement: 0, route: "human", reviewedBy: "reviewer", reviewerAction: "accept", reviewNote: null };
  assert.equal(isExportable({ ...record, route: "auto", reviewerAction: "reject" }), false);
  assert.equal(isExportable({ ...record, isHoneypot: true }), false);
  assert.match(exportRecords([record], "csv"), /'=HYPERLINK/);
  assert.equal(JSON.parse(exportRecords([record], "json"))[0].annotation_engine, "rules-v1");
});

test("browser writes are serialized without dropping papers", async () => {
  const before = (await readState()).jobs.length;
  await Promise.all(Array.from({ length: 3 }, (_, index) => call("/api/jobs", { method: "POST", body: JSON.stringify({ mode: "paste", filename: "paper-" + index + ".txt", text: "1. A resistor has resistance 2 ohm." }) })));
  assert.equal((await readState()).jobs.length, before + 3);
  await mutateState((state) => { state.jobs = []; state.units = []; state.finals = []; state.drafts = {}; state.events = []; });
});
