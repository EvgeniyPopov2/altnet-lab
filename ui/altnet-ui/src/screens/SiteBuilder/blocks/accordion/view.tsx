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
function clsPanel(variant?: "ghost" | "filled" | "outline") { return `px-3 py-2 text-sm ${variant === "filled" ? "text-[#c9d0e9]" : "text-[#2b3050]"}`; }

export default function AccordionView({ block }: { block: AccordionBlock }) {
  const allowMultiple = !!block.allowMultiple;
  const allowToggle = block.allowToggle !== false; // по умолчанию можно закрыть последний
  const initial = () => {
    const chosen = block.items.filter(i => i.open).map(i => i.id);
    const normalized = allowMultiple ? chosen : chosen.slice(0, 1);
    return !allowToggle && !normalized.length && block.items.length ? [block.items[0].id] : normalized;
  };
  const [openIds, setOpen] = React.useState<string[]>(initial);
  React.useEffect(() => { setOpen(initial()); }, [block.items, allowMultiple, allowToggle]);

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
              hidden={!open}
            >
              <div className={clsPanel(block.variant)}>
                {it.content ?? ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
