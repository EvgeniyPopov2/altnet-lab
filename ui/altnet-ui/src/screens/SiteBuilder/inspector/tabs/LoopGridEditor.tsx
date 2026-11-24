import { useContext } from "react";
import { loopSettings } from "../../dynamicContent";
import { SiteDataContext } from "../../siteDataContext";
import type { Device, LoopGridBlock } from "../../types";
import type { BlockPatch } from "../patch";
import Field from "../../ui/Field";

export default function LoopGridEditor({
  block,
  onPatch,
  device,
}: {
  block: LoopGridBlock;
  onPatch: (p: BlockPatch) => void;
  device: Device;
}) {
  const { templates } = useContext(SiteDataContext),
    settings = loopSettings(block);
  return (
    <div className="grid gap-2">
      <Field label="Источник цикла">
        <select value={settings.source} onChange={(e) => onPatch({ source: e.target.value })}>
          <option value="post">Записи</option>
          <option value="page">Страницы</option>
          <option value="all">Все материалы</option>
        </select>
      </Field>
      <Field label="Шаблон карточки">
        <select value={block.templateId ?? ""} onChange={(e) => onPatch({ templateId: e.target.value || undefined })}>
          <option value="">Заголовок и описание</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Сортировка">
        <select value={settings.sort} onChange={(e) => onPatch({ sort: e.target.value })}>
          <option value="menu">Порядок страниц</option>
          <option value="title">Заголовок</option>
          <option value="date">Дата</option>
        </select>
      </Field>
      <Field label="Отбирать рубрики">
        <input
          value={(block.terms ?? []).join(",")}
          onChange={(e) => onPatch({ terms: e.target.value.split(",") })}
          onBlur={() => onPatch({ terms: [...new Set((block.terms ?? []).map((x) => x.trim()).filter(Boolean))] })}
        />
      </Field>
      <Field label="Колонки на выбранном экране">
        <input
          type="number"
          min={1}
          max={12}
          value={block.columns?.[device] ?? ""}
          placeholder={String(settings.columns[device])}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            onPatch({
              columns: {
                ...block.columns,
                [device]: Number.isFinite(n) ? Math.min(12, Math.max(1, Math.round(n))) : undefined,
              },
            });
          }}
        />
      </Field>
      {(
        [
          ["pageSize", "Карточек на странице", 1, 100],
          ["offset", "Пропустить материалов", 0, 500],
          ["gap", "Интервал, px", 0, 128],
        ] as const
      ).map(([key, label, min, max]) => (
        <Field label={label} key={key}>
          <input
            type="number"
            min={min}
            max={max}
            value={settings[key]}
            onChange={(e) => {
              const n = e.target.valueAsNumber;
              if (Number.isFinite(n)) onPatch({ [key]: Math.min(max, Math.max(min, Math.round(n))) });
            }}
          />
        </Field>
      ))}
      {(
        [
          ["descending", "Обратный порядок"],
          ["omitCurrent", "Исключить текущий материал"],
          ["filter", "Показывать фильтр рубрик"],
        ] as const
      ).map(([key, name]) => (
        <label key={key}>
          <input type="checkbox" checked={settings[key]} onChange={(e) => onPatch({ [key]: e.target.checked })} />{" "}
          {name}
        </label>
      ))}
      <Field label="Текст пустого списка">
        <input value={settings.emptyText} onChange={(e) => onPatch({ emptyText: e.target.value })} />
      </Field>
    </div>
  );
}
