import { useEffect, useRef, useState } from "react";
import { lottieOptions, MAX_LOTTIE_BYTES, readAnimation, triggers } from "../../lottie";
import type { LottieBlock } from "../../types";
import type { BlockPatch } from "../patch";
import Field from "../../ui/Field";
import LocalImageInput from "./LocalImageInput";

export default function LottieEditor({ block, onPatch }: { block: LottieBlock; onPatch: (patch: BlockPatch) => void }) {
  const [error, setError] = useState("");
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const opts = lottieOptions(block);
  const names = {
    viewport: "В области просмотра",
    click: "Нажатие",
    hover: "Наведение",
    scroll: "Прокрутка",
    none: "Вручную",
  };
  return (
    <div className="grid gap-2">
      <Field label="Файл Lottie JSON">
        <input
          type="file"
          accept=".json,application/json"
          onChange={async (e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (!file) return;
            try {
              if (file.size > MAX_LOTTIE_BYTES) throw new Error("Файл анимации больше 2 МиБ.");
              const text = await file.text();
              readAnimation(text);
              if (mounted.current) {
                onPatch({ animationJson: text, src: "" });
                setError("");
              }
            } catch (cause) {
              if (mounted.current) setError(cause instanceof Error ? cause.message : "Не удалось открыть файл.");
            }
          }}
        />
      </Field>
      {error && <p role="alert">{error}</p>}
      {block.src && <p className="text-xs">Источник в старом документе: {block.src}. Выберите локальную копию JSON.</p>}
      {block.animationJson && (
        <button type="button" onClick={() => onPatch({ animationJson: undefined })}>
          Убрать анимацию
        </button>
      )}
      <Field label="Подпись анимации">
        <input value={block.caption ?? ""} onChange={(e) => onPatch({ caption: e.target.value })} />
      </Field>
      <Field label="Запуск анимации">
        <select value={opts.trigger} onChange={(e) => onPatch({ trigger: e.target.value })}>
          {triggers.map((t) => (
            <option value={t} key={t}>
              {names[t]}
            </option>
          ))}
        </select>
      </Field>
      {opts.trigger === "hover" && (
        <Field label="После ухода указателя">
          <select value={opts.hoverOut} onChange={(e) => onPatch({ hoverOut: e.target.value })}>
            <option value="pause">Пауза</option>
            <option value="stop">В начало</option>
            <option value="reverse">В обратном направлении</option>
            <option value="continue">Продолжить</option>
          </select>
        </Field>
      )}
      <Field label="Выравнивание анимации">
        <select value={opts.align} onChange={(e) => onPatch({ align: e.target.value })}>
          <option value="left">Слева</option>
          <option value="center">По центру</option>
          <option value="right">Справа</option>
        </select>
      </Field>
      {(
        [
          ["speed", "Скорость", 0.1, 5, 0.1],
          ["start", "Начало фрагмента, %", 0, 99, 1],
          ["end", "Конец фрагмента, %", opts.start + 1, 100, 1],
          ["threshold", "Порог видимости, %", 0, 100, 1],
          ["width", "Ширина анимации, %", 1, 100, 1],
          ["maxWidth", "Максимальная ширина, px", 1, 3840, 1],
        ] as const
      ).map(([key, label, min, max, step]) => (
        <Field key={key} label={label}>
          <input
            type="number"
            value={opts[key]}
            min={min}
            max={max}
            step={step}
            onChange={(e) => {
              const n = e.target.valueAsNumber;
              if (Number.isFinite(n)) onPatch({ [key]: Math.max(min, Math.min(max, n)) });
            }}
          />
        </Field>
      ))}
      {(
        [
          ["loop", "Повторять"],
          ["reverse", "Обратное направление"],
          ["lazy", "Загружать при появлении"],
        ] as const
      ).map(([key, label]) => (
        <label key={key}>
          <input type="checkbox" checked={opts[key]} onChange={(e) => onPatch({ [key]: e.target.checked })} /> {label}
        </label>
      ))}
      <details>
        <summary>Постер</summary>
        <LocalImageInput onLoad={(poster) => onPatch({ poster })} />
      </details>
    </div>
  );
}
