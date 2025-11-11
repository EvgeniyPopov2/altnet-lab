import React from "react";

type Testi = { id: string; quote?: string; author?: string; role?: string; avatar?: string };
type TestiBlockLike = { items?: Testi[] };

export default function TestimonialsView({ block }: { block: TestiBlockLike }) {
  const items = block.items || [
    { id: "t1", quote: "AltNet — приватность по умолчанию.", author: "Анна", role: "Исследователь" },
    { id: "t2", quote: "Делать сайты как в Elementor — но безопасно.", author: "Максим", role: "Разработчик" },
    { id: "t3", quote: "Всё летает и без телеметрии.", author: "Ирина", role: "Дизайнер" },
  ];
  const ref = React.useRef<HTMLDivElement>(null);

  function scrollBy(dx: number) {
    const el = ref.current; if (!el) return;
    el.scrollBy({ left: dx, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar" ref={ref}>
        {items.map(it => (
          <figure key={it.id} className="min-w-[280px] snap-center shrink-0 rounded-2xl border border-[#1f2751] bg-[#0b1022] p-4">
            <blockquote className="text-sm text-[#e6e9f4]">“{it.quote || "Отзыв"}”</blockquote>
            <figcaption className="mt-2 text-xs text-[#9aa3b2]">
              <span className="font-semibold text-[#e6e9f4]">{it.author || "Автор"}</span>{it.role ? ` — ${it.role}` : ""}
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="hidden md:flex gap-2 absolute -top-4 right-0">
        <button onClick={() => scrollBy(-320)} className="px-2 py-1 rounded border border-[#1f2751] bg-[#101735] text-[#e6e9f4]">‹</button>
        <button onClick={() => scrollBy(320)}  className="px-2 py-1 rounded border border-[#1f2751] bg-[#101735] text-[#e6e9f4]">›</button>
      </div>
    </div>
  );
}
