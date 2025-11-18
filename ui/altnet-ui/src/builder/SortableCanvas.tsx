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
  variant = "default",
}: {
  id: string; // "slot-<index>"
  onInsert?: (type: InsertChoice) => void;
  /** Вариант слота:
   *  - default — обычный «+ Добавить блок»
   *  - section — мастер Flex/Grid с тремя кружками (+, папка, «магия»)
   */
  variant?: "default" | "section";
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [open, setOpen] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);

  const isSectionMaster = variant === "section";

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
          {isSectionMaster ? (
            // Мастер Flex/Grid для пустого канваса — БЕЗ палитры блоков
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="flex items-center gap-2">
                {/* + — создать простую секцию */}
                <button
                  type="button"
                  onClick={() => {
                    setGridOpen(false);
                    onInsert?.("section");
                  }}
                  className="h-8 w-8 rounded-full border border-[#2a2f45] bg-[#050816] text-sm text-[#e6e9f4] hover:bg-[#151a2e]"
                  title="Добавить секцию"
                >
                  +
                </button>

                {/* 📁 — заглушка под библиотеку (пока без логики) */}
                <button
                  type="button"
                  onClick={() => {
                    // TODO: подключить библиотеку шаблонов, когда будет готова
                  }}
                  className="h-8 w-8 rounded-full border border-[#2a2f45] bg-[#050816] text-xs text-[#e6e9f4] hover:bg-[#151a2e]"
                  title="Библиотека (скоро)"
                >
                  📁
                </button>

                {/* ✨ — открыть экран выбора структуры колонок */}
                <button
                  type="button"
                  onClick={() => {
                    setGridOpen((v) => !v);
                  }}
                  className="h-8 w-8 rounded-full border border-[#6E59F2] bg-[#1b163a] text-xs text-[#e6e9f4] hover:bg-[#2a2058]"
                  title="Выбрать структуру колонок"
                >
                  ✨
                </button>
              </div>

              <div className="mt-1 text-[11px] text-[#9aa3b2] text-center">
                Добавьте секцию, библиотеку (скоро) или выберите структуру колонок
              </div>

              {gridOpen && (
                <div className="mt-3 grid w-full gap-2 text-xs">
                  {/* 1 колонка — широкая секция */}
                  <button
                    type="button"
                    onClick={() => {
                      setGridOpen(false);
                      onInsert?.("section");
                    }}
                    className="flex items-center gap-2 rounded-lg border border-[#2a2f45] bg-[#050816] px-3 py-2 hover:border-[#6E59F2]"
                  >
                    <span className="inline-flex h-6 w-full rounded-md bg-[#111827]" />
                    <span className="whitespace-nowrap text-[#e6e9f4]">
                      1 колонка (широкая секция)
                    </span>
                  </button>

                  {/* 2 колонки 50 / 50 */}
                  <button
                    type="button"
                    onClick={() => {
                      setGridOpen(false);
                      onInsert?.("cols2");
                    }}
                    className="flex items-center gap-2 rounded-lg border border-[#2a2f45] bg-[#050816] px-3 py-2 hover:border-[#6E59F2]"
                  >
                    <span className="flex h-6 w-full gap-1">
                      <span className="flex-1 rounded-md bg-[#111827]" />
                      <span className="flex-1 rounded-md bg-[#111827]" />
                    </span>
                    <span className="whitespace-nowrap text-[#e6e9f4]">
                      2 колонки 50 / 50
                    </span>
                  </button>

                  {/* 2 колонки 40 / 60 */}
                  <button
                    type="button"
                    onClick={() => {
                      setGridOpen(false);
                      onInsert?.("cols2");
                    }}
                    className="flex items-center gap-2 rounded-lg border border-[#2a2f45] bg-[#050816] px-3 py-2 hover:border-[#6E59F2]"
                  >
                    <span className="flex h-6 w-full gap-1">
                      <span className="flex-[2] rounded-md bg-[#111827]" />
                      <span className="flex-[3] rounded-md bg-[#111827]" />
                    </span>
                    <span className="whitespace-nowrap text-[#e6e9f4]">
                      2 колонки 40 / 60
                    </span>
                  </button>

                  {/* 3 колонки (Grid) */}
                  <button
                    type="button"
                    onClick={() => {
                      setGridOpen(false);
                      onInsert?.("grid");
                    }}
                    className="flex items-center gap-2 rounded-lg border border-[#2a2f45] bg-[#050816] px-3 py-2 hover:border-[#6E59F2]"
                  >
                    <span className="grid h-6 w-full grid-cols-3 gap-1">
                      <span className="rounded-md bg-[#111827]" />
                      <span className="rounded-md bg-[#111827]" />
                      <span className="rounded-md bg-[#111827]" />
                    </span>
                    <span className="whitespace-nowrap text-[#e6e9f4]">
                      3 колонки (Grid)
                    </span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            // Обычный слот — mini-палитра блоков, как была
            <>
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
            </>
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
    // Перетаскивание внешних блоков (если нужно) добавим позже во внешнем DndContext.
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
          {/* Начальный слот:
              - когда блоков нет → мастер Flex/Grid (variant="section")
              - когда уже есть блоки → обычный слот вставки */}
          <InsertSlot
            id="slot-0"
            variant={blocks.length === 0 ? "section" : "default"}
            onInsert={(t) => onInsertAt?.(0, t)}
          />

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
