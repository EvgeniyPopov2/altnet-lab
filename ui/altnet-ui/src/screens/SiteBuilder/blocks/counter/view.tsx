import type { CounterBlock } from "../../types";

export default function CounterView({ block }: { block: CounterBlock }) {
  const p = block.prefix || "";
  const s = block.suffix || "";
  return (
    <div className="inline-flex items-baseline gap-2">
      <div className="text-3xl font-extrabold text-[#e6e9f4]">{p}{block.value}{s}</div>
    </div>
  );
}
