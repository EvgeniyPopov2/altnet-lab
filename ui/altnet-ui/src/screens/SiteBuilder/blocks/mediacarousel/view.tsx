import { useEffect, useState } from "react";

export default function MediaCarouselView({ block }: { block: any }) {
  const slides = Array.isArray(block.slides) ? block.slides : Array.isArray(block.items) ? block.items.map((item: any) => ({ ...item, kind: item.kind || item.type || "img", src: item.src || item.cid || "" })) : [];
  const initial = Math.max(0, Math.min(slides.length - 1, Math.floor(Number(block.initial) || 0)));
  const [index, setIndex] = useState(initial);
  useEffect(() => { setIndex(initial); }, [block.initial, block.slides, block.items]);
  const slide = slides[index];
  return <div className="relative overflow-hidden rounded-2xl border border-[#1f2751] bg-[#0b1022]">
    {slide ? <figure>
      {slide.src ? slide.kind === "video" ? <video key={slide.id || index} src={slide.src} controls preload="none" className="w-full" /> : <img src={slide.src} alt={slide.alt || ""} className="block h-auto w-full" referrerPolicy="no-referrer" /> : <div className="grid aspect-video place-items-center text-xs text-[#9aa3b2]">Укажите адрес {slide.kind === "video" ? "видео" : "изображения"}</div>}
      {slide.caption && <figcaption className="p-2 text-xs">{slide.caption}</figcaption>}
    </figure> : <div className="grid min-h-28 place-items-center text-xs text-[#9aa3b2]">Добавьте слайды в настройках карусели</div>}
    {slides.length > 1 && <div className="flex items-center justify-center gap-3 p-2"><button type="button" aria-label="Предыдущий слайд" onClick={() => setIndex((index - 1 + slides.length) % slides.length)}>‹</button><span aria-live="polite" className="text-xs">Слайд {index + 1} из {slides.length}</span><button type="button" aria-label="Следующий слайд" onClick={() => setIndex((index + 1) % slides.length)}>›</button></div>}
  </div>;
}
