"use client";
import { DEMO_MODE } from "@/lib/api";
export function DemoNotice() {
  if (!DEMO_MODE) return null;
  return <aside className="mb-5 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm" aria-label="Demo mode information">
    <div className="font-semibold">Browser demo · rules + human review · no API keys</div>
    <p className="mt-1 text-xs text-muted-foreground">Papers and results are saved in this browser. Topic and difficulty labels are suggestions. The score measures keyword evidence, not prediction accuracy. Every question needs review before export. OCR may download engine assets; papers stay on your device.</p>
    <details className="mt-2 text-xs"><summary className="cursor-pointer font-medium">Demo steps and limits</summary>
      <ol className="mt-2 list-decimal pl-5 space-y-1"><li>Open Jobs &amp; Upload. Select up to three papers or a folder.</li><li>Check the extracted text and question count, then create paper jobs.</li><li>Open Live Pipeline and run annotation. Review Queue lets you accept, edit, or reject suggestions.</li><li>Export approved annotations as JSON, JSONL, or CSV.</li></ol>
      <p className="mt-2 text-muted-foreground">Limits: 10 MB, 20 PDF pages, and 200 questions per paper. OCR: 10 scanned pages. Clear printed questions work best. Multi-column layouts, formulas, diagrams, and handwriting can require corrections in the preview. Data is specific to this browser and origin; export it before clearing site data.</p>
    </details>
  </aside>;
}
