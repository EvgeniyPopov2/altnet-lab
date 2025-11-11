// src/screens/SiteBuilder/palette/Palette.tsx

// Забираем точный тип InsertChoice из SortableCanvas, чтобы не спорить с его union.
import SortableCanvas from "../../../builder/SortableCanvas";

type NativeProps = React.ComponentProps<typeof SortableCanvas>;
type NativeOnInsertAt = NonNullable<NativeProps["onInsertAt"]>;
export type InsertChoice = Parameters<NativeOnInsertAt>[1];

type Props = {
  onInsert: (type: InsertChoice) => void;
};

/** Простая палитра блоков — каркас. Дальше добавим поиск/фильтры/пресеты. */
export default function Palette({ onInsert }: Props) {
  const items: { type: InsertChoice; label: string }[] = [
    { type: "h1", label: "H1" },
    { type: "p", label: "Текст" },
    { type: "btn", label: "Кнопка" },
    { type: "img", label: "Изображение" },
    { type: "divider", label: "Разделитель" },
    { type: "spacer", label: "Отступ" },
  ];

  return (
    <div className="rounded-xl border border-[#1f2751] bg-[#0b1022] p-2">
      <div className="px-1 pb-2 text-xs uppercase tracking-wide text-[#9aa3b2]">Палитра</div>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <button
            key={it.type}
            className="px-2 py-1 rounded-lg text-sm bg-[#101735] text-[#e6e9f4] hover:bg-[#121b3f] border border-[#1f2751]"
            onClick={() => onInsert(it.type)}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}
