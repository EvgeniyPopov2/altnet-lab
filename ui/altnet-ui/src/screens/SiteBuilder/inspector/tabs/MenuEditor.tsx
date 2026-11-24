import type { MenuBlock } from "../../types";
import type { MenuItem } from "../../types";
import { newId } from "../../registry";
import Field from "../../ui/Field";

type Props = { block: MenuBlock; onPatch: (patch: Record<string, unknown>) => void };
const input = "w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2";
const newItem = (): MenuItem => ({ id: newId("mi"), label: "Новый пункт", href: "#" });

function ItemList({ items, onChange, depth = 0 }: { items: MenuItem[]; onChange: (items: MenuItem[]) => void; depth?: number }) {
  const update = (index: number, patch: Partial<MenuItem>) => onChange(items.map((item, i) => i === index ? { ...item, ...patch } : item));
  return <div className="grid gap-2">
    {items.map((item, index) => <fieldset key={item.id} className="grid min-w-0 gap-2 rounded border border-[#2a2f45] p-2">
      <legend className="px-1 text-xs">{depth ? "Подпункт" : "Пункт"} {index + 1}</legend>
      <Field label="Название"><input className={input} value={item.label ?? ""} onChange={e => update(index, { label: e.target.value })} /></Field>
      <Field label="Ссылка"><input className={input} value={item.href ?? ""} onChange={e => update(index, { href: e.target.value })} /></Field>
      <div className="flex flex-wrap gap-1">
        <button type="button" title="Выше" disabled={index === 0} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => { const next = items.slice(); [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }}>↑</button>
        <button type="button" title="Ниже" disabled={index === items.length - 1} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => { const next = items.slice(); [next[index + 1], next[index]] = [next[index], next[index + 1]]; onChange(next); }}>↓</button>
        <button type="button" disabled={depth >= 64} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => update(index, { children: [...(item.children || []), newItem()] })}>+ Подпункт</button>
        <button type="button" className="rounded border px-2 text-xs" onClick={() => onChange(items.filter((_, i) => i !== index))}>Удалить</button>
      </div>
      {Boolean(item.children?.length) && <ItemList items={item.children!} onChange={children => update(index, { children })} depth={depth + 1} />}
    </fieldset>)}
  </div>;
}

export default function MenuEditor({ block, onPatch }: Props) {
  const items = Array.isArray(block.items) ? block.items : [];
  return <div className="grid gap-3">
    <Field label="Расположение"><select className={input} value={block.orientation || "horizontal"} onChange={e => onPatch({ orientation: e.target.value })}><option value="horizontal">Горизонтальное</option><option value="vertical">Вертикальное</option></select></Field>
    <Field label="Название навигации для экранного диктора"><input className={input} value={block.ariaLabel || ""} onChange={e => onPatch({ ariaLabel: e.target.value })} /></Field>
    <Field label="Ссылка активного пункта"><input className={input} value={block.activeHref || ""} onChange={e => onPatch({ activeHref: e.target.value })} /></Field>
    <ItemList items={items} onChange={next => onPatch({ items: next })} />
    <button type="button" className="rounded border border-[#6E59F2] px-3 py-2 text-xs" onClick={() => onPatch({ items: [...items, newItem()] })}>Добавить пункт меню</button>
  </div>;
}
