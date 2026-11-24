import type {
  ActivityEvent,
  Draft,
  FinalRecord,
  HoneypotResult,
  InsightsStats,
  Job,
  JobComparison,
  QualityStats,
  ReviewItem,
  SearchResult,
  TaxonomyStats,
  Unit,
} from "@/lib/types";

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "0";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch with automatic retry on network failure (server restarts, OOM kills).
 * The sandbox dev server gets killed under memory pressure; this makes the
 * frontend resilient by retrying transient failures instead of crashing.
 */
async function jfetch<T>(url: string, init?: RequestInit, retries = 3): Promise<T> {
  if (DEMO_MODE) {
    const { demoRequest } = await import("@/lib/demo-engine");
    return demoRequest<T>(url, init);
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json() as Promise<T>;
    } catch (e) {
      lastErr = e;
      // retry on network errors (Failed to fetch) and 5xx; don't retry on 4xx
      const isNetwork = e instanceof TypeError;
      const is5xx = e instanceof Error && /5\d\d:/.test(e.message);
      if ((isNetwork || is5xx) && attempt < retries) {
        await sleep(800 * (attempt + 1)); // 0.8s, 1.6s, 2.4s
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

export const api = {
  getHealth: () => jfetch<{ status: "healthy" | "degraded" | "down"; jobs: number; activeJobs: number; totalUnits: number; pendingUnits: number; labeledUnits: number; reviewedUnits: number; agentsAvailable: number; dbConnected: boolean }>("/api/health"),
  subscribePipeline: (id: string, onEvent: (event: import("@/lib/types").PipelineEvent) => void): (() => void) => {
    let disposed = false;
    let cleanup = () => {};
    if (DEMO_MODE) {
      void import("@/lib/demo-engine").then(({ subscribeDemo }) => {
        if (!disposed) cleanup = subscribeDemo(id, onEvent);
      });
    } else {
      const source = new EventSource("/api/jobs/" + id + "/stream");
      source.onmessage = (event) => { try { onEvent(JSON.parse(event.data)); } catch { /* invalid events are ignored */ } };
      cleanup = () => source.close();
    }
    return () => { disposed = true; cleanup(); };
  },
  downloadExport: async (id: string, format: "json" | "jsonl" | "csv") => {
    let contents: string;
    if (DEMO_MODE) {
      const [{ finals }, { units }, { job }, { exportRecords }] = await Promise.all([api.getFinals(id), api.getUnits(id), api.getJob(id), import("@/lib/exports")]);
      const sources = Object.fromEntries(units.map((unit) => [unit.id, { filename: job.filename, page: unit.page, label: unit.sourceLabel }]));
      contents = exportRecords(finals, format, sources);
    } else {
      const response = await fetch(api.exportUrl(id, format));
      if (!response.ok) throw new Error("Export failed: " + response.status);
      contents = await response.text();
    }
    const mime = format === "csv" ? "text/csv" : format === "jsonl" ? "application/x-ndjson" : "application/json";
    const link = document.createElement("a");
    const url = URL.createObjectURL(new Blob([contents], { type: mime + ";charset=utf-8" }));
    link.href = url;
    link.download = "annotateiq-" + id.slice(0, 8) + "." + format;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  listJobs: () => jfetch<{ jobs: Job[] }>("/api/jobs"),
  createJob: (body: { mode: "sample" | "paste" | "file"; paperId?: string; text?: string; filename?: string }) =>
    jfetch<{ job: Job }>("/api/jobs", { method: "POST", body: JSON.stringify(body) }),
  getJob: (id: string) => jfetch<{ job: Job }>(`/api/jobs/${id}`),
  getUnits: (id: string) => jfetch<{ units: (Unit & { final?: { route: string; confidence: number; agreement: number; reviewerAction: string | null } | null })[] }>(`/api/jobs/${id}/units`),
  runPipeline: (id: string) => jfetch<{ ok: boolean; job?: Job }>(`/api/jobs/${id}/run`, { method: "POST" }),
  getFinals: (id: string) => jfetch<{ finals: FinalRecord[] }>(`/api/jobs/${id}/finals`),
  getDrafts: (jobId: string, unitId: string) =>
    jfetch<{
      unit: { id: string; seq: number; stem: string; options: string[] | null; isHoneypot: boolean; goldPayload: Record<string, unknown> | null; attempt: number } | null;
      drafts: Draft[];
      final: { payload: unknown; confidence: number; agreement: number; route: string; reviewedBy: string | null; reviewerAction: string | null } | null;
    }>(`/api/jobs/${jobId}/drafts/${unitId}`),
  getReviewQueue: (id: string, unreviewed = false) =>
    jfetch<{ queue: ReviewItem[]; total: number; reviewed: number }>(
      `/api/jobs/${id}/review${unreviewed ? "?unreviewed=1" : ""}`
    ),
  submitReview: (unitId: string, body: { action: "accept" | "edit" | "reject"; editedPayload?: unknown; note?: string; reviewer?: string }) =>
    jfetch<{ ok: boolean }>(`/api/units/${unitId}/review`, { method: "POST", body: JSON.stringify(body) }),
  getQuality: (id: string) => jfetch<QualityStats>(`/api/jobs/${id}/quality`),
  getHoneypots: (id: string) => jfetch<{ honeypots: HoneypotResult[]; total: number }>(`/api/jobs/${id}/honeypots`),
  exportUrl: (id: string, format: "jsonl" | "json" | "csv" = "jsonl") => `/api/jobs/${id}/export?format=${format}`,
  compareJobs: () => jfetch<{ jobs: JobComparison[] }>("/api/compare"),
  deleteJob: (id: string) => jfetch<{ ok: boolean }>(`/api/jobs/${id}`, { method: "DELETE" }),
  resetJob: (id: string) => jfetch<{ ok: boolean }>(`/api/jobs/${id}/reset`, { method: "POST" }),
  getTaxonomy: () => jfetch<TaxonomyStats>("/api/taxonomy"),
  getActivity: (jobId?: string, kind?: string) =>
    jfetch<{ events: ActivityEvent[]; total: number; kinds: string[] }>(
      `/api/activity${jobId ? `?jobId=${jobId}` : ""}${kind ? `${jobId ? "&" : "?"}kind=${kind}` : ""}`
    ),
  search: (q: string) => jfetch<{ results: SearchResult[]; total: number; query: string }>(`/api/search?q=${encodeURIComponent(q)}`),
  getInsights: () => jfetch<InsightsStats>("/api/insights"),
};
