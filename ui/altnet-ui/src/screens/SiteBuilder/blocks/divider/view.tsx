// src/screens/SiteBuilder/blocks/divider/view.tsx
import type { DividerBlock } from "../../types";

export default function DividerView(_props: { block: DividerBlock }) {
  return <div className="h-px w-full bg-[#2a2f45]/70" />;
}
