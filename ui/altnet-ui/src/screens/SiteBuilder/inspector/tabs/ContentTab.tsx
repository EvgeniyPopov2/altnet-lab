import Field from "../../ui/Field";

type Props = {
  block: any;
  onPatch: (patch: Record<string, any>) => void;
  device: "desktop" | "tablet" | "mobile";
};

export default function ContentTab({ block, onPatch }: Props) {
  const t = (block?.type || "") as string;

  if (t === "h1" || t === "heading" || t === "p") {
    return (
      <div className="grid gap-3">
        <Field label="Текст">
          <input
            className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
            value={block.text || ""}
            onChange={(e) => onPatch({ text: e.target.value })}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field label="Выравнивание">
          <select
            className="w-full px-2 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-sm"
            value={block.align || "left"}
            onChange={(e) => onPatch({ align: e.target.value })}
          >
            <option value="left">Слева</option>
            <option value="center">По центру</option>
            <option value="right">Справа</option>
          </select>
        </Field>
      </div>
    );
  }

  if (t === "btn") {
    return (
      <div className="grid gap-3">
        <Field label="Надпись">
          <input
            className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751]"
            value={block.label || ""}
            onChange={(e) => onPatch({ label: e.target.value })}
          />
        </Field>
        <Field label="Ссылка (href)">
          <input
            className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751]"
            value={block.href || ""}
            onChange={(e) => onPatch({ href: e.target.value })}
          />
        </Field>
        <Field label="Вариант">
          <select
            className="w-full px-2 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-sm"
            value={block.variant || "primary"}
            onChange={(e) => onPatch({ variant: e.target.value })}
          >
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
            <option value="ghost">Ghost</option>
          </select>
        </Field>
      </div>
    );
  }

  if (t === "img") {
    return (
      <div className="grid gap-3">
        <Field label="Источник (URL/CID)">
          <input
            className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751]"
            value={block.src || block.cid || ""}
            onChange={(e) => {
              const v = e.target.value;
              // безопасность: сохраняем в src, а cid не трогаем
              onPatch({ src: v });
            }}
          />
        </Field>
        <Field label="Alt">
          <input
            className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751]"
            value={block.alt || ""}
            onChange={(e) => onPatch({ alt: e.target.value })}
          />
        </Field>
      </div>
    );
  }

  return (
    <div className="text-xs text-[#c9d0e9]">
      Для блока <b>{t}</b> редактор Content будет добавлен на следующем шаге.
    </div>
  );
}
