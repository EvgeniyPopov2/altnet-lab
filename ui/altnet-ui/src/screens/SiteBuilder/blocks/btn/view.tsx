// src/screens/SiteBuilder/blocks/btn/view.tsx
import type { BtnBlock } from "../../types";

export default function BtnView({ block }: { block: BtnBlock }) {
  const variant =
    block.variant === "secondary"
      ? "bg-transparent text-[#2a3b8f] border border-[#2a3b8f] hover:bg-[#eef1ff]"
      : "bg-[#2a3b8f] text-white hover:bg-[#22327a]";
  return (
    <a
      href={block.href || "#"}
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm transition-colors ${variant}`}
      // в предпросмотре ссылка никуда не ведёт
      onClick={(e) => e.preventDefault()}
    >
      {block.label || "Кнопка"}
    </a>
  );
}
