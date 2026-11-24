import { useState } from "react";
import { Link2, Unlink2, RotateCcw } from "lucide-react";
import { corners, cornerStyles, stateKey, type WidgetState } from "../../corners";
import { resolveResponsiveStyle } from "../../responsiveStyle";
import type { Block, Device, StyleLayer } from "../../types";
import type { BlockPatch } from "../patch";

type Props = {
  block: Extract<Block, { type: "btn" | "img" }>;
  device: Device;
  state: WidgetState;
  onPatch: (patch: BlockPatch) => void;
};

export default function CornerControl({ block, device, state, onPatch }: Props) {
  const layers = block.type === "img" ? block.imageStyleByBp : block.buttonStyleByBp;
  const layer: StyleLayer = layers?.[device] ?? {};
  const limit = block.type === "img" ? 512 : 256;
  const styled = cornerStyles(layers, device, state, limit);
  const [linked, setLinked] = useState(() => !corners.some(([corner]) => styled["border" + corner + "Radius"]));
  const key = (field: string) => stateKey(state, field);
  function patch(fields: string[], value?: number | string) {
    onPatch((current) => {
      if (current.type !== "img" && current.type !== "btn") return {};
      const collection = current.type === "btn" ? "buttonStyleByBp" : "imageStyleByBp";
      const all = current.type === "btn" ? current.buttonStyleByBp : current.imageStyleByBp;
      const next: StyleLayer = { ...all?.[device] };
      for (const field of fields) {
        if (value === undefined) delete next[key(field)];
        else next[key(field)] = value;
      }
      return { [collection]: { ...all, [device]: next } };
    });
  }
  const fields = corners.map(([corner]) => "radius" + corner);
  const unit = resolveResponsiveStyle({}, layers, device)[key("radiusUnit")] === "%" ? "%" : "px";
  return (
    <fieldset className="sb-four-control">
      <legend>Углы рамки</legend>
      <div className="sb-four-tools">
        <button
          type="button"
          aria-label="Связать углы"
          aria-pressed={linked}
          title="Связать углы"
          onClick={() => setLinked(!linked)}
        >
          {linked ? <Link2 size={14} /> : <Unlink2 size={14} />}
        </button>
        <select
          aria-label="Единица радиуса"
          value={layer[key("radiusUnit")] ?? ""}
          onChange={(e) => patch(["radiusUnit"], e.target.value || undefined)}
        >
          <option value="">Авто ({unit})</option>
          <option value="px">px</option>
          <option value="%">%</option>
        </select>
        <button
          type="button"
          aria-label="Сбросить радиусы углов"
          title="Сбросить радиусы углов"
          onClick={() => patch([...fields, "radius", "radiusUnit"])}
        >
          <RotateCcw size={13} />
        </button>
      </div>
      <div className="sb-four-fields">
        {corners.map(([corner, label], index) => (
          <label key={corner}>
            <span>{label}</span>
            <input
              type="number"
              min={0}
              max={limit}
              value={layer[key(fields[index])] ?? ""}
              placeholder={String(parseFloat(styled["border" + corner + "Radius"] ?? styled.borderRadius ?? "") || 0)}
              onChange={(e) => {
                const n = e.target.valueAsNumber;
                if (!e.target.value || Number.isFinite(n))
                  patch(
                    linked ? fields : [fields[index]],
                    e.target.value === "" ? undefined : Math.min(limit, Math.max(0, n))
                  );
              }}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
