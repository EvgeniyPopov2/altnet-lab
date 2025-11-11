import { useState } from "react";
import type { VideoPlaylistBlock } from "../../types";

function safeUrl(s?: string) {
  const u = (s || "").trim().toLowerCase();
  if (!u) return "";
  if (u.startsWith("javascript:")) return "";
  if (u.startsWith("http:") || u.startsWith("https:") || u.startsWith("ipfs:") || u.startsWith("altfs:") || u.startsWith("data:")) return s!;
  return "";
}

export default function VideoPlaylistView({ block }: { block: VideoPlaylistBlock }) {
  const [i, setI] = useState(Math.max(0, Math.min(block.initial ?? 0, block.items.length - 1)));
  const cur = block.items[i];
  return (
    <div className="grid gap-3">
      <div className="rounded-xl overflow-hidden border border-[#1f2751] bg-black">
        {cur && (
          <video className="w-full h-auto" controls preload="metadata" poster={safeUrl(cur.poster) || undefined}>
            <source src={safeUrl(cur.src)} />
          </video>
        )}
      </div>
      <div className="grid gap-2">
        {block.items.map((v, idx) => (
          <button key={v.id} onClick={() => setI(idx)}
            className={`w-full text-left px-3 py-2 rounded-lg border ${idx === i ? "border-[#5865F2] bg-[#121b3f]" : "border-[#1f2751] bg-[#101735] hover:bg-[#121b3f]"} text-[#e6e9f4]`}>
            {v.title || `Видео ${idx + 1}`}
          </button>
        ))}
      </div>
    </div>
  );
}
