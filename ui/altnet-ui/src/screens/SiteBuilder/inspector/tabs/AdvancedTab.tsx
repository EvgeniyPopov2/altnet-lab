import Field from "../../ui/Field";

type Props = {
  block: any;
  onPatch: (patch: Record<string, any>) => void;
  device: "desktop" | "tablet" | "mobile";
};

export default function AdvancedTab({ block, onPatch }: Props) {
  return (
    <div className="grid gap-3">
      <Field label="CSS class">
        <input
          className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751]"
          value={block.className || ""}
          onChange={(e) => onPatch({ className: e.target.value })}
          placeholder="например: my-card"
        />
      </Field>
      <Field label="Anchor (id)">
        <input
          className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751]"
          value={block.anchor || ""}
          onChange={(e) => onPatch({ anchor: e.target.value })}
          placeholder="например: section-1"
        />
      </Field>
    </div>
  );
}
