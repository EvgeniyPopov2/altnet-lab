import React from "react";
import type { ShareBlock, ShareNetwork } from "../../types";

function safeUrl(s?: string) {
  const u = (s || "").trim();
  if (!u) return "";
  if (u.toLowerCase().startsWith("javascript:")) return "";
  return u;
}
function netHref(net: ShareNetwork, url: string) {
  const enc = encodeURIComponent(url);
  switch (net) {
    case "telegram": return `https://t.me/share/url?url=${enc}`;
    case "vk":       return `https://vk.com/share.php?url=${enc}`;
    case "twitter":  return `https://twitter.com/intent/tweet?url=${enc}`;
    case "facebook": return `https://www.facebook.com/sharer/sharer.php?u=${enc}`;
    default:         return "#";
  }
}

export default function ShareView({ block }: { block: ShareBlock }) {
  const [copied, setCopied] = React.useState(false);
  const url = safeUrl(block.url || (typeof window !== "undefined" ? window.location.href : "")) || "#";
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }
  return (
    <div className="flex flex-wrap gap-2">
      {block.networks.map((n) =>
        n === "copy" ? (
          <button key={n} onClick={copy}
            className="px-2 py-1 rounded-lg border border-[#1f2751] bg-[#101735] text-[#e6e9f4] hover:bg-[#121b3f]">
            {copied ? "Скопировано" : "Копировать ссылку"}
          </button>
        ) : (
          <a key={n} href={netHref(n, url)} target="_blank" rel="noopener noreferrer nofollow"
             className="px-2 py-1 rounded-lg border border-[#1f2751] bg-[#101735] text-[#e6e9f4] hover:bg-[#121b3f]">
            Поделиться: {n}
          </a>
        )
      )}
    </div>
  );
}
