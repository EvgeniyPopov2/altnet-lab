import Field from "../../ui/Field";
import { newId } from "../../registry";
import LocalImageInput from "./LocalImageInput";
import type { BlockPatch } from "../patch";

type Props = { block: any; onPatch: (patch: BlockPatch) => void };
const input = "w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2";

export default function EntriesEditor({ block, onPatch }: Props) {
  const price = block.type === "pricelist";
  const items = Array.isArray(block.items) ? block.items : [];
  const update = (index: number, patch: Record<string, unknown>) => onPatch({ items: items.map((item: any, i: number) => i === index ? { ...item, ...patch } : item) });
  const fields: [string, string, boolean][] = price ? [
    ["title", "Название", false], ["price", "Цена", false], ["period", "Период", false], ["desc", "Описание", true], ["ctaLabel", "Надпись кнопки", false], ["ctaHref", "Ссылка кнопки", false],
  ] : [["author", "Автор", false], ["role", "Подпись автора", false], ["text", "Отзыв", true], ["avatar", "Адрес фотографии", false]];
  return <div className="grid gap-3">
    {items.map((item: any, index: number) => <fieldset key={item.id || index} className="grid gap-2 rounded border border-[#2a2f45] p-2">
      <legend className="px-1 text-xs">{price ? "Позиция" : "Отзыв"} {index + 1}</legend>
      {fields.map(([key, label, multiline]) => <Field key={key} label={label}>{multiline ?
        <textarea className={input} value={key === "text" ? item.text ?? item.quote ?? "" : item[key] || ""} onChange={e => update(index, key === "text" ? { text: e.target.value, quote: e.target.value } : { [key]: e.target.value })} /> :
        <input className={input} value={item[key] || ""} onChange={e => update(index, { [key]: e.target.value })} />}</Field>)}
      {price && <Field label="Преимущества — по одному в строке"><textarea className={input} value={(Array.isArray(item.features) ? item.features : []).join("\n")} onChange={e => update(index, { features: e.target.value.split("\n") })} /></Field>}
      {!price && <LocalImageInput onLoad={avatar => onPatch((current: any) => ({ items: (Array.isArray(current.items) ? current.items : []).map((entry: any) => (item.id ? entry.id === item.id : entry === item) ? { ...entry, avatar } : entry) }))} />}
      <div className="flex gap-1">
        <button type="button" disabled={index === 0} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => { const next = items.slice(); [next[index - 1], next[index]] = [next[index], next[index - 1]]; onPatch({ items: next }); }}>↑</button>
        <button type="button" disabled={index === items.length - 1} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => { const next = items.slice(); [next[index + 1], next[index]] = [next[index], next[index + 1]]; onPatch({ items: next }); }}>↓</button>
        <button type="button" className="rounded border px-2 text-xs" onClick={() => onPatch({ items: items.filter((_: any, i: number) => i !== index) })}>Удалить</button>
      </div>
    </fieldset>)}
    <button type="button" className="rounded border border-[#6E59F2] px-3 py-2 text-xs" onClick={() => onPatch({ items: [...items, price ? { id: newId("price"), title: "Новая позиция", price: "", desc: "" } : { id: newId("review"), author: "", text: "", role: "" }] })}>{price ? "Добавить позицию" : "Добавить отзыв"}</button>
  </div>;
}
