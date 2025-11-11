import type { MenuBlock } from "../../types";

function safeHref(h: string) {
  const s = (h || "").trim().toLowerCase();
  if (s.startsWith("javascript:")) return "#";
  if (/^https?:\/\//.test(s) || s.startsWith("#")) return h;
  return "#";
}

export default function MenuView({ block }: { block: MenuBlock }) {
  const row = (block.orientation ?? "horizontal") === "horizontal";
  return (
    <nav aria-label="Меню">
      <ul className={`flex ${row ? "flex-row" : "flex-col"} gap-2`}>
        {block.items.map((it) => (
          <li key={it.id}>
            <a href={safeHref(it.href)} className="px-2 py-1 rounded-lg border border-[#1f2751] bg-[#101735] text-[#e6e9f4] hover:bg-[#121b3f]" rel="noopener noreferrer nofollow">
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
