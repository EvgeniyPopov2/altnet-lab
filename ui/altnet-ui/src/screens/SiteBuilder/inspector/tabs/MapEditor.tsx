import type { MapBlock } from "../../types";
import type { BlockPatch } from "../patch";
import { mapSettings } from "../../blocks/map/geometry";
import Field from "../../ui/Field";

export default function MapEditor({ block, onPatch }: { block: MapBlock; onPatch: (patch: BlockPatch) => void }) {
  const settings = mapSettings(block);
  return (
    <div className="grid gap-2">
      <Field label="Название места">
        <input value={settings.label} onChange={(e) => onPatch({ label: e.target.value })} />
      </Field>
      {(
        [
          ["lat", "Широта", -90, 90, "any"],
          ["lon", "Долгота", -180, 180, "any"],
          ["zoom", "Масштаб подробной карты", 1, 20, 1],
          ["height", "Высота карты, px", 100, 1000, 1],
        ] as const
      ).map(([key, label, min, max, step]) => (
        <Field label={label} key={key}>
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={settings[key]}
            onChange={(e) => {
              const n = e.target.valueAsNumber;
              if (Number.isFinite(n)) onPatch({ [key]: Math.max(min, Math.min(max, n)) });
            }}
          />
        </Field>
      ))}
      <Field label="Оформление карты">
        <select value={settings.mapTheme} onChange={(e) => onPatch({ mapTheme: e.target.value })}>
          <option value="auto">Автоматически</option>
          <option value="light">Светлое</option>
          <option value="dark">Тёмное</option>
        </select>
      </Field>
      <label>
        <input
          type="checkbox"
          checked={settings.detailMap}
          onChange={(e) => onPatch({ detailMap: e.target.checked })}
        />{" "}
        Подробная карта по нажатию
      </label>
      <p className="text-xs">
        Обзорная карта работает автономно. В экспортированном сайте посетитель может загрузить карту улиц из
        OpenStreetMap.
      </p>
    </div>
  );
}
