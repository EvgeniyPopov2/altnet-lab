import { useState, type DragEvent, type ReactNode } from "react";
import type { Block } from "../types";
import type { InsertChoice } from "../../../builder/SortableCanvas";
import { BLOCK_DRAG_TYPE, readWidgetType, WIDGET_DRAG_TYPE } from "../palette/drag";
import { cellsOf } from "../layoutTree";
import { resolveFlexLayout, resolveGridGaps, resolveLayout, type LayoutBreakpoint } from "../layoutResponsive";
import { gridColumnCount, gridCoveredCells, gridTracks, readGridMerges } from "../gridLayout";
import "./layoutCanvas.css";

type LayoutBlock = Extract<Block, { type: "grid" | "section" | "container" | "offcanvas" }>;
type Props = {
  block: LayoutBlock;
  device: LayoutBreakpoint;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChooseCell: (parentId: string, cellIndex: number) => void;
  onInsert: (parentId: string, cellIndex: number, type: InsertChoice, preset?: number[], at?: number) => void;
  onMove: (id: string, parentId: string, cellIndex: number, at?: number) => void;
  onRemove: (id: string) => void;
  renderChild: (block: Block) => ReactNode;
};

export default function LayoutCanvas({ block, device, selectedId, onSelect, onChooseCell, onInsert, onMove, onRemove, renderChild }: Props) {
  const [over, setOver] = useState<number | null>(null);
  const cells = cellsOf(block) ?? [];
  const locked = "locked" in block && Boolean(block.locked);
  const layout = resolveLayout(block, device);
  const gaps = block.type === "grid" ? resolveGridGaps(block, device) : { x: layout.gap, y: layout.gap };
  const flex = block.type === "section" || block.type === "container" ? resolveFlexLayout(block, device) : null;
  const columns = (block.type === "grid" ? gridTracks(block, device) : layout.weights).map(weight => `minmax(0, ${weight}fr)`).join(" ");
  const merges = block.type === "grid" ? readGridMerges(block) || [] : [];
  const covered = block.type === "grid" ? gridCoveredCells(block) : new Set<number>();
  const columnCount = block.type === "grid" ? gridColumnCount(block) : cells.length;
  const sectionClass = block.type === "section" ? [
    block.theme === "dark" ? "bg-[#0b0d12] text-[#e7e9f0]" : "bg-white text-[#0b1022]",
    block.pad === "sm" ? "py-6" : block.pad === "lg" ? "py-16" : "py-10",
    block.bg === "card" ? "rounded-xl border border-[#777b8d]" : "",
    block.bg === "subtle" ? "bg-[#e7e9f4]" : block.bg === "accent" ? "bg-[#e8e5fa]" : "",
  ].join(" ") : block.type === "container" ? [
    "mx-auto",
    block.width === "sm" ? "max-w-screen-sm" : block.width === "lg" ? "max-w-screen-lg" : block.width === "xl" ? "max-w-screen-xl" : block.width === "full" ? "max-w-none" : "max-w-screen-md",
    block.padding === "none" ? "p-0" : block.padding === "sm" ? "p-3" : block.padding === "lg" ? "p-8" : "p-6",
    block.bg === "panel" ? "bg-[#0b1022]" : block.bg === "brand" ? "bg-[#101735]" : "",
    block.border ? "border border-[#1f2751]" : "", block.rounded ? "rounded-2xl" : "",
  ].join(" ") : "";
  const align = block.type === "section" && block.align === "center" ? "text-center" : block.type === "section" && block.align === "right" ? "text-right" : "text-left";

  function onDrop(event: DragEvent, index: number, at?: number) {
    if (locked) return;
    const type = readWidgetType(event.dataTransfer);
    const source = event.dataTransfer.getData(BLOCK_DRAG_TYPE);
    setOver(null);
    if (!type && !source) return;
    event.preventDefault();
    event.stopPropagation();
    if (type) onInsert(block.id, index, type, undefined, at);
    else onMove(source, block.id, index, at);
  }

  function insertionSlot(cellIndex: number, position: number) {
    return <div key={`slot-${position}`} data-cell-insert-slot={`${block.id}:${cellIndex}:${position}`}
      aria-label={`Вставить в ячейку ${cellIndex + 1}, позиция ${position + 1}`}
      onDrop={event => onDrop(event, cellIndex, position)}
      className="my-1 h-3 rounded border-t border-dashed border-[#aaa1c9] hover:border-2 hover:border-[#6E59F2]" />;
  }

  return (
    <div className={`p-3 ${sectionClass}`} style={flex?.contentWidth ? { maxWidth: "none" } : undefined}>
      {block.type === "section" && block.title && <h2 className={`mb-2 text-lg font-semibold ${align}`}>{block.title}</h2>}
      {block.type === "section" && block.text && <p className={`mb-2 ${align}`}>{block.text}</p>}
      {block.type === "container" && block.note && <p className="mb-2 text-xs text-[#677089]">{block.note}</p>}
      {block.type === "offcanvas" && <div className="mb-2 rounded border border-[#6E59F2] p-2 text-sm text-[#494274]"><strong>Содержимое выезжающей панели: {block.title || "Панель"}</strong>{block.body && <p className="whitespace-pre-wrap">{block.body}</p>}</div>}
      {block.type === "grid" && block.items?.length > 0 && <div className="mb-3 grid grid-cols-2 gap-2">
        {block.items.map((item, index) => <figure key={item.id || index}>
          <img className="max-w-full" src={item.src} alt={item.alt || ""} />
          {item.caption && <figcaption className="text-xs text-slate-700">{item.caption}</figcaption>}
        </figure>)}
      </div>}
      <div className="grid" data-layout-kind={flex ? "flex" : "grid"} style={flex?.row ?? { columnGap: `${gaps.x}px`, rowGap: `${gaps.y}px`, gridTemplateColumns: layout.mode === "stack" ? "minmax(0, 1fr)" : columns }}>
        {cells.map((items, index) => covered.has(index) ? null : (
          <div key={index} data-layout-cell={`${block.id}:${index}`}
            style={flex ? { flex: flex.cells[index], containerType: flex.sizing === "content" ? "normal" : undefined } : merges.length && layout.mode === "columns" ? {
              gridColumn: `${index % columnCount + 1} / span ${merges.find(item => item.start === index)?.columns || 1}`,
              gridRow: `${Math.floor(index / columnCount) + 1} / span ${merges.find(item => item.start === index)?.rows || 1}`,
            } : undefined}
            onDragOver={event => {
              if (locked) return;
              const types = Array.from(event.dataTransfer.types);
              if (!types.includes(WIDGET_DRAG_TYPE) && !types.includes(BLOCK_DRAG_TYPE)) return;
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = types.includes(BLOCK_DRAG_TYPE) ? "move" : "copy";
              setOver(index);
            }}
            onDragLeave={event => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null);
            }}
            onDrop={event => onDrop(event, index)}
            className={`layout-editor-cell min-h-28 min-w-0 rounded-lg border border-dashed p-1.5 ${over === index ? "border-[#6E59F2] bg-[#eeeafe] ring-2 ring-[#6E59F2]/40" : "border-[#aaa1c9] bg-[#faf9ff]"}`}>
            {block.type === "grid" && <div className="mb-1 text-[10px] text-[#655c87]">
              Строка {Math.floor(index / columnCount) + 1} · колонка {index % columnCount + 1}
              {merges.some(item => item.start === index) && ` · объединена ${merges.find(item => item.start === index)!.columns}×${merges.find(item => item.start === index)!.rows}`}
            </div>}
            {items.map((child, position) => (
              <div key={child.id}>
              {insertionSlot(index, position)}
              <div data-layout-block={child.id}
                className={`relative mb-2 min-w-0 rounded border bg-white p-1 ${selectedId === child.id ? "border-[#6E59F2]" : "border-slate-200"}`}
                style={{ overflowWrap: "anywhere" }}
                onClick={event => { event.stopPropagation(); onSelect(child.id); }}>
                <div className="mb-1 flex justify-end gap-1">
                  <button type="button" draggable={!("locked" in child && child.locked)} disabled={"locked" in child && Boolean(child.locked)}
                    onDragStart={event => { event.stopPropagation(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData(BLOCK_DRAG_TYPE, child.id); }}
                    onClick={event => event.stopPropagation()}
                    className="rounded border border-slate-300 px-1.5 text-xs text-slate-700" title="Перетащить в другую ячейку" aria-label="Перетащить в другую ячейку">⋮⋮</button>
                  <button type="button" disabled={locked || ("locked" in child && Boolean(child.locked))} onClick={event => { event.stopPropagation(); onRemove(child.id); }}
                    className="rounded border border-slate-300 px-2 text-xs text-slate-700" title="Удалить блок">×</button>
                </div>
                {renderChild(child)}
              </div>
              </div>
            ))}
            {items.length > 0 && insertionSlot(index, items.length)}
            <div className="flex min-h-14 flex-wrap items-center justify-center gap-1">
              <button type="button" disabled={locked} aria-label="Добавить виджет в ячейку" title="Добавить виджет в ячейку" onClick={event => { event.stopPropagation(); onChooseCell(block.id, index); }}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-[#57536b] hover:bg-[#eeeafe]">
                +<span className="layout-add-label"> {over === index ? "Отпустите здесь" : "Виджет"}</span>
              </button>
              <button type="button" disabled={locked} aria-label="Добавить вложенный контейнер с двумя колонками" title="Добавить вложенный контейнер с двумя колонками" onClick={event => { event.stopPropagation(); onInsert(block.id, index, "section", [1, 1]); }}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-[#eeeafe]">▦<span className="layout-add-label"> Контейнер</span></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
