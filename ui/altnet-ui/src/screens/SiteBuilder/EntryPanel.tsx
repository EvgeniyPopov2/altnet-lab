import { useState, type Dispatch, type SetStateAction } from "react";
import type { Doc, EntryDetails } from "./types";

export default function EntryPanel({ doc, setDoc }: { doc: Doc; setDoc: Dispatch<SetStateAction<Doc>> }) {
  const [key, setKey] = useState("");
  const data = doc.entry ?? {};
  const change = (patch: Partial<EntryDetails>) => setDoc((d) => ({ ...d, entry: { ...d.entry, ...patch } }));
  function field(name: string, value?: string) {
    setDoc((d) => {
      const fields = { ...d.entry?.fields };
      if (value === undefined) delete fields[name];
      else fields[name] = value;
      return { ...d, entry: { ...d.entry, fields } };
    });
  }
  return (
    <details className="sb-template-panel">
      <summary>Данные записи</summary>
      <div className="grid gap-2">
        <label>
          Тип материала
          <select
            value={data.kind ?? "page"}
            onChange={(e) => change({ kind: e.target.value === "post" ? "post" : "page" })}
          >
            <option value="page">Страница</option>
            <option value="post">Запись</option>
          </select>
        </label>
        <label>
          Автор
          <input value={data.author ?? ""} onChange={(e) => change({ author: e.target.value })} />
        </label>
        <label>
          Дата записи
          <input type="date" value={data.date ?? ""} onChange={(e) => change({ date: e.target.value })} />
        </label>
        <label>
          Рубрики через запятую
          <input
            value={(data.terms ?? []).join(",")}
            onChange={(e) => change({ terms: e.target.value.split(",") })}
            onBlur={() => change({ terms: [...new Set((data.terms ?? []).map((t) => t.trim()).filter(Boolean))] })}
          />
        </label>
        {Object.entries(data.fields ?? {}).map(([name, value]) => (
          <div key={name}>
            <label>
              {name}
              <input value={value} onChange={(e) => field(name, e.target.value)} />
            </label>
            <button type="button" aria-label={"Удалить поле " + name} onClick={() => field(name)}>
              Удалить поле
            </button>
          </div>
        ))}
        <label>
          Ключ нового поля
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="subtitle" />
        </label>
        <button
          type="button"
          disabled={!/^[A-Za-z][\w.-]{0,63}$/.test(key) || Object.hasOwn(data.fields ?? {}, key)}
          onClick={() => {
            field(key, "");
            setKey("");
          }}
        >
          Добавить поле
        </button>
      </div>
    </details>
  );
}
