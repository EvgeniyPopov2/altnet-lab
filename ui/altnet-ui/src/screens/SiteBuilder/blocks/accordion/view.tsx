import React from "react";
import type { AccordionBlock } from "../../types";

export default function AccordionView({ block }: { block: AccordionBlock }) {
  const [openIds, setOpen] = React.useState<string[]>(
    block.items.filter((i) => i.open).map((i) => i.id)
  );

  function toggle(id: string) {
    setOpen((cur) => {
      const has = cur.includes(id);
      if (block.allowMultiple) return has ? cur.filter((x) => x !== id) : [...cur, id];
      return has ? [] : [id];
    });
  }

  return (
    <div className="grid gap-2">
      {block.items.map((it, i) => {
        const open = openIds.includes(it.id);
        const panelId = `${block.id}-p-${i}`;
        const btnId = `${block.id}-b-${i}`;
        return (
          <div key={it.id} className="rounded-xl border border-[#1f2751] bg-[#0f1630]">
            <h3 className="text-sm">
              <button
                id={btnId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(it.id)}
                className="w-full text-left px-3 py-2 flex items-center justify-between"
              >
                <span className="text-[#e6e9f4]">{it.title}</span>
                <span className="text-[#9aa3b2]">{open ? "−" : "+"}</span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={btnId}
              hidden={!open}
              className="px-3 pb-3 text-sm text-[#c9d0e9]"
            >
              {it.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
