import Field from "../../ui/Field";

type Props = {
  block: any;
  onPatch: (patch: Record<string, any>) => void;
  device: "desktop" | "tablet" | "mobile";
};

export default function StyleTab({ block, onPatch, device }: Props) {
  // Заглушка: базовые отступы (C1.b расширим по брейкпоинтам)
  return (
    <div className="grid gap-3">
      <Field label={`Отступы (padding) • ${device}`}>
        <input
          className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751]"
          value={block.pad || ""}
          onChange={(e) => onPatch({ pad: e.target.value })}
          placeholder="например: 16px 24px"
        />
      </Field>
      <Field label="Скругление (radius)">
        <input
          className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751]"
          value={block.radius || ""}
          onChange={(e) => onPatch({ radius: e.target.value })}
          placeholder="например: 12px"
        />
      </Field>
    </div>
  );
}
