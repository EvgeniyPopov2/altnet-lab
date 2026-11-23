import { useRef } from "react";
import Field from "../../ui/Field";
import { newId } from "../../registry";
import type { HotspotBlock, HotspotMarker } from "../../types";
import LocalImageInput from "./LocalImageInput";

const input = "w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2";
const clamp = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 50));
export default function HotspotEditor({ block, onPatch }: { block: HotspotBlock; onPatch: (patch: Record<string, any>) => void }) {
  const board = useRef<HTMLDivElement>(null);
  const markers = Array.isArray(block.markers) ? block.markers : [];
  const update = (index: number, patch: Partial<HotspotMarker>) => onPatch({ markers: markers.map((marker, i) => i === index ? { ...marker, ...patch } : marker) });
  const position = (index: number, x: number, y: number) => {
    const rect = board.current?.getBoundingClientRect();
    if (rect?.width && rect.height) update(index, { x: Math.round(clamp((x - rect.left) / rect.width * 100)), y: Math.round(clamp((y - rect.top) / rect.height * 100)) });
  };
  const safeImage = /^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(block.src || "") ? block.src : "";
  return <div className="grid gap-3">
    <Field label="Адрес изображения"><input className={input} value={block.src || ""} onChange={event => onPatch({ src: event.target.value })} /></Field>
    <LocalImageInput onLoad={src => onPatch({ src })} />
    <Field label="Описание изображения"><input className={input} value={block.alt || ""} onChange={event => onPatch({ alt: event.target.value })} /></Field>
    <p className="text-xs text-[#c9d0e9]">Перетащите маркер или переместите его стрелками. Внешнее изображение появится после подключения защищённого транспорта.</p>
    <div ref={board} className="relative overflow-hidden rounded border border-[#5865F2] bg-[#151a2d]">
      {safeImage ? <img src={safeImage} alt="" draggable={false} className="block h-auto w-full" /> : <div className="grid aspect-video place-items-center text-xs text-[#9aa3b2]">Область изображения</div>}
      {markers.map((marker, index) => <button key={marker.id || index} type="button" aria-label={`Переместить маркер ${marker.label || index + 1}`} className="absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white bg-[#5865F2] text-xs text-white touch-none" style={{ left: `${clamp(marker.x)}%`, top: `${clamp(marker.y)}%` }} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); position(index, event.clientX, event.clientY); }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) position(index, event.clientX, event.clientY); }} onKeyDown={event => { const delta = event.shiftKey ? 10 : 1; const dx = event.key === "ArrowLeft" ? -delta : event.key === "ArrowRight" ? delta : 0; const dy = event.key === "ArrowUp" ? -delta : event.key === "ArrowDown" ? delta : 0; if (dx || dy) { event.preventDefault(); update(index, { x: clamp(marker.x + dx), y: clamp(marker.y + dy) }); } }}>{index + 1}</button>)}
    </div>
    {markers.map((marker, index) => <fieldset key={marker.id || index} className="grid gap-2 rounded border border-[#2a2f45] p-2"><legend className="px-1 text-xs">Маркер {index + 1}</legend>
      <Field label="Подпись"><input className={input} value={marker.label || ""} onChange={event => update(index, { label: event.target.value })} /></Field>
      <Field label="Ссылка"><input className={input} value={marker.href || ""} onChange={event => update(index, { href: event.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-2">{(["x", "y"] as const).map(axis => <Field key={axis} label={`${axis.toUpperCase()} (%)`}><input className={input} type="number" min="0" max="100" value={clamp(marker[axis])} onChange={event => update(index, { [axis]: clamp(Number(event.target.value)) })} /></Field>)}</div>
      <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => onPatch({ markers: markers.filter((_, i) => i !== index) })}>Удалить маркер</button>
    </fieldset>)}
    <button type="button" className="rounded border border-[#6E59F2] px-3 py-2 text-xs" onClick={() => onPatch({ markers: [...markers, { id: newId("hm"), x: 50, y: 50, label: "Новая точка", href: "" }] })}>Добавить маркер</button>
  </div>;
}
