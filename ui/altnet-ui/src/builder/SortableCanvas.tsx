import React, { useMemo } from "react";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type SortableLike = { id: string };

type Props<T extends SortableLike> = {
  cols?: 1 | 2 | 3 | 4;
  gapX?: number;
  gapY?: number;
  blocks: T[];
  renderBlock: (b: T) => React.ReactNode;
  onReorder: (next: T[]) => void;
};

function SortableItem({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : "auto",
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      {/* Хэндл перетаскивания */}
      <div
        className="absolute -left-2 -top-2 opacity-0 group-hover:opacity-100 transition
                   text-xs px-1.5 py-0.5 rounded bg-[#151a2e] border border-[#2a2f45] text-[#e6e9f4] cursor-grab"
        {...attributes}
        {...listeners}
      >
        ⠿
      </div>
      {children}
    </div>
  );
}

export default function SortableCanvas<T extends SortableLike>({
  cols = 3, gapX = 16, gapY = 16, blocks, renderBlock, onReorder,
}: Props<T>) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const ids = useMemo(() => blocks.map((b) => b.id), [blocks]);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(blocks, oldIndex, newIndex));
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
          {blocks.map((b) => (
            <SortableItem key={b.id} id={b.id}>
              {renderBlock(b)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
