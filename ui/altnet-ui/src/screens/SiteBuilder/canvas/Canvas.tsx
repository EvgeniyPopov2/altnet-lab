// src/screens/SiteBuilder/canvas/Canvas.tsx
import React from "react";
import SortableCanvas from "../../../builder/SortableCanvas";

// Берём типы пропсов прямо из SortableCanvas, чтобы не сломать контракт
export type CanvasProps = React.ComponentProps<typeof SortableCanvas>;

/**
 * Canvas — обёртка над SortableCanvas.
 * Сейчас — 1:1 проксирование пропсов. Далее сюда добавим rulers/overlays,
 * responsive-рамки, слои выделения, подсказки дропа и т.п.
 */
export default function Canvas(props: CanvasProps) {
  return <SortableCanvas {...props} />;
}
