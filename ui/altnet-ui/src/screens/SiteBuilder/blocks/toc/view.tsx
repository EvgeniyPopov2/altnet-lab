import type { TocBlock } from "../../types";

function safeHref(h: string) {
  const s = (h || "").trim().toLowerCase();
  if (!s.startsWith("#")) return "#";
  return h;
}

export default function TocView({ block }: { block: TocBlock }) {
  return (
    <nav aria-label="Содержание" className="rounded-xl border border-[#1f2751] bg-[#0f1630] p-3">
      <ol className="grid gap-1 text-sm">
        {block.items.map((it) => (
          <li key={it.id}>
            <a href={safeHref(it.href)} className="text-[#9bb1ff] hover:underline">{it.label}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
