type Breakpoint = "desktop" | "tablet" | "mobile";

export default function DeviceSwitch(props: {
  bp: Breakpoint;
  onChangeBp: (bp: Breakpoint) => void;
  mode: "fit" | Breakpoint;
  onChangeMode: (m: "fit" | Breakpoint) => void;
  widthByBp?: Record<Breakpoint, number>;
}) {
  const { bp, onChangeBp, mode, onChangeMode, widthByBp = { desktop: 1280, tablet: 834, mobile: 390 } } = props;
  const Btn = (p: { id: Breakpoint; label: string }) => (
    <button
      className={`px-2.5 py-1.5 rounded-md border ${bp === p.id ? "border-[#6E59F2] text-[#e6e9f4]" : "border-[#2a2f45] text-[#cfd5e6]"} bg-[#0f1420]`}
      onClick={() => { onChangeBp(p.id); onChangeMode(p.id); }}
      title={p.label}
    >
      {p.label}
    </button>
  );
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#2a2f45] bg-[#0c0f1a] px-3 py-2">
      <span className="text-xs text-[#9aa3b2] mr-1">Режим:</span>
      <Btn id="desktop" label="Desktop" />
      <Btn id="tablet"  label="Tablet" />
      <Btn id="mobile"  label="Mobile" />
      <span className="mx-2 h-5 w-px bg-[#2a2f45]" />
      <button
        className={`px-2.5 py-1.5 rounded-md border ${mode === "fit" ? "border-[#6E59F2] text-[#e6e9f4]" : "border-[#2a2f45] text-[#cfd5e6]"} bg-[#0f1420]`}
        onClick={() => onChangeMode("fit")}
        title="Под ширину контейнера"
      >
        Fit
      </button>
      <span className="text-xs text-[#9aa3b2] ml-2">Ширина:</span>
      <span className="text-xs text-[#cfd5e6]">
        {mode === "fit" ? "auto" : `${widthByBp[mode as Breakpoint] ?? 0}px`}
      </span>
    </div>
  );
}
