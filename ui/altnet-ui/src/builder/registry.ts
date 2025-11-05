// src/builder/registry.ts
export type BlockKind = "h1" | "p" | "img" | "btn" | "row";

export type Block =
  | { id: string; kind: "h1"; text: string }
  | { id: string; kind: "p"; text: string }
  | { id: string; kind: "img"; cid: string; alt?: string }
  | { id: string; kind: "btn"; label: string; href: string }
  | { id: string; kind: "row"; cols: ColSpec[] };

export type ColSpec = {
  id: string;
  // ширины (1..12); если не указано — наследуется от меньшего брейкпоинта
  xs: number;
  sm?: number;
  md?: number;
  lg?: number;
  xl?: number;
  blocks: Block[];
};

export type PageDoc = { title: string; blocks: Block[] };

export function uid() { return Math.random().toString(36).slice(2, 8); }

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[ch] as string));
}
function escapeAttr(s: string) { return escapeHtml(s).replace(/\s+/g, " ").trim(); }

const CID_RE = /^[a-z0-9]+[a-z0-9\-_/]*$/i;
const HREF_OK = /^(https?:\/\/|altfs:\/\/|cid:|#|\/|mailto:)/i;

export function createBlock(kind: BlockKind): Block {
  switch (kind) {
    case "h1":  return { id: uid(), kind: "h1", text: "Заголовок" };
    case "p":   return { id: uid(), kind: "p", text: "Абзац текста" };
    case "img": return { id: uid(), kind: "img", cid: "bafy...CID", alt: "Картинка" };
    case "btn": return { id: uid(), kind: "btn", label: "Кнопка", href: "https://example.org" };
    case "row": return createRow(2); // дефолт 2 колонки 6/6
  }
}

// Шаблон строки на N колонок, равномерно
export function createRow(n: 1|2|3|4): Block {
  const span = Math.max(1, Math.min(12, Math.round(12 / n)));
  const cols: ColSpec[] = Array.from({ length: n }, () => ({
    id: uid(),
    xs: span,
    md: span,
    blocks: [],
  }));
  return { id: uid(), kind: "row", cols };
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
  if (b.kind === "row") {
    if (b.cols.length < 1 || b.cols.length > 4) errs.push("Количество колонок 1..4");
    const bps: (keyof ColSpec)[] = ["xs","sm","md","lg","xl"];
    for (const c of b.cols) {
      for (const bp of bps) {
        const w = (c[bp] as number|undefined);
        if (w !== undefined && (w < 1 || w > 12)) {
          errs.push(`Колонка ${c.id}: ширина ${String(bp)} вне диапазона 1..12`);
        }
      }
      // рекурсивная валидация вложенных блоков
      c.blocks.forEach((child, j) => {
        const ce = validateBlock(child);
        ce.forEach((e) => errs.push(`Колонка ${c.id} blk#${j+1}: ${e}`));
      });
    }
    // ВАЖНО: не проверяем сумму спанов по брейкпоинтам — есть flex-wrap.
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
  if (b.kind === "row") {
    const colsHtml = b.cols.map(col => {
      const classes = spanClasses(col);
      const inner = col.blocks.map(renderBlock).join("\n");
      return `<div class="col ${classes}">${inner}</div>`;
    }).join("\n");
    return `<div class="row">${colsHtml}</div>`;
  }
  return "";
}

export function renderDoc(doc: PageDoc): string {
  const parts: string[] = [];
  parts.push(`<h1>${escapeHtml(doc.title)}</h1>`);
  for (const b of doc.blocks) parts.push(renderBlock(b));
  return parts.join("\n");
}

function spanClasses(c: ColSpec): string {
  const xs = c.xs ?? 12;
  const sm = c.sm ?? xs;
  const md = c.md ?? sm;
  const lg = c.lg ?? md;
  const xl = c.xl ?? lg;
  return `c-xs-${xs} c-sm-${sm} c-md-${md} c-lg-${lg} c-xl-${xl}`;
}

// Шаблон Hero, адаптированный под сетку (кнопка + иллюстрация)
export function templateHero(): PageDoc {
  return {
    title: "AltNet — свободная сеть",
    blocks: [
      {
        id: uid(),
        kind: "row",
        cols: [
          {
            id: uid(), xs: 12, md: 7, blocks: [
              { id: uid(), kind: "h1", text: "Свобода общения. Приватность по умолчанию." },
              { id: uid(), kind: "p",  text: "Создайте свой уголок в .alt за минуты. Без рекламы и слежки." },
              { id: uid(), kind: "btn", label: "Начать", href: "#get-started" },
            ],
          },
          {
            id: uid(), xs: 12, md: 5, blocks: [
              { id: uid(), kind: "img", cid: "bafy-hero-illustration", alt: "Иллюстрация" },
            ],
          },
        ],
      },
    ],
  };
}
