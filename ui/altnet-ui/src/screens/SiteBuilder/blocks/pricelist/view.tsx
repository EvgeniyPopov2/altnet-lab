type PriceItem = { id: string; title?: string; price?: string; period?: string; features?: string[]; ctaLabel?: string; ctaHref?: string };
type PriceListLike = { items?: PriceItem[] };

function safeHref(h?: string) {
  const s = (h || "").trim().toLowerCase();
  if (!s) return undefined;
  if (s.startsWith("javascript:")) return "#";
  if (/^https?:\/\//.test(s) || s.startsWith("#") || s.startsWith("/")) return h!;
  return "#";
}

export default function PriceListView({ block }: { block: PriceListLike }) {
  const items = block.items || [
    { id: "pl1", title: "Базовый", price: "0 ₽", period: "/мес", features: ["1 сайт", "Базовые блоки"], ctaLabel: "Начать", ctaHref: "#start" },
    { id: "pl2", title: "Про", price: "299 ₽", period: "/мес", features: ["Безлимит блоков", "CDR"], ctaLabel: "Выбрать", ctaHref: "#pro" },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map(p => (
        <div key={p.id} className="rounded-2xl border border-[#1f2751] bg-[#0b1022] p-4">
          <div className="text-sm font-semibold text-[#e6e9f4]">{p.title || "Тариф"}</div>
          <div className="mt-1 text-xl font-extrabold text-[#e6e9f4]">{p.price || "0 ₽"} <span className="text-xs text-[#9aa3b2]">{p.period || ""}</span></div>
          <ul className="mt-2 grid gap-1 text-xs text-[#c9d0e9] list-disc pl-5">
            {(p.features || []).map((f, i) => <li key={i}>{f}</li>)}
          </ul>
          {p.ctaLabel && safeHref(p.ctaHref) && (
            <div className="mt-3">
              <a href={safeHref(p.ctaHref)} className="px-3 py-2 rounded-lg bg-[#5865F2] text-white hover:bg-[#4854e6]" rel="noopener noreferrer nofollow">
                {p.ctaLabel}
              </a>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
