// src/screens/SiteBuilder/blocks/grid/view.tsx
import type { GridBlock } from "../../types";

export default function GridView({ block }: { block: GridBlock }) {
  const cols =
    block.cols === 4 ? "grid-cols-4" :
    block.cols === 3 ? "grid-cols-3" :
    block.cols === 2 ? "grid-cols-2" : "grid-cols-1";

  return (
    <div className={`grid ${cols} gap-3`}>
      {block.items.map((it) => (
        <figure key={it.id} className="rounded-xl overflow-hidden border border-[#2a2f45] bg-[#0f1630]">
          {it.src ? (
            <img
              src={it.src}
              alt={it.alt || ""}
              className="w-full h-full object-cover"
              draggable={false}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="aspect-video grid place-items-center text-xs text-[#9aa3b2]">Пусто</div>
          )}
          {it.caption && (
            <figcaption className="px-2 py-1 text-xs text-[#9aa3b2]">{it.caption}</figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}
