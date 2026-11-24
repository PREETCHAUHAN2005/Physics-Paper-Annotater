/** Shared, lossless question segmentation for uploaded and pasted papers. */
export type Segment = { seq: number; page: number; label: string; rawText: string; stem: string };
export const MAX_TEXT_LENGTH = 250_000;
export const MAX_QUESTIONS = 200;

// A marker must start a line. Decimal values and dates are not question markers.
const MARKER = /^[ \t]*(?:(?:Question|Q)\s*\.?\s*(\d{1,3})\s*[.):\-]?|(\d{1,3})\s*[.)])(?:[ \t]+|(?=\S))/gim;

export function segmentText(input: string): Segment[] {
  if (input.length > MAX_TEXT_LENGTH) throw new Error("Paper text exceeds 250,000 characters.");
  const text = input.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
  const markers: { index: number; end: number; label: string }[] = [];
  const regex = new RegExp(MARKER.source, MARKER.flags);
  for (const match of text.matchAll(regex)) {
    const rest = text.slice(match.index! + match[0].length).split("\n")[0];
    if (!rest.trim() || /^\d+\.\d/.test(match[0].trim() + rest)) continue;
    markers.push({ index: match.index!, end: match.index! + match[0].length, label: match[1] ?? match[2] });
  }
  if (markers.length > MAX_QUESTIONS) throw new Error("Demo limit: 200 questions per paper.");
  return markers.map((marker, index) => {
    const end = markers[index + 1]?.index ?? text.length;
    const rawText = text.slice(marker.index, end).trim();
    return {
      seq: index + 1,
      page: 1 + (text.slice(0, marker.index).match(/\f/g)?.length ?? 0),
      label: marker.label,
      rawText,
      stem: text.slice(marker.end, end).replace(/\f/g, "\n").trim(),
    };
  }).filter((item) => item.stem.length >= 4);
}

export function extractOptions(stem: string): string[] | null {
  const regex = /(?:^|[\s])(?:\(([a-dA-D])\)|([A-Da-d])[.)])\s+/g;
  const found = [...stem.matchAll(regex)];
  if (found.length !== 4 || found.map((m) => (m[1] ?? m[2]).toLowerCase()).join("") !== "abcd") return null;
  return found.map((m, index) => stem.slice(m.index! + m[0].length, found[index + 1]?.index ?? stem.length).trim());
}

export function requireSegments(text: string): Segment[] {
  const result = segmentText(text);
  if (!result.length) throw new Error("No numbered questions found. In the preview, start each question on a new line with Q1., Q2., or 1., 2.");
  return result;
}
