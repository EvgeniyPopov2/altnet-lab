// src/builder/registry.ts
export type BlockKind = "h1" | "p" | "img" | "btn";

export type Block =
  | { id: string; kind: "h1"; text: string }
  | { id: string; kind: "p"; text: string }
  | { id: string; kind: "img"; cid: string; alt?: string }
  | { id: string; kind: "btn"; label: string; href: string };

export type PageDoc = {
  title: string;
  blocks: Block[];
};

export function uid() {
  return Math.random().toString(36).slice(2, 8);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[ch] as string));
}
function escapeAttr(s: string) {
  return escapeHtml(s).replace(/\s+/g, " ").trim();
}

const CID_RE = /^[a-z0-9]+[a-z0-9\-_/]*$/i;
const HREF_OK = /^(https?:\/\/|altfs:\/\/|cid:|#|\/|mailto:)/i;

export function createBlock(kind: BlockKind): Block {
  switch (kind) {
    case "h1":  return { id: uid(), kind: "h1", text: "Заголовок" };
    case "p":   return { id: uid(), kind: "p", text: "Абзац текста" };
    case "img": return { id: uid(), kind: "img", cid: "bafy...CID", alt: "Картинка" };
    case "btn": return { id: uid(), kind: "btn", label: "Кнопка", href: "https://example.org" };
  }
}

export function validateBlock(b: Block): string[] {
  const errs: string[] = [];
  if (b.kind === "h1" || b.kind === "p") {
    if (!b.text || b.text.trim().length === 0) errs.push("Текст не задан");
    if ((b.text ?? "").length > 2000) errs.push("Слишком длинный текст");
  }
  if (b.kind === "img") {
    if (!CID_RE.test(b.cid)) errs.push("CID имеет неверный формат");
    if ((b.alt ?? "").length > 2000) errs.push("Слишком длинный alt");
  }
  if (b.kind === "btn") {
    if (!b.label) errs.push("Нет текста кнопки");
    if (!HREF_OK.test(b.href)) errs.push("Недопустимый href (разрешены: http/https, altfs://, cid:, #, /, mailto:)");
  }
  return errs;
}

export function validateDoc(doc: PageDoc): string[] {
  const errs: string[] = [];
  if (!doc.title || doc.title.trim().length === 0) errs.push("Название сайта пустое");
  if (doc.blocks.length > 200) errs.push("Слишком много блоков");
  doc.blocks.forEach((b, i) => {
    const be = validateBlock(b);
    be.forEach((e) => errs.push(`Блок #${i+1} (${b.kind}): ${e}`));
  });
  return errs;
}

export function renderBlock(b: Block): string {
  if (b.kind === "h1") return `<h2>${escapeHtml(b.text)}</h2>`;
  if (b.kind === "p")  return `<p>${escapeHtml(b.text)}</p>`;
  if (b.kind === "img") return `<img src="altfs://${escapeAttr(b.cid)}" alt="${escapeAttr(b.alt ?? "")}" />`;
  if (b.kind === "btn") return `<a class="btn" href="${escapeAttr(b.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(b.label)}</a>`;
  return "";
}

export function renderDoc(doc: PageDoc): string {
  const parts: string[] = [];
  parts.push(`<h1>${escapeHtml(doc.title)}</h1>`);
  for (const b of doc.blocks) parts.push(renderBlock(b));
  return parts.join("\n");
}

// Шаблоны
export function templateHero(): PageDoc {
  return {
    title: "AltNet — свободная сеть",
    blocks: [
      { id: uid(), kind: "h1", text: "Свобода общения. Приватность по умолчанию." },
      { id: uid(), kind: "p",  text: "Создайте свой уголок в .alt за минуты. Без рекламы и слежки." },
      { id: uid(), kind: "btn", label: "Начать", href: "#get-started" },
      { id: uid(), kind: "img", cid: "bafy-hero-illustration", alt: "Иллюстрация" },
    ],
  };
}
