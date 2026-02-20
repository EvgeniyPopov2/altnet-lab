// src/screens/SiteBuilder/blocks/alert/view.tsx
import type { AlertBlock } from "../../types";

function classes(v: AlertBlock["variant"]) {
  switch (v) {
    case "success":
      return { box: "bg-[#0e2a1c] border-[#1e774e] text-[#b9f2d6]", dot: "bg-[#34d399]" };
    case "warning":
      return { box: "bg-[#2a210f] border-[#8c6a1e] text-[#ffe7b0]", dot: "bg-[#f59e0b]" };
    case "danger":
      return { box: "bg-[#2a1414] border-[#9b1c1c] text-[#ffc8c8]", dot: "bg-[#ef4444]" };
    default: // info
      return { box: "bg-[#101735] border-[#2a3b8f] text-[#c9d0e9]", dot: "bg-[#60a5fa]" };
  }
}

export default function AlertView({ block }: { block: AlertBlock }) {
  const cls = classes(block.variant);
  return (
    <div className={`rounded-xl border px-3 py-2 ${cls.box}`}>
      <div className="flex items-start gap-2">
        <span className={`mt-1 h-2 w-2 rounded-full ${cls.dot}`} aria-hidden="true" />
        <div className="grid gap-1">
          {block.title && <div className="text-sm font-semibold">{block.title}</div>}
          {block.text && <div className="text-sm opacity-90">{block.text}</div>}
        </div>
      </div>
    </div>
  );
}
