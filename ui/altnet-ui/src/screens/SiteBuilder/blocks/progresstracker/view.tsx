import type { ProgressTrackerBlock } from "../../types";

export default function ProgressTrackerView({ block }: { block: ProgressTrackerBlock }) {
  const total = Math.max(1, block.steps.length);
  const cur = Math.min(Math.max(0, block.current), total - 1);
  return (
    <ol className="flex flex-wrap items-center gap-3" aria-label="Ход выполнения">
      {block.steps.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2">
          <span className={`h-5 w-5 rounded-full grid place-items-center text-xs border
            ${i <= cur ? "bg-[#5865F2] border-[#5865F2] text-white" : "bg-[#101735] border-[#1f2751] text-[#9aa3b2]"}`}>
            {i + 1}
          </span>
          <span className={i <= cur ? "text-[#e6e9f4]" : "text-[#9aa3b2]"}>{s.label}</span>
          {i < total - 1 && <span className="opacity-50">—</span>}
        </li>
      ))}
    </ol>
  );
}
