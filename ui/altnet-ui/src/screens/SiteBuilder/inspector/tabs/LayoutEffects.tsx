import type { Block, Device, StyleLayer } from "../../types";
import type { BlockPatch } from "../patch";
import { useClassStyle } from "../../styleClassesContext";
import { lengthUnits, sides } from "../../boxDimensions";

type Props = { block: Block; device: Device; onPatch: (patch: BlockPatch) => void };
export default function LayoutEffects({ block, device, onPatch }: Props) {
  const current = block.styleByBp?.[device] ?? {};
  const resolved = useClassStyle(block, device);
  function edit(key: string, value: string | number | undefined) {
    onPatch(latest => {
      const layer: StyleLayer = { ...latest.styleByBp?.[device] };
      if (value === undefined) delete layer[key]; else layer[key] = value;
      return { styleByBp: { ...latest.styleByBp, [device]: layer } };
    });
  }
  return <details className="sb-transform-controls">
    <summary>Расположение и переполнение</summary>
    <label>Позиция
      <select aria-label="Позиция блока" value={typeof current.positionMode === "string" ? current.positionMode : ""}
        onChange={event => edit("positionMode", event.target.value || undefined)}>
        <option value="">Наследовать</option>
        <option value="normal">В потоке</option>
        <option value="relative">Относительная</option>
      </select>
    </label>
    {resolved.positionMode === "relative" && <fieldset className="sb-four-control">
      <legend>Смещение от исходного положения</legend>
      <div className="sb-four-tools">
        <select aria-label="Единица смещения" value={current.positionUnit ?? ""}
          onChange={event => edit("positionUnit", event.target.value || undefined)}>
          <option value="">Авто ({String(resolved.positionUnit ?? "px")})</option>
          {lengthUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}
        </select>
      </div>
      <div className="sb-four-fields">{sides.map(([key, side, label]) => {
        const field = "position" + key.toUpperCase();
        return <label key={side}><span>{label}</span><input type="number" step="any" min={-5000} max={5000}
          aria-label={"Смещение блока " + label.toLowerCase()}
          value={typeof current[field] === "number" ? current[field] : ""}
          placeholder={typeof resolved[field] === "number" ? String(resolved[field]) : "Авто"}
          onChange={event => {
            if (!event.target.value) edit(field, undefined);
            else if (Number.isFinite(event.target.valueAsNumber)) edit(field, Math.max(-5000, Math.min(5000, event.target.valueAsNumber)));
          }}/></label>;
      })}</div>
    </fieldset>}
    {([
      ["overflowMode", "Переполнение", [["visible", "Видимое"], ["hidden", "Скрыто"], ["clip", "Обрезать"], ["auto", "Автоматически"], ["scroll", "Прокрутка"]]],
      ["stackingIsolation", "Изоляция наложения", [["auto", "Автоматически"], ["isolate", "Изолировать"]]],
      ["mouseCursor", "Указатель мыши", [["auto", "Автоматически"], ["default", "Обычный"], ["pointer", "Рука"], ["text", "Текст"], ["grab", "Захват"], ["zoom-in", "Увеличение"], ["zoom-out", "Уменьшение"]]],
    ] as const).map(([key, label, options]) => <label key={key}>{label}
      <select aria-label={label} value={typeof current[key] === "string" ? current[key] : ""}
        onChange={event => edit(key, event.target.value || undefined)}>
        <option value="">Наследовать{typeof resolved[key] === "string" ? " (" + resolved[key] + ")" : ""}</option>
        {options.map(([value, title]) => <option key={value} value={value}>{title}</option>)}
      </select>
    </label>)}
    <label>Порядок наложения
      <input type="number" aria-label="Порядок наложения" min={-9999} max={9999} step={1}
        value={typeof current.layerOrder === "number" ? current.layerOrder : ""}
        placeholder={typeof resolved.layerOrder === "number" ? String(resolved.layerOrder) : "Наследовать"}
        onChange={event => {
          const raw = event.target.value;
          if (!raw) { edit("layerOrder", undefined); return; }
          const value = Number(raw);
          if (Number.isInteger(value) && value >= -9999 && value <= 9999) edit("layerOrder", value);
        }}/>
    </label>
  </details>;
}
