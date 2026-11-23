import type { PaginationBlock } from "../../types";
import { paginationHref, paginationState } from "./model";

export default function PaginationView({ block }: { block: PaginationBlock }) {
  const { total, current, pages } = paginationState(block);
  const size = block.size || "sm";

  const btn = size === "lg" ? "px-3 py-2 text-sm" : size === "md" ? "px-2.5 py-1.5 text-[13px]" : "px-2 py-1 text-[12px]";
  const baseCls = `rounded-lg border border-[#1f2751] ${btn}`;
  const activeCls = "bg-[#5865F2] text-white";
  const idleCls = "bg-[#101735] text-[#e6e9f4] hover:bg-[#121b3f]";


  return (
    <nav aria-label={block.ariaLabel || "Навигация по страницам"} className="flex items-center gap-1">
      {/* Prev */}
      <a
        aria-label="Предыдущая страница"
        className={`${baseCls} ${current <= 1 ? "opacity-40 pointer-events-none" : idleCls}`}
        href={current > 1 ? paginationHref(block.baseHref, current - 1) : "#"}
        onClick={event => event.preventDefault()}
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
          href={paginationHref(block.baseHref, p as number)}
          onClick={event => event.preventDefault()}
          rel="noopener noreferrer nofollow"
        >{p}</a>
      ))}

      {/* Next */}
      <a
        aria-label="Следующая страница"
        className={`${baseCls} ${current >= total ? "opacity-40 pointer-events-none" : idleCls}`}
        href={current < total ? paginationHref(block.baseHref, current + 1) : "#"}
        onClick={event => event.preventDefault()}
        rel="noopener noreferrer nofollow"
      >›</a>
    </nav>
  );
}
