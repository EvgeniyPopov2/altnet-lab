import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import SafePreview from "../components/SafePreview";
import { exportSiteZip, exportSingleHtml, downloadBlob, adaptFromSiteBuilderDoc } from "../builder/exporter";


type CheckItem = { id: string; ok: boolean; text: string };

const isHttp = (s: string) => /^https?:\/\//i.test(s || "");
const isHash = (s: string) => (s || "").trim().startsWith("#");
const notEmpty = (s?: string) => !!(s && s.trim().length > 0);

/* =========================
 * Типы документа и блоков
 * ========================= */
type BlockType = "hero" | "h1" | "p" | "img" | "btn" | "cols2";

type HeroBlock = {
  id: string;
  type: "hero";
  title: string;
  subtitle?: string;
  ctaText?: string;
  ctaLink?: string;
};

type H1Block = {
  id: string;
  type: "h1";
  text: string;
};

type PBlock = {
  id: string;
  type: "p";
  text: string;
};

type ImgBlock = {
  id: string;
  type: "img";
  cid: string; // altfs://CID или http(s)
  alt?: string;
};

type BtnBlock = {
  id: string;
  type: "btn";
  label: string;
  href: string;
  variant?: "primary" | "secondary";
};

type ColsRatio = "5-7" | "6-6" | "7-5";

type Cols2Block = {
  id: string;
  type: "cols2";
  title: string;
  text: string;
  img: string;   // CID/URL
  alt: string;
  ratio: ColsRatio;
  reverse?: boolean;
};

type Block = HeroBlock | H1Block | PBlock | ImgBlock | BtnBlock | Cols2Block;

type Doc = {
  title: string;
  description?: string; // новое поле для meta description
  ogImage?: string;
  theme?: {
    accent?: string;     // HEX или css-цвет
    container?: number;  // px
  };
  blocks: Block[];
};
const STORAGE_KEY = "altnet.sitebuilder.v1";

const DEFAULT_DOC: Doc = {
  title: "Мой сайт",
  description: "", // ← добавили meta description (по умолчанию пусто)
  ogImage: "",
  theme: { accent: "#5865F2", container: 960 },
  blocks: [
    {
      id: Math.random().toString(36).slice(2, 9),
      type: "hero",
      title: "Заголовок героя",
      subtitle: "Короткий подзаголовок",
      ctaText: "Подробнее",
      ctaLink: "#",
    },
  ],
};

function validateDoc(doc: Doc): CheckItem[] {
  const checks: CheckItem[] = [];
  const titleOk = notEmpty(doc.title) && doc.title.trim().length >= 3;
  checks.push({ id: "title", ok: titleOk, text: titleOk ? "Заголовок задан." : "Добавьте заголовок сайта (≥ 3 символов)." });

  const desc = (doc as any).description || ""; // если поля нет — считаем пустым
  const descOk = !desc ? false : desc.trim().length >= 50 && desc.trim().length <= 160;
  checks.push({
    id: "desc",
    ok: descOk,
    text: descOk ? "Описание 50–160 символов." : "Заполните «Описание сайта» (желательно 50–160 символов).",
  });

  const hasHero = doc.blocks.some(b => b.type === "hero");
  checks.push({ id: "hero", ok: hasHero, text: hasHero ? "Есть блок Hero." : "Добавьте блок Hero." });

  const hero = doc.blocks.find(b => b.type === "hero") as HeroBlock | undefined;
  const ctaOk = !!hero && notEmpty(hero.ctaText) && notEmpty(hero.ctaLink);
  checks.push({
    id: "hero-cta",
    ok: ctaOk,
    text: ctaOk ? "CTA в Hero заполнен." : "В Hero заполните «Текст кнопки» и «Ссылка».",
  });

  // alt у всех картинок
  const imgBlocks = doc.blocks.filter(b => b.type === "img") as ImgBlock[];
  const allImgAlt = imgBlocks.every(b => notEmpty(b.alt));
  checks.push({
    id: "img-alt",
    ok: allImgAlt || imgBlocks.length === 0,
    text: imgBlocks.length === 0 ? "Картинок нет — ок." : (allImgAlt ? "У всех изображений заполнен alt." : "Добавьте alt ко всем изображениям."),
  });

  // кнопки: href валиден/не пуст
  const btnBlocks = doc.blocks.filter(b => b.type === "btn") as BtnBlock[];
  const allBtnHrefOk = btnBlocks.every(b => notEmpty(b.href) && (isHttp(b.href) || isHash(b.href) || b.href.startsWith("/")));
  checks.push({
    id: "btn-href",
    ok: allBtnHrefOk || btnBlocks.length === 0,
    text: btnBlocks.length === 0 ? "Кнопок нет — ок." : (allBtnHrefOk ? "Ссылки у кнопок валидны." : "Проверьте ссылки у кнопок (http(s), /путь или #якорь)."),
  });

  // OG-картинка (хотя бы одна картинка в документе для красивых превью)
  const hasAnyImage = imgBlocks.length > 0;
  checks.push({
    id: "og",
    ok: hasAnyImage,
    text: hasAnyImage ? "Есть изображение для превью (OG)." : "Добавьте хотя бы одну «Картинку» — пригодится для превью в соцсетях.",
  });

  
  return checks;
}

function loadFromStorage(): Doc | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.blocks)) return null;
    return parsed as Doc;
  } catch {
    return null;
  }
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// Делаем "человечное" имя файла и оставляем кириллицу
function prettyFileName(title: string, ext: string) {
  const base = (title || "site")
    .normalize("NFC")
    .replace(/[\\/:*?"<>|]+/g, " ") // запрещённые в Windows символы
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60); // не длиннее ~60 символов, чтобы не было проблем
  return (base || "site") + "." + ext;
}

/* =========================
 * Рендер HTML для предпросмотра
 * ========================= */
function renderDocToHTML(doc: Doc): string {
  // Базовый CSS для предпросмотра (привязан к var(--accent))
  const PREVIEW_CSS = `
:root{--accent:#5865F2}
body{background:#0b0f1a;color:#e6e9f4;font:16px/1.6 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial}
.container{max-width:960px;margin:0 auto;padding:24px}
.section{padding:32px 0;border-bottom:1px solid rgba(255,255,255,0.06)}
h1{font-size:40px;line-height:1.2;margin:0 0 16px}
p{margin:8px 0}
.muted{color:#9aa3b2}
.hero{text-align:center}
.btn{display:inline-block;padding:10px 16px;border-radius:10px;background:var(--accent);color:#fff;font-weight:600}
.btn:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.btn.secondary{background:#2a2e45}
img.responsive{max-width:100%;height:auto;border-radius:12px}

/* Сетка для cols2 */
.row{display:flex;flex-wrap:wrap;margin-left:-8px;margin-right:-8px}
.row.row-reverse{flex-direction:row-reverse}
.col{padding-left:8px;padding-right:8px;margin-bottom:16px}
.c-xs-12{width:100%}
@media (min-width:640px){
  .c-md-5{width:41.6667%}
  .c-md-6{width:50%}
  .c-md-7{width:58.3333%}
  /* reverse работает и на мобильном (stack) */
  .row.reverse .left{order:2}
  .row.reverse .right{order:1}
}
`.trim();
  const accent = (doc as any)?.theme?.accent?.trim() || "#5865F2";
  const container = Number((doc as any)?.theme?.container) || 960;
  // ВАЖНО: !important — чтобы перебить дефолт 960px из PREVIEW_CSS
  const themeStyle = `<style id="altnet-theme">:root{--accent:${accent}} .container{max-width:${container}px !important}</style>`;
  const blocks = doc.blocks
    .map((b) => {
      switch (b.type) {
        case "hero":
          return `
<section class="container" style="padding:64px 24px; text-align:center;">
  <h1 style="font-size:40px; line-height:1.1; margin:0 0 12px;">${escapeHtml(b.title || "")}</h1>
  <p style="font-size:18px; color:#9aa3b2; margin:0 0 20px;">${escapeHtml(b.subtitle || "")}</p>
  ${
    b.ctaText
      ? `<div class="mt-16"><a class="btn" href="${escapeAttr(b.ctaLink || "#")}" rel="noopener noreferrer nofollow">${escapeHtml(
          b.ctaText
        )}</a>`
      : ""
  }
</section>`.trim();
        case "h1":
          return `<h1 style="font-size:32px; line-height:1.2; margin:24px 0;">${escapeHtml(b.text)}</h1>`;
        case "p":
          return `<p style="font-size:16px; color:#c7cfdd; margin:12px 0;">${escapeHtml(b.text)}</p>`;
        case "img":
          return `<img src="${escapeAttr(b.cid)}" alt="${escapeAttr(b.alt || "")}" style="max-width:100%; border-radius:12px; margin:12px 0;" />`;
        case "cols2": {
          const ratio = String((b as any).ratio || "6-6").split("-");
          const l = ratio[0] || "6";
          const r = ratio[1] || "6";
          const isRev = Boolean((b as any).reverse);

          const left = `
<div class="col left c-xs-12 c-md-${l}">
  <h2>${escapeHtml((b as any).title || "")}</h2>
  <p>${escapeHtml((b as any).text || "")}</p>
</div>`.trim();

          const right = `
<div class="col right c-xs-12 c-md-${r}">
  <img class="responsive" src="${escapeAttr((b as any).img || "")}" alt="${escapeAttr((b as any).alt || "")}"/>
</div>`.trim();

          // Всегда left+right, порядок управляем классом .row.reverse (см. PREVIEW_CSS)
          return `<section class="section"><div class="row${isRev ? " reverse" : ""}">${left}${right}</div></section>`;
        }

        case "btn":
          return `<a class="btn${b.variant === "secondary" ? " secondary" : ""}" href="${escapeAttr(b.href)}" rel="noopener noreferrer nofollow">${escapeHtml(
            b.label
          )}</a>`;
      }
    })
    .join("\n");

  const siteTitle = doc.title
    ? `<header class="container">
         <h1 style="font-size:28px; line-height:1.2; margin:16px 0 12px; opacity:.85;">${escapeHtml(doc.title)}</h1>
       </header>`
    : "";

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(doc.title || "Сайт")}</title>
<style id="altnet-preview-css">${PREVIEW_CSS}</style>
${themeStyle}
</head>
<body style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background:#0b0f1a; color:#e6e9f4; padding:24px;">
  ${siteTitle}
  <main class="container">
    ${blocks}
  </main>
</body></html>`;
}



function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function escapeAttr(s?: string) {
  return (s || "").replaceAll('"', "&quot;");
}

/* =========================
 * Карточка блока (DnD только за «ручку»)
 * ========================= */
type BlockCardProps = {
  block: Block;
  index: number;
  onChange(patch: Partial<Block>): void;
  onRemove(): void;
  onDragStartByHandle(e: React.DragEvent, id: string): void;
  onDragOverCard(e: React.DragEvent, id: string): void;
  onDropOnCard(e: React.DragEvent, id: string): void;
  onDuplicate(): void;
  onMoveUp(id: string): void;
  onMoveDown(id: string): void;
};

const BlockCard = React.memo(function BlockCard(props: BlockCardProps) {
  const { block: b, index, onChange, onRemove, onDuplicate, onDragStartByHandle, onDragOverCard, onDropOnCard, onMoveUp, onMoveDown } =
    props;

  const stopAll = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);
  const preventDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div
      className="rounded-2xl bg-[#0f111a] border border-[#1c2030] p-4 mb-3 select-text"
      onDragOver={(e) => onDragOverCard(e, b.id)}
      onDrop={(e) => onDropOnCard(e, b.id)}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs tracking-wider uppercase text-[#9aa3b2]">
          {index + 1}. {labelOf(b.type)}
        </div>
        <div className="flex items-center gap-2">
          <button
            title="Перетащи для сортировки"
            className="px-2 py-1 rounded-md bg-[#111427] border border-[#1f2751] text-[#b8c1ff] cursor-grab active:cursor-grabbing"
            draggable
            onDragStart={(e) => onDragStartByHandle(e, b.id)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            ≡
          </button>
           
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="px-2 py-1 rounded-md bg-[#1a1d2e] border border-[#2a2f45] text-[#b8ffc1] hover:bg-[#1a2e1f]"
            title="Создать копию блока ниже"
          >
            Дублировать
          </button> 

          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="px-2 py-1 rounded-md bg-[#1a1d2e] border border-[#2a2f45] text-[#ffb3a8] hover:bg-[#221f2e]"
          >
            Удалить
          </button>
          
          <button
            title="Переместить вверх"
            className="px-2 py-1 rounded-md bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]"
            onClick={(e) => { e.stopPropagation(); onMoveUp(b.id); }}
            aria-label="Переместить блок вверх"
          >
            ↑
          </button>

          <button
            title="Переместить вниз"
            className="px-2 py-1 rounded-md bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]"
            onClick={(e) => { e.stopPropagation(); onMoveDown(b.id); }}
            aria-label="Переместить блок вниз"
          >
            ↓
          </button>

        </div>
      </div>

      {/* Редакторы блоков, инпуты защищены от всплытия/drag */}
      {b.type === "hero" && (
        <div className="grid gap-3">
          <Field label="Заголовок">
            <input
              className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
              value={b.title}
              onChange={(e) => onChange({ title: e.target.value } as Partial<Block>)}
              onMouseDownCapture={stopAll}
              onKeyDownCapture={stopAll}
              onClickCapture={stopAll}
              onDragStart={preventDrag}
              draggable={false}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label="Подзаголовок">
            <textarea
              className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#cfd5e6] min-h-[72px] resize-vertical"
              value={b.subtitle || ""}
              onChange={(e) => onChange({ subtitle: e.target.value } as Partial<Block>)}
              onMouseDownCapture={stopAll}
              onKeyDownCapture={stopAll}
              onClickCapture={stopAll}
              onDragStart={preventDrag}
              draggable={false}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Текст кнопки">
              <input
                className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={b.ctaText || ""}
                onChange={(e) => onChange({ ctaText: e.target.value } as Partial<Block>)}
                onMouseDownCapture={stopAll}
                onKeyDownCapture={stopAll}
                onClickCapture={stopAll}
                onDragStart={preventDrag}
                draggable={false}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            {(() => {
              const link = b.ctaLink || "";
              const ok = isSafeLink(link);
              return (
                <Field label="Ссылка">
                  <input
                    className={`w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border outline-none text-[#e6e9f4] ${ok ? "border-[#1f2751] focus:border-[#2a3a8f]" : "border-[#ff6b6b] focus:border-[#ff6b6b]"
                      }`}
                    value={link}
                    onChange={(e) => onChange({ ctaLink: e.target.value } as Partial<Block>)}
                    onMouseDownCapture={stopAll}
                    onKeyDownCapture={stopAll}
                    onClickCapture={stopAll}
                    onDragStart={preventDrag}
                    draggable={false}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {!ok && (
                    <div className="text-xs text-[#ff9b9b] mt-1">
                      Разрешено: #якорь, /путь, ./относительный, http(s)://, altfs://, ipfs://
                    </div>
                  )}
                </Field>
              );
            })()}
          </div>
        </div>
      )}

      {b.type === "h1" && (
        <Field label="Текст заголовка">
          <input
            className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
            value={b.text}
            onChange={(e) => onChange({ text: e.target.value } as Partial<Block>)}
            onMouseDownCapture={stopAll}
            onKeyDownCapture={stopAll}
            onClickCapture={stopAll}
            onDragStart={preventDrag}
            draggable={false}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
      )}

      {b.type === "p" && (
        <Field label="Параграф">
          <textarea
            className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#cfd5e6] min-h-[72px] resize-vertical"
            value={b.text}
            onChange={(e) => onChange({ text: e.target.value } as Partial<Block>)}
            onMouseDownCapture={stopAll}
            onKeyDownCapture={stopAll}
            onClickCapture={stopAll}
            onDragStart={preventDrag}
            draggable={false}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
      )}

      {b.type === "img" && (
        <div className="grid gap-3">
          {(() => {
            const src = b.cid || "";
            const ok = isSafeImageSrc(src);
            return (
              <Field label="CID / URL">
                <input
                  className={`w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border outline-none text-[#e6e9f4] ${ok ? "border-[#1f2751] focus:border-[#2a3a8f]" : "border-[#ff6b6b] focus:border-[#ff6b6b]"
                    }`}
                  value={src}
                  onChange={(e) => onChange({ cid: e.target.value } as Partial<Block>)}
                  onMouseDownCapture={stopAll}
                  onKeyDownCapture={stopAll}
                  onClickCapture={stopAll}
                  onDragStart={preventDrag}
                  draggable={false}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="altfs://<CID> или https://..."
                />
                {!ok && (
                  <div className="text-xs text-[#ff9b9b] mt-1">
                    Разрешено: data:image/*, http(s)://, altfs://, ipfs://
                  </div>
                )}
              </Field>
            );
          })()}
          <Field label="Описание (alt)">
            <input
              className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
              value={b.alt || ""}
              onChange={(e) => onChange({ alt: e.target.value } as Partial<Block>)}
              onMouseDownCapture={stopAll}
              onKeyDownCapture={stopAll}
              onClickCapture={stopAll}
              onDragStart={preventDrag}
              draggable={false}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        </div>
      )}

      {b.type === "cols2" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Заголовок">
            <input
              className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
              value={(b as any).title || ""}
              onChange={(e) => onChange({ title: e.target.value } as any)}
            />
          </Field>

          <Field label="Доля колонок">
            <select
              className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
              value={(b as any).ratio || "6-6"}
              onChange={(e) => onChange({ ratio: e.target.value } as any)}
            >
              <option value="5-7">5-7</option>
              <option value="6-6">6-6</option>
              <option value="7-5">7-5</option>
            </select>
          </Field>

          <Field label="Текст">
            <textarea
              className="w-full px-3 py-2 h-24 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
              value={(b as any).text || ""}
              onChange={(e) => onChange({ text: e.target.value } as any)}
            />
          </Field>

          <Field label="Картинка (CID/URL)">
            <input
              className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
              value={(b as any).img || ""}
              onChange={(e) => onChange({ img: e.target.value } as any)}
            />
          </Field>

          <Field label="Alt">
            <input
              className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
              value={(b as any).alt || ""}
              onChange={(e) => onChange({ alt: e.target.value } as any)}
            />
          </Field>

          <Field label="Поменять местами">
            <label className="inline-flex items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={Boolean((b as any).reverse)}
                onChange={(e) => onChange({ reverse: e.target.checked } as any)}
              />
              <span>Картинка слева, текст справа</span>
            </label>
          </Field>
        </div>
      )}

      {b.type === "btn" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Текст кнопки">
            <input
              className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
              value={b.label}
              onChange={(e) => onChange({ label: e.target.value } as Partial<Block>)}
              onMouseDownCapture={stopAll}
              onKeyDownCapture={stopAll}
              onClickCapture={stopAll}
              onDragStart={preventDrag}
              draggable={false}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          {(() => {
            const link = b.href || "";
            const ok = isSafeLink(link);
            return (
              <Field label="Ссылка">
                <Field label="Вариант">
                  <select
                    className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                    value={(b as any).variant || "primary"}
                    onChange={(e) => onChange({ variant: e.target.value } as any)}
                    onMouseDownCapture={stopAll}
                    onKeyDownCapture={stopAll}
                    onClickCapture={stopAll}
                  >
                    <option value="primary">Основная</option>
                    <option value="secondary">Вторичная</option>
                  </select>
                </Field>

                <input
                  className={`w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border outline-none text-[#e6e9f4] ${ok ? "border-[#1f2751] focus:border-[#2a3a8f]" : "border-[#ff6b6b] focus:border-[#ff6b6b]"
                    }`}
                  value={link}
                  onChange={(e) => onChange({ href: e.target.value } as Partial<Block>)}
                  onMouseDownCapture={stopAll}
                  onKeyDownCapture={stopAll}
                  onClickCapture={stopAll}
                  onDragStart={preventDrag}
                  draggable={false}
                  autoComplete="off"
                  spellCheck={false}
                />
                {!ok && (
                  <div className="text-xs text-[#ff9b9b] mt-1">
                    Разрешено: #якорь, /путь, ./относительный, http(s)://, altfs://, ipfs://
                  </div>
                )}
              </Field>
            );
          })()}
        </div>
      )}
    </div>
  );
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs text-[#9aa3b2]">{label}</span>
      {children}
    </label>
  );
}

function labelOf(t: BlockType) {
  switch (t) {
    case "hero":
      return "герой";
    case "h1":
      return "заголовок";
    case "p":
      return "текст";
    case "img":
      return "картинка";
    case "btn":
      return "кнопка";
    case "cols2":
      return "две колонки";  
  }
}

// ── Валидация URL'ов для полей
function isSafeLink(href?: string): boolean {
  const s = (href || "").trim();
  if (!s) return true;                 // пустое не ругаем в редакторе
  if (s.startsWith("#")) return true;  // якорь
  if (s.startsWith("/")) return true;  // абсолютный относительный путь
  if (/^(\.\/|\.\.\/)/.test(s)) return true; // относительный путь
  if (/^https?:\/\//i.test(s)) return true;  // внешние http/https
  if (/^(altfs:|ipfs:)/i.test(s)) return true;
  return false;
}

function isSafeImageSrc(src?: string): boolean {
  const s = (src || "").trim();
  if (!s) return false;                       // для картинки пустое — не ок
  if (/^data:image\//i.test(s)) return true;  // data: для изображений
  if (/^https?:\/\//i.test(s)) return true;
  if (/^(altfs:|ipfs:)/i.test(s)) return true;
  return false;
}

/* =========================
 * Основной экран
 * ========================= */
export default function SiteBuilder() {
  const [doc, setDoc] = useState<Doc>(() => loadFromStorage() ?? DEFAULT_DOC);
  const html = useMemo(() => renderDocToHTML(doc), [doc]);
  const checks = useMemo(() => validateDoc(doc), [doc]);
  const okCount = useMemo(() => checks.filter(c => c.ok).length, [checks]);
  const [showChecklist, setShowChecklist] = useState(false);
  // Валидатор для поля "OG-картинка"
  const isValidOgImage = (s: string) => {
    if (!s) return true; // пустое — не ошибка
    const v = s.trim().toLowerCase();
    return (
      v.startsWith("https://") ||
      v.startsWith("http://") ||
      v.startsWith("altfs://") ||
      v.startsWith("ipfs://") ||
      v.startsWith("data:image/")
    );
  };

  // Автосохранение в localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    } catch {}
  }, [doc]);

  // DnD состояние
  const dragFromId = useRef<string | null>(null);

  const onDragStartByHandle = useCallback((e: React.DragEvent, id: string) => {
    dragFromId.current = id;
    e.dataTransfer.effectAllowed = "move";
    e.stopPropagation();
  }, []);

  const onDragOverCard = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const onDropOnCard = useCallback((e: React.DragEvent, toId: string) => {
    e.preventDefault();
    const fromId = dragFromId.current;
    dragFromId.current = null;
    if (!fromId || fromId === toId) return;

    setDoc((prev) => {
      const arr = [...prev.blocks];
      const from = arr.findIndex((x) => x.id === fromId);
      const to = arr.findIndex((x) => x.id === toId);
      if (from < 0 || to < 0) return prev;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return { ...prev, blocks: arr };
    });
  }, []);

  const addBlock = useCallback((type: BlockType) => {
    const block: Block =
      type === "hero"
        ? { id: uid(), type: "hero", title: "Новый раздел", subtitle: "", ctaText: "", ctaLink: "" }
        : type === "h1"
          ? { id: uid(), type: "h1", text: "Заголовок" }
          : type === "p"
            ? { id: uid(), type: "p", text: "Параграф текста…" }
            : type === "img"
              ? { id: uid(), type: "img", cid: "", alt: "" }
              : type === "cols2"
                ? { id: uid(), type: "cols2", title: "Заголовок", text: "Текст…", img: "", alt: "", ratio: "6-6", reverse: false }
                : { id: uid(), type: "btn", label: "Кнопка", href: "#" };

    setDoc((d) => ({ ...d, blocks: [...d.blocks, block] }));
  }, []);

  const updateBlock = useCallback((id: string, patch: Partial<Block>) => {
    setDoc((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)),
    }));
  }, []);

  const removeBlock = useCallback((id: string) => {
    setDoc((prev) => ({ ...prev, blocks: prev.blocks.filter((b) => b.id !== id) }));
  }, []);

  const moveBlock = useCallback((id: string, dir: -1 | 1) => {
    setDoc((prev) => {
      const i = prev.blocks.findIndex((x) => x.id === id);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.blocks.length) return prev;
      const arr = [...prev.blocks];
      const [moved] = arr.splice(i, 1);
      arr.splice(j, 0, moved);
      return { ...prev, blocks: arr };
    });
  }, []);

  const moveUp = useCallback((id: string) => moveBlock(id, -1), [moveBlock]);
  const moveDown = useCallback((id: string) => moveBlock(id, 1), [moveBlock]);

  const duplicateBlock = useCallback((id: string) => {
    setDoc((prev) => {
      const arr = [...prev.blocks];
      const idx = arr.findIndex((b) => b.id === id);
      if (idx < 0) return prev;
      const copy = { ...(arr[idx] as any), id: uid() } as Block; // новый id
      arr.splice(idx + 1, 0, copy); // вставляем КОПИЮ ниже исходного
      return { ...prev, blocks: arr };
    });
  }, []);

  const onExportZip = useCallback(async () => {
    const model = adaptFromSiteBuilderDoc(doc);
    const blob = await exportSiteZip(model, { bundleAssets: true });
    const fname = prettyFileName(doc.title || "site", "zip");
    downloadBlob(blob, fname);
  }, [doc]);
  
  const onExportSingle = useCallback(async () => {
    const model = adaptFromSiteBuilderDoc(doc);
    const blob = await exportSingleHtml(model, { bundleAssets: true });
    downloadBlob(blob, prettyFileName(doc.title || "site", "html"));
  }, [doc]);

  // Импорт модели из JSON
  const importJsonInputRef = useRef<HTMLInputElement>(null);

  const onImportJsonClick = () => {
    importJsonInputRef.current?.click();
  };

  const onImportJsonChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    // сбрасываем value, чтобы повторно можно было выбрать тот же файл
    e.target.value = "";
    if (!f) return;

    try {
      const text = await f.text();
      const data = JSON.parse(text);

      // очень лёгкая валидация структуры
      if (!data || typeof data !== "object" || !Array.isArray((data as any).blocks)) {
        throw new Error("Ожидался объект с массивом blocks.");
      }

      const okTypes = new Set<BlockType>(["hero", "h1", "p", "img", "btn", "cols2"]);

      const title = typeof (data as any).title === "string" ? (data as any).title : "Мой сайт";
      const description = typeof (data as any).description === "string" ? (data as any).description : "";
      const blocksRaw: any[] = (data as any).blocks;

      const blocks: Block[] = blocksRaw
        .map((b: any) => {
          if (!b || !okTypes.has(b.type)) return null;
          const id = uid();

          // ВАЖНО: читаем поля из b.props, если они есть (экспортная модель),
          // иначе — с верхнего уровня (старый формат).
          const p = (b && typeof b.props === "object" && b.props) || b;

          switch (b.type as BlockType) {
            case "hero":
              return {
                id,
                type: "hero",
                title: String(p.title ?? ""),
                subtitle: String(p.subtitle ?? ""),
                // ctaText | ctaLabel
                ctaText: String(p.ctaText ?? p.ctaLabel ?? ""),
                // ctaLink | ctaHref
                ctaLink: String(p.ctaLink ?? p.ctaHref ?? "#"),
              } as HeroBlock;

            case "h1":
              return {
                id,
                type: "h1",
                // допускаем импорт, где заголовок лежит в title/text
                text: String(p.text ?? p.title ?? ""),
              } as H1Block;

            case "p":
              return {
                id,
                type: "p",
                text: String(p.text ?? ""),
              } as PBlock;

            case "img":
              return {
                id,
                type: "img",
                // cid | src
                cid: String(p.cid ?? p.src ?? ""),
                alt: String(p.alt ?? ""),
              } as ImgBlock;

            case "btn":
              return {
                id,
                type: "btn",
                // label | text
                label: String(p.label ?? p.text ?? "Кнопка"),
                // href | url
                href: String(p.href ?? p.url ?? "#"),
              } as BtnBlock;

            case "cols2":
              return {
                id,
                type: "cols2",
                title: String(b.title ?? ""),
                text: String(b.text ?? ""),
                img: String(b.img ?? ""),
                alt: String(b.alt ?? ""),
                ratio: (["5-7", "6-6", "7-5"].includes(b.ratio) ? b.ratio : "6-6") as ColsRatio,
                reverse: Boolean(b.reverse),
              } as Cols2Block;

          }
        })
        .filter(Boolean) as Block[];

      if (!blocks.length) throw new Error("В файле нет валидных блоков.");

      if (!confirm("Импортировать JSON и заменить текущий документ?")) return;
      setDoc({ title, description, blocks });
    } catch (err: any) {
      alert("Не удалось импортировать JSON: " + (err?.message || String(err)));
    }
  };

  const onExportJson = useCallback(() => {
    const model = adaptFromSiteBuilderDoc(doc);
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: "application/json" });
    const fname = prettyFileName(doc.title || "site", "json");
    downloadBlob(blob, fname);
  }, [doc]); 

  const resetDoc = useCallback(() => {
    setDoc(DEFAULT_DOC);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const handlePreviewClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement | null;
    const link = el?.closest?.("a") as HTMLAnchorElement | null;
    if (!link) return;

    const isNewTab = e.ctrlKey || e.metaKey || e.button === 1;
    if (isNewTab && link.href) {
      window.open(link.href, "_blank", "noopener,noreferrer");
    }
    e.preventDefault();
    e.stopPropagation();
  }, []);


  // Зум предпросмотра (горизонтальный скролл обеспечим «холстом»)
  const [zoom, setZoom] = useState(1);
  const decZoom = () => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)));
  const incZoom = () => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)));
  const resetZoom = () => setZoom(1);

  const CONTENT_WIDTH = Math.max(640, Number(doc?.theme?.container) || 960); // ширина макета предпросмотра

  return (
    <div className="h-full grid grid-cols-1 md:grid-cols-[380px_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)] gap-4">
      {/* Левая панель */}
      <div className="md:col-[1] h-full overflow-y-auto border-r border-[#1c2030] bg-[#0b0e18] p-4">
        <div className="mb-4">
          <Field label="Название сайта">
            <input
              className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
              value={doc.title}
              onChange={(e) => setDoc((d) => ({ ...d, title: e.target.value }))}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        </div>

        <div className="mb-4">
          {(() => {
            const desc = doc.description || "";
            const max = 160;
            const left = max - desc.length;
            const tooLong = left < 0;
            return (
              <Field label="Описание сайта (meta description, до 160 символов)">
                <textarea
                  className={`w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border outline-none text-[#cfd5e6] min-h-[72px] resize-vertical ${tooLong ? "border-[#ff6b6b] focus:border-[#ff6b6b]" : "border-[#1f2751] focus:border-[#2a3a8f]"
                    }`}
                  value={desc}
                  onChange={(e) => setDoc((d) => ({ ...d, description: e.target.value }))}
                  autoComplete="off"
                  spellCheck={false}
                />
                <div className="text-xs mt-1" style={{ color: tooLong ? "#ff9b9b" : "#9aa3b2" }}>
                  Осталось {Math.max(0, left)} символов{tooLong ? " (лишнее не попадёт в сниппеты)" : ""}
                </div>
              </Field>
            );
          })()}
        </div>

        <div className="mb-4">
          <div className="mb-2 text-sm text-[#9aa3b2]">Настройки темы</div>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">
              <span className="text-xs text-[#9aa3b2]">Акцентный цвет</span>
              <input
                type="text"
                className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={doc.theme?.accent || ""}
                onChange={(e) =>
                  setDoc((d) => ({
                    ...d,
                    theme: { ...(d.theme || {}), accent: e.target.value.trim() },
                  }))
                }
                placeholder="#5865F2"
                spellCheck={false}
                autoComplete="off"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-[#9aa3b2]">Ширина контейнера, px</span>
              <input
                type="number"
                min={640}
                max={1920}
                step={10}
                className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={String(doc.theme?.container ?? 960)}
                onChange={(e) =>
                  setDoc((d) => ({
                    ...d,
                    theme: {
                      ...(d.theme || {}),
                      container: Math.max(640, Math.min(1920, parseInt(e.target.value || "960", 10))),
                    },
                  }))
                }
              />
            </label>
          </div>
        </div>

        <div className="mb-4">
          <Field label="OG-картинка (CID/URL)">
            <input
              className={
                "w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border outline-none " +
                (isValidOgImage(doc.ogImage || "")
                  ? "border-[#1f2751] text-[#e6e9f4]"
                  : "border-red-500 text-red-300")
              }
              value={doc.ogImage || ""}
              onChange={(e) => setDoc(d => ({ ...d, ogImage: e.target.value }))}
              placeholder="altfs://CID или https://… или data:image/…"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          {!isValidOgImage(doc.ogImage || "") && (
            <div className="mt-1 text-xs text-red-400">
              Разрешены: https://, http://, altfs://, ipfs:// или data:image/…
            </div>
          )}
        </div>

        {/* Кнопки действий */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]"
            onClick={onExportZip}
            title="Скачать ZIP (index.html + styles.css + manifest.json)"
          >
            ⬇️ Экспорт статического сайта (ZIP)
          </button>
          
          <button
            className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#93e5ab] hover:bg-[#1f2336]"
            onClick={onExportSingle}
            title="Скачать один HTML-файл (всё внутри, без JS)"
          >
            📄 Экспорт одним файлом (HTML)
          </button>

          <button
            className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#93e5ab] hover:bg-[#1f2336]"
            onClick={() => setShowChecklist(v => !v)}
            title="Проверки качества"
          >
            ✅ Проверки ({okCount}/{checks.length})
          </button>

          <button
            className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]"
            onClick={onImportJsonClick}
            title="Загрузить *.json с моделью сайта"
          >
            ⬆️ Импорт модели (JSON)
          </button>

          <input
            ref={importJsonInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={onImportJsonChange}
          /> 

          <button
            className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]"
            onClick={onExportJson}
            title="Скачать модель сайта (JSON)"
          >
            🧾 Скачать JSON
          </button>

          <button
            className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#ffb3a8] hover:bg-[#241a24]"
            onClick={resetDoc}
            title="Сбросить документ к заводским значениям"
          >
            ↩️ Сбросить
          </button>
        </div>

        {showChecklist && (
          <div className="mb-4 rounded-xl border border-[#2a2f45] bg-[#0c0f1a] p-3">
            <div className="text-sm mb-2 text-[#9aa3b2]">Проверки качества</div>
            <ul className="space-y-1 text-sm">
              {checks.map(it => (
                <li key={it.id} className="flex items-start gap-2">
                  <span className={it.ok ? "text-green-400" : "text-red-400"}>{it.ok ? "✔" : "✖"}</span>
                  <span className={it.ok ? "text-[#9aa3b2]" : "text-[#ffb3a8]"}>{it.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-3 text-sm text-[#9aa3b2]">Палитра</div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]" onClick={() => addBlock("hero")}>+ Hero</button>
          <button className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]" onClick={() => addBlock("h1")}>+ Заголовок</button>
          <button className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]" onClick={() => addBlock("p")}>+ Текст</button>
          <button className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]" onClick={() => addBlock("img")}>+ Картинка</button>
          <button className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]" onClick={() => addBlock("btn")}>+ Кнопка</button>
          <button
            className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]"
            onClick={() => addBlock("cols2")}
>
  + Две колонки
</button>
        </div>

        {/* Список блоков */}
        <div>
          {doc.blocks.map((b, i) => (
            <BlockCard
              key={b.id}
              block={b}
              index={i}
              onChange={(patch) => updateBlock(b.id, patch)}
              onRemove={() => removeBlock(b.id)}
              onDuplicate={() => duplicateBlock(b.id)}    // ← ДОБАВЛЕНО
              onDragStartByHandle={onDragStartByHandle}
              onDragOverCard={(e) => onDragOverCard(e)}   // предотвращаем default
              onDropOnCard={onDropOnCard}
              onMoveUp={moveUp}
              onMoveDown={moveDown}
            />
          ))}
        </div>
      </div>

      {/* Предпросмотр */}
      <div
        className="md:col-[2] rounded-2xl p-4 bg-[#0f111a] border border-[#1c2030]"
        onClick={handlePreviewClick}
        style={{ minHeight: "calc(100vh - 96px)" }}
      >
        {/* Панель зума */}
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-[#9aa3b2]">
            Предпросмотр
            <button
              className={`ml-2 px-2 py-0.5 rounded-md border ${okCount === checks.length ? "bg-[#0e2e1f] border-[#14532d] text-[#a7f3d0]" : "bg-[#2a1212] border-[#7f1d1d] text-[#fecaca]"}`}
              onClick={() => setShowChecklist(v => !v)}
              title="Открыть проверки качества"
            >
              {okCount}/{checks.length}
            </button>
          </div>
          <div className="flex items-center gap-2"></div>
        
          <div className="flex items-center gap-2">
            <button className="px-2 py-1 rounded bg-[#1a1d2e] border border-[#2a2f45]" onClick={decZoom}>−</button>
            <button className="px-2 py-1 rounded bg-[#1a1d2e] border border-[#2a2f45]" onClick={resetZoom}>{Math.round(zoom * 100)}%</button>
            <button className="px-2 py-1 rounded bg-[#1a1d2e] border border-[#2a2f45]" onClick={incZoom}>+</button>
          </div>
        </div>

        {/* Скроллируемый холст: даёт H/V скролл при зуме.
            Важное: высота = 100% панели; iframe внутри SafePreview тоже 100% высоты. */}
        <div className="w-full h-[calc(100%-44px)] overflow-auto rounded-xl bg-[#0b0f1a] border border-[#1c2030]">
          {/* «Холст» шириной 960*zoom создаёт горизонтальный скролл */}
          <div
            className="relative"
            style={{ width: `${CONTENT_WIDTH * zoom}px`, height: "100%" }}
          >
            {/* Масштабируем содержимое от левого верхнего края */}
            <div
              className="absolute top-0 left-0"
              style={{
                width: `${CONTENT_WIDTH}px`,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
                height: "100%",
              }}
            >
              <SafePreview html={html} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
