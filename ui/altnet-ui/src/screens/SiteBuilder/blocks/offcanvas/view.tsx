import React from "react";
import type { OffcanvasBlock } from "../../types";

export default function OffcanvasView({ block }: { block: OffcanvasBlock }) {
  const [open, setOpen] = React.useState(false);
  const side = block.side ?? "left";
  const w = Math.max(200, Math.min(640, Math.floor(block.width ?? 320)));
  const offPos = side === "left" ? "-translate-x-full" : "translate-x-full";
  const onPos  = "translate-x-0";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-[#1f2751] bg-[#101735] text-[#e6e9f4] hover:bg-[#121b3f] px-3 py-2">
        Открыть {block.title || "панель"}
      </button>

      {/* Затемнение */}
      {open && (
        <button
          aria-label="Закрыть"
          onClick={() => setOpen(false)}
          className="fixed inset-0 bg-black/50"
        />
      )}

      {/* Панель */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={block.title || "Offcanvas"}
        className={`fixed top-0 ${side === "left" ? "left-0" : "right-0"} h-full bg-[#0b1022] border-[#1f2751] border
                    w-[${w}px] p-4 transition-transform duration-200
                    ${open ? onPos : offPos}`}
        style={{ willChange: "transform" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-[#e6e9f4]">{block.title || "Меню"}</div>
          <button
            onClick={() => setOpen(false)}
            className="rounded px-2 py-1 text-sm border border-[#1f2751] hover:bg-[#121b3f] text-[#e6e9f4]">
            Закрыть
          </button>
        </div>
        <div className="text-sm text-[#c9d0e9] whitespace-pre-wrap">
          {block.body || "Содержимое панели (демо)."}
        </div>
      </div>
    </div>
  );
}
