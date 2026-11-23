import Field from "../../ui/Field";
import { newId } from "../../registry";

type Props = { block: any; onPatch: (patch: Record<string, any>) => void };
const input = "w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2";

export default function AccordionEditor({ block, onPatch }: Props) {
  const items = Array.isArray(block.items) ? block.items : [];
  const update = (index: number, patch: Record<string, unknown>) => onPatch({ items: items.map((item: any, i: number) => i === index ? { ...item, ...patch } : item) });
  return <div className="grid gap-3">
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(block.allowMultiple)} onChange={e => {
      const multiple = e.target.checked;
      let first = false;
      const next = items.map((item: any) => { const open = Boolean(item.open) && (multiple || !first); if (open) first = true; return { ...item, open }; });
      onPatch({ allowMultiple: multiple, items: next });
    }} />Можно открыть несколько разделов</label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={block.allowToggle !== false} onChange={e => onPatch({ allowToggle: e.target.checked })} />Можно закрыть последний раздел</label>
    <Field label="Стиль"><select className={input} value={block.variant || "ghost"} onChange={e => onPatch({ variant: e.target.value })}><option value="ghost">Без фона</option><option value="filled">С фоном</option><option value="outline">Контур</option></select></Field>
    <Field label="Размер"><select className={input} value={block.size || "md"} onChange={e => onPatch({ size: e.target.value })}><option value="sm">Малый</option><option value="md">Средний</option><option value="lg">Большой</option></select></Field>
    {items.map((item: any, index: number) => <fieldset key={item.id || index} className="grid gap-2 rounded border border-[#2a2f45] p-2">
      <legend className="px-1 text-xs">Раздел {index + 1}</legend>
      <Field label="Название"><input className={input} value={item.title || ""} onChange={e => update(index, { title: e.target.value })} /></Field>
      <Field label="Содержимое"><textarea className={input} value={item.content || ""} onChange={e => update(index, { content: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(item.open)} onChange={e => onPatch({ items: items.map((entry: any, i: number) => i === index ? { ...entry, open: e.target.checked } : !block.allowMultiple && e.target.checked ? { ...entry, open: false } : entry) })} />Открыт при загрузке</label>
      <div className="flex gap-1">
        <button type="button" disabled={index === 0} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => { const next = items.slice(); [next[index - 1], next[index]] = [next[index], next[index - 1]]; onPatch({ items: next }); }}>↑</button>
        <button type="button" disabled={index === items.length - 1} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => { const next = items.slice(); [next[index + 1], next[index]] = [next[index], next[index + 1]]; onPatch({ items: next }); }}>↓</button>
        <button type="button" className="rounded border px-2 text-xs" onClick={() => onPatch({ items: items.filter((_: any, i: number) => i !== index) })}>Удалить</button>
      </div>
    </fieldset>)}
    <button type="button" className="rounded border border-[#6E59F2] px-3 py-2 text-xs" onClick={() => onPatch({ items: [...items, { id: newId("acc"), title: "Новый раздел", content: "", open: false }] })}>Добавить раздел</button>
  </div>;
}
