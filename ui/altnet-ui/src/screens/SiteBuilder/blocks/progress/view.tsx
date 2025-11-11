import type { ProgressBlock } from "../../types";

export default function ProgressView({ block }: { block: ProgressBlock }) {
  const v = Math.max(0, Math.min(100, Math.round(block.value)));
  return (
    <div className="grid gap-2">
      {block.label && <div className="text-sm text-[#c9d0e9]">{block.label}</div>}
      <div className="h-2 rounded-full bg-[#101735] border border-[#1f2751]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}>
        <div className="h-full rounded-full bg-[#5865F2]" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
