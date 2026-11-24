import type { GalleryBlock } from "../../types";
import "./gallery.css";

export default function GalleryView({ block }: { block: GalleryBlock }) {
  const cols = block.cols || 3;
  const cls = cols === 4 ? "grid-cols-4" : cols === 2 ? "grid-cols-2" : "grid-cols-3";
  return (
    <div className="sb-gallery">
    {!block.items.length && <div className="rounded-lg border border-dashed border-[#a9a1c7] p-6 text-center text-xs text-[#57536b]">Добавьте изображения в настройках галереи</div>}
    <div role="list" className={`sb-gallery-grid grid ${cls} gap-3`}>
      {block.items.map((it) => (
        <div role="listitem" key={it.id} className="rounded-xl overflow-hidden border border-[#2a2f45]">
          {it.src ? <img src={it.src} alt={it.alt || ""} className="w-full h-auto block" draggable={false} referrerPolicy="no-referrer"/> : <div className="grid aspect-video place-items-center text-xs text-slate-500">Укажите адрес</div>}
          {it.caption && <p className="px-2 py-1 text-sm">{it.caption}</p>}
        </div>
      ))}
    </div>
    </div>
  );
}
