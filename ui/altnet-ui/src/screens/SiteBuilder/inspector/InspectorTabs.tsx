export type InspectorTab = "content" | "style" | "advanced";

export default function InspectorTabs(props: {
  active: InspectorTab;
  onChange: (t: InspectorTab) => void;
}) {
  const { active, onChange } = props;

  const TabBtn = ({
    id,
    label,
  }: {
    id: InspectorTab;
    label: string;
  }) => {
    const is = active === id;
    return (
      <button
        type="button"
        aria-current={is ? "page" : undefined}
        className={[
          "px-3 py-1.5 text-xs rounded-md border",
          is
            ? "bg-[#11162b] border-[#2a3875] text-[#e6e9f4]"
            : "bg-[#0c0f1a] border-[#1f2751] text-[#9aa3b2] hover:border-[#2a3875]",
        ].join(" ")}
        onClick={() => onChange(id)}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="mb-2 flex items-center gap-2">
      <TabBtn id="content" label="Контент" />
      <TabBtn id="style" label="Стиль" />
      <TabBtn id="advanced" label="Дополнительно" />
    </div>
  );
}
