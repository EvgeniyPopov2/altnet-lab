import type { GalleryBlock } from "../../types";

export default function GalleryView({ block }: { block: GalleryBlock }) {
  const cols = block.cols || 3;
  const cls = cols === 4 ? "grid-cols-4" : cols === 2 ? "grid-cols-2" : "grid-cols-3";
  return (
    <div role="list" className={`grid ${cls} gap-3`}>
      {block.items.map((it) => (
        <div role="listitem" key={it.id} className="rounded-xl overflow-hidden border border-[#2a2f45]">
          <img src={it.src} alt={it.alt || ""} className="w-full h-auto block" draggable={false}/>
        </div>
      ))}
    </div>
  );
}
