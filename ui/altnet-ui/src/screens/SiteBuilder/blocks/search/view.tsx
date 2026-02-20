import type { SearchBlock } from "../../types";

function safeAction(a?: string) {
  const s = (a || "").trim().toLowerCase();
  if (!s || s.startsWith("javascript:")) return "#";
  if (/^https?:\/\//.test(s) || s.startsWith("#") || s.startsWith("/")) return a!;
  return "#";
}

export default function SearchView({ block }: { block: SearchBlock }) {
  const action = safeAction(block.action);
  const method = block.method || "GET";
  return (
    <form role="search" action={action} method={method} className="flex gap-2">
      <input
        type="search"
        className="min-w-[240px] px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
        placeholder={block.placeholder || "Поиск…"}
        name="q"
        autoComplete="off"
      />
      <button className="px-3 py-2 rounded-lg border border-[#1f2751] bg-[#101735] text-[#e6e9f4] hover:bg-[#121b3f]" type="submit">
        Искать
      </button>
    </form>
  );
}
