import type { ContainerBlock } from "../../types";

export default function ContainerView({ block }: { block: ContainerBlock }) {
  const w = block.width ?? "md";
  const p = block.padding ?? "md";
  const bg = block.bg ?? "none";
  const maxW =
    w === "sm" ? "max-w-screen-sm" :
    w === "md" ? "max-w-screen-md" :
    w === "lg" ? "max-w-screen-lg" :
    w === "xl" ? "max-w-screen-xl" : "max-w-none";
  const pad =
    p === "none" ? "" :
    p === "sm" ? "p-3" :
    p === "md" ? "p-6" : "p-8";
  const bgCls =
    bg === "panel" ? "bg-[#0b1022]" :
    bg === "brand" ? "bg-[#101735]" : "";
  const border = block.border ? "border border-[#1f2751]" : "";
  const radius = block.rounded ? "rounded-2xl" : "";

  return (
    <section className={`${maxW} mx-auto ${pad} ${bgCls} ${border} ${radius}`}>
      {block.note && <div className="mb-2 text-xs text-[#9aa3b2]">{block.note}</div>}
      <div className="text-sm text-[#c9d0e9]">
        Контент контейнера (демо). В реальности сюда вкладываются блоки.
      </div>
    </section>
  );
}
