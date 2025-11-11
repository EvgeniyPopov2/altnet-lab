import { useState } from "react";
import type { SlidesBlock } from "../../types";

function safeHref(h?: string) {
  const s = (h || "").trim().toLowerCase();
  if (!s) return undefined;
  if (s.startsWith("javascript:")) return "#";
  if (/^https?:\/\//.test(s) || s.startsWith("#")) return h!;
  return "#";
}

export default function SlidesView({ block }: { block: SlidesBlock }) {
  const [i, setI] = useState(Math.max(0, Math.min(block.initial ?? 0, block.slides.length - 1)));
  const n = block.slides.length || 1;
  const s = block.slides[i];

  return (
    <div className="relative rounded-2xl border border-[#1f2751] bg-[#0b1022] p-6">
      {s && (
        <div className="grid gap-2">
          {s.title && <div className="text-xl font-extrabold text-[#e6e9f4]">{s.title}</div>}
          {s.text && <div className="text-sm text-[#c9d0e9]">{s.text}</div>}
          {s.ctaLabel && (
            <a href={safeHref(s.ctaHref)} className="w-max px-3 py-1.5 rounded-lg border border-[#1f2751] bg-[#101735] text-[#e6e9f4] hover:bg-[#121b3f]" rel="noopener noreferrer nofollow">
              {s.ctaLabel}
            </a>
          )}
        </div>
      )}
      {n > 1 && (
        <>
          <button aria-label="Предыдущий" onClick={() => setI((i - 1 + n) % n)}
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 bg-[#101735]/70 text-[#e6e9f4] border border-[#1f2751]">‹</button>
          <button aria-label="Следующий" onClick={() => setI((i + 1) % n)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 bg-[#101735]/70 text-[#e6e9f4] border border-[#1f2751]">›</button>
        </>
      )}
    </div>
  );
}
