import { useMemo } from "react";
import ContentTab from "./tabs/ContentTab";
import StyleTab from "./tabs/StyleTab";
import AdvancedTab from "./tabs/AdvancedTab";
import Segmented from "../ui/Segmented";
import Field from "../ui/Field";
import type { BlockPatch } from "./patch";
import type { InspectorTab } from "./InspectorTabs";

type Device = "desktop" | "tablet" | "mobile";

type Props = {
  block?: any;                               // выбранный блок или undefined
  onPatch: (patch: BlockPatch, group?: string) => void; // патч или преобразование актуального блока
  device: Device;
  onDeviceChange: (device: Device) => void;
  tab: InspectorTab;
};

export default function Inspector({ block, onPatch, device, onDeviceChange, tab }: Props) {

  const header = useMemo(() => {
    if (!block) return "Нет выбранного блока";
    const t = (block.type || "").toString();
    return `Блок: ${t} — ${block.id || ""}`;
  }, [block]);

  return (
    <aside className="builder-inspector w-full min-w-0 shrink-0 border border-[#1f2751] bg-[#0b1022] text-[#e6e9f4]">
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
            onChange={(v) => onDeviceChange(v as Device)}
          />
        </div>
      </div>

      <div id="inspector-panel" role="tabpanel" aria-labelledby={`inspector-tab-${tab}`} className="p-3">
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
              readOnly
              aria-label="Внутренний идентификатор блока"
            />
          </Field>
        </div>
      )}
    </aside>
  );
}
