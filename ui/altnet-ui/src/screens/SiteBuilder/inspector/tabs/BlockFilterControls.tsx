import { useRef, useState } from "react";
import { blockFilterKey, blockFilters } from "../../blockFilters";
import { useClassStyle } from "../../styleClassesContext";
import type { Block, Device, StyleLayer } from "../../types";
import type { BlockPatch } from "../patch";

export default function BlockFilterControls({ block, device, onPatch }: { block: Block; device: Device; onPatch: (patch: BlockPatch, group?: string) => void }) {
  const [hover, setHover] = useState(false);
  const gesture = useRef<string | undefined>(undefined);
  const current = block.styleByBp?.[device] ?? {};
  const resolved = useClassStyle(block, device);
  const key = (id: string) => blockFilterKey(id, hover);
  const mode = resolved[key("Mode")] ?? (hover ? resolved.blockFilterMode : undefined);
  function edit(field: string, value?: string | number, group?: string) {
    onPatch(latest => {
      const layer: StyleLayer = { ...latest.styleByBp?.[device] };
      if (value === undefined) delete layer[field]; else layer[field] = value;
      return { styleByBp: { ...latest.styleByBp, [device]: layer } };
    }, group);
  }
  return <details className="sb-transform-controls">
    <summary>Цветовые эффекты блока</summary>
    <div className="sb-four-tools" role="group" aria-label="Состояние эффектов">
      <button type="button" aria-pressed={!hover} onClick={() => setHover(false)}>Обычное</button>
      <button type="button" aria-pressed={hover} onClick={() => setHover(true)}>При наведении</button>
    </div>
    <label>Фильтры
      <select aria-label="Фильтры блока" value={current[key("Mode")] ?? ""} onChange={event => edit(key("Mode"), event.target.value || undefined)}>
        <option value="">Наследовать</option><option value="on">Настроить</option><option value="none">Без фильтров</option>
      </select>
    </label>
    {mode === "on" && blockFilters.map(item => {
      const inherited = resolved[key(item.id)] ?? (hover ? resolved[blockFilterKey(item.id, false)] : undefined);
      const value = typeof inherited === "number" ? inherited : item.initial;
      const label = item.name + " (" + item.unit + ")" + (hover ? " при наведении" : "");
      return <div className="sb-transform-row" key={item.id}>
        <span>{label}</span>
        <input type="range" aria-label={label + " — ползунок"} min={item.min} max={item.max} value={value}
          onPointerDown={() => { gesture.current = crypto.randomUUID(); }}
          onPointerUp={() => { gesture.current = undefined; }}
          onPointerCancel={() => { gesture.current = undefined; }}
          onKeyDown={() => { if (!gesture.current) gesture.current = crypto.randomUUID(); }}
          onKeyUp={() => { gesture.current = undefined; }}
          onBlur={() => { gesture.current = undefined; }}
          onChange={event => edit(key(item.id), event.target.valueAsNumber, gesture.current)}/>
        <input type="number" aria-label={label} min={item.min} max={item.max} value={current[key(item.id)] ?? ""} placeholder={String(value)}
          onChange={event => {
            if (!event.target.value) edit(key(item.id));
            else if (Number.isFinite(event.target.valueAsNumber)) edit(key(item.id), Math.min(item.max, Math.max(item.min, event.target.valueAsNumber)));
          }}/>
      </div>;
    })}
    <label>Длительность перехода, мс
      <input type="number" aria-label="Длительность перехода фильтра, мс" min={0} max={5000} step={10}
        value={current.blockFilterDuration ?? ""} placeholder={String(resolved.blockFilterDuration ?? 0)}
        onChange={event => {
          if (!event.target.value) edit("blockFilterDuration");
          else if (Number.isFinite(event.target.valueAsNumber)) edit("blockFilterDuration", Math.max(0, Math.min(5000, event.target.valueAsNumber)));
        }}/>
    </label>
  </details>;
}
