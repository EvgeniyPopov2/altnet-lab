import React from "react";
import type { AccordionBlock } from "../../types";

function clsItem(variant?: "ghost" | "filled" | "outline") {
  if (variant === "filled")  return "bg-[#0b1022] border border-[#1f2751]";
  if (variant === "outline") return "border border-[#1f2751]";
  return ""; // ghost
}
function clsBtn(open: boolean) {
  return `w-full text-left px-3 py-2 rounded-lg ${open ? "bg-[#121b3f] text-[#e6e9f4]" : "bg-[#101735] text-[#e6e9f4] hover:bg-[#121b3f]"} border border-[#1f2751]`;
}
function clsPanel() { return "px-3 py-2 text-sm text-[#c9d0e9]"; }

export default function AccordionView({ block }: { block: AccordionBlock }) {
  const [openIds, setOpen] = React.useState<string[]>(
    block.items.filter(i => i.open).map(i => i.id)
  );
  const allowMultiple = !!block.allowMultiple;
  const allowToggle = block.allowToggle !== false; // по умолчанию можно закрыть последний

  function toggle(id: string) {
    setOpen(prev => {
      const has = prev.includes(id);
      if (has) {
        if (allowToggle) return prev.filter(x => x !== id);
        return prev; // нельзя закрыть
      } else {
        return allowMultiple ? [...prev, id] : [id];
      }
    });
  }

  return (
    <div className="grid gap-2">
      {block.items.map(it => {
        const open = openIds.includes(it.id);
        const panelId = `acc-panel-${block.id}-${it.id}`;
        const btnId   = `acc-btn-${block.id}-${it.id}`;
        return (
          <div key={it.id} className={`rounded-2xl ${clsItem(block.variant)} overflow-hidden`}>
            <h3 className="sr-only">{it.title}</h3>
            <button
              id={btnId}
              className={clsBtn(open)}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => toggle(it.id)}
            >
              {it.title}
            </button>
            <div
              id={panelId}
              role="region"
              aria-labelledby={btnId}
              className={`transition-all ${open ? "max-h-[320px] opacity-100" : "max-h-0 opacity-0"} overflow-hidden`}
            >
              <div className={clsPanel()}>
                {it.content || "Контент секции"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
