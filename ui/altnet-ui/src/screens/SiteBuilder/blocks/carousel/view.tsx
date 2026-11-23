import React from "react";
import type { CarouselBlock } from "../../types";

export default function CarouselView({ block }: { block: CarouselBlock }) {
  const [i, setI] = React.useState(Math.max(0, Math.min(block.initial ?? 0, block.slides.length - 1)));
  React.useEffect(() => { setI(Math.max(0, Math.min(block.initial ?? 0, block.slides.length - 1))); }, [block.initial, block.slides]);
  const n = block.slides.length || 1;
  function prev() { setI((i - 1 + n) % n); }
  function next() { setI((i + 1) % n); }
  const cur = block.slides[i];

  return (
    <div className="relative rounded-2xl border border-[#1f2751] bg-[#0b1022] overflow-hidden">
      {cur && (
        <figure>
          {cur.src ? <img src={cur.src} alt={cur.alt || ""} className="w-full h-auto block" draggable={false} referrerPolicy="no-referrer"/> : <div className="grid aspect-video place-items-center text-xs text-[#9aa3b2]">Укажите адрес изображения</div>}
          {cur.caption && <figcaption className="absolute bottom-2 left-2 text-xs px-2 py-1 rounded bg-black/50 text-white">{cur.caption}</figcaption>}
        </figure>
      )}
      {!cur && <div className="grid min-h-28 place-items-center text-xs text-[#9aa3b2]">Добавьте слайды в настройках карусели</div>}
      {n > 1 && (
        <>
          <button aria-label="Предыдущий" onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 bg-[#101735]/70 text-[#e6e9f4] border border-[#1f2751]">‹</button>
          <button aria-label="Следующий" onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 bg-[#101735]/70 text-[#e6e9f4] border border-[#1f2751]">›</button>
        </>
      )}
    </div>
  );
}
