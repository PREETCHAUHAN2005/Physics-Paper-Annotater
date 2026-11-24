import { db } from "@/lib/db";
import { SAMPLE_PAPERS } from "@/lib/data/sample-papers";
import { segmentText, extractOptions } from "@/lib/questions";
export { segmentText } from "@/lib/questions";
export type { Segment } from "@/lib/questions";

/**
 * Create a job from a sample paper id. Pre-segmented units come from the
 * curated dataset; ~15% of slots are honeypots injected at random positions.
 */
export async function createJobFromSample(paperId: string): Promise<string> {
  const paper = SAMPLE_PAPERS.find((p) => p.id === paperId) ?? SAMPLE_PAPERS[0];
  const jobId = await createJobWithUnits(
    paper.filename,
    "sample",
    paper.units.map((u) => ({
      seq: u.seq,
      page: u.page,
      stem: u.stem,
      options: u.options,
      gold: u.gold,
    }))
  );
  return jobId;
}

/** Create a job from pasted raw text (segmented with the regex). */
export async function createJobFromText(filename: string, text: string): Promise<string> {
  const segments = segmentText(text);
  if (segments.length === 0) throw new Error("No questions found. Use numbered questions like '1. ...'");
  const units = segments.map((s) => ({
    seq: s.seq,
    page: s.page,
    stem: s.stem,
    rawText: s.rawText,
    options: extractOptions(s.stem),
    gold: undefined as undefined | object,
  }));
  return createJobWithUnits(filename, "paste", units);
}


type UnitSpec = {
  seq: number; page: number; stem: string; options: string[] | null;
  rawText?: string; gold?: object;
};

async function createJobWithUnits(filename: string, source: string, specs: UnitSpec[]): Promise<string> {
  // Create the paper and its exact source questions atomically. Evaluation
  // questions belong in a separate test set and never replace an upload.
  const job = await db.job.create({
    data: {
      filename, source, status: "pending", unitCount: specs.length,
      units: { create: specs.map((spec) => ({
        seq: spec.seq, page: spec.page, rawText: spec.rawText ?? spec.stem, stem: spec.stem,
        optionsJson: spec.options ? JSON.stringify(spec.options) : null,
        isHoneypot: false, status: "pending",
      })) },
    },
  });
  return job.id;
}
