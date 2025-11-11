import type { PaginationBlock } from "../../types";

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }
function pageHref(base?: string, p?: number) {
  if (!p || p < 1) return "#";
  const b = (base || "#p=");
  return b.includes("=") ? `${b}${p}` : `${b}${p}`;
}

export default function PaginationView({ block }: { block: PaginationBlock }) {
  const total = Math.max(1, block.total);
  const current = clamp(block.current, 1, total);
  const size = block.size || "sm";
  const sib = Math.max(0, block.siblings ?? 1);
  const bound = Math.max(0, block.boundary ?? 1);

  const btn = size === "lg" ? "px-3 py-2 text-sm" : size === "md" ? "px-2.5 py-1.5 text-[13px]" : "px-2 py-1 text-[12px]";
  const baseCls = `rounded-lg border border-[#1f2751] ${btn}`;
  const activeCls = "bg-[#5865F2] text-white";
  const idleCls = "bg-[#101735] text-[#e6e9f4] hover:bg-[#121b3f]";

  function range(): (number | "...")[] {
    const pages: (number | "...")[] = [];
    const left = Math.max(1, current - sib);
    const right = Math.min(total, current + sib);

    // left boundary
    for (let i = 1; i <= Math.min(bound, total); i++) pages.push(i);
    if (left > (bound + 1)) pages.push("...");
    // middle
    for (let p = left; p <= right; p++) {
      if (!pages.includes(p)) pages.push(p);
    }
    // right boundary
    if (right < (total - bound)) pages.push("...");
    for (let i = Math.max(total - bound + 1, 1); i <= total; i++) {
      if (!pages.includes(i)) pages.push(i);
    }
    return pages;
  }

  const pages = range();

  return (
    <nav aria-label={block.ariaLabel || "Навигация по страницам"} className="flex items-center gap-1">
      {/* Prev */}
      <a
        aria-label="Предыдущая страница"
        className={`${baseCls} ${current <= 1 ? "opacity-40 pointer-events-none" : idleCls}`}
        href={current > 1 ? pageHref(block.baseHref, current - 1) : "#"}
        rel="noopener noreferrer nofollow"
      >‹</a>

      {/* Pages */}
      {pages.map((p, idx) => p === "..." ? (
        <span key={`e${idx}`} className="px-2 text-[#9aa3b2]">…</span>
      ) : (
        <a
          key={p}
          aria-current={p === current ? "page" : undefined}
          className={`${baseCls} ${p === current ? activeCls : idleCls}`}
          href={pageHref(block.baseHref, p as number)}
          rel="noopener noreferrer nofollow"
        >{p}</a>
      ))}

      {/* Next */}
      <a
        aria-label="Следующая страница"
        className={`${baseCls} ${current >= total ? "opacity-40 pointer-events-none" : idleCls}`}
        href={current < total ? pageHref(block.baseHref, current + 1) : "#"}
        rel="noopener noreferrer nofollow"
      >›</a>
    </nav>
  );
}
