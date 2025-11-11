// src/screens/SiteBuilder/blocks/heading/view.tsx
import type { HeadingBlock } from "../../types";

export default function HeadingView({ block }: { block: HeadingBlock }) {
  const align =
    block.align === "center" ? "text-center" : block.align === "right" ? "text-right" : "text-left";

  const text = block.text || "Заголовок";
  const cls = "text-[#0b1022] " + align;

  switch (block.level ?? "h2") {
    case "h3":
      return <h3 className={`text-xl font-semibold ${cls}`}>{text}</h3>;
    case "h4":
      return <h4 className={`text-lg font-semibold ${cls}`}>{text}</h4>;
    default:
      return <h2 className={`text-2xl font-bold ${cls}`}>{text}</h2>;
  }
}
