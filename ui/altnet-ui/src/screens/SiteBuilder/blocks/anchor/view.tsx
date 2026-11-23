import type { AnchorBlock } from "../../types";
import { safeAnchorName } from "./name";

export default function AnchorView({ block }: { block: AnchorBlock }) {
  const id = safeAnchorName(block.name);
  return (
    <div className="grid gap-1">
      <div id={id} className="h-0" aria-hidden="true" />
      <div className="inline-flex items-center gap-2 text-xs text-[#9aa3b2]">
        <span className="rounded bg-[#0f1630] border border-[#1f2751] px-2 py-0.5"># {id}</span>
        {block.label && <span>— {block.label}</span>}
      </div>
    </div>
  );
}
