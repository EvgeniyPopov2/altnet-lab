import type { VideoBlock } from "../../types";

function safeUrl(s?: string) {
  const u = (s || "").trim().toLowerCase();
  if (!u) return "";
  if (u.startsWith("javascript:")) return "";
  if (u.startsWith("http:") || u.startsWith("https:") || u.startsWith("ipfs:") || u.startsWith("altfs:") || u.startsWith("data:")) return s!;
  return "";
}

export default function VideoView({ block }: { block: VideoBlock }) {
  const src = safeUrl(block.src);
  const poster = safeUrl(block.poster);
  return (
    <div className="rounded-xl border border-[#1f2751] bg-black overflow-hidden">
      <video
        className="w-full h-auto"
        controls
        preload="metadata"
        muted={!!block.muted}
        loop={!!block.loop}
        poster={poster || undefined}
      >
        {src && <source src={src} />}
        Ваш браузер не поддерживает видео.
      </video>
    </div>
  );
}
