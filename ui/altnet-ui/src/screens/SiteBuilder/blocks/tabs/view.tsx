import React from "react";
import type { TabsBlock, TabsAlign, TabsOrientation, TabsSize, TabsVariant } from "../../types";

function clsVariant(v?: TabsVariant) {
  switch (v) {
    case "boxed":  return "bg-[#0b1022] border border-[#1f2751] rounded-xl p-1";
    case "pill":   return "bg-transparent";
    default:       return "bg-transparent"; // underline
  }
}
function clsTab(v?: TabsVariant, active?: boolean, size?: TabsSize) {
  const sz = size === "lg" ? "px-4 py-2 text-sm" : size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm";
  const base = "rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5865F2]/60";
  if (v === "boxed") {
    return `${sz} ${base} ${active ? "bg-[#121b3f] text-[#e6e9f4]" : "text-[#c9d0e9] hover:bg-[#101735]"}`;
  }
  if (v === "pill") {
    return `${sz} ${base} ${active ? "bg-[#5865F2] text-white" : "text-[#c9d0e9] hover:bg-[#121b3f]"}`;
  }
  // underline
  return `${sz} ${base} ${active ? "text-[#e6e9f4] border-b-2 border-[#5865F2]" : "text-[#c9d0e9] hover:text-[#e6e9f4]"} bg-transparent`;
}
function clsAlign(a?: TabsAlign) {
  return a === "center" ? "justify-center" : a === "end" ? "justify-end" : "justify-start";
}
function dirCls(o?: TabsOrientation) {
  return o === "vertical" ? "flex-col" : "flex-row";
}

export default function TabsView({ block }: { block: TabsBlock }) {
  const [idx, setIdx] = React.useState(Math.max(0, Math.min(block.active ?? 0, (block.tabs?.length || 1) - 1)));
  const refList = React.useRef<HTMLDivElement | null>(null);
  const variant = block.variant ?? "underline";
  const size = block.size ?? "md";
  const align = block.align ?? "start";
  const orient = block.orientation ?? "horizontal";

  function onKey(e: React.KeyboardEvent) {
    if (orient === "horizontal") {
      if (e.key === "ArrowRight") { e.preventDefault(); setIdx(i => Math.min(i + 1, (block.tabs.length - 1))); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    } else {
      if (e.key === "ArrowDown")  { e.preventDefault(); setIdx(i => Math.min(i + 1, (block.tabs.length - 1))); }
      if (e.key === "ArrowUp")    { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    }
  }

  return (
    <div className={`grid gap-3 ${orient === "vertical" ? "md:grid-cols-[220px_1fr]" : ""}`}>
      <div
        role="tablist"
        aria-orientation={orient}
        className={`flex ${dirCls(orient)} ${clsAlign(align)} gap-1 ${clsVariant(variant)}`}
        onKeyDown={onKey}
        ref={refList}
      >
        {block.tabs.map((t, i) => {
          const active = i === idx;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className={clsTab(variant, active, size)}
              onClick={() => !t.disabled && setIdx(i)}
              disabled={!!t.disabled}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="rounded-2xl border border-[#1f2751] bg-[#0b1022] p-4 text-sm text-[#e6e9f4]">
        {(block.tabs[idx]?.content || "Контент вкладки")}
      </div>
    </div>
  );
}
