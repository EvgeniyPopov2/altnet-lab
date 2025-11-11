// src/screens/SiteBuilder/outline/Outline.tsx
import type { Block } from "../types";

type Props = {
  blocks: Block[];
  selId?: string | null; // допускаем null, чтобы совпасть с состоянием экрана
  onSelect: (id: string) => void;
};

function labelOf(b: Block): string {
  switch (b.type) {
    case "hero":
      return "Hero";
    case "h1":
      return "Заголовок H1";
    case "heading":
      return b.level === "h3" ? "Заголовок H3" : b.level === "h4" ? "Заголовок H4" : "Заголовок H2";
    case "p":
      return "Текст";
    case "img":
      return "Изображение";
    case "btn":
      return "Кнопка";
    case "cols2":
      return "Колонки 2";
    case "spacer":
      return "Отступ";
    case "divider":
      return "Разделитель";
    case "section":
      return "Секция";
    case "grid":
      return "Сетка";
    default:
      // В теории недостижимый кейс (исчерпывающий switch), но без обращения к b.type,
      // иначе TS сузит b до never и выдаст ошибку.
      return "Блок";
  }
}

function previewText(b: Block): string {
  switch (b.type) {
    case "hero":
      return b.title || "Без заголовка";
    case "h1":
    case "heading":
    case "p":
      // у этих типов есть text
      
      return (b.text as string) || "";
    case "btn":
      return b.label || "";
    case "img":
      return b.alt || b.cid || "";
    case "cols2":
      return b.title || "";
    default:
      return "";
  }
}

/** Простой навигатор блоков: список с подсветкой выбранного */
export default function Outline({ blocks, selId, onSelect }: Props) {
  return (
    <aside className="rounded-xl border border-[#1f2751] bg-[#0b1022]">
      <div className="px-3 py-2 text-xs uppercase tracking-wide text-[#9aa3b2]">Структура</div>
      <ul className="divide-y divide-[#1f2751]">
        {blocks.map((b, i) => {
          const active = selId === b.id;
          return (
            <li
              key={b.id}
              className={
                "px-3 py-2 cursor-pointer select-none hover:bg-[#0f1630] " +
                (active ? "bg-[#0f1630] ring-1 ring-[#2a3b8f]" : "")
              }
              onClick={() => onSelect(b.id)}
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#101735] text-[#aab3c7]">{i + 1}</span>
                <span className="text-[13px] text-[#e6e9f4]">{labelOf(b)}</span>
              </div>
              {(() => {
                const text = previewText(b);
                return text ? (
                  <div className="mt-1 line-clamp-1 text-xs text-[#9aa3b2]" title={text}>
                    {text}
                  </div>
                ) : null;
              })()}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
