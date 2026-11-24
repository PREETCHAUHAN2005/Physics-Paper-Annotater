"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CHAPTERS } from "@/lib/schemas";
import type { FinalRecord, Job, QualityStats } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function DemoQuality({ job }: { job: Job }) {
  const [quality, setQuality] = useState<QualityStats | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; api.getQuality(job.id).then((value) => { if (active) setQuality(value); }).catch((err) => { if (active) setError(String(err)); }); return () => { active = false; }; }, [job.id]);
  return <div className="space-y-5"><h1 className="text-2xl font-bold">Annotation quality</h1>
    <p className="text-sm text-muted-foreground">Review status and topic coverage for {job.filename}. This rule engine has no measured model accuracy or inter-rater agreement.</p>
    {error && <p role="alert">{error}</p>}
    {!quality ? <p>Loading saved results…</p> : <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[["Questions", quality.totals.units], ["Suggestions", quality.totals.finals], ["Reviewed", quality.totals.reviewed], ["Awaiting review", quality.totals.finals - quality.totals.reviewed]].map(([label, value]) => <Card key={String(label)}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><strong className="text-2xl">{value}</strong></CardContent></Card>)}</div>
      <Card><CardContent className="p-5"><h2 className="font-semibold mb-3">Detected topics</h2><div className="space-y-2">{Object.entries(quality.distributions.chapter).map(([chapter, count]) => <div key={chapter} className="flex justify-between text-sm gap-4"><span>{chapter}</span><span>{count}</span></div>)}{!quality.totals.finals && <p className="text-sm text-muted-foreground">Run annotation to see topic coverage.</p>}</div></CardContent></Card>
      <p className="text-xs text-muted-foreground">Difficulty, Bloom levels, and evidence scores are provisional. No time-saving estimate or benchmark result is inferred from these papers.</p>
    </>}
  </div>;
}

export function DemoSummary({ compare = false }: { compare?: boolean }) {
  const [rows, setRows] = useState<{ job: Job; finals: FinalRecord[] }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; void api.listJobs().then(async ({ jobs }) => Promise.all(jobs.map(async (job) => ({ job, finals: (await api.getFinals(job.id)).finals })))).then((value) => { if (active) setRows(value); }).catch((err) => { if (active) setError(String(err)); }); return () => { active = false; }; }, []);
  return <div className="space-y-5"><h1 className="text-2xl font-bold">{compare ? "Compare papers" : "Annotation insights"}</h1>
    <p className="text-sm text-muted-foreground">Actual saved paper counts and review outcomes. All suggestions use the same deterministic rule engine.</p>
    {error && <p role="alert">{error}</p>}
    <div className="overflow-auto rounded-lg border"><table className="w-full text-sm text-left"><thead className="bg-muted"><tr>{["Paper", "Questions", "Suggested", "Reviewed", "Approved", "Rejected"].map((value) => <th className="p-3" key={value}>{value}</th>)}</tr></thead><tbody>{rows.map(({ job, finals }) => <tr className="border-t" key={job.id}><td className="p-3">{job.filename}</td><td className="p-3">{job.unitCount}</td><td className="p-3">{finals.length}</td><td className="p-3">{job.reviewedCount}</td><td className="p-3">{finals.filter((item) => item.reviewerAction === "accept" || item.reviewerAction === "edit").length}</td><td className="p-3">{finals.filter((item) => item.reviewerAction === "reject").length}</td></tr>)}</tbody></table>{!rows.length && <p className="p-5 text-sm text-muted-foreground">Import a paper to begin.</p>}</div>
  </div>;
}

export function DemoValidation() {
  return <div className="space-y-4"><h1 className="text-2xl font-bold">Validation &amp; source integrity</h1>
    <Card><CardContent className="p-5 space-y-3 text-sm"><p>Uploaded questions are preserved. No question is replaced by a hidden test question.</p><p>Rule stages can flag missing or ambiguous topic evidence. Every suggestion requires a reviewer decision; unclassified questions require a topic edit before approval.</p><p>Automated regression checks exercise segmentation, source preservation, deterministic suggestions, persistence, and export filtering. Those checks establish software behavior; they do not establish annotation accuracy on unseen papers.</p><p className="text-muted-foreground">To measure accuracy later, prepare a separate human-labeled evaluation set covering all {CHAPTERS.length} topics. Keep it separate from demonstration uploads.</p></CardContent></Card>
  </div>;
}
