import type { TabsBlock } from "../../types";
import Field from "../../ui/Field";
import { newId } from "../../registry";

type Props = { block: TabsBlock; onPatch: (patch: Record<string, unknown>) => void };
const input = "w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2";

export default function TabsEditor({ block, onPatch }: Props) {
  const tabs = Array.isArray(block.tabs) ? block.tabs : [];
  const active = Math.max(0, Math.min(tabs.length - 1, Number(block.active) || 0));
  const update = (index: number, patch: Record<string, unknown>) => onPatch({ tabs: tabs.map((tab, i: number) => i === index ? { ...tab, ...patch } : tab) });
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction; if (target < 0 || target >= tabs.length) return;
    const next = tabs.slice(); [next[index], next[target]] = [next[target], next[index]];
    onPatch({ tabs: next, active: active === index ? target : active === target ? index : active });
  };
  return <div className="grid gap-3">
    <Field label="Ориентация"><select className={input} value={block.orientation || "horizontal"} onChange={e => onPatch({ orientation: e.target.value })}><option value="horizontal">Горизонтально</option><option value="vertical">Вертикально</option></select></Field>
    <Field label="Стиль"><select className={input} value={block.variant || "underline"} onChange={e => onPatch({ variant: e.target.value })}><option value="underline">Подчёркивание</option><option value="boxed">Панель</option><option value="pill">Кнопки</option></select></Field>
    <Field label="Размер"><select className={input} value={block.size || "md"} onChange={e => onPatch({ size: e.target.value })}><option value="sm">Малый</option><option value="md">Средний</option><option value="lg">Большой</option></select></Field>
    <Field label="Выравнивание"><select className={input} value={block.align || "start"} onChange={e => onPatch({ align: e.target.value })}><option value="start">Слева / сверху</option><option value="center">По центру</option><option value="end">Справа / снизу</option></select></Field>
    <Field label="Открыта при загрузке"><select className={input} value={active} onChange={e => onPatch({ active: Number(e.target.value) })}>{tabs.map((tab, i: number) => <option key={tab.id || i} value={i} disabled={Boolean(tab.disabled)}>{tab.label || `Вкладка ${i + 1}`}</option>)}</select></Field>
    {tabs.map((tab, index: number) => <fieldset key={tab.id || index} className="grid gap-2 rounded border border-[#2a2f45] p-2">
      <legend className="px-1 text-xs">Вкладка {index + 1}</legend>
      <Field label="Название"><input className={input} value={tab.label || ""} onChange={e => update(index, { label: e.target.value })} /></Field>
      <Field label="Содержимое"><textarea className={input} value={tab.content || ""} onChange={e => update(index, { content: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(tab.disabled)} onChange={e => {
        const next = tabs.map((item, i: number) => i === index ? { ...item, disabled: e.target.checked } : item);
        const replacement = next.findIndex((item) => !item.disabled);
        onPatch({ tabs: next, active: e.target.checked && active === index ? Math.max(0, replacement) : active });
      }} />Недоступна</label>
      <div className="flex gap-1">
        <button type="button" disabled={index === 0} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => move(index, -1)}>↑</button>
        <button type="button" disabled={index === tabs.length - 1} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => move(index, 1)}>↓</button>
        <button type="button" className="rounded border px-2 text-xs" onClick={() => { const next = tabs.filter((_, i: number) => i !== index); onPatch({ tabs: next, active: Math.max(0, Math.min(next.length - 1, active - (index < active ? 1 : 0))) }); }}>Удалить</button>
      </div>
    </fieldset>)}
    <button type="button" className="rounded border border-[#6E59F2] px-3 py-2 text-xs" onClick={() => onPatch({ tabs: [...tabs, { id: newId("tab"), label: "Новая вкладка", content: "" }] })}>Добавить вкладку</button>
  </div>;
}
