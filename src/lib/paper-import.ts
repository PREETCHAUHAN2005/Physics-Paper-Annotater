import { MAX_TEXT_LENGTH } from "@/lib/questions";

export const SUPPORTED_PAPERS = /\.(pdf|txt|md|docx|png|jpe?g|webp)$/i;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export type ImportOptions = { ocr: boolean; language: "eng" | "eng+hin" };
export type ImportedPaper = { filename: string; text: string; warnings: string[] };
type TextItem = { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean };

/** Reconstruct lines by position; infer two columns only from question markers. */
export function pageText(items: TextItem[], pageWidth: number): string {
  const meaningful = items.filter((item) => item.str.trim());
  const markers = meaningful.filter((item) => /^(?:Q(?:uestion)?\s*\.?\s*)?\d{1,3}[.)]\s*/i.test(item.str.trim()));
  const left = markers.filter((item) => item.transform[4] < pageWidth * 0.35);
  const right = markers.filter((item) => item.transform[4] > pageWidth * 0.43 && item.transform[4] < pageWidth * 0.75);
  const split = left.length >= 2 && right.length >= 2 ? Math.min(...right.map((item) => item.transform[4])) - 8 : null;
  const columns = split === null ? [meaningful] : [meaningful.filter((item) => item.transform[4] < split), meaningful.filter((item) => item.transform[4] >= split)];
  return columns.map((column) => {
    const sorted = [...column].sort((a, b) => Math.abs(b.transform[5] - a.transform[5]) > 3 ? b.transform[5] - a.transform[5] : a.transform[4] - b.transform[4]);
    const rows: { y: number; items: TextItem[] }[] = [];
    for (const item of sorted) {
      const previous = rows[rows.length - 1];
      if (previous && Math.abs(previous.y - item.transform[5]) <= Math.max(2, item.height * 0.3)) previous.items.push(item);
      else rows.push({ y: item.transform[5], items: [item] });
    }
    return rows.map((row) => row.items.sort((a, b) => a.transform[4] - b.transform[4]).map((item) => item.str).join(" ")).join("\n");
  }).join("\n");
}

export async function importPaper(file: File, options: ImportOptions, progress: (message: string) => void): Promise<ImportedPaper> {
  if (!SUPPORTED_PAPERS.test(file.name)) throw new Error("Supported files: PDF, TXT, MD, DOCX, PNG, JPG, and WEBP.");
  if (!file.size) throw new Error("The file is empty.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Demo limit: 10 MB per paper.");
  const warnings: string[] = [];
  let worker: Awaited<ReturnType<typeof import("tesseract.js").createWorker>> | null = null;
  const recognize = async (image: File | HTMLCanvasElement) => {
    if (!options.ocr) throw new Error("This paper contains scanned pages. Enable OCR, or paste the extracted questions.");
    if (!worker) {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker(options.language, 1, { logger: (message) => progress("OCR: " + message.status + " " + Math.round((message.progress ?? 0) * 100) + "%") });
    }
    const result = await worker.recognize(image);
    return result.data.text;
  };
  let text = "";
  try {
    if (/\.pdf$/i.test(file.name)) {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
      const loading = pdfjs.getDocument({
        data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false,
        cMapUrl: "/vendor/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/vendor/pdfjs/standard_fonts/", wasmUrl: "/vendor/pdfjs/wasm/",
      });
      let pdf: Awaited<typeof loading.promise> | null = null;
      try {
        pdf = await loading.promise;
        if (pdf.numPages > 20) throw new Error("Demo limit: 20 pages per paper. Upload the physics section separately.");
        const pages: string[] = [];
        let scannedPages = 0;
        for (let index = 1; index <= pdf.numPages; index++) {
          progress("Reading page " + index + " of " + pdf.numPages + " — " + file.name);
          const page = await pdf.getPage(index);
          try {
            const content = await page.getTextContent();
            let value = pageText(content.items.filter((item) => "str" in item), page.getViewport({ scale: 1 }).width);
            // Pages containing only a page number/header need OCR as well.
            if (value.replace(/\s/g, "").length < 50) {
              if (++scannedPages > 10) throw new Error("OCR demo limit: 10 scanned pages per paper. Split the physics section into smaller PDFs.");
              const viewport = page.getViewport({ scale: Math.min(2, 1800 / page.getViewport({ scale: 1 }).width) });
              const canvas = document.createElement("canvas");
              canvas.width = Math.ceil(viewport.width);
              canvas.height = Math.ceil(viewport.height);
              const context = canvas.getContext("2d");
              if (!context) throw new Error("Your browser cannot render scanned PDF pages.");
              await page.render({ canvas, canvasContext: context, viewport }).promise;
              value = await recognize(canvas);
              canvas.width = 0;
              canvas.height = 0;
              warnings.push("Page " + index + " used OCR. Check question numbers, symbols, and columns in the preview.");
            }
            pages.push(value);
            if (pages.reduce((total, value) => total + value.length, 0) > MAX_TEXT_LENGTH) throw new Error("Paper text exceeds 250,000 characters.");
          } finally { page.cleanup(); }
        }
        text = pages.join("\n\f\n");
      } finally {
        await loading.destroy();
      }
    } else if (/\.docx$/i.test(file.name)) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      text = result.value;
      if (result.messages.length) warnings.push("Some document formatting could not be extracted. Review the text below.");
    } else if (/\.(png|jpe?g|webp)$/i.test(file.name)) {
      text = await recognize(file);
      warnings.push("OCR was used. Verify formulas, numbering, and diagrams against the original.");
    } else text = await file.text();
  } catch (error) {
    if (error instanceof Error && /password/i.test(error.message)) throw new Error("Password-protected PDFs are unsupported. Upload an unlocked copy.");
    throw error;
  } finally {
    if (worker) await (worker as Awaited<ReturnType<typeof import("tesseract.js").createWorker>>).terminate();
  }
  if (text.length > MAX_TEXT_LENGTH) throw new Error("Paper text exceeds 250,000 characters.");
  if (!text.trim()) throw new Error("No text could be extracted. Try a clearer scan or paste numbered questions.");
  return { filename: file.name, text, warnings };
}
