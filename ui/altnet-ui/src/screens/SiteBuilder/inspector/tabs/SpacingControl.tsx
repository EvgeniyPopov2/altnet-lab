import { useClassStyle } from "../../styleClassesContext";
import { useState } from "react";
import { Link2, Unlink2, RotateCcw } from "lucide-react";
import { lengthUnits, sides, spacingStyle } from "../../boxDimensions";
import type { Block, Device, StyleLayer } from "../../types";
import type { BlockPatch } from "../patch";

export default function SpacingControl({
  block,
  device,
  kind,
  onPatch,
}: {
  block: Block;
  device: Device;
  kind: "padding" | "margin";
  onPatch: (patch: BlockPatch) => void;
}) {
  const current: StyleLayer = block.styleByBp?.[device] ?? {};
  const resolved = useClassStyle(block, device);
  const values = spacingStyle(resolved);
  const [linked, setLinked] = useState(() => new Set(sides.map(([, side]) => values[kind + side] ?? "0px")).size === 1);
  const unitKey = kind + "Unit";
  const group = kind === "padding" ? "Внутренний отступ" : "Внешний отступ";
  const keys = sides.map(([key]) => kind[0] + key);
  function patch(fields: string[], value?: string | number) {
    onPatch((latest) => {
      const layers = latest.styleByBp ?? {};
      const layer: StyleLayer = { ...layers[device] };
      for (const key of fields) {
        if (value === undefined) delete layer[key];
        else layer[key] = value;
      }
      return { styleByBp: { ...layers, [device]: layer } };
    });
  }
  return (
    <fieldset className="sb-four-control">
      <legend>{group}</legend>
      <div className="sb-four-tools">
        <button
          type="button"
          aria-label={group + " — связать стороны"}
          aria-pressed={linked}
          onClick={() => setLinked(!linked)}
        >
          {linked ? <Link2 size={14} /> : <Unlink2 size={14} />}
        </button>
        <select
          aria-label={group + " — единица"}
          value={current[unitKey] ?? ""}
          onChange={(e) => patch([unitKey], e.target.value || undefined)}
        >
          <option value="">Авто ({String(resolved[unitKey] ?? "px")})</option>
          {lengthUnits.map((unit) => (
            <option key={unit}>{unit}</option>
          ))}
        </select>
        <button
          type="button"
          aria-label={group + " — сбросить"}
          onClick={() => patch([...keys, unitKey, ...(kind === "padding" ? ["py"] : [])])}
        >
          <RotateCcw size={13} />
        </button>
      </div>
      <div className="sb-four-fields">
        {sides.map(([, side, label], index) => (
          <label key={side}>
            <span>{label}</span>
            <input
              type="number"
              step="any"
              min={kind === "margin" ? -512 : 0}
              max={512}
              value={current[keys[index]] ?? ""}
              placeholder={String(parseFloat(values[kind + side] ?? "0"))}
              aria-label={group + " " + label.toLowerCase()}
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                if (!e.target.value || Number.isFinite(v))
                  patch(
                    linked ? keys : [keys[index]],
                    e.target.value === "" ? undefined : Math.max(kind === "margin" ? -512 : 0, Math.min(512, v))
                  );
              }}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
