// src/screens/SiteBuilder/blocks/divider/view.tsx
import type { DividerBlock } from "../../types";

export default function DividerView({ block }: { block: DividerBlock }) {
  const width = typeof block.width === "number" && Number.isFinite(block.width) ? Math.max(1, Math.min(100, block.width)) : 100;
  const thickness = typeof block.thickness === "number" && Number.isFinite(block.thickness) ? Math.max(1, Math.min(12, block.thickness)) : 1;
  const color = typeof block.color === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(block.color) ? block.color : "#2a2f45";
  const style = ["solid", "dashed", "dotted", "double"].includes(block.lineStyle || "") ? block.lineStyle : "solid";
  return <hr style={{ width: `${width}%`, border: 0, borderTop: `${thickness}px ${style} ${color}`, margin: block.align === "right" ? "16px 0 16px auto" : block.align === "center" ? "16px auto" : "16px auto 16px 0" }} />;
}
