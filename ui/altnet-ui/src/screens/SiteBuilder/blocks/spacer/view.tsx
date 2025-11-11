// src/screens/SiteBuilder/blocks/spacer/view.tsx
import type { SpacerBlock } from "../../types";

export default function SpacerView({ block }: { block: SpacerBlock }) {
  const h =
    block.size === "xs" ? "h-2" :
    block.size === "sm" ? "h-4" :
    block.size === "lg" ? "h-12" :
    block.size === "xl" ? "h-16" :
    "h-8"; // md по умолчанию
  return <div className={`${h}`} aria-hidden="true" />;
}
