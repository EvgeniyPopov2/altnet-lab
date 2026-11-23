// src/screens/SiteBuilder/blocks/spacer/view.tsx
import type { SpacerBlock } from "../../types";
import { spacerHeight } from "./size";
import type { LayoutBreakpoint } from "../../layoutResponsive";

export default function SpacerView({ block, device = "desktop" }: { block: SpacerBlock; device?: LayoutBreakpoint }) {
  return <div style={{ height: spacerHeight(block, device) }} aria-hidden="true" />;
}
