import { asRecord } from "../../core/records";
import { sanitizeHref } from "../../builder/cdr";

export const markKeys = ["bold", "italic", "underline", "strike", "code"] as const;
export type Mark = (typeof markKeys)[number];
export type TextRun = { text: string; href?: string } & Partial<Record<Mark, true>>;
const same = (a: TextRun, b: TextRun) => markKeys.every((key) => a[key] === b[key]) && a.href === b.href;

function compact(runs: TextRun[]): TextRun[] {
  const result: TextRun[] = [];
  for (const run of runs)
    if (run.text) {
      const last = result.at(-1);
      if (last && same(last, run)) last.text += run.text;
      else result.push({ ...run });
    }
  return result;
}

export function paragraphRuns(text: string, raw: unknown): TextRun[] {
  if (!Array.isArray(raw)) return [{ text }];
  const runs: TextRun[] = [];
  for (const entry of raw) {
    const value = asRecord(entry);
    if (typeof value.text !== "string") return [{ text }];
    const run: TextRun = { text: value.text };
    for (const key of markKeys) if (value[key] === true) run[key] = true;
    if (typeof value.href === "string" && value.href.trim()) {
      const href = sanitizeHref(value.href);
      if (href !== "#" || value.href === "#") run.href = href;
    }
    runs.push(run);
  }
  return runs.map((r) => r.text).join("") === text ? compact(runs) : [{ text }];
}

function part(runs: TextRun[], start: number, end: number): TextRun[] {
  let pos = 0;
  const result: TextRun[] = [];
  for (const run of runs) {
    const next = pos + run.text.length;
    if (next > start && pos < end)
      result.push({ ...run, text: run.text.slice(Math.max(0, start - pos), Math.min(run.text.length, end - pos)) });
    if (next >= end) break;
    pos = next;
  }
  return result;
}

function stored(runs: TextRun[]) {
  const result = compact(runs);
  return result.some((r) => r.href || markKeys.some((k) => r[k])) ? result : undefined;
}

export function formatSelection(text: string, raw: unknown, start: number, end: number, key: Mark | "href", href = "") {
  const runs = paragraphRuns(text, raw);
  if (start < 0 || end > text.length || end <= start) return stored(runs);
  const span = part(runs, start, end),
    enable = !span.every((r) => r[key]);
  const middle = span.map((r) => {
    const copy = { ...r };
    if (key === "href") {
      const url = sanitizeHref(href);
      if (href.trim() && (url !== "#" || href === "#")) copy.href = url;
      else delete copy.href;
    } else if (enable) copy[key] = true;
    else delete copy[key];
    return copy;
  });
  return stored([...part(runs, 0, start), ...middle, ...part(runs, end, text.length)]);
}

export function editParagraph(oldText: string, raw: unknown, text: string) {
  const runs = paragraphRuns(oldText, raw);
  if (oldText === text) return { text, richRuns: stored(runs) };
  let prefix = 0,
    suffix = 0;
  while (prefix < Math.min(oldText.length, text.length) && oldText[prefix] === text[prefix]) prefix++;
  while (
    suffix < Math.min(oldText.length, text.length) - prefix &&
    oldText[oldText.length - 1 - suffix] === text[text.length - 1 - suffix]
  )
    suffix++;
  const inserted = text.slice(prefix, text.length - suffix);
  const sampleOffset = oldText.length - suffix > prefix ? prefix : Math.max(0, prefix - 1);
  const [inherit] = part(runs, sampleOffset, sampleOffset + 1);
  return {
    text,
    richRuns: stored([
      ...part(runs, 0, prefix),
      { ...inherit, text: inserted },
      ...part(runs, oldText.length - suffix, oldText.length),
    ]),
  };
}

export function inlineMarkup(text: string, raw: unknown, escape: (value: string) => string) {
  const tags = { bold: "strong", italic: "em", underline: "u", strike: "s", code: "code" };
  return paragraphRuns(text, raw)
    .map((run) => {
      let html = escape(run.text).replace(/\n/g, "<br/>");
      for (const key of markKeys) if (run[key]) html = "<" + tags[key] + ">" + html + "</" + tags[key] + ">";
      return run.href ? '<a href="' + escape(run.href) + '">' + html + "</a>" : html;
    })
    .join("");
}
