import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";

export default function SafePreview({ html }: { html: string }) {
  // 1) Debounce, чтобы iframe обновлялся не на каждую букву
  const [deb, setDeb] = useState(html);
  useEffect(() => {
    const t = setTimeout(() => setDeb(html), 250);
    return () => clearTimeout(t);
  }, [html]);

  // 2) Санитайзим уже "задебоунсенный" HTML
  const clean = useMemo(() => DOMPurify.sanitize(deb, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "iframe", "object", "embed", "link"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "style"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?:|data:image\/|altfs:\/\/|cid:))/i,
    KEEP_CONTENT: false,
  }), [deb]);

  // 3) Не даём iframe уводить фокус
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const doc = useMemo(() => `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: altfs: https: http:; style-src 'unsafe-inline'; font-src 'none'; connect-src 'none'; frame-ancestors 'none'">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Предпросмотр</title>
  <style>
    :root { --gap: 16px; }
    html,body { margin:0; padding:16px; color:#e5e7eb; background:#0b0d12; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto; }
    img,video { max-width:100%; height:auto; border-radius:12px; }
    a { color:#93c5fd; }
    .btn { display:inline-block; padding:10px 14px; border-radius:12px; background:#4f46e5; color:white; text-decoration:none; }
    h1,h2,h3 { margin:0 0 12px; }
    p { margin:0 0 12px; line-height:1.6; }

    /* 12-колоночная сетка */
    .row { display:flex; flex-wrap:wrap; margin-left:calc(var(--gap) * -0.5); margin-right:calc(var(--gap) * -0.5); }
    .col { padding-left:calc(var(--gap) * 0.5); padding-right:calc(var(--gap) * 0.5); margin-bottom:var(--gap); }
    /* брейкпоинты */
    /* xs (mobile) */
    ${Array.from({length:12}, (_,i)=>`.c-xs-${i+1}{ width:${((i+1)/12*100).toFixed(6)}%; }`).join("\n")}
    /* sm ≥640px */
    @media (min-width:640px){ ${Array.from({length:12},(_,i)=>`.c-sm-${i+1}{ width:${((i+1)/12*100).toFixed(6)}%; }`).join("\n")} }
    /* md ≥768px */
    @media (min-width:768px){ ${Array.from({length:12},(_,i)=>`.c-md-${i+1}{ width:${((i+1)/12*100).toFixed(6)}%; }`).join("\n")} }
    /* lg ≥1024px */
    @media (min-width:1024px){ ${Array.from({length:12},(_,i)=>`.c-lg-${i+1}{ width:${((i+1)/12*100).toFixed(6)}%; }`).join("\n")} }
    /* xl ≥1280px */
    @media (min-width:1280px){ ${Array.from({length:12},(_,i)=>`.c-xl-${i+1}{ width:${((i+1)/12*100).toFixed(6)}%; }`).join("\n")} }
  </style>
</head>
<body>
${clean}
</body>
</html>`, [clean]);

  return (
    <iframe
      ref={iframeRef}
      tabIndex={-1}
      onLoad={() => { iframeRef.current?.blur(); }}
      sandbox=""
      srcDoc={doc}
      className="w-full h-full rounded-2xl border border-white/10 bg-black"
      title="SafePreview"
    />
  );
}
