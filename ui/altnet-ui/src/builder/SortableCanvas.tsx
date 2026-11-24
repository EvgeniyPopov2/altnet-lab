import type { BlockType, GridTemplate } from "../screens/SiteBuilder/types";
import React, { useMemo, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, useDroppable } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BLOCK_DRAG_TYPE, WIDGET_DRAG_TYPE, readWidgetType } from "../screens/SiteBuilder/palette/drag";
import CustomLayout from "../screens/SiteBuilder/layout/CustomLayout";
import { moveBlockToSlot } from "./slotOrder";

type SortableLike = { id: string; locked?: boolean };

export type InsertChoice = BlockType | "bio-card";

type Props<T extends SortableLike> = {
  cols?: 1 | 2 | 3 | 4;
  gapX?: number;
  gapY?: number;
  blocks: T[];
  renderBlock: (b: T) => React.ReactNode;
  onReorder: (next: T[]) => void;
  /** Вставка нового блока в индекс (0..N). Вызывается при клике «+» и выборе типа. */
  onInsertAt?: (index: number, type: InsertChoice, preset?: number[] | GridTemplate) => void;
  onMoveToRoot?: (index: number, id: string) => void;
};

type InsertSlotVariant = "default" | "section";

type InsertSlotProps = {
  id: string;
  variant?: InsertSlotVariant;
  onInsert?: (type: InsertChoice, preset?: number[] | GridTemplate) => void;
  onMoveExisting?: (id: string) => void;
};

function DragHandle(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      aria-label="Переместить блок стрелками вверх и вниз"
      className="sb-sort-handle absolute left-2 top-2 z-20 opacity-0 group-hover:opacity-100 focus:opacity-100 transition
                 text-xs px-1.5 py-0.5 rounded bg-[#151a2e] border border-[#2a2f45] text-[#e6e9f4] cursor-grab"
    >
      ⠿
    </div>
  );
}

function SortableItem({
  id,
  children,
  onMove,
  locked,
}: {
  id: string;
  children: React.ReactNode;
  onMove: (direction: -1 | 1) => void;
  locked?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: locked });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : "auto",
  };

  return (
    <div ref={setNodeRef} style={style} data-canvas-block={id} className={`group relative col-span-full ${locked ? "" : "sb-sortable-block"}`}>
      {!locked && <DragHandle {...attributes} {...listeners} onKeyDown={(event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        onMove(event.key === "ArrowUp" ? -1 : 1);
      }} />}
      <button type="button" draggable={!locked} disabled={locked} title="Перетащить блок в ячейку"
        className="absolute right-2 top-2 z-20 rounded border border-[#2a2f45] bg-[#151a2e] px-2 text-xs text-white opacity-0 group-hover:opacity-100 focus:opacity-100"
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(BLOCK_DRAG_TYPE, id);
        }}
        onClick={(event) => event.stopPropagation()}>В ячейку</button>
      {children}
    </div>
  );
}

function InsertSlot({ id, onInsert, onMoveExisting, variant }: InsertSlotProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [widgetOver, setWidgetOver] = useState(false);


  // Состояние мастера для слота секции
  const [stage, setStage] = useState<"root" | "layout" | "flex" | "grid">("root");

  const [rows, setRows] = useState(1);
  const isSectionMaster = variant === "section" || stage !== "root";

  return (
    <div className="col-span-full">
      <div
        ref={setNodeRef}
        data-insert-slot={id}
        onDragOver={(event) => {
          const types = Array.from(event.dataTransfer.types);
          if (!types.includes(WIDGET_DRAG_TYPE) && !types.includes(BLOCK_DRAG_TYPE)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = types.includes(BLOCK_DRAG_TYPE) ? "move" : "copy";
          setWidgetOver(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setWidgetOver(false);
        }}
        onDrop={(event) => {
          const type = readWidgetType(event.dataTransfer);
          const existing = event.dataTransfer.getData(BLOCK_DRAG_TYPE);
          setWidgetOver(false);
          if (!type && !existing) return;
          event.preventDefault();
          event.stopPropagation();
          if (type) onInsert?.(type);
          else onMoveExisting?.(existing);
        }}
        className={[
          "my-2 rounded-lg border border-dashed border-[#a1a1aa]",
          isOver || widgetOver ? "border-[#6E59F2] bg-[#eeeafe] shadow-[0_0_0_2px_rgba(110,89,242,0.4)]" : "bg-white",
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

                  <div className="text-xs text-[#57536b] text-center">
                    {widgetOver ? "Отпустите виджет здесь" : "Перетащите виджет сюда или добавьте секцию"}
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
                    <span className="font-semibold text-[#6E59F2]">Сетка</span> — раскладка ячеек по колонкам.
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
                      onClick={() => { setRows(1); setStage("grid"); }}
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
                        Ячейки с выбранными пропорциями колонок.
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
                          : "Выберите число строк и пропорции колонок"}
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

                  {stage === "grid" && <label className="sb-preset-rows">Строки сетки
                    <select value={rows} onChange={event => setRows(Number(event.target.value))}>
                      {Array.from({ length: 16 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                    </select>
                  </label>}
                  <div
                    className={
                      stage === "flex"
                        ? "grid grid-cols-2 sm:grid-cols-4 gap-2"
                        : "grid grid-cols-2 sm:grid-cols-3 gap-2"
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
                            [1, 1, 1, 1, 1],
                            [1, 1, 1, 1, 1, 1],
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
                        aria-label={`Макет: ${cols.length} ${cols.length === 1 ? "колонка" : cols.length < 5 ? "колонки" : "колонок"}, пропорции ${cols.join(" к ")}${stage === "grid" ? ", строк " + rows : ""}`}
                        onClick={() => {
                          if (stage === "grid") onInsert?.("grid", { columns: cols, rows });
                          else onInsert?.("section", cols);
                          setStage("root");
                        }}
                        className="flex flex-col items-center gap-1 rounded-lg border border-[#e5e2f1] bg-[#fbfaff] px-2 py-2 hover:border-[#6E59F2] hover:bg-[#f1eeff] transition focus-visible:outline-2 focus-visible:outline-[#6E59F2]"
                      >
                        <div data-layout-preview={cols.join("-")} aria-hidden="true" className="sb-column-preview"
                          style={{ minHeight: stage === "grid" ? Math.max(40, rows * 5 + 4) : undefined, gridTemplateColumns: cols.map(weight => `minmax(0, ${weight}fr)`).join(" "), gridTemplateRows: `repeat(${stage === "grid" ? rows : 1}, minmax(0,1fr))` }}>
                          {Array.from({length: cols.length * (stage === "grid" ? rows : 1)}, (_, i) => <span key={i} />)}
                        </div>
                        <span className="sb-preset-caption">{stage === "grid" ? `${cols.length} × ${rows}` : `${cols.length} ${cols.length === 1 ? "колонка" : cols.length < 5 ? "колонки" : "колонок"}`} · {cols.join(" : ")}</span>
                      </button>
                    ))}
                  </div>
                  <CustomLayout key={stage} grid={stage === "grid"} onInsert={(weights, height) => {
                    if (stage === "grid") onInsert?.("grid", {columns: weights, rows: height});
                    else onInsert?.("section", weights);
                    setStage("root");
                  }} />
                </div>
              )}
            </div>
          ) : (
           // ─────────────────────────────────────
            // Обычный слот — только зона дропа без мини-палитры
            // ─────────────────────────────────────
            <div className="flex items-center justify-center gap-3 py-2 text-xs text-center text-[#57536b]">
              {widgetOver || isOver ? "Отпустите здесь" : "Место вставки виджета"}
              <button type="button" title="Выбрать макет секции" aria-label="Выбрать макет секции" onClick={(event) => { event.stopPropagation(); setStage("layout"); }}
                className="grid h-7 w-7 place-items-center rounded-full border border-[#bcb1eb] bg-[#f5f2ff] text-base text-[#5946b5] hover:bg-[#e8e1ff]">+</button>
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
  onMoveToRoot,
}: Props<T>) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const ids = useMemo(() => blocks.map((b) => b.id), [blocks]);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const slot = /^slot-(\d+)$/.exec(String(over.id));
    if (slot) {
      const oldIndex = ids.indexOf(String(active.id));
      const next = moveBlockToSlot(blocks, oldIndex, Number(slot[1]));
      if (next !== blocks) onReorder(next);
    } else if (active.id !== over.id) {
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex !== -1 && newIndex !== -1) onReorder(arrayMove(blocks, oldIndex, newIndex));
    }
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
            variant={blocks.length === 0 ? "section" : "default"}
            onInsert={(t, preset) => onInsertAt?.(0, t, preset)}
            onMoveExisting={(id) => onMoveToRoot?.(0, id)}
          />
          {blocks.map((b, i) => (
            <React.Fragment key={b.id}>
              <SortableItem id={b.id} locked={b.locked} onMove={(direction) => {
                const target = i + direction;
                if (target >= 0 && target < blocks.length) onReorder(arrayMove(blocks, i, target));
              }}>{renderBlock(b)}</SortableItem>
              <InsertSlot id={`slot-${i + 1}`} onInsert={(t, preset) => onInsertAt?.(i + 1, t, preset)} onMoveExisting={(id) => onMoveToRoot?.(i + 1, id)} />
            </React.Fragment>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
