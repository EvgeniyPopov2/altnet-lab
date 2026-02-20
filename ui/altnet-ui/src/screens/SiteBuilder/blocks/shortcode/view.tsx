import type { ShortcodeBlock } from "../../types";

function parse(sc: string) {
  const m = sc.match(/^\s*\[([a-z0-9_]+)\s*([^\]]*)\]\s*$/i);
  if (!m) return { kind: "unknown", html: "" } as const;
  const name = m[1].toLowerCase();
  const attrs: Record<string, string> = {};
  (m[2] || "").replace(/([a-z0-9_:-]+)\s*=\s*"([^"]*)"/gi, (_, k, v) => (attrs[k.toLowerCase()] = v, ""));
  if (name === "youtube" && attrs.id) {
    const start = attrs.start ? `&start=${encodeURIComponent(attrs.start)}` : "";
    const url = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(attrs.id)}?rel=0${start}`;
    return { kind: "iframe", url, allow: "accelerometer; encrypted-media; picture-in-picture; fullscreen" } as const;
  }
  if (name === "vimeo" && attrs.id) {
    const url = `https://player.vimeo.com/video/${encodeURIComponent(attrs.id)}`;
    return { kind: "iframe", url, allow: "autoplay; fullscreen; picture-in-picture" } as const;
  }
  if (name === "soundcloud" && attrs.url && /^https:\/\/soundcloud\.com\//i.test(attrs.url)) {
    const url = `https://w.soundcloud.com/player/?url=${encodeURIComponent(attrs.url)}&auto_play=false`;
    return { kind: "iframe", url, allow: "autoplay" } as const;
  }
  return { kind: "unknown", html: sc } as const;
}

export default function ShortcodeView({ block }: { block: ShortcodeBlock }) {
  const parsed = parse(block.code || "");
  return (
    <section className="rounded-2xl border border-[#1f2751] bg-[#0b1022]">
      {block.title && <div className="px-4 pt-3 text-sm text-[#9aa3b2]">{block.title}</div>}
      <div className="p-3">
        {parsed.kind === "iframe" ? (
          <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
            <iframe
              title="Shortcode embed"
              className="absolute inset-0 w-full h-full rounded-xl"
              src={parsed.url}
              sandbox="allow-scripts allow-same-origin allow-presentation"
              referrerPolicy="no-referrer"
              allow={parsed.allow}
            />
          </div>
        ) : (
          <pre className="text-xs text-[#c9d0e9] bg-[#0f1630] rounded-xl p-3 overflow-auto">{block.code}</pre>
        )}
      </div>
    </section>
  );
}
