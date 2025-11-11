// src/screens/SiteBuilder/inspector/Inspector.tsx
import { useState } from "react";
import type { Block } from "../types";
import ContentTab from "./tabs/ContentTab";
import StyleTab from "./tabs/StyleTab";
import AdvancedTab from "./tabs/AdvancedTab";

export type InspectorProps = {
  block?: Block;                           // может быть undefined, если ничего не выбрано
  onChange?: (patch: Partial<Block>) => void; // дальше будем использовать
};

export default function Inspector({ block, onChange }: InspectorProps) {
  const [tab, setTab] = useState<"content" | "style" | "advanced">("content");

  return (
    <aside className="rounded-xl border border-[#1f2751] bg-[#0b1022]">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-xs uppercase tracking-wide text-[#9aa3b2]">Inspector</div>
        <div className="flex gap-1">
          <button
            className={"px-2 py-1 rounded text-xs " + (tab === "content" ? "bg-[#101735] text-[#e6e9f4]" : "text-[#9aa3b2]")}
            onClick={() => setTab("content")}
          >
            Content
          </button>
          <button
            className={"px-2 py-1 rounded text-xs " + (tab === "style" ? "bg-[#101735] text-[#e6e9f4]" : "text-[#9aa3b2]")}
            onClick={() => setTab("style")}
          >
            Style
          </button>
          <button
            className={"px-2 py-1 rounded text-xs " + (tab === "advanced" ? "bg-[#101735] text-[#e6e9f4]" : "text-[#9aa3b2]")}
            onClick={() => setTab("advanced")}
          >
            Advanced
          </button>
        </div>
      </div>

      {!block ? (
        <div className="px-3 pb-3 text-sm text-[#9aa3b2]">Выберите блок на канвасе, чтобы редактировать.</div>
      ) : (
        <>
          <div className="px-3 pb-2 text-[11px] text-[#aab3c7]">
            Выбран: <span className="text-[#e6e9f4]">{block.type}</span> <span className="opacity-60">#{block.id}</span>
          </div>
          <div className="px-3 py-3">
            {tab === "content" && <ContentTab block={block} onChange={onChange} />}
            {tab === "style" && <StyleTab block={block} onChange={onChange} />}
            {tab === "advanced" && <AdvancedTab block={block} onChange={onChange} />}
          </div>
        </>
      )}
    </aside>
  );
}
