import type { SocialBlock } from "../../types";

function safeHref(h: string) {
  const s = (h || "").trim().toLowerCase();
  if (s.startsWith("javascript:")) return "#";
  if (/^https?:\/\//.test(s)) return h;
  return "#";
}

export default function SocialView({ block }: { block: SocialBlock }) {
  return (
    <div className="flex flex-wrap gap-2">
      {block.items.map((it) => (
        <a key={it.id} href={safeHref(it.href)} rel="noopener noreferrer nofollow"
           className="inline-flex items-center gap-2 rounded-lg px-2 py-1 border border-[#1f2751] bg-[#101735] text-[#e6e9f4] hover:bg-[#121b3f]">
          <span className="inline-grid place-items-center h-5 w-5 rounded-full bg-[#5865F2] text-white text-[10px]">{(it.label || "?").slice(0,2)}</span>
          <span className="text-sm">{it.label}</span>
        </a>
      ))}
    </div>
  );
}
