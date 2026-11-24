import { useState } from "react";
import { fromSvgFile, textPathOptions } from "../../textPath";
import type { TextPathBlock } from "../../types";
import type { BlockPatch } from "../patch";
import Field from "../../ui/Field";

const shapeNames = {
  wave: "Волна",
  arc: "Дуга",
  circle: "Окружность",
  line: "Прямая",
  oval: "Овал",
  spiral: "Спираль",
  custom: "Свой SVG",
};
export default function TextPathEditor({ block, onPatch }: { block: TextPathBlock; onPatch: (p: BlockPatch) => void }) {
  const s = textPathOptions(block),
    [error, setError] = useState("");
  return (
    <div className="grid gap-2">
      <Field label="Надпись">
        <textarea value={s.text} onChange={(e) => onPatch({ text: e.target.value })} />
      </Field>
      <Field label="Форма контура">
        <select value={s.shape} onChange={(e) => onPatch({ shape: e.target.value })}>
          {Object.entries(shapeNames).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      {s.shape === "custom" && (
        <Field label="SVG с контуром">
          <input
            type="file"
            accept=".svg,image/svg+xml"
            onChange={async (e) => {
              const input = e.currentTarget,
                file = input.files?.[0];
              if (!file) return;
              try {
                if (file.size > 512 * 1024) throw Error("Максимальный размер SVG — 512 КиБ.");
                const path = fromSvgFile(await file.text());
                if (input.isConnected) {
                  onPatch(path);
                  setError("");
                }
              } catch (e) {
                if (input.isConnected) setError(e instanceof Error ? e.message : "Не удалось прочитать SVG.");
              } finally {
                input.value = "";
              }
            }}
          />
        </Field>
      )}
      {error && <p role="alert">{error}</p>}
      <Field label="Ссылка надписи">
        <input value={block.href ?? ""} onChange={(e) => onPatch({ href: e.target.value })} />
      </Field>
      <Field label="Выравнивание вдоль контура">
        <select value={s.align} onChange={(e) => onPatch({ align: e.target.value, start: undefined })}>
          <option value="start">Начало</option>
          <option value="middle">Центр</option>
          <option value="end">Конец</option>
        </select>
      </Field>
      <Field label="Направление текста">
        <select value={s.direction} onChange={(e) => onPatch({ direction: e.target.value })}>
          <option value="auto">Автоматически</option>
          <option value="ltr">Слева направо</option>
          <option value="rtl">Справа налево</option>
        </select>
      </Field>
      <Field label="Размер контура">
        <input
          type="number"
          min={0.1}
          max={2000}
          value={s.size}
          onChange={(e) => {
            if (Number.isFinite(e.target.valueAsNumber)) onPatch({ size: e.target.valueAsNumber });
          }}
        />
      </Field>
      <Field label="Единица размера">
        <select value={s.unit} onChange={(e) => onPatch({ unit: e.target.value })}>
          {["px", "%", "em", "rem", "vw"].map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </Field>
      {(
        [
          ["rotate", "Поворот, °", -360, 360],
          ["start", "Начало текста, %", 0, 100],
          ["fontSize", "Размер букв", 1, 300],
          ["wordSpacing", "Интервал между словами", -20, 100],
          ["strokeWidth", "Толщина линии", 0, 50],
        ] as const
      ).map(([key, label, min, max]) => (
        <Field label={label} key={key}>
          <span className="flex items-center gap-1">
            <input
              type="range"
              min={min}
              max={max}
              value={s[key]}
              aria-label={label}
              onChange={(e) => onPatch({ [key]: Number(e.target.value) })}
            />
            <output>{s[key]}</output>
          </span>
        </Field>
      ))}
      <label>
        <input type="checkbox" checked={s.showPath} onChange={(e) => onPatch({ showPath: e.target.checked })} />{" "}
        Показывать контур
      </label>
      {(
        [
          ["color", "Цвет букв"],
          ["hoverColor", "Буквы при наведении"],
          ["stroke", "Цвет линии"],
          ["hoverStroke", "Линия при наведении"],
        ] as const
      ).map(([key, label]) => (
        <Field label={label} key={key}>
          <input
            type="color"
            value={/^#[a-f0-9]{6}$/i.test(s[key]) ? s[key] : "#151826"}
            onChange={(e) => onPatch({ [key]: e.target.value })}
          />
        </Field>
      ))}
    </div>
  );
}
