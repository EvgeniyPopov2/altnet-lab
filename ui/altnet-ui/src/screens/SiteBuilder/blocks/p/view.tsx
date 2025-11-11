// src/screens/SiteBuilder/blocks/p/view.tsx
import type { PBlock } from "../../types";

export default function PView({ block }: { block: PBlock }) {
  const align =
    block.align === "center" ? "text-center" : block.align === "right" ? "text-right" : "text-left";

  return (
    <p className={`text-base leading-6 text-[#2b3050] ${align}`}>
      {block.text || "Текст абзаца. Нажмите, чтобы отредактировать."}
    </p>
  );
}
