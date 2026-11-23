import type { CounterBlock } from "../../types";

export default function CounterView({ block }: { block: CounterBlock }) {
  const p = block.prefix || "";
  const s = block.suffix || "";
  const value = Number.isFinite(Number(block.value)) ? Number(block.value) : 0;
  const decimals = Number.isInteger(block.decimals) ? Math.max(0, Math.min(3, block.decimals!)) : 0;
  return (
    <div className="inline-flex items-baseline gap-2">
      <div className="text-3xl font-extrabold text-[#1d2440]">{p}{block.animate ? value.toFixed(decimals) : value}{s}</div>
    </div>
  );
}
