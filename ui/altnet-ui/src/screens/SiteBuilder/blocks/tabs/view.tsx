import React from "react";
import type { TabsBlock } from "../../types";

export default function TabsView({ block }: { block: TabsBlock }) {
  const [idx, setIdx] = React.useState(Math.max(0, Math.min(block.initial ?? 0, block.items.length - 1)));
  const tabsRef = React.useRef<Array<HTMLButtonElement | null>>([]);

  function onKey(e: React.KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    let next = idx;
    if (e.key === "ArrowLeft") next = (idx - 1 + block.items.length) % block.items.length;
    if (e.key === "ArrowRight") next = (idx + 1) % block.items.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = block.items.length - 1;
    setIdx(next);
    requestAnimationFrame(() => tabsRef.current[next]?.focus());
  }

  return (
    <div className="w-full">
      <div role="tablist" aria-label="Tabs" className="flex gap-2 border-b border-[#1f2751] mb-2" onKeyDown={onKey}>
        {block.items.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => (tabsRef.current[i] = el)}
            role="tab"
            aria-selected={i === idx}
            aria-controls={`panel-${block.id}-${i}`}
            tabIndex={i === idx ? 0 : -1}
            className={`px-3 py-1 rounded-t-lg text-sm ${
              i === idx ? "bg-[#101735] text-[#e6e9f4] border border-b-0 border-[#1f2751]" : "text-[#9aa3b2]"
            }`}
            onClick={() => setIdx(i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {block.items.map((t, i) => (
        <div
          key={t.id}
          id={`panel-${block.id}-${i}`}
          role="tabpanel"
          hidden={i !== idx}
          className="rounded-b-xl border border-[#1f2751] bg-[#0f1630] p-3 text-sm text-[#e6e9f4]"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
