// src/screens/SiteBuilder/blocks/h1/view.tsx
import type { H1Block } from "../../types";

export default function H1View({ block }: { block: H1Block }) {
  const align =
    block.align === "center" ? "text-center" : block.align === "right" ? "text-right" : "text-left";

  return (
    <h1 className={`text-3xl font-bold text-[#0b1022] ${align}`}>
      {block.text || "Заголовок"}
    </h1>
  );
}
