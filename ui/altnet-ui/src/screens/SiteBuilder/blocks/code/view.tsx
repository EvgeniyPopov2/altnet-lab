// src/screens/SiteBuilder/blocks/code/view.tsx
import type { CodeBlock } from "../../types";

export default function CodeView({ block }: { block: CodeBlock }) {
  const code = block.code || "";
  return (
    <pre className="rounded-xl border border-[#1f2751] bg-[#0f1630] p-3 overflow-auto text-sm text-[#e6e9f4]">
      <code>{code}</code>
    </pre>
  );
}
