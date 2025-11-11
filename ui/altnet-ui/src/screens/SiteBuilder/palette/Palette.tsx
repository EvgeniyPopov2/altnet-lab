// src/screens/SiteBuilder/palette/Palette.tsx

import SortableCanvas from "../../../builder/SortableCanvas";
type NativeProps = React.ComponentProps<typeof SortableCanvas>;
type NativeOnInsertAt = NonNullable<NativeProps["onInsertAt"]>;
export type InsertChoice = Parameters<NativeOnInsertAt>[1];

type Props = { onInsert: (type: InsertChoice) => void };

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#1f2751] bg-[#0b1022] p-2">
      <div className="px-1 pb-2 text-xs uppercase tracking-wide text-[#9aa3b2]">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Item({ type, label, onClick }: { type: InsertChoice; label: string; onClick: (t: InsertChoice) => void }) {
  return (
    <button
      className="px-2 py-1 rounded-lg text-sm bg-[#101735] text-[#e6e9f4] hover:bg-[#121b3f] border border-[#1f2751]"
      onClick={() => onClick(type)}
    >
      {label}
    </button>
  );
}

/** Палитра блоков: Контент и Макет. */
export default function Palette({ onInsert }: Props) {
  return (
    <div className="grid gap-2">
      <Group title="Контент">
        <Item type="h1" label="H1" onClick={onInsert} />
        <Item type="heading" label="Heading" onClick={onInsert} />
        <Item type="p" label="Текст" onClick={onInsert} />
        <Item type="btn" label="Кнопка" onClick={onInsert} />
        <Item type="img" label="Изображение" onClick={onInsert} />
        <Item type="divider" label="Разделитель" onClick={onInsert} />
        <Item type="spacer" label="Отступ" onClick={onInsert} />
      </Group>

      <Group title="Макет">
        <Item type="hero" label="Hero" onClick={onInsert} />
        <Item type="cols2" label="2 колонки" onClick={onInsert} />
        <Item type="section" label="Секция" onClick={onInsert} />
        <Item type="grid" label="Сетка" onClick={onInsert} />
      </Group>
    </div>
  );
}
