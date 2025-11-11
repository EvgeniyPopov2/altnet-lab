import React from "react";
import type { CtaBlock } from "../../types";

export default function CtaView({ block }: { block: CtaBlock }) {
  const variant =
    block.variant === "secondary"
      ? "bg-[#101735] border-[#1f2751] text-[#e6e9f4]"
      : block.variant === "outline"
      ? "bg-transparent border-[#5865F2] text-[#e6e9f4]"
      : "bg-[#5865F2] border-[#5865F2] text-white"; // primary

  return (
    <div className="rounded-2xl border border-[#1f2751] bg-[#0b1022] p-4 grid gap-2">
      <div className="text-lg font-semibold text-[#e6e9f4]">{block.title}</div>
      {block.text && <div className="text-sm text-[#c9d0e9]">{block.text}</div>}
      <div>
        <a
          href={block.href || "#"}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 border ${variant}`}
          rel="noopener noreferrer nofollow"
        >
          {block.btnLabel}
        </a>
      </div>
    </div>
  );
}
