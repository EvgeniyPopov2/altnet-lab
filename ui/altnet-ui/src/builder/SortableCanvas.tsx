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
  onInsertAt?: (index: number, type: InsertChoice, preset?: any) => void;
};

type InsertSlotVariant = "default" | "section";

type InsertSlotProps = {
  id: string;
  variant?: InsertSlotVariant;
  onInsert?: (type: InsertChoice, preset?: any) => void;
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

function InsertSlot({ id, onInsert, variant }: InsertSlotProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  

  // Состояние мастера для слота секции
  const [stage, setStage] = useState<"root" | "layout" | "flex" | "grid">("root");

  const isSectionMaster = variant === "section";

  return (
    <div className="col-span-full">
      <div
        ref={setNodeRef}
        className={[
          "my-6 rounded-lg border border-dashed border-[#d4d4d8] shadow-sm",
          isOver ? "border-[#6E59F2] shadow-[0_0_0_1px_rgba(110,89,242,0.4)]" : "",
        ].join(" ")}
        style={{ backgroundColor: "#ffffff" }}
      >
        <div className="p-2 flex items-center justify-center">
          {isSectionMaster ? (
            // ─────────────────────────────────────
            // Мастер Flex/Grid для пустого канваса
            // ─────────────────────────────────────
            <div className="flex w-full flex-col items-center gap-4 py-6">
              {/* ROOT: основной плейсхолдер с плюсиком и папкой */}
              {stage === "root" && (
                <>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setStage("layout")}
                      className="h-10 w-10 rounded-full bg-[#111827] border border-[#2a2f45] flex items-center justify-center text-lg text-[#e6e9f4] hover:bg-[#151a2e] transition"
                      title="Добавить секцию"
                    >
                      +
                    </button>

                    <button
                      type="button"
                      className="h-10 w-10 rounded-full bg-[#111827] border border-[#2a2f45] flex items-center justify-center text-base text-[#e6e9f4] hover:bg-[#151a2e] transition"
                      title="Библиотека (скоро)"
                    >
                      📁
                    </button>
                  </div>

                  <div className="text-xs text-[#9aa3b2] text-center">
                    Добавьте секцию, библиотеку (скоро) или выберите структуру колонок
                  </div>
                </>
              )}

              {/* LAYOUT: выбор между Flexbox и Grid */}
              {stage === "layout" && (
                <div className="relative w-full max-w-5xl rounded-xl border border-dashed border-[#d4d4d8] bg-white px-10 py-10 shadow-sm">
                  {/* Крестик справа сверху — выход обратно в root */}
                  <button
                    type="button"
                    onClick={() => setStage("root")}
                    className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-sm text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827] transition"
                    aria-label="Закрыть"
                  >
                    ✕
                  </button>

                  {/* Заголовок */}
                  <div className="mb-2 text-center text-base font-semibold text-[#111827]">
                    Какой макет вы хотите использовать?
                  </div>

                  {/* Подпояснение под заголовком */}
                  <div className="mb-8 text-center text-xs text-[#6b7280]">
                    <span className="font-semibold text-[#6E59F2]">Flexbox</span> — одна строка колонок;&nbsp;
                    <span className="font-semibold text-[#6E59F2]">CSS Grid</span> — полноценная сетка из строк и колонок.
                  </div>

                  {/* Две большие карточки Flexbox / Grid */}
                  <div className="flex flex-wrap justify-center gap-6">
                    {/* Flexbox карточка */}
                    <button
                      type="button"
                      onClick={() => setStage("flex")}
                      className="group flex w-64 flex-col items-center gap-3 rounded-2xl border-2 border-[#E5D9FF] bg-[#fdf2ff] px-6 py-5 text-[#111827] hover:border-[#6E59F2] hover:bg-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6E59F2] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                    >
                      {/* Псевдо-иконка Flex (3 колонки) */}
                      <div className="flex h-20 w-full items-center justify-center rounded-lg bg-white">
                        <div className="flex h-10 w-28 gap-1">
                          <div className="flex-1 bg-[#e5e7eb]" />
                          <div className="flex-1 bg-[#d1d5db]" />
                          <div className="flex-1 bg-[#e5e7eb]" />
                        </div>
                      </div>
                      <div className="text-sm font-semibold">Flexbox</div>
                      <div className="text-[11px] leading-snug text-center text-[#6b7280]">
                        Колонки в одну строку, поведение задаёт flex-контейнер.
                      </div>
                    </button>

                    {/* Grid карточка */}
                    <button
                      type="button"
                      onClick={() => setStage("grid")}
                      className="group flex w-64 flex-col items-center gap-3 rounded-2xl border-2 border-[#E5D9FF] bg-[#fdf2ff] px-6 py-5 text-[#111827] hover:border-[#6E59F2] hover:bg-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6E59F2] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                    >
                      {/* Псевдо-иконка Grid 2×2 */}
                      <div className="flex h-20 w-full items-center justify-center rounded-lg bg-white">
                        <div className="grid h-10 w-20 grid-cols-2 grid-rows-2 gap-[3px]">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="bg-[#e5e7eb]" />
                          ))}
                        </div>
                      </div>
                      <div className="text-sm font-semibold">CSS Grid</div>
                      <div className="text-[11px] leading-snug text-center text-[#6b7280]">
                        Полноценная сетка: строки и колонки, гибкая компоновка.
                      </div>
                    </button>
                  </div>
                </div>
              )}


              {/* FLEX / GRID: выбор конкретной структуры */}
              {(stage === "flex" || stage === "grid") && (
                <div className="relative w-full max-w-5xl rounded-lg border border-dashed border-[#d4d4d8] bg-white px-8 py-8 shadow-sm">
                 <div className="mb-4 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setStage("layout")}
                      className="text-sm text-[#6b7280] hover:text-[#111827]"
                    >
                      ←
                    </button>

                    <div className="flex flex-col items-center gap-1">
                      <div className="text-sm font-medium text-[#111827]">
                        {stage === "flex"
                          ? "Flexbox — выберите структуру колонок"
                          : "CSS Grid — выберите структуру сетки"}
                      </div>
                      <div className="text-[11px] text-[#6b7280]">
                        {stage === "flex"
                          ? "Колонки в одну строку, поведение задаётся flex-контейнером"
                          : "Двумерная сетка: строки и колонки, больше контроля по вертикали"}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setStage("root")}
                      className="text-base text-[#6b7280] hover:text-[#111827]"
                      aria-label="Закрыть"
                    >
                      ✕
                    </button>
                  </div>

                  <div
                    className={
                      stage === "flex"
                        ? "grid grid-cols-4 gap-4"
                        : "grid grid-cols-3 gap-4"
                    }
                  >
                    {(
                      stage === "flex"
                        ? [
                            [1],
                            [1, 1],
                            [2, 1],
                            [1, 2],
                            [1, 1, 1],
                            [2, 1, 1],
                            [1, 2, 1],
                            [1, 1, 2],
                            [3, 1],
                            [1, 3],
                            [2, 2],
                            [1, 1, 1, 1],
                          ]
                        : [
                            [1, 1],
                            [1, 1, 1],
                            [2, 1, 1],
                            [1, 2],
                            [1, 1, 2],
                            [1, 1, 1, 1],
                          ]
                    ).map((cols, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          // Передаём выбранную структуру колонок как preset (пока без жёсткого типа)
                          onInsert?.(
                            stage === "flex"
                              ? ("section" as InsertChoice)
                              : ("grid" as InsertChoice),
                            cols
                          );
                          setStage("root");
                        }}
                        className="flex flex-col items-center gap-2 rounded-lg border border-transparent bg-transparent p-1 hover:border-[#6E59F2] hover:bg-[#0b1020] transition"
                      >
                        <div className="h-16 w-full max-w-[120px] rounded-md border border-dashed border-[#2a2f45] bg-[#020617] flex overflow-hidden">
                          {cols.map((flexValue, i) => (
                            <div
                              key={i}
                              className="border-r border-[#111827] last:border-r-0 bg-[#111827]"
                              style={{ flex: flexValue }}
                            />
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
           // ─────────────────────────────────────
            // Обычный слот — только зона дропа без мини-палитры
            // ─────────────────────────────────────
            <div className="py-3 text-xs text-center text-[#9aa3b2]">
              Перетащите виджет из левой панели сюда
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
          {/* Начальный слот: всегда мастер Flex/Grid, даже когда уже есть секции */}
          <InsertSlot
            id="slot-0"
            variant="section"
            onInsert={(t, preset) => onInsertAt?.(0, t, preset)}
          />
          {blocks.map((b, i) => (
            <React.Fragment key={b.id}>
              <SortableItem id={b.id}>{renderBlock(b)}</SortableItem>
              <InsertSlot id={`slot-${i + 1}`} onInsert={(t, preset) => onInsertAt?.(i + 1, t, preset)} />
            </React.Fragment>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
