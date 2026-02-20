// src/screens/SiteBuilder/canvas/Canvas.tsx
import React from "react";
import SortableCanvas from "../../../builder/SortableCanvas";
import type { Block } from "../types";

// Забираем точный тип onInsertAt у нативного компонента, чтобы совпал InsertChoice.
type NativeProps = React.ComponentProps<typeof SortableCanvas>;
type NativeOnInsertAt = NativeProps["onInsertAt"];

export type CanvasProps = {
  cols?: 1 | 2 | 3 | 4;
  gapX?: number;
  gapY?: number;
  blocks: Block[];
  /** Рендер блока нашего типа Block */
  renderBlock: (b: Block) => React.ReactNode;
  /** Обязателен, как и у SortableCanvas */
  onReorder: (next: Block[]) => void;
  /** Совместим с нативным InsertChoice */
  onInsertAt?: NativeOnInsertAt;
};

/**
 * Canvas — тонкая обёртка над SortableCanvas с адаптацией типов:
 * - renderBlock: (SortableLike) → (Block)
 * - onReorder: (SortableLike[]) → (Block[])
 * - onInsertAt: берём родной тип из SortableCanvas
 */
export default function Canvas(props: CanvasProps) {
  const { cols, gapX, gapY, blocks, renderBlock, onReorder, onInsertAt } = props;

  return (
    <SortableCanvas
      cols={cols}
      gapX={gapX}
      gapY={gapY}
      // Block гарантированно имеет id, значит совместим с SortableLike
      blocks={blocks as unknown as any[]}
      renderBlock={(b) => renderBlock(b as Block)}
      onReorder={(next) => onReorder(next as Block[])}
      onInsertAt={onInsertAt as NativeOnInsertAt}
    />
  );
}
