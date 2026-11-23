import { sanitizeHref } from "../../../../builder/cdr";

export function paginationState(block: { total?: number; current?: number; siblings?: number; boundary?: number }) {
  const integer = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  const total = Math.max(1, Math.min(10000, integer(block.total, 1)));
  const current = Math.max(1, Math.min(total, integer(block.current, 1)));
  const siblings = Math.max(0, Math.min(10, integer(block.siblings, 1)));
  const boundary = Math.max(0, Math.min(10, integer(block.boundary, 1)));
  const set = new Set<number>();
  for (let n = 1; n <= Math.min(boundary, total); n++) set.add(n);
  for (let n = Math.max(1, current - siblings); n <= Math.min(total, current + siblings); n++) set.add(n);
  for (let n = Math.max(1, total - boundary + 1); n <= total; n++) set.add(n);
  const sorted = [...set].sort((a, b) => a - b);
  const pages: (number | "...")[] = [];
  sorted.forEach((value, index) => {
    const previous = sorted[index - 1];
    if (index && value - previous === 2) pages.push(previous + 1);
    else if (index && value - previous > 2) pages.push("...");
    pages.push(value);
  });
  return { total, current, pages };
}

export function paginationHref(base: unknown, page: number): string {
  const raw = typeof base === "string" && base ? base : "#p=";
  return sanitizeHref(`${raw}${page}`);
}
