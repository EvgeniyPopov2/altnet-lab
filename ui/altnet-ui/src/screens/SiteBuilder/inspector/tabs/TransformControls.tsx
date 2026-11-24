import { useClassStyle } from "../../styleClassesContext";
import { useRef, useState } from "react";
import { transformKey, transforms } from "../../transforms";
import type { Block, Device, StyleLayer } from "../../types";
import type { BlockPatch } from "../patch";

type Props = { block: Block; device: Device; onPatch: (patch: BlockPatch, group?: string) => void };
export default function TransformControls({ block, device, onPatch }: Props) {
  const gesture = useRef<string | undefined>(undefined);
  const [hover, setHover] = useState(false);
  const current: StyleLayer = block.styleByBp?.[device] ?? {};
  const resolved = useClassStyle(block, device);
  function edit(fields: string[], value?: string | number, group?: string) {
    onPatch((latest) => {
      const layer: StyleLayer = { ...latest.styleByBp?.[device] };
      for (const key of fields) {
        if (value === undefined) delete layer[key];
        else layer[key] = value;
      }
      return { styleByBp: { ...latest.styleByBp, [device]: layer } };
    }, group);
  }
  const mode = transformKey("transformMode", hover);
  const parameters = [
    ...transforms,
    { id: "originX", name: "Центр по X", min: 0, max: 100, step: 1, initial: 50, unit: "%" },
    { id: "originY", name: "Центр по Y", min: 0, max: 100, step: 1, initial: 50, unit: "%" },
    ...(!hover
      ? [{ id: "transformDuration", name: "Длительность перехода", min: 0, max: 5000, step: 1, initial: 0, unit: "ms" }]
      : []),
  ];
  return (
    <details className="sb-transform-controls">
      <summary>Трансформация</summary>
      <div className="sb-four-tools">
        {["Обычное", "При наведении"].map((label, index) => (
          <button key={label} type="button" aria-pressed={hover === !!index} onClick={() => setHover(!!index)}>
            {label}
          </button>
        ))}
      </div>
      <label>
        Режим трансформации
        <select value={current[mode] ?? ""} onChange={(e) => edit([mode], e.target.value || undefined)}>
          <option value="">Наследовать</option>
          <option value="on">Применить</option>
          <option value="none">Отключить</option>
        </select>
      </label>
      {resolved[mode] !== "none" &&
        parameters.map(({ id, name, min, max, step, initial, unit }) => {
          const key = transformKey(id, hover);
          const inherited = resolved[key] ?? (hover ? resolved[id] : undefined);
          const value = typeof inherited === "number" ? inherited : initial;
          const label = name + (unit ? " (" + unit + ")" : "");
          return (
            <div className="sb-transform-row" key={key}>
              <span>{label}</span>
              <input
                aria-label={label + " — ползунок"}
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onPointerDown={() => {
                  gesture.current = crypto.randomUUID();
                }}
                onPointerUp={() => {
                  gesture.current = undefined;
                }}
                onBlur={() => {
                  gesture.current = undefined;
                }}
                onChange={(e) => edit([key], e.target.valueAsNumber, gesture.current)}
              />
              <input
                aria-label={label}
                type="number"
                min={min}
                max={max}
                step={step}
                value={current[key] ?? ""}
                placeholder={String(value)}
                onChange={(e) => {
                  if (!e.target.value) edit([key]);
                  else if (Number.isFinite(e.target.valueAsNumber))
                    edit([key], Math.max(min, Math.min(max, e.target.valueAsNumber)));
                }}
              />
            </div>
          );
        })}
      <button type="button" onClick={() => edit([mode, ...parameters.map(({ id }) => transformKey(id, hover))])}>
        Сбросить трансформацию
      </button>
    </details>
  );
}
