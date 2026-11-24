import type { Block, Device, StyleLayer } from "../../types";
import type { BlockPatch } from "../patch";
import { clipLabels, clipShapes } from "../../blockClip";
import { useClassStyle } from "../../styleClassesContext";

export default function BlockClipControls({block, device, onPatch}: {block: Block; device: Device; onPatch: (patch: BlockPatch) => void}) {
  const current = block.styleByBp?.[device] ?? {};
  const resolved = useClassStyle(block, device);
  return <details className="sb-transform-controls">
    <summary>Форма обрезки</summary>
    <label>Форма
      <select aria-label="Форма обрезки блока" value={typeof current.clipShape === "string" ? current.clipShape : ""} onChange={event => {
        const value = event.target.value;
        onPatch(latest => {
          const layer: StyleLayer = {...latest.styleByBp?.[device]};
          if (value) layer.clipShape = value; else delete layer.clipShape;
          return {styleByBp: {...latest.styleByBp, [device]: layer}};
        });
      }}>
        <option value="">Наследовать{typeof resolved.clipShape === "string" && clipShapes.includes(resolved.clipShape as typeof clipShapes[number]) ? ` (${clipLabels[resolved.clipShape as typeof clipShapes[number]]})` : ""}</option>
        {clipShapes.map(shape => <option key={shape} value={shape}>{clipLabels[shape]}</option>)}
      </select>
    </label>
    <p>Форма обрезает блок вместе с его содержимым. Загрузка внешних масок не используется.</p>
  </details>;
}
