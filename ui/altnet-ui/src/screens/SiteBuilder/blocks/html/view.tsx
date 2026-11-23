import { sanitizeSafeHtml } from "./sanitize";

type HtmlBlockLike = { html?: string; content?: string; title?: string };

export default function HtmlView({ block }: { block: HtmlBlockLike }) {
  const html = sanitizeSafeHtml(block.html ?? block.content ?? "");
  const srcDoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><style>body{margin:0;padding:16px;font:14px/1.45 system-ui;color:#e6e9f4;background:#0b1022}a{color:#9bb1ff}</style>${html}`;
  return <section className="overflow-hidden rounded-2xl border border-[#1f2751]">
    {block.title && <div className="px-4 pt-3 text-sm text-[#9aa3b2]">{block.title}</div>}
    <iframe title="Безопасный предпросмотр HTML" className="h-[320px] w-full bg-[#0b1022]" sandbox="" referrerPolicy="no-referrer" srcDoc={srcDoc} />
  </section>;
}
