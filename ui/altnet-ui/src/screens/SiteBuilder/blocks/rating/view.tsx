import React from "react";
import type { RatingBlock } from "../../types";

function Star({ filled }: { filled: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className={filled ? "text-[#ffd166]" : "text-[#3a415f]"}>
      <path d="M12 2l3.1 6.3L22 9.3l-5 4.9 1.2 7-6.2-3.3L5.8 21l1.2-6.8-5-4.9 6.9-1z" fill="currentColor"/>
    </svg>
  );
}

export default function RatingView({ block }: { block: RatingBlock }) {
  const max = Math.max(1, block.max ?? 5);
  const [val, setVal] = React.useState(Math.max(0, Math.min(block.value, max)));
  function onKey(e: React.KeyboardEvent) {
    if (block.readonly) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); setVal((v) => Math.max(0, v - 1)); }
    if (e.key === "ArrowRight") { e.preventDefault(); setVal((v) => Math.min(max, v + 1)); }
  }
  return (
    <div role="slider"
         aria-valuemin={0}
         aria-valuemax={max}
         aria-valuenow={val}
         tabIndex={0}
         onKeyDown={onKey}
         className="inline-flex items-center gap-1">
      {new Array(max).fill(0).map((_, i) => (
        <button
          key={i}
          type="button"
          className="p-0 m-0 bg-transparent"
          aria-label={`${i + 1} из ${max}`}
          onClick={block.readonly ? undefined : () => setVal(i + 1)}
        >
          <Star filled={i < val} />
        </button>
      ))}
    </div>
  );
}
