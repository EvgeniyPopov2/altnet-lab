import type { PaginationBlock } from "../../types";

export default function PaginationView({ block }: { block: PaginationBlock }) {
  const total = Math.max(1, Math.floor(block.total));
  const current = Math.min(Math.max(1, Math.floor(block.current)), total);

  const pages = new Array(total).fill(0).map((_, i) => i + 1);

  return (
    <nav aria-label="Пагинация">
      <ul className="flex items-center gap-1">
        <li>
          <a href="#" aria-disabled={current === 1} className={`px-2 py-1 rounded border ${current === 1 ? "opacity-40 cursor-not-allowed" : "hover:bg-[#121b3f]"} border-[#1f2751] text-[#e6e9f4]`}>‹</a>
        </li>
        {pages.map((p) => (
          <li key={p}>
            <a href="#" aria-current={p === current ? "page" : undefined}
               className={`px-2 py-1 rounded border border-[#1f2751] ${p === current ? "bg-[#5865F2] text-white" : "text-[#e6e9f4] hover:bg-[#121b3f]"}`}>
              {p}
            </a>
          </li>
        ))}
        <li>
          <a href="#" aria-disabled={current === total} className={`px-2 py-1 rounded border ${current === total ? "opacity-40 cursor-not-allowed" : "hover:bg-[#121b3f]"} border-[#1f2751] text-[#e6e9f4]`}>›</a>
        </li>
      </ul>
    </nav>
  );
}
