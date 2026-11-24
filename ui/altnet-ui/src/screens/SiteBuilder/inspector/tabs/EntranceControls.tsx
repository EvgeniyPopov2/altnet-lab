import { useState } from "react";
import { entranceLabels, entranceSettings, entranceStart, entranceTypes } from "../../entrance";
import { useClassStyle } from "../../styleClassesContext";
import type { Block, Device, StyleLayer } from "../../types";
import type { BlockPatch } from "../patch";

export default function EntranceControls({ block, device, onPatch, previewBlockId }: { block: Block; device: Device; onPatch: (patch: BlockPatch) => void; previewBlockId?: string }) {
  const current = block.styleByBp?.[device] ?? {};
  const settings = entranceSettings(useClassStyle(block, device));
  const [message, setMessage] = useState("");
  function edit(key: string, value?: string | number) {
    onPatch(latest => {
      const layer: StyleLayer = { ...latest.styleByBp?.[device] };
      if (value === undefined) delete layer[key]; else layer[key] = value;
      return { styleByBp: { ...latest.styleByBp, [device]: layer } };
    });
  }
  function preview() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMessage("В системе включено уменьшение движения.");
      return;
    }
    const target = Array.from(document.querySelectorAll<HTMLElement>("[data-styled-block]")).find(element => element.dataset.styledBlock === (previewBlockId ?? block.id));
    if (!target || settings.type === "none") return;
    target.getAnimations().filter(animation => animation.id === "altnet-entrance-preview").forEach(animation => animation.cancel());
    const animation = target.animate([entranceStart(settings.type, settings.distance), { opacity: getComputedStyle(target).opacity, translate: "0 0", scale: "1" }], {
      duration: settings.duration, delay: settings.delay, easing: "ease-out", fill: "backwards",
    });
    animation.id = "altnet-entrance-preview";
    setMessage("");
  }
  return <details className="sb-transform-controls">
    <summary>Появление при прокрутке</summary>
    <label>Анимация
      <select aria-label="Анимация появления" value={current.entranceType ?? ""} onChange={event => edit("entranceType", event.target.value || undefined)}>
        <option value="">Наследовать</option>{entranceTypes.map(type => <option key={type} value={type}>{entranceLabels[type]}</option>)}
      </select>
    </label>
    {settings.type !== "none" && <>
      {([ ["entranceDuration", "Длительность появления, мс", 100, 5000, settings.duration],
          ["entranceDelay", "Задержка появления, мс", 0, 5000, settings.delay],
          ["entranceDistance", "Расстояние появления, px", 0, 500, settings.distance] ] as const).map(([key, label, min, max, value]) =>
        <label key={key}>{label}<input type="number" aria-label={label} min={min} max={max} value={current[key] ?? ""} placeholder={String(value)}
          onChange={event => {
            if (!event.target.value) edit(key);
            else if (Number.isFinite(event.target.valueAsNumber)) edit(key, Math.min(max, Math.max(min, event.target.valueAsNumber)));
          }}/></label>)}
      <label>Повтор
        <select aria-label="Повтор появления" value={current.entranceRepeat ?? ""} onChange={event => edit("entranceRepeat", event.target.value || undefined)}>
          <option value="">Наследовать</option><option value="once">Один раз</option><option value="repeat">При каждом появлении</option>
        </select>
      </label>
      <button type="button" onClick={preview}>Показать анимацию</button>
      {message && <p role="status">{message}</p>}
    </>}
  </details>;
}
