import type { PriceTableBlock, PriceTablePlan } from "../../types";

function safeHref(h?: string) {
  const s = (h || "").trim().toLowerCase();
  if (!s) return undefined;
  if (s.startsWith("javascript:")) return "#";
  if (/^https?:\/\//.test(s) || s.startsWith("#") || s.startsWith("/")) return h!;
  return "#";
}

export default function PriceTableView({ block }: { block: PriceTableBlock }) {
  const plans = block.plans || [];
  const grid = plans.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2";
  return (
    <div className={`grid gap-3 ${grid}`}>
      {plans.map((p: PriceTablePlan) => (
        <article key={p.id} className={`rounded-2xl border ${p.popular ? "border-[#5865F2]" : "border-[#1f2751]"} bg-[#0b1022] p-5`}>
          {p.popular && <div className="mb-2 inline-block text-[10px] px-2 py-0.5 rounded bg-[#5865F2] text-white">Популярный</div>}
          <h4 className="text-sm font-semibold text-[#e6e9f4]">{p.name}</h4>
          <div className="mt-1 text-2xl font-extrabold text-[#e6e9f4]">
            {p.price} <span className="text-xs text-[#9aa3b2]">{p.period || ""}</span>
          </div>
          <ul className="mt-3 grid gap-1 text-xs text-[#c9d0e9]">
            {(p.features || []).map(f => (
              <li key={f.id} className="flex items-center gap-2">
                <span className={`inline-block w-3 h-3 rounded-full ${f.included ? "bg-[#27E3CE]" : "bg-[#2a2f45]"}`} />
                <span>{f.label}</span>
              </li>
            ))}
          </ul>
          {p.ctaLabel && safeHref(p.ctaHref) && (
            <div className="mt-4">
              <a href={safeHref(p.ctaHref)} className="px-4 py-2 rounded-lg bg-[#5865F2] text-white hover:bg-[#4854e6]" rel="noopener noreferrer nofollow">
                {p.ctaLabel}
              </a>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
