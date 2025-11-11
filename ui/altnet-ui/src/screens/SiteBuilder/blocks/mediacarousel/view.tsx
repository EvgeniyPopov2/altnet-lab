import React from "react";

type MediaItem = { id: string; type?: "img"|"video"; src?: string; cid?: string; alt?: string };
type MediaCarouselLike = { items?: MediaItem[] };

function safeSrc(s?: string) {
  const u = (s || "").trim();
  if (!u) return "";
  if (/^(https?:|data:|ipfs:|altfs:)/i.test(u)) return u;
  return "";
}

export default function MediaCarouselView({ block }: { block: MediaCarouselLike }) {
  const items = block.items || [
    { id: "m1", type: "img", src: "https://picsum.photos/800/450?1", alt: "" },
    { id: "m2", type: "img", src: "https://picsum.photos/800/450?2", alt: "" },
    { id: "m3", type: "video", src: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4", alt: "" },
  ];
  const ref = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);
  const lastX = React.useRef(0);

  function onDown(e: React.PointerEvent) { dragging.current = true; lastX.current = e.clientX; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
  function onMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const dx = lastX.current - e.clientX; lastX.current = e.clientX;
    const el = ref.current; if (!el) return;
    el.scrollLeft += dx;
  }
  function onUp(e: React.PointerEvent) { dragging.current = false; (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); }

  function scrollBy(dx: number) {
    const el = ref.current; if (!el) return;
    el.scrollBy({ left: dx, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div
        ref={ref}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      >
        {items.map(it => (
          <div key={it.id} className="min-w-[320px] snap-center shrink-0 rounded-2xl border border-[#1f2751] bg-[#0b1022] overflow-hidden">
            {it.type === "video" ? (
              safeSrc(it.src || it.cid) ? (
                <video className="w-full h-full" src={safeSrc(it.src || it.cid)} controls preload="metadata" />
              ) : null
            ) : (
              safeSrc(it.src || it.cid) ? (
                <img className="w-full h-full object-cover" src={safeSrc(it.src || it.cid)} alt={it.alt || ""} />
              ) : null
            )}
          </div>
        ))}
      </div>
      <div className="hidden md:flex gap-2 absolute -top-4 right-0">
        <button onClick={() => scrollBy(-360)} className="px-2 py-1 rounded border border-[#1f2751] bg-[#101735] text-[#e6e9f4]">‹</button>
        <button onClick={() => scrollBy(360)}  className="px-2 py-1 rounded border border-[#1f2751] bg-[#101735] text-[#e6e9f4]">›</button>
      </div>
    </div>
  );
}
