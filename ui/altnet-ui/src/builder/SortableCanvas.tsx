import React, { useMemo, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, useDroppable } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type SortableLike = { id: string };

export type InsertChoice =
  | "h1" | "heading" | "p" | "btn" | "img"
  | "divider" | "spacer"
  | "hero" | "cols2" | "section" | "grid"
  | "icon" | "iconlist" | "alert" | "html" | "code"
  | "tabs" | "accordion" | "blockquote" | "cta" | "rating"
  | "counter" | "progress" | "breadcrumbs" | "pagination" | "social" | "iconbox" | "imagebox"
  | "pricelist" | "testimonials" | "share" | "progresstracker" | "anchor" | "toc"
  | "video" | "gallery" | "carousel" | "countdown" | "menu" | "search" | "contentnav"
  | "map" | "lottie" | "mediacarousel" | "slides" | "videoplaylist" | "hotspot"
  | "container" | "sidebar" | "offcanvas"| "shortcode" | "pricetable";

type Props<T extends SortableLike> = {
  cols?: 1 | 2 | 3 | 4;
  gapX?: number;
  gapY?: number;
  blocks: T[];
  renderBlock: (b: T) => React.ReactNode;
  onReorder: (next: T[]) => void;
  /** Вставка нового блока в индекс (0..N). Вызывается при клике «+» и выборе типа. */
  onInsertAt?: (index: number, type: InsertChoice) => void;
};

function DragHandle(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className="absolute -left-2 -top-2 opacity-0 group-hover:opacity-100 transition
                 text-xs px-1.5 py-0.5 rounded bg-[#151a2e] border border-[#2a2f45] text-[#e6e9f4] cursor-grab"
    >
      ⠿
    </div>
  );
}

function SortableItem({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : "auto",
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <DragHandle {...attributes} {...listeners} />
      {children}
    </div>
  );
}

function InsertSlot({
  id,
  onInsert,
}: {
  id: string; // "slot-<index>"
  onInsert?: (type: InsertChoice) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [open, setOpen] = useState(false);

  return (
    <div className="col-span-full">
      <div
        ref={setNodeRef}
        onDragOver={(e) => {
          // Разрешаем дроп только нашего «application/x-block»
          const types = Array.from(e.dataTransfer?.types ?? []);
          if (types.includes("application/x-block")) e.preventDefault();
        }}
        onDrop={(e) => {
          const t = e.dataTransfer?.getData("application/x-block") as InsertChoice | undefined;
          if (t) {
            e.preventDefault();
            onInsert?.(t);
          }
        }}
        className={
          "my-2 rounded-lg border border-dashed " +
          (isOver ? "border-indigo-500 bg-indigo-500/10" : "border-[#2a2f45] bg-[#0c0f1a]")
        }
      >
        <div className="p-2 flex items-center justify-center">
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="px-3 py-1.5 text-sm rounded-md bg-[#12162a] border border-[#2a2f45] text-[#e6e9f4] hover:bg-[#151a2e]"
            >
              + Добавить блок
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 p-1">
              {(
                [
                  ["hero", "Hero"],
                  ["h1", "Заголовок"],
                  ["p", "Текст"],
                  ["btn", "Кнопка"],
                  ["img", "Изображение"],
                  ["divider", "Разделитель"],
                  ["spacer", "Интервал"],
                ] as Array<[InsertChoice, string]>
              ).map(([t, label]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    onInsert?.(t);
                    setOpen(false);
                  }}
                  className="px-2.5 py-1.5 text-xs rounded-md bg-[#151a2e] border border-[#2a2f45] text-[#e6e9f4] hover:bg-[#1a203b]"
                  title={label}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-1 px-2 py-1.5 text-xs rounded-md bg-transparent text-[#9aa3b2] hover:text-[#e6e9f4]"
                title="Отмена"
              >
                Отмена
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SortableCanvas<T extends SortableLike>({
  cols = 3,
  gapX = 16,
  gapY = 16,
  blocks,
  renderBlock,
  onReorder,
  onInsertAt,
}: Props<T>) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const ids = useMemo(() => blocks.map((b) => b.id), [blocks]);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    // Перестановка блоков по карточкам
    if (!String(over.id).startsWith("slot-") && active.id !== over.id) {
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex !== -1 && newIndex !== -1) onReorder(arrayMove(blocks, oldIndex, newIndex));
    }
    // Перетаскивание из палитры добавим в следующем шаге (внешний DndContext).
  };

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            columnGap: gapX,
            rowGap: gapY,
            alignItems: "start",
          }}
        >
          {/* Начальный слот */}
          <InsertSlot id="slot-0" onInsert={(t) => onInsertAt?.(0, t)} />

          {blocks.map((b, i) => (
            <React.Fragment key={b.id}>
              <SortableItem id={b.id}>{renderBlock(b)}</SortableItem>
              <InsertSlot id={`slot-${i + 1}`} onInsert={(t) => onInsertAt?.(i + 1, t)} />
            </React.Fragment>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
