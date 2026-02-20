import { useMemo, useState } from "react";
import ContentTab from "./tabs/ContentTab";
import StyleTab from "./tabs/StyleTab";
import AdvancedTab from "./tabs/AdvancedTab";
import Segmented from "../ui/Segmented";
import Field from "../ui/Field";

type Device = "desktop" | "tablet" | "mobile";

type Props = {
  block?: any;                               // выбранный блок или undefined
  onPatch: (patch: Record<string, any>) => void; // патч в текущий блок
};

export default function Inspector({ block, onPatch }: Props) {
  const [tab, setTab] = useState<"content" | "style" | "advanced">("content");
  const [device, setDevice] = useState<Device>("desktop");

  const header = useMemo(() => {
    if (!block) return "Нет выбранного блока";
    const t = (block.type || "").toString();
    return `Блок: ${t} — ${block.id || ""}`;
  }, [block]);

  return (
    <aside className="w-full xl:w-[320px] 2xl:w-[360px] shrink-0 border-l border-[#1f2751] bg-[#0b1022] text-[#e6e9f4]">
      <div className="p-3 border-b border-[#1f2751]">
        <div className="text-sm font-semibold">{header}</div>
        <div className="mt-2">
          <Segmented
            items={[
              { id: "desktop", label: "Desktop" },
              { id: "tablet", label: "Tablet" },
              { id: "mobile", label: "Mobile" },
            ]}
            value={device}
            onChange={(v) => setDevice(v as Device)}
          />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1">
          <button
            className={`px-2 py-1 rounded ${tab === "content" ? "bg-[#182047]" : "bg-[#101735]"} border border-[#1f2751] text-xs`}
            onClick={() => setTab("content")}
          >
            Content
          </button>
          <button
            className={`px-2 py-1 rounded ${tab === "style" ? "bg-[#182047]" : "bg-[#101735]"} border border-[#1f2751] text-xs`}
            onClick={() => setTab("style")}
          >
            Style
          </button>
          <button
            className={`px-2 py-1 rounded ${tab === "advanced" ? "bg-[#182047]" : "bg-[#101735]"} border border-[#1f2751] text-xs`}
            onClick={() => setTab("advanced")}
          >
            Advanced
          </button>
        </div>
      </div>

      <div className="p-3">
        {!block ? (
          <div className="text-xs text-[#c9d0e9]">Выберите блок на канвасе.</div>
        ) : tab === "content" ? (
          <ContentTab block={block} onPatch={onPatch} device={device} />
        ) : tab === "style" ? (
          <StyleTab block={block} onPatch={onPatch} device={device} />
        ) : (
          <AdvancedTab block={block} onPatch={onPatch} device={device} />
        )}
      </div>

      {/* Служебный раздел: отладочная сводка */}
      {block && (
        <div className="p-3 border-t border-[#1f2751]">
          <Field label="ID">
            <input
              className="w-full px-2 py-1 rounded bg-[#0c1127] border border-[#1f2751] text-xs"
              value={block.id || ""}
              onChange={(e) => onPatch({ id: e.target.value })}
            />
          </Field>
        </div>
      )}
    </aside>
  );
}
