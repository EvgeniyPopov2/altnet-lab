import type { SidebarBlock } from "../../types";

function safeHref(h: string) {
  const s = (h || "").trim().toLowerCase();
  if (s.startsWith("javascript:")) return "#";
  if (/^https?:\/\//.test(s) || s.startsWith("#")) return h;
  return "#";
}

export default function SidebarView({ block }: { block: SidebarBlock }) {
  const w = Math.max(160, Math.min(520, Math.floor(block.width ?? 260)));
  const side = (block.side ?? "left") === "left" ? "mr-6" : "ml-6";
  return (
    <aside
      aria-label="Боковая панель"
      className={`w-full sm:w-[${w}px] ${side} rounded-2xl border border-[#1f2751] bg-[#0b1022] p-4`}>
      {block.title && <div className="text-sm font-semibold text-[#e6e9f4] mb-2">{block.title}</div>}
      <nav>
        <ul className="grid gap-1">
          {block.items.map(it => (
            <li key={it.id}>
              <a href={safeHref(it.href)} className="block rounded px-2 py-1 text-sm text-[#e6e9f4] hover:bg-[#121b3f]"
                 rel="noopener noreferrer nofollow">
                {it.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
