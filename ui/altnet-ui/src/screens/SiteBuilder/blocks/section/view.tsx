// src/screens/SiteBuilder/blocks/section/view.tsx
import type { SectionBlock } from "../../types";

export default function SectionView({ block }: { block: SectionBlock }) {
  const theme =
    block.theme === "light" ? "bg-white text-[#0b1022]" :
    block.theme === "dark"  ? "bg-[#0f1630] text-white" :
                              "bg-transparent";

  const pad =
    block.pad === "sm" ? "py-4" :
    block.pad === "lg" ? "py-10" : "py-6";

  const bg =
    block.bg === "card"   ? "rounded-xl border border-[#1f2751]" :
    block.bg === "accent" ? "rounded-xl border border-[#1f2751] bg-[#0f1630]" :
    block.bg === "subtle" ? "rounded-xl bg-[#0f1630]/40" :
                            "";

  const align =
    block.align === "center" ? "text-center" :
    block.align === "right"  ? "text-right"  : "text-left";
  // Если секция создана через мастер Flex, layoutPreset содержит массив flex-значений колонок
  const layoutPreset = (block as any).layoutPreset as number[] | undefined;
  return (
    <section className={`${theme} ${pad} ${bg}`}>
      
      {/* Визуальные колонки, выбранные в мастере Flex */}
      {layoutPreset && layoutPreset.length > 0 && (
        <div className="mb-4 flex gap-4">
          {layoutPreset.map((flex, idx) => (
            <div
              key={idx}
              style={{ flex }}
              className="
                relative flex min-h-[140px] flex-1 items-center justify-center
                rounded-lg border border-dashed border-[#e5e7eb] bg-[#f9fafb]
              "
            >
              {/* Пока что только визуальный +, логика дропа будет позже */}
              <span className="text-2xl text-[#c4b5fd]">+</span>
            </div>
          ))}
        </div>
      )}

      {block.title && <h3 className={`text-2xl font-bold ${align}`}>{block.title}</h3>}
      {block.text && (
        <p
          className={`mt-2 text-[#2b3050] ${
            theme.includes("text-white") ? "text-[#c9d0e9]" : ""
          } ${align}`}
        >
          {block.text}
        </p>
      )}
    </section>
  );
}
