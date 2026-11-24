import { useRef, useState } from "react";
import { editParagraph, formatSelection, type Mark } from "../../inlineText";
import type { PBlock } from "../../types";
import type { BlockPatch } from "../patch";
import Field from "../../ui/Field";

const buttons: ReadonlyArray<[Mark, string, string]> = [
  ["bold", "B", "Полужирный"],
  ["italic", "I", "Курсив"],
  ["underline", "U", "Подчёркивание"],
  ["strike", "S", "Зачёркивание"],
  ["code", "‹›", "Код"],
];
export default function ParagraphEditor({ block, onPatch }: { block: PBlock; onPatch: (patch: BlockPatch) => void }) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [range, setRange] = useState([0, 0]),
    [href, setHref] = useState("");
  const format = (key: Mark | "href", link?: string) => {
    const [start, end] = range;
    onPatch((current) =>
      current.type === "p" ? { richRuns: formatSelection(current.text, current.richRuns, start, end, key, link) } : {}
    );
    field.current?.focus();
    field.current?.setSelectionRange(start, end);
  };
  return (
    <div className="grid gap-1">
      <Field label="Текст">
        <textarea
          ref={field}
          value={block.text || ""}
          onSelect={(e) => setRange([e.currentTarget.selectionStart, e.currentTarget.selectionEnd])}
          onChange={(e) => {
            const text = e.target.value;
            onPatch((current) => (current.type === "p" ? editParagraph(current.text, current.richRuns, text) : {}));
          }}
          onKeyDown={(e) => {
            if (!e.ctrlKey && !e.metaKey) return;
            const key = ({ b: "bold", i: "italic", u: "underline" } as const)[e.key.toLowerCase() as "b" | "i" | "u"];
            if (key && range[0] !== range[1]) {
              e.preventDefault();
              format(key);
            }
          }}
        />
      </Field>
      <div className="sb-inline-tools" aria-label="Оформление выделенного текста" role="group">
        {buttons.map(([key, symbol, title]) => (
          <button
            type="button"
            key={key}
            aria-label={title}
            title={title}
            disabled={range[0] === range[1]}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => format(key)}
          >
            {symbol}
          </button>
        ))}
      </div>
      <details>
        <summary>Ссылка для выделенного текста</summary>
        <Field label="Адрес ссылки">
          <input value={href} onChange={(e) => setHref(e.target.value)} placeholder="https:// или #якорь" />
        </Field>
        <button type="button" disabled={range[0] === range[1] || !href.trim()} onClick={() => format("href", href)}>
          Установить ссылку
        </button>
        <button type="button" disabled={range[0] === range[1]} onClick={() => format("href", "")}>
          Убрать ссылку
        </button>
      </details>
    </div>
  );
}
