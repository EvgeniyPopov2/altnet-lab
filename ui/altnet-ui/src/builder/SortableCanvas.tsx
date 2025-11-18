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

type InsertSlotVariant = "default" | "section";

type InsertSlotProps = {
  id: string;
  variant?: InsertSlotVariant;
  onInsert?: (type: InsertChoice) => void;
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
          "my-2 rounded-lg border border-dashed border-[#2a2f45] bg-[#050816]",
          isOver ? "border-[#6E59F2] bg-[#050816]/80" : "",
        ].join(" ")}
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
                <div className="relative w-full max-w-5xl rounded-lg border border-dashed border-[#2a2f45] bg-[#050816] px-6 py-8">
                  <button
                    type="button"
                    onClick={() => setStage("root")}
                    className="absolute right-4 top-4 text-base text-[#9aa3b2] hover:text-[#e6e9f4]"
                    aria-label="Закрыть"
                  >
                    ✕
                  </button>

                  <div className="mb-6 text-center text-sm text-[#e6e9f4]">
                    Какой макет вы хотите использовать?
                  </div>

                  <div className="flex flex-wrap justify-center gap-8">
                    {/* Flexbox карточка */}
                    <button
                      type="button"
                      onClick={() => setStage("flex")}
                      className="group flex w-48 flex-col items-center gap-3 rounded-lg border border-[#4b5563] bg-[#0b1020] px-4 py-4 hover:border-[#6E59F2] hover:shadow-lg transition"
                    >
                      <div className="flex h-28 w-full items-center justify-center rounded-md bg-[#f3f4f6]">
                        <div className="flex h-20 w-24 gap-1">
                          <div className="flex-1 bg-[#e5e7eb]" />
                          <div className="flex-1 bg-[#d1d5db]" />
                          <div className="flex-1 bg-[#e5e7eb]" />
                        </div>
                      </div>
                      <span className="text-sm font-medium text-[#111827] group-hover:text-[#1f2937]">
                        Flexbox
                      </span>
                    </button>

                    {/* Grid карточка */}
                    <button
                      type="button"
                      onClick={() => setStage("grid")}
                      className="group flex w-48 flex-col items-center gap-3 rounded-lg border border-[#4b5563] bg-[#0b1020] px-4 py-4 hover:border-[#6E59F2] hover:shadow-lg transition"
                    >
                      <div className="flex h-28 w-full items-center justify-center rounded-md bg-[#f3f4f6]">
                        <div className="grid h-20 w-20 grid-cols-2 grid-rows-2 gap-[2px]">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="bg-[#e5e7eb]" />
                          ))}
                        </div>
                      </div>
                      <span className="text-sm font-medium text-[#111827] group-hover:text-[#1f2937]">
                        Grid
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* FLEX / GRID: выбор конкретной структуры */}
              {(stage === "flex" || stage === "grid") && (
                <div className="relative w-full max-w-5xl rounded-lg border border-dashed border-[#2a2f45] bg-[#050816] px-6 py-8">
                  <div className="mb-4 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setStage("layout")}
                      className="text-sm text-[#9aa3b2] hover:text-[#e6e9f4]"
                    >
                      ←
                    </button>

                    <div className="text-sm text-[#e6e9f4]">Выберите структуру</div>

                    <button
                      type="button"
                      onClick={() => setStage("root")}
                      className="text-base text-[#9aa3b2] hover:text-[#e6e9f4]"
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
                          // Пока различаем только тип блока: section для Flexbox, grid для Grid
                          onInsert?.(
                            stage === "flex"
                              ? ("section" as InsertChoice)
                              : ("grid" as InsertChoice)
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
