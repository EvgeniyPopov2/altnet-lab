import type { PriceListBlock } from "../../types";

export default function PriceListView({ block }: { block: PriceListBlock }) {
  return (
    <div className="grid gap-2">
      {block.items.map((it) => (
        <div key={it.id} className="grid grid-cols-[1fr_auto] items-start gap-3 rounded-xl border border-[#1f2751] bg-[#0f1630] p-3">
          <div>
            <div className="text-sm font-semibold text-[#e6e9f4]">{it.title}</div>
            {it.desc && <div className="text-xs text-[#9aa3b2]">{it.desc}</div>}
          </div>
          <div className="text-base font-extrabold text-[#e6e9f4]">{it.price}</div>
        </div>
      ))}
    </div>
  );
}
