import { useState } from "react";
import type { MediaCarouselBlock } from "../../types";

function safeUrl(s?: string) {
  const u = (s || "").trim().toLowerCase();
  if (!u) return "";
  if (u.startsWith("javascript:")) return "";
  if (u.startsWith("http:") || u.startsWith("https:") || u.startsWith("ipfs:") || u.startsWith("altfs:") || u.startsWith("data:")) return s!;
  return "";
}

export default function MediaCarouselView({ block }: { block: MediaCarouselBlock }) {
  const [i, setI] = useState(Math.max(0, Math.min(block.initial ?? 0, block.slides.length - 1)));
  const n = block.slides.length || 1;
  const cur = block.slides[i];

  return (
    <div className="relative rounded-2xl border border-[#1f2751] bg-[#0b1022] overflow-hidden">
      {cur && cur.kind === "img" && (
        <figure>
          <img src={safeUrl(cur.src)} alt={cur.alt || ""} className="w-full h-auto block" />
          {cur.caption && <figcaption className="absolute bottom-2 left-2 text-xs px-2 py-1 rounded bg-black/50 text-white">{cur.caption}</figcaption>}
        </figure>
      )}
      {cur && cur.kind === "video" && (
        <figure>
          <video className="w-full h-auto block" controls preload="metadata">
            <source src={safeUrl(cur.src)} />
          </video>
          {cur.caption && <figcaption className="absolute bottom-2 left-2 text-xs px-2 py-1 rounded bg-black/50 text-white">{cur.caption}</figcaption>}
        </figure>
      )}
      {n > 1 && (
        <>
          <button aria-label="Предыдущий" onClick={() => setI((i - 1 + n) % n)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 bg-[#101735]/70 text-[#e6e9f4] border border-[#1f2751]">‹</button>
          <button aria-label="Следующий" onClick={() => setI((i + 1) % n)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 bg-[#101735]/70 text-[#e6e9f4] border border-[#1f2751]">›</button>
        </>
      )}
    </div>
  );
}
