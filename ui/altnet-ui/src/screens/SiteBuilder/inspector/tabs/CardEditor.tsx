import Field from "../../ui/Field";
import { newId } from "../../registry";
import LocalImageInput from "./LocalImageInput";
import type { BlockPatch } from "../patch";

type Props = { block: any; onPatch: (patch: BlockPatch) => void };
const input = "w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2";

export default function CardEditor({ block, onPatch }: Props) {
  const multi = Array.isArray(block.items);
  const items = multi ? block.items : [block];
  const image = block.type === "imagebox";
  const update = (index: number, patch: Record<string, string>) => multi
    ? onPatch({ items: items.map((item: any, i: number) => i === index ? { ...item, ...patch } : item) }) : onPatch(patch);
  return <div className="grid gap-3">
    {multi && <Field label="Колонки"><select className={input} value={block.columns || 3} onChange={e => onPatch({ columns: Number(e.target.value) })}>
      {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
    </select></Field>}
    {items.map((item: any, index: number) => <fieldset key={item.id || index} className="grid gap-2 rounded border border-[#2a2f45] p-2">
      {multi && <legend className="px-1 text-xs">Карточка {index + 1}</legend>}
      {image ? <>
        <Field label="Адрес изображения"><input className={input} value={item.src ?? item.cid ?? ""} onChange={e => update(index, { src: e.target.value, cid: e.target.value })} /></Field>
        <LocalImageInput onLoad={src => onPatch((current: any) => Array.isArray(current.items) ? { items: current.items.map((entry: any) => (item.id ? entry.id === item.id : entry === item) ? { ...entry, src, cid: src } : entry) } : { src, cid: src })} />
        <Field label="Описание изображения"><input className={input} value={item.alt || ""} onChange={e => update(index, { alt: e.target.value })} /></Field>
      </> : <Field label="Иконка"><select className={input} value={item.icon || "star"} onChange={e => update(index, { icon: e.target.value })}>
        <option value="star">Звезда</option><option value="check">Галочка</option><option value="heart">Сердце</option><option value="shield">Щит</option><option value="alert">Внимание</option>
        {item.icon && !["star", "check", "heart", "shield", "alert"].includes(item.icon) && <option value={item.icon}>{item.icon}</option>}
      </select></Field>}
      <Field label="Заголовок"><input className={input} value={item.title ?? item.label ?? ""} onChange={e => update(index, { title: e.target.value })} /></Field>
      <Field label="Текст"><textarea className={input} value={item.text ?? item.description ?? ""} onChange={e => update(index, { text: e.target.value })} /></Field>
      {multi && <div className="flex gap-1">
        <button type="button" disabled={index === 0} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => { const next = items.slice(); [next[index - 1], next[index]] = [next[index], next[index - 1]]; onPatch({ items: next }); }}>↑</button>
        <button type="button" disabled={index === items.length - 1} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => { const next = items.slice(); [next[index + 1], next[index]] = [next[index], next[index + 1]]; onPatch({ items: next }); }}>↓</button>
        <button type="button" className="rounded border px-2 text-xs" onClick={() => onPatch({ items: items.filter((_: any, i: number) => i !== index) })}>Удалить</button>
      </div>}
    </fieldset>)}
    {multi && <button type="button" className="rounded border border-[#6E59F2] px-3 py-2 text-xs" onClick={() => onPatch({ items: [...items, { id: newId("card"), title: "Новая карточка", text: "", ...(image ? { src: "", alt: "" } : { icon: "star" }) }] })}>Добавить карточку</button>}
  </div>;
}
