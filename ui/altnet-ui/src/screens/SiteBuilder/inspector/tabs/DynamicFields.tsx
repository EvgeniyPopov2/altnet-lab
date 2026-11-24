import { useContext } from "react";
import { bindingTargets, sources, setBinding } from "../../dynamicContent";
import { SiteDataContext } from "../../siteDataContext";
import type { Block, DynamicBinding } from "../../types";
import type { BlockPatch } from "../patch";
import Field from "../../ui/Field";

export default function DynamicFields({ block, onPatch }: { block: Block; onPatch: (p: BlockPatch) => void }) {
  const { fields } = useContext(SiteDataContext),
    targets = bindingTargets[block.type];
  if (!targets) return null;
  return (
    <details className="sb-template-panel">
      <summary>Динамические поля</summary>
      <div className="grid gap-2">
        {targets.map(([key, label]) => {
          const binding = block.dynamic?.[key],
            current = binding?.source ?? "";
          const fieldNames = [...new Set([...fields, ...(current.startsWith("custom.") ? [current.slice(7)] : [])])];
          function patch(values: Partial<DynamicBinding>) {
            onPatch((b) =>
              setBinding(b, key, { ...b.dynamic?.[key], source: b.dynamic?.[key]?.source ?? "", ...values })
            );
          }
          return (
            <div className="grid gap-1" key={key}>
              <Field label={label + " — источник"}>
                <select
                  value={current}
                  onChange={(e) => {
                    const source = e.target.value;
                    if (source) patch({ source });
                    else onPatch((b) => setBinding(b, key, undefined));
                  }}
                >
                  <option value="">Ввести вручную</option>
                  {Object.entries(sources).map(([value, name]) => (
                    <option key={value} value={value}>
                      {name}
                    </option>
                  ))}
                  {fieldNames.map((name) => (
                    <option key={name} value={"custom." + name}>
                      Поле · {name}
                    </option>
                  ))}
                </select>
              </Field>
              {binding &&
                (
                  [
                    ["before", "Перед значением"],
                    ["after", "После значения"],
                    ["fallback", "Если значение пустое"],
                  ] as const
                ).map(([k, name]) => (
                  <Field key={k} label={name + " · " + label}>
                    <input value={binding[k] ?? ""} onChange={(e) => patch({ [k]: e.target.value })} />
                  </Field>
                ))}
            </div>
          );
        })}
      </div>
    </details>
  );
}
