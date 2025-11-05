import DOMPurify from "dompurify";

export default function SafePreview({ html }: { html: string }) {
  // Жёстко чистим HTML: без <script>, <iframe>, инлайновых событий и опасных URL.
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true }, // базовый профиль HTML
    FORBID_TAGS: ["script", "iframe", "object", "embed", "link"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "style"], // убираем инлайновые события и стили
    ALLOWED_URI_REGEXP: /^(?:(?:https?:|data:image\/|altfs:\/\/|cid:))/i, // разрешим http/https, data:image, altfs://, cid:
    KEEP_CONTENT: false,
  });

  // Песочница через iframe srcdoc; без allow-scripts.
  // Даже если кто-то протиснет скрипт, он не выполнится.
  const doc = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: altfs: https: http:; style-src 'unsafe-inline'; font-src 'none'; connect-src 'none'; frame-ancestors 'none'">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Предпросмотр</title>
  <style>
    html,body { margin:0; padding:16px; color:#e5e7eb; background:#0b0d12; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto; }
    img,video { max-width:100%; height:auto; border-radius:12px; }
    a { color:#93c5fd; }
    .btn { display:inline-block; padding:10px 14px; border-radius:12px; background:#4f46e5; color:white; text-decoration:none; }
    h1,h2,h3 { margin:0 0 12px; }
    p { margin:0 0 12px; line-height:1.6; }
  </style>
</head>
<body>
${clean}
</body>
</html>`;

  return (
    <iframe
      sandbox=""
      srcDoc={doc}
      className="w-full h-[420px] rounded-2xl border border-white/10 bg-black"
      title="SafePreview"
    />
  );
}
