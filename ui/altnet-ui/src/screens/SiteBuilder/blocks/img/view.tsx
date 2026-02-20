// src/screens/SiteBuilder/blocks/img/view.tsx
import type { ImgBlock } from "../../types";

export default function ImgView({ block }: { block: ImgBlock }) {
  const src = block.cid || ""; // поддерживаем http(s)/ipfs/altfs/data:
  if (!src) {
    // Плейсхолдер, когда изображения ещё нет
    return (
      <div className="aspect-video w-full rounded-xl border border-dashed border-[#2a2f45] bg-[#0f1630] grid place-items-center text-xs text-[#9aa3b2]">
        Изображение не выбрано
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={block.alt || ""}
      className="max-w-full rounded-xl border border-[#2a2f45]"
      draggable={false}
      referrerPolicy="no-referrer"
    />
  );
}
