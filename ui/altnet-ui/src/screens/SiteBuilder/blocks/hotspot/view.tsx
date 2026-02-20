import type { HotspotBlock } from "../../types";

function safeHref(h?: string) {
  const s = (h || "").trim().toLowerCase();
  if (!s) return undefined;
  if (s.startsWith("javascript:")) return "#";
  if (/^https?:\/\//.test(s) || s.startsWith("#")) return h!;
  return "#";
}

export default function HotspotView({ block }: { block: HotspotBlock }) {
  return (
    <div className="relative rounded-2xl overflow-hidden border border-[#1f2751]">
      <img src={block.src} alt={block.alt || ""} className="w-full h-auto block" />
      {block.markers.map(m => (
        <a key={m.id}
           href={safeHref(m.href)}
           className="absolute -translate-x-1/2 -translate-y-1/2 grid place-items-center h-6 w-6 rounded-full bg-[#5865F2] text-white text-[11px] border border-white/50"
           style={{ left: `${Math.max(0, Math.min(100, m.x))}%`, top: `${Math.max(0, Math.min(100, m.y))}%` }}
           aria-label={m.label || "Маркер"}
           rel="noopener noreferrer nofollow">
          ●
        </a>
      ))}
    </div>
  );
}
