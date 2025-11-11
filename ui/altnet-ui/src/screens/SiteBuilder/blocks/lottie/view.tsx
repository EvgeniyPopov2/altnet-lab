import type { LottieBlock } from "../../types";

function safeUrl(s?: string) {
  const u = (s || "").trim().toLowerCase();
  if (!u) return "";
  if (u.startsWith("javascript:")) return "";
  if (u.startsWith("http:") || u.startsWith("https:") || u.startsWith("ipfs:") || u.startsWith("altfs:") || u.startsWith("data:")) return s!;
  return "";
}

export default function LottieView({ block }: { block: LottieBlock }) {
  const poster = safeUrl(block.poster);
  const src = safeUrl(block.src);
  return (
    <figure className="grid gap-2 rounded-2xl border border-[#1f2751] bg-[#0b1022] p-3">
      {poster ? (
        <img className="w-full rounded-xl border border-[#2a2f45]" src={poster} alt={block.caption || "Lottie"} />
      ) : (
        <div className="aspect-video w-full grid place-items-center rounded-xl border border-[#1f2751] bg-[#101735] text-[#9aa3b2]">
          Lottie (превью)
        </div>
      )}
      <figcaption className="text-xs text-[#9aa3b2]">
        {block.caption || (src ? `JSON: ${src}` : "Задайте JSON или постер")}
      </figcaption>
    </figure>
  );
}
