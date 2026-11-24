"use client";

import { useRef, useState, type InputHTMLAttributes } from "react";
import { FileUp, FolderOpen, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { segmentText } from "@/lib/questions";
import { importPaper, SUPPORTED_PAPERS, type ImportedPaper, type ImportOptions } from "@/lib/paper-import";
import type { Job } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const directoryAttributes = { webkitdirectory: "", directory: "" } as InputHTMLAttributes<HTMLInputElement>;

export function PaperUpload({ onJobCreated }: { onJobCreated: (job: Job) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [papers, setPapers] = useState<ImportedPaper[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ocr, setOcr] = useState(false);
  const [language, setLanguage] = useState<ImportOptions["language"]>("eng");
  const [dragging, setDragging] = useState(false);

  const select = async (files: File[]) => {
    if (busy) return;
    const selected = files.filter((file) => SUPPORTED_PAPERS.test(file.name));
    const ignored = files.length - selected.length;
    if (!selected.length) { setErrors(["No supported papers selected. Choose PDF, TXT, MD, DOCX, PNG, JPG, or WEBP."]); return; }
    if (selected.length > 3) { setErrors(["Choose a folder with at most 3 papers, or select 1–3 files. No files were imported."]); return; }
    setBusy(true);
    setPapers([]);
    setErrors(ignored ? [ignored + " unsupported file(s) were skipped."] : []);
    const imported: ImportedPaper[] = [];
    for (const file of selected) {
      try { imported.push(await importPaper(file, { ocr, language }, setMessage)); }
      catch (error) { setErrors((previous) => [...previous, file.name + ": " + (error instanceof Error ? error.message : "Could not read paper.")]); }
    }
    setPapers(imported);
    setMessage("");
    setBusy(false);
  };

  const count = (text: string) => {
    try { return { value: segmentText(text).length, error: "" }; }
    catch (error) { return { value: 0, error: error instanceof Error ? error.message : "Invalid paper." }; }
  };

  const create = async () => {
    setBusy(true);
    const remaining = [...papers];
    for (const paper of papers) {
      try {
        const { job } = await api.createJob({ mode: "file", filename: paper.filename, text: paper.text });
        onJobCreated(job);
        remaining.splice(remaining.indexOf(paper), 1);
        toast.success(job.filename + ": " + job.unitCount + " questions imported.");
      } catch (error) { toast.error(paper.filename + ": " + (error instanceof Error ? error.message : "Import failed")); }
    }
    setPapers(remaining);
    setBusy(false);
  };

  return (
    <Card><CardContent className="p-5 space-y-4">
      <div className="space-y-2 text-sm">
        <h2 className="font-semibold">Import 1–3 physics papers</h2>
        <p className="text-muted-foreground">PDF, text, Word documents, or page images. Maximum 10 MB and 20 PDF pages per paper. Review the extracted questions before creating jobs.</p>
      </div>
      <div className="flex flex-wrap gap-4 items-center text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={ocr} disabled={busy} onChange={(event) => setOcr(event.target.checked)} /> Enable OCR for scanned pages (slower)</label>
        {ocr && <label className="flex items-center gap-2">OCR language <select className="rounded border bg-background p-1" disabled={busy} value={language} onChange={(event) => setLanguage(event.target.value as ImportOptions["language"])}><option value="eng">English</option><option value="eng+hin">English + Hindi</option></select></label>}
      </div>
      {ocr && <p className="text-xs text-muted-foreground">OCR downloads its engine and language data on first use. Paper contents are processed on your device. Handwriting, diagrams, and complex equations need manual checking.</p>}
      <input ref={picker} aria-label="Choose physics papers" type="file" multiple accept=".pdf,.txt,.md,.docx,.png,.jpg,.jpeg,.webp" className="sr-only" disabled={busy} onChange={(event) => { void select(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
      <input {...directoryAttributes} ref={folder} aria-label="Choose paper folder" type="file" multiple className="sr-only" disabled={busy} onChange={(event) => { void select(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
      <div className={"rounded-xl border-2 border-dashed p-8 text-center space-y-3 " + (dragging ? "border-primary bg-primary/5" : "border-border")} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void select(Array.from(event.dataTransfer.files)); }}>
        <FileUp className="h-7 w-7 mx-auto text-primary" />
        <p className="text-sm">Drop paper files here</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button disabled={busy} onClick={() => picker.current?.click()} className="gap-2"><FileUp className="h-4 w-4" /> Choose files</Button>
          <Button disabled={busy} variant="outline" onClick={() => folder.current?.click()} className="gap-2"><FolderOpen className="h-4 w-4" /> Choose folder</Button>
        </div>
      </div>
      {busy && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> {message || "Saving papers…"}</p>}
      {errors.length > 0 && <ul role="alert" aria-label="Paper import errors" className="list-disc pl-5 text-sm text-rose-500">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
      {papers.map((paper, index) => {
        const result = count(paper.text);
        return <div key={paper.filename + index} className="space-y-2 rounded-lg border p-4">
          <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{paper.filename}</strong><span data-testid="question-count">{result.value} questions detected</span></div>
          {paper.warnings.map((warning, i) => <p key={i} className="text-xs text-amber-600 dark:text-amber-400">{warning}</p>)}
          <label htmlFor={"preview-" + index} className="text-xs text-muted-foreground">Editable extraction preview — put each question on a new line as Q1., Q2., etc. A form-feed between PDF pages preserves page numbers.</label>
          <Textarea id={"preview-" + index} aria-label={"Extracted text: " + paper.filename} value={paper.text} disabled={busy} className="min-h-48 font-mono text-xs" onChange={(event) => setPapers((previous) => previous.map((item, i) => i === index ? { ...item, text: event.target.value } : item))} />
          {(!result.value || result.error) && <p className="text-sm text-rose-500">{result.error || "No question markers found. Correct the numbering above before importing."}</p>}
        </div>;
      })}
      {!!papers.length && <Button onClick={create} disabled={busy || papers.some((paper) => !count(paper.text).value)} className="gap-2"><FileUp className="h-4 w-4" /> Create {papers.length} paper job{papers.length > 1 ? "s" : ""}</Button>}
    </CardContent></Card>
  );
}
