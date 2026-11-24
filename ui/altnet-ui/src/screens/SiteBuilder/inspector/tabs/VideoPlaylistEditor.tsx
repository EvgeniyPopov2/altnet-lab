import Field from "../../ui/Field";
import { newId } from "../../registry";
import type { VideoItem, VideoPlaylistBlock } from "../../types";
import LocalImageInput from "./LocalImageInput";
import type { BlockPatch } from "../patch";

const input = "w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2";
export default function VideoPlaylistEditor({ block, onPatch }: { block: VideoPlaylistBlock; onPatch: (patch: BlockPatch) => void }) {
  const items = Array.isArray(block.items) ? block.items : [];
  const initial = Math.max(0, Math.min(items.length - 1, Math.floor(Number(block.initial) || 0)));
  const update = (index: number, patch: Partial<VideoItem>) => onPatch({ items: items.map((item, i) => i === index ? { ...item, ...patch } : item) });
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction; if (target < 0 || target >= items.length) return;
    const next = items.slice(); [next[index], next[target]] = [next[target], next[index]];
    onPatch({ items: next, initial: initial === index ? target : initial === target ? index : initial });
  };
  return <div className="grid gap-3">
    {items.length > 0 && <Field label="Первое видео"><select className={input} value={initial} onChange={event => onPatch({ initial: Number(event.target.value) })}>{items.map((item, index) => <option key={item.id || index} value={index}>{index + 1}. {item.title || "Видео"}</option>)}</select></Field>}
    {items.map((item, index) => <fieldset key={item.id || index} className="grid gap-2 rounded border border-[#2a2f45] p-2"><legend className="px-1 text-xs">Видео {index + 1}</legend>
      {([["title", "Название"], ["src", "Адрес видео"], ["poster", "Обложка"]] as const).map(([key, label]) => <Field key={key} label={label}><input className={input} value={item[key] || ""} onChange={event => update(index, { [key]: event.target.value })} /></Field>)}
      <LocalImageInput onLoad={poster => onPatch((current) => ({ items: (current.type === "videoplaylist" && Array.isArray(current.items) ? current.items : []).map((entry) => (item.id ? entry.id === item.id : entry === item) ? { ...entry, poster } : entry) }))} />
      <div className="flex gap-1"><button type="button" aria-label="Переместить видео вверх" disabled={index === 0} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => move(index, -1)}>↑</button><button type="button" aria-label="Переместить видео вниз" disabled={index === items.length - 1} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => move(index, 1)}>↓</button><button type="button" className="rounded border px-2 text-xs" onClick={() => { const next = items.filter((_, i) => i !== index); onPatch({ items: next, initial: Math.max(0, Math.min(next.length - 1, initial - (index < initial ? 1 : 0))) }); }}>Удалить</button></div>
    </fieldset>)}
    <p className="text-xs text-[#c9d0e9]">Внешние медиа не загружаются в редакторе до подключения защищённого транспорта. В HTML видео остаётся внешним ресурсом.</p>
    <button type="button" className="rounded border border-[#6E59F2] px-3 py-2 text-xs" onClick={() => onPatch({ items: [...items, { id: newId("vi"), src: "", title: "Новое видео", poster: "" }] })}>Добавить видео</button>
  </div>;
}
