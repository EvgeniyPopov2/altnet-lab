import type { IconListBlock, IconListItem, IconListVariant } from "../../types";

function Marker({ variant }: { variant: IconListVariant }) {
  if (variant === "check") return <span aria-hidden className="inline-block w-4 h-4 rounded-full grid place-items-center bg-[#27E3CE] text-[#0b1022] text-[10px]">✓</span>;
  if (variant === "star")  return <span aria-hidden className="inline-block w-4 h-4 rounded-full grid place-items-center bg-[#FFC857] text-[#0b1022] text-[10px]">★</span>;
  return <span aria-hidden className="inline-block w-2 h-2 rounded-full bg-[#5865F2]" />;
}

function safeHref(h?: string) {
  const s = (h || "").trim().toLowerCase();
  if (!s) return undefined;
  if (s.startsWith("javascript:")) return "#";
  if (/^https?:\/\//.test(s) || s.startsWith("#")) return h!;
  return "#";
}

export default function IconListView({ block }: { block: IconListBlock }) {
  const size = block.size ?? "md";
  const gap  = block.gap ?? "md";
  const align = block.align ?? "start";
  const v = block.variant ?? "dot";

  const sz = size === "lg" ? "text-base" : size === "sm" ? "text-xs" : "text-sm";
  const gp = gap === "lg" ? "gap-3" : gap === "sm" ? "gap-1.5" : "gap-2";
  const al = align === "center" ? "justify-center" : align === "end" ? "justify-end" : "justify-start";

  function Item({ it }: { it: IconListItem }) {
    const href = safeHref(it.href);
    const content = (
      <div className={`flex items-start ${gp}`}>
        <div className="mt-1">
          {block.variant === "custom" && it.icon
            ? <span className="inline-block w-4 h-4 rounded bg-[#0f1630] border border-[#1f2751] text-[9px] text-[#c9d0e9] grid place-items-center">{it.icon.slice(0,2)}</span>
            : <Marker variant={v} />}
        </div>
        <div>
          <div className={`${sz} text-[#e6e9f4]`}>{it.label}</div>
          {it.description && <div className="text-xs text-[#9aa3b2]">{it.description}</div>}
        </div>
      </div>
    );
    return href ? (
      <a href={href} className="block hover:bg-[#121b3f] rounded-lg px-2 py-1" rel="noopener noreferrer nofollow">
        {content}
      </a>
    ) : (
      <div className="px-2 py-1">{content}</div>
    );
  }

  return (
    <div className={`grid ${al} gap-1`}>
      {block.items.map(it => <Item key={it.id} it={it} />)}
    </div>
  );
}
