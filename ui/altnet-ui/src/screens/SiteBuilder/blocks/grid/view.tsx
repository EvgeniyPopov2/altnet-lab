// src/screens/SiteBuilder/blocks/grid/view.tsx
import type { GridBlock } from "../../types";

export default function GridView({ block }: { block: GridBlock }) {
  // Если грид создан через мастер Grid, layoutPreset содержит массив колонок
  const layoutPreset = Array.isArray(block.layoutPreset) ? block.layoutPreset : undefined;
  const colsCount = layoutPreset && layoutPreset.length > 0 ? layoutPreset.length : block.cols;

  const cols =
    colsCount === 4 ? "grid-cols-4" :
    colsCount === 3 ? "grid-cols-3" :
    colsCount === 2 ? "grid-cols-2" : "grid-cols-1";

  if (Array.isArray(layoutPreset) && layoutPreset.length > 0 && block.items.length === 0) {
    return (
      <div>
        <div className="grid gap-3" style={{ gridTemplateColumns: layoutPreset.map(value => `${Math.max(1, Number(value) || 1)}fr`).join(" ") }}>
          {layoutPreset.map((_, index) => (
            <div key={index} className="min-h-28 rounded-lg border border-dashed border-[#8b82b8] bg-[#f6f4ff]" />
          ))}
        </div>
        <p className="mt-2 text-xs text-[#57536b]">Нажмите «Сделать ячейки редактируемыми» под сеткой.</p>
      </div>
    );
  }

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
