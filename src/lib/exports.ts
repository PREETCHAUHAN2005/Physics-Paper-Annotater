import type { FinalRecord } from "@/lib/types";
export type ExportFormat = "json" | "jsonl" | "csv";

export function isExportable(record: FinalRecord): boolean {
  return !record.isHoneypot && record.reviewerAction !== "reject" &&
    (record.route === "auto" || record.reviewerAction === "accept" || record.reviewerAction === "edit");
}

export function exportRecords(records: FinalRecord[], format: ExportFormat): string {
  const rows = records.filter(isExportable).map((record) => ({
    ...record.payload,
    annotation_engine: "rules-v1",
    score_kind: "uncalibrated_rule_evidence",
    reviewed_by: record.reviewedBy,
    reviewer_action: record.reviewerAction,
    review_note: record.reviewNote,
  }));
  if (format === "json") return JSON.stringify(rows, null, 2);
  if (format === "jsonl") return rows.map((row) => JSON.stringify(row)).join("\n");
  const fields = ["unit_id", "stem", "chapter", "concepts", "difficulty", "bloom", "language", "latex", "confidence", "route", "annotation_engine", "score_kind", "reviewed_by", "reviewer_action", "review_note"] as const;
  // Spreadsheet formula injection is prevented even for text inside quoted cells.
  const cell = (value: unknown) => {
    let text = Array.isArray(value) ? JSON.stringify(value) : String(value ?? "");
    if (/^\s*[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return "\uFEFF" + [fields.join(","), ...rows.map((row) => fields.map((field) => cell(row[field])).join(","))].join("\r\n");
}
