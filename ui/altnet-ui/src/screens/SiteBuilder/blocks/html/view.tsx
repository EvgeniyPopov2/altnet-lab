type HtmlBlockLike = { html?: string; content?: string; title?: string };

function sanitize(html: string) {
  let s = html || "";
  s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");        // убираем <script>
  s = s.replace(/\son[a-z]+\s*=\s*["'][^"']*["']/gi, "");           // убираем inline-обработчики
  s = s.replace(/(href|src)\s*=\s*["']\s*javascript:[^"']*["']/gi, '$1="#"'); // убираем javascript:
  return s;
}

export default function HtmlView({ block }: { block: HtmlBlockLike }) {
  const html = sanitize(block.html ?? block.content ?? "");
  const srcDoc = `<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="dark light"><style>
    :root{color-scheme:dark light} body{margin:0;padding:16px;font:14px/1.45 ui-sans-serif,system-ui;color:#e6e9f4;background:#0b1022}
    a{color:#9bb1ff} img,video{max-width:100%;height:auto;border-radius:12px}
  </style>${html}`;

  return (
    <section className="rounded-2xl border border-[#1f2751] overflow-hidden">
      {block.title && <div className="px-4 pt-3 text-sm text-[#9aa3b2]">{block.title}</div>}
      <iframe
        title="HTML (sandbox)"
        className="w-full h-[320px] bg-[#0b1022]"
        sandbox="allow-same-origin allow-popups allow-forms"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
      />
    </section>
  );
}
