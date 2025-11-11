import React from "react";
import type { BlockquoteBlock } from "../../types";

export default function BlockquoteView({ block }: { block: BlockquoteBlock }) {
  return (
    <blockquote className="border-l-4 border-[#5865F2] pl-3 text-[#e6e9f4] italic bg-[#0f1630] rounded-r-xl py-2 px-3">
      <p className="text-sm"> {block.text} </p>
      {block.cite && <cite className="block mt-1 text-xs text-[#9aa3b2]">— {block.cite}</cite>}
    </blockquote>
  );
}
