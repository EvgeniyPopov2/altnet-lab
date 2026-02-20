// src/screens/SiteBuilder/blocks/hero/view.tsx
import type { HeroBlock } from "../../types";

export default function HeroView({ block }: { block: HeroBlock }) {
  const title = block.title || "Заголовок";
  const subtitle = block.subtitle || "";

  return (
    <section className="rounded-2xl border border-[#1f2751] bg-[#0f1630] px-6 py-8 text-white">
      <h2 className="text-3xl font-extrabold">{title}</h2>
      {subtitle && <p className="mt-2 text-[#c9d0e9]">{subtitle}</p>}
      {block.ctaText && (
        <div className="mt-4">
          <a
            href={block.ctaLink || "#"}
            className="inline-flex items-center rounded-lg bg-[#2a3b8f] px-4 py-2 text-sm text-white hover:bg-[#22327a]"
            onClick={(e) => e.preventDefault()}
          >
            {block.ctaText}
          </a>
        </div>
      )}
    </section>
  );
}
