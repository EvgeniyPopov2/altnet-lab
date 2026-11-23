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
        role="tab"
        id={`inspector-tab-${id}`}
        aria-controls="inspector-panel"
        aria-selected={is}
        tabIndex={is ? 0 : -1}
        onKeyDown={event => {
          const ids: InspectorTab[] = ["content", "style", "advanced"];
          const index = ids.indexOf(id);
          const next = event.key === "ArrowRight" ? ids[(index + 1) % ids.length] : event.key === "ArrowLeft" ? ids[(index + ids.length - 1) % ids.length] : event.key === "Home" ? ids[0] : event.key === "End" ? ids[ids.length - 1] : undefined;
          if (!next) return;
          event.preventDefault(); onChange(next);
          event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#inspector-tab-${next}`)?.focus();
        }}
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
    <div role="tablist" aria-label="Настройки блока" className="mb-2 flex items-center gap-2">
      <TabBtn id="content" label="Контент" />
      <TabBtn id="style" label="Стиль" />
      <TabBtn id="advanced" label="Дополнительно" />
    </div>
  );
}
