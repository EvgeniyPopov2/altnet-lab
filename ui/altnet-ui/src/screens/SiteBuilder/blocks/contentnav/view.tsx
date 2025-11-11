import type { ContentNavBlock } from "../../types";

function safeHref(h: string) {
  const s = (h || "").trim().toLowerCase();
  if (!s.startsWith("#")) return "#";
  return h;
}

export default function ContentNavView({ block }: { block: ContentNavBlock }) {
  const row = (block.orientation ?? "horizontal") === "horizontal";
  return (
    <nav aria-label="Навигация по контенту">
      <ul className={`flex ${row ? "flex-row" : "flex-col"} gap-2`}>
        {block.items.map((it) => (
          <li key={it.id}>
            <a href={safeHref(it.href)} className="px-2 py-1 rounded-lg border border-[#1f2751] bg-[#101735] text-[#e6e9f4] hover:bg-[#121b3f]">
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
