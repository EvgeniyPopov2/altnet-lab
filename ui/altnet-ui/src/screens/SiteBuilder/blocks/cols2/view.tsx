// src/screens/SiteBuilder/blocks/cols2/view.tsx
import type { Cols2Block } from "../../types";

function spanClass(n: number): string {
  // допустимые значения 5/6/7, соответствия Tailwind фиксируем явно
  return n === 5 ? "col-span-5" : n === 7 ? "col-span-7" : "col-span-6";
}

export default function Cols2View({ block }: { block: Cols2Block }) {
  const ratio = block.ratio ?? "6-6";
  const reverse = !!block.reverse;
  const [leftN, rightN] =
    ratio === "5-7" ? [5, 7] : ratio === "7-5" ? [7, 5] : [6, 6];
  const left = reverse ? rightN : leftN;
  const right = reverse ? leftN : rightN;

  return (
    <div className="grid grid-cols-12 gap-6 items-center">
      <div className={`${spanClass(left)} space-y-2`}>
        <h3 className="text-xl font-bold text-[#0b1022]">{block.title || "Заголовок"}</h3>
        <p className="text-[#2b3050]">{block.text || ""}</p>
      </div>
      <div className={`${spanClass(right)}`}>
        {block.img ? (
          <img
            src={block.img}
            alt={block.alt || ""}
            className="w-full rounded-xl border border-[#2a2f45]"
            draggable={false}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="aspect-video w-full rounded-xl border border-dashed border-[#2a2f45] bg-[#0f1630] grid place-items-center text-xs text-[#9aa3b2]">
            Изображение не выбрано
          </div>
        )}
      </div>
    </div>
  );
}
