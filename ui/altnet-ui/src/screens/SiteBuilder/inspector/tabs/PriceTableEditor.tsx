import Field from "../../ui/Field";
import { newId } from "../../registry";
import type { PriceTablePlan, PriceTableFeature } from "../../types";

const input = "w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2";
type Props = { block: { plans?: PriceTablePlan[] }; onPatch: (patch: Record<string, unknown>) => void };

export default function PriceTableEditor({ block, onPatch }: Props) {
  const plans = Array.isArray(block.plans) ? block.plans : [];
  const update = (index: number, patch: Partial<PriceTablePlan>) => onPatch({ plans: plans.map((plan, i) => i === index ? { ...plan, ...patch } : plan) });
  const move = <T,>(items: T[], index: number, delta: number): T[] => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return items;
    const next = items.slice(); [next[index], next[target]] = [next[target], next[index]]; return next;
  };
  return <div className="grid gap-3">
    {plans.map((plan, index) => {
      const features = Array.isArray(plan.features) ? plan.features : [];
      const updateFeature = (featureIndex: number, patch: Partial<PriceTableFeature>) => update(index, { features: features.map((feature, i) => i === featureIndex ? { ...feature, ...patch } : feature) });
      return <fieldset key={plan.id || index} className="grid gap-2 rounded border border-[#2a2f45] p-2">
        <legend className="px-1 text-xs">Тариф {index + 1}</legend>
        {([["name", "Название"], ["price", "Цена"], ["period", "Период"], ["ctaLabel", "Надпись кнопки"], ["ctaHref", "Ссылка кнопки"]] as const).map(([key, label]) => <Field key={key} label={label}><input className={input} value={plan[key] || ""} onChange={event => update(index, { [key]: event.target.value })} /></Field>)}
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!plan.popular} onChange={event => update(index, { popular: event.target.checked })} /> Популярный тариф</label>
        <span className="text-xs">Возможности тарифа</span>
        {features.map((feature, featureIndex) => <div key={feature.id || featureIndex} className="grid gap-1 rounded border border-[#2a2f45] p-2">
          <input className={input} aria-label={`Возможность ${featureIndex + 1}`} value={feature.label || ""} onChange={event => updateFeature(featureIndex, { label: event.target.value })} />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!feature.included} onChange={event => updateFeature(featureIndex, { included: event.target.checked })} /> Включена</label>
          <div className="flex gap-1">
            <button type="button" aria-label="Переместить возможность вверх" disabled={featureIndex === 0} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => update(index, { features: move(features, featureIndex, -1) })}>↑</button>
            <button type="button" aria-label="Переместить возможность вниз" disabled={featureIndex === features.length - 1} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => update(index, { features: move(features, featureIndex, 1) })}>↓</button>
            <button type="button" className="rounded border px-2 text-xs" onClick={() => update(index, { features: features.filter((_, i) => i !== featureIndex) })}>Удалить возможность</button>
          </div>
        </div>)}
        <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => update(index, { features: [...features, { id: newId("pf"), label: "Новая возможность", included: true }] })}>Добавить возможность</button>
        <div className="flex gap-1">
          <button type="button" aria-label="Переместить тариф вверх" disabled={index === 0} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => onPatch({ plans: move(plans, index, -1) })}>↑</button>
          <button type="button" aria-label="Переместить тариф вниз" disabled={index === plans.length - 1} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => onPatch({ plans: move(plans, index, 1) })}>↓</button>
          <button type="button" className="rounded border px-2 text-xs" onClick={() => onPatch({ plans: plans.filter((_, i) => i !== index) })}>Удалить тариф</button>
        </div>
      </fieldset>;
    })}
    <button type="button" className="rounded border border-[#6E59F2] px-3 py-2 text-xs" onClick={() => onPatch({ plans: [...plans, { id: newId("plan"), name: "Новый тариф", price: "", features: [] }] })}>Добавить тариф</button>
  </div>;
}
