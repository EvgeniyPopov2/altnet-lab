import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { exportSiteZip, exportSingleHtml, downloadBlob, adaptFromSiteBuilderDoc } from "../builder/exporter";


type CheckItem = { id: string; ok: boolean; text: string };

const isHttp = (s: string) => /^https?:\/\//i.test(s || "");
const isHash = (s: string) => (s || "").trim().startsWith("#");
const notEmpty = (s?: string) => !!(s && s.trim().length > 0);

/* =========================
 * Типы документа и блоков
 * ========================= */
type BlockType = "hero" | "h1" | "heading" | "p" | "img" | "btn" | "cols2" | "spacer" | "divider" | "section";


type HeroBlock = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  type: "hero";
  title: string;
  subtitle?: string;
  ctaText?: string;
  ctaLink?: string;
};

type H1Block = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  align?: "left" | "center" | "right";
  type: "h1";
  text: string;
};

type PBlock = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  align?: "left" | "center" | "right";
  type: "p";
  text: string;
};

type ImgBlock = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  type: "img";
  cid: string; // altfs://CID или http(s)
  alt?: string;
};

type BtnBlock = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  type: "btn";
  label: string;
  href: string;
  variant?: "primary" | "secondary";
  align?: "left" | "center" | "right";
};

type ColsRatio = "5-7" | "6-6" | "7-5";

type Cols2Block = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  type: "cols2";
  title: string;
  text: string;
  img: string;   // CID/URL
  alt: string;
  ratio: ColsRatio;
  reverse?: boolean;
};

type SpacerBlock = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  type: "spacer";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
};

type DividerBlock = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  type: "divider";
};


type HeadingBlock = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  type: "heading";
  text: string;
  level?: "h2" | "h3" | "h4";
  align?: "left" | "center" | "right";
};

type SectionBlock = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  type: "section";
  title?: string;
  text?: string;
  align?: "left" | "center" | "right";
  theme?: "auto" | "light" | "dark";
  pad?: "sm" | "md" | "lg";
  bg?: "none" | "subtle" | "card" | "accent";
};

type Block = HeroBlock | H1Block | HeadingBlock | PBlock | ImgBlock | BtnBlock | Cols2Block | SpacerBlock | DividerBlock | SectionBlock;

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
  const isLocked = Boolean((b as any).locked);
  const stopAll = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);
  const preventDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div
      className={`rounded-2xl bg-[#0f111a] border border-[#1c2030] p-4 mb-3 select-text ${(b as any).hidden ? "opacity-50" : ""}`}
      onDragOver={(e) => onDragOverCard(e, b.id)}
      onDrop={(e) => onDropOnCard(e, b.id)}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs tracking-wider uppercase text-[#9aa3b2]">
          {index + 1}. {labelOf(b.type)}
        </div>
        <div className="flex items-center gap-2">
          {/* Хэндл перетаскивания: выключен при замке */}
          <button
            title={isLocked ? "Блок заблокирован" : "Перетащи для сортировки"}
            className={`px-2 py-1 rounded-md bg-[#111427] border border-[#1f2751] ${isLocked ? "opacity-40 cursor-not-allowed" : "text-[#b8c1ff]"}`}
            draggable={!isLocked}
            onDragStart={(e) => {
              if (isLocked) { e.preventDefault(); e.stopPropagation(); return; }
              onDragStartByHandle(e, b.id);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={isLocked}
            aria-disabled={isLocked}
          >
            ≡
          </button>

          {/* Дублировать — запрещено при замке */}
          <button
            onClick={(e) => { e.stopPropagation(); if (!isLocked) onDuplicate(); }}
            className={`px-2 py-1 rounded-md bg-[#1a1d2e] border border-[#2a2f45] ${isLocked ? "opacity-40 cursor-not-allowed" : "text-[#b8ffc1] hover:bg-[#1a2e1f]"}`}
            title={isLocked ? "Разблокируйте, чтобы дублировать" : "Создать копию блока ниже"}
            disabled={isLocked}
          >
            Дублировать
          </button>

          {/* Скрыть/показать — можно всегда */}
          <button
            onClick={(e) => { e.stopPropagation(); onChange({ hidden: !(b as any).hidden } as any); }}
            className="px-2 py-1 rounded-md bg-[#1a1d2e] border border-[#2a2f45] text-[#9aa3b2] hover:bg-[#1f2336]"
            title={(b as any).hidden ? "Показать блок" : "Скрыть блок"}
            aria-label="Скрыть/показать блок"
          >
            {(b as any).hidden ? "👁‍🗨 Показать" : "👁 Скрыть"}
          </button>

          {/* Замок — можно всегда (переключатель) */}
          <button
            onClick={(e) => { e.stopPropagation(); onChange({ locked: !isLocked } as any); }}
            className={`px-2 py-1 rounded-md bg-[#1a1d2e] border border-[#2a2f45] ${isLocked ? "text-[#a7f3d0]" : "text-[#b8c1ff]"} hover:bg-[#1f2336]`}
            title={isLocked ? "Разблокировать блок" : "Заблокировать блок"}
            aria-label="Заблокировать/разблокировать блок"
          >
            {isLocked ? "🔓 Разблок." : "🔒 Замок"}
          </button>

          {/* Удалить — запрещено при замке */}
          <button
            onClick={(e) => { e.stopPropagation(); if (!isLocked) onRemove(); }}
            className={`px-2 py-1 rounded-md bg-[#1a1d2e] border border-[#2a2f45] ${isLocked ? "opacity-40 cursor-not-allowed text-[#ffb3a8]" : "text-[#ffb3a8] hover:bg-[#221f2e]"}`}
            title={isLocked ? "Разблокируйте, чтобы удалить" : "Удалить блок"}
            disabled={isLocked}
          >
            Удалить
          </button>

          {/* Двигать вверх/вниз — запрещено при замке */}
          <button
            title={isLocked ? "Разблокируйте, чтобы переместить" : "Переместить вверх"}
            className={`px-2 py-1 rounded-md bg-[#1a1d2e] border border-[#2a2f45] ${isLocked ? "opacity-40 cursor-not-allowed" : "text-[#b8c1ff] hover:bg-[#1f2336]"}`}
            onClick={(e) => { e.stopPropagation(); if (!isLocked) onMoveUp(b.id); }}
            aria-label="Переместить блок вверх"
            disabled={isLocked}
          >
            ↑
          </button>

          <button
            title={isLocked ? "Разблокируйте, чтобы переместить" : "Переместить вниз"}
            className={`px-2 py-1 rounded-md bg-[#1a1d2e] border border-[#2a2f45] ${isLocked ? "opacity-40 cursor-not-allowed" : "text-[#b8c1ff] hover:bg-[#1f2336]"}`}
            onClick={(e) => { e.stopPropagation(); if (!isLocked) onMoveDown(b.id); }}
            aria-label="Переместить блок вниз"
            disabled={isLocked}
          >
            ↓
          </button>
        </div>

      </div>

      {/* Редакторы блоков, инпуты защищены от всплытия/drag */}
      <div className={isLocked ? "pointer-events-none opacity-60" : ""}>
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
          <div className="grid grid-cols-2 gap-3">
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
            <Field label="Выравнивание">
              <select
                className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={(b as any).align || "left"}
                onChange={(e) => onChange({ align: e.target.value } as any)}
                onMouseDownCapture={stopAll}
                onKeyDownCapture={stopAll}
                onClickCapture={stopAll}
              >
                <option value="left">Слева</option>
                <option value="center">По центру</option>
                <option value="right">Справа</option>
              </select>
            </Field>
          </div>
        )}

        {b.type === "p" && (
          <div className="grid grid-cols-2 gap-3">
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
            <Field label="Выравнивание">
              <select
                className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={(b as any).align || "left"}
                onChange={(e) => onChange({ align: e.target.value } as any)}
                onMouseDownCapture={stopAll}
                onKeyDownCapture={stopAll}
                onClickCapture={stopAll}
              >
                <option value="left">Слева</option>
                <option value="center">По центру</option>
                <option value="right">Справа</option>
              </select>
            </Field>
          </div>
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

                  <Field label="Выравнивание">
                    <select
                      className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                      value={(b as any).align || "center"}
                      onChange={(e) => onChange({ align: e.target.value } as any)}
                    >
                      <option value="left">Слева</option>
                      <option value="center">По центру</option>
                      <option value="right">Справа</option>
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

        {b.type === "heading" && (
          <div className="grid gap-3">
            <Field label="Текст заголовка">
              <input
                className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={b.text || ""}
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

            <Field label="Уровень (H2–H4)">
              <select
                className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={b.level || "h2"}
                onChange={(e) => onChange({ level: e.target.value as any } as Partial<Block>)}
                onMouseDownCapture={stopAll}
                onKeyDownCapture={stopAll}
                onClickCapture={stopAll}
                onDragStart={preventDrag}
                draggable={false}
              >
                <option value="h2">H2</option>
                <option value="h3">H3</option>
                <option value="h4">H4</option>
              </select>
            </Field>

            <Field label="Выравнивание">
              <select
                className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={b.align || "left"}
                onChange={(e) => onChange({ align: e.target.value as any } as Partial<Block>)}
                onMouseDownCapture={stopAll}
                onKeyDownCapture={stopAll}
                onClickCapture={stopAll}
                onDragStart={preventDrag}
                draggable={false}
              >
                <option value="left">Слева</option>
                <option value="center">По центру</option>
                <option value="right">Справа</option>
              </select>
            </Field>
          </div>
        )}

        {b.type === "section" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Заголовок (опц.)">
              <input
                className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={b.title || ""}
                onChange={(e) => onChange({ title: e.target.value } as Partial<Block>)}
                onMouseDownCapture={stopAll} onKeyDownCapture={stopAll} onClickCapture={stopAll}
                onDragStart={preventDrag} draggable={false} autoComplete="off" spellCheck={false}
              />
            </Field>

            <Field label="Текст (опц.)">
              <input
                className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={b.text || ""}
                onChange={(e) => onChange({ text: e.target.value } as Partial<Block>)}
                onMouseDownCapture={stopAll} onKeyDownCapture={stopAll} onClickCapture={stopAll}
                onDragStart={preventDrag} draggable={false} autoComplete="off" spellCheck={false}
              />
            </Field>

            <Field label="Выравнивание">
              <select
                className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={b.align || "left"}
                onChange={(e) => onChange({ align: e.target.value as any } as Partial<Block>)}
                onMouseDownCapture={stopAll} onKeyDownCapture={stopAll} onClickCapture={stopAll}
                onDragStart={preventDrag} draggable={false}
              >
                <option value="left">Слева</option>
                <option value="center">По центру</option>
                <option value="right">Справа</option>
              </select>
            </Field>

            <Field label="Тема секции">
              <select
                className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={b.theme || "auto"}
                onChange={(e) => onChange({ theme: e.target.value as any } as Partial<Block>)}
                onMouseDownCapture={stopAll} onKeyDownCapture={stopAll} onClickCapture={stopAll}
                onDragStart={preventDrag} draggable={false}
              >
                <option value="auto">Auto (по странице)</option>
                <option value="light">Light (локально)</option>
                <option value="dark">Dark (локально)</option>
              </select>
            </Field>

            <Field label="Отступы">
              <select
                className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={b.pad || "md"}
                onChange={(e) => onChange({ pad: e.target.value as any } as Partial<Block>)}
                onMouseDownCapture={stopAll} onKeyDownCapture={stopAll} onClickCapture={stopAll}
                onDragStart={preventDrag} draggable={false}
              >
                <option value="sm">Малые</option>
                <option value="md">Средние</option>
                <option value="lg">Большие</option>
              </select>
            </Field>

            <Field label="Фон">
              <select
                className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={b.bg || "none"}
                onChange={(e) => onChange({ bg: e.target.value as any } as Partial<Block>)}
                onMouseDownCapture={stopAll} onKeyDownCapture={stopAll} onClickCapture={stopAll}
                onDragStart={preventDrag} draggable={false}
              >
                <option value="none">Нет</option>
                <option value="subtle">Ненавязчивый градиент</option>
                <option value="card">Панель (card)</option>
                <option value="accent">Акцент (оттенок)</option>
              </select>
            </Field>
          </div>
        )}

        {/* Новые самостоятельные ветки: spacer/divider */}
        {b.type === "spacer" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Размер">
              <select
                className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={(b as any).size || "md"}
                onChange={(e) => onChange({ size: e.target.value } as any)}
              >
                <option value="xs">XS (8px)</option>
                <option value="sm">SM (16px)</option>
                <option value="md">MD (24px)</option>
                <option value="lg">LG (40px)</option>
                <option value="xl">XL (64px)</option>
              </select>
            </Field>
          </div>
        )}

        {b.type === "divider" && (
          <div className="grid gap-2">
            <div className="h-px bg-[#2a2f45]" />
            <div className="text-[#9aa3b2] text-xs">Тонкая линия-разделитель</div>
          </div>
        )}
      </div>
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
    case "spacer":
      return "отступ";
    case "divider":
      return "разделитель";
    case "heading": 
      return "Заголовок (H2–H4)";
    case "section": 
      return "секция";    
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

  const docForBuild = useMemo(
    () => ({ ...doc, blocks: doc.blocks.filter(b => !(b as any).hidden) }),
    [doc]
  );

  // Снятие предупреждений TS о неиспользуемых сущностях после отключения старого превью
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
    } catch { }
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

      // 🚫 запрет: если источник или цель — «замок», не двигаем
      const fromLocked = Boolean((arr[from] as any).locked);
      const toLocked = Boolean((arr[to] as any).locked);
      if (fromLocked || toLocked) return prev;

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
          : type === "heading"
            ? { id: uid(), type: "heading", text: "Заголовок секции", level: "h2", align: "left" }
            : type === "p"
              ? { id: uid(), type: "p", text: "Параграф текста…" }
              : type === "img"
                ? { id: uid(), type: "img", cid: "", alt: "" }
                : type === "cols2"
                  ? { id: uid(), type: "cols2", title: "Заголовок", text: "Текст…", img: "", alt: "", ratio: "6-6", reverse: false }
                  : type === "spacer"
                    ? { id: uid(), type: "spacer", size: "md" }
                    : type === "divider"
                      ? { id: uid(), type: "divider" }
                      : type === "section"
                        ? { id: uid(), type: "section", title: "Секция", text: "", align: "left", theme: "auto", pad: "md", bg: "none" }
                        : { id: uid(), type: "btn", label: "Кнопка", href: "#", align: "center" };


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
    const model = adaptFromSiteBuilderDoc(docForBuild);
    const blob = await exportSiteZip(model, { bundleAssets: true });
    const fname = prettyFileName(doc.title || "site", "zip");
    downloadBlob(blob, fname);
  }, [doc]);

  const onExportSingle = useCallback(async () => {
    const model = adaptFromSiteBuilderDoc(docForBuild);
    const blob = await exportSingleHtml(model, { bundleAssets: true });
    downloadBlob(blob, prettyFileName(doc.title || "site", "html"));
  }, [doc]);

  const onOpenPreviewTab = useCallback(async () => {
    const model = adaptFromSiteBuilderDoc(docForBuild);
    const blob = await exportSingleHtml(model, { bundleAssets: true });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    // на всякий случай почистим URL через минуту
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, [doc]);

  // HTML-оболочка для live-предпросмотра (с responsive-панелью)
  const buildLiveShellHtml = (id: string) => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"/>
<meta name="color-scheme" content="dark light"/>
<title>AltNet — live-предпросмотр</title>
<style>
  :root{--bg:#0b0f17;--fg:#e6e9f4;--muted:#9aa3b2;--bar:#151a25;--bd:#22283a}
  html,body{height:100%;margin:0;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,Segoe UI,Roboto,Arial}
  #bar{
    position:fixed;top:8px;left:8px;right:8px;z-index:10;
    background:var(--bar);border:1px solid var(--bd);
    border-radius:12px;padding:8px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap
  }
  #bar .tag{opacity:.8}
  #bar button{
    border:1px solid var(--bd);background:#0f1420;color:#cfd5e6;
    padding:6px 10px;border-radius:8px;cursor:pointer
  }
  #bar button.active{outline:2px solid #5865F2}
  #bar input[type="number"]{
    width:92px;padding:6px 8px;border:1px solid var(--bd);border-radius:8px;background:#0f1420;color:#cfd5e6
  }
  #viewport{
    position:absolute;inset:0;display:flex;justify-content:center;align-items:stretch;
    overflow:auto;padding:56px 16px 16px
  }
  iframe#stage{
    border:0;height:100%;width:100%; /* режим Fit по умолчанию */
    background:#0b0f17;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35)
  }
  .sep{width:1px;height:24px;background:var(--bd);margin:0 4px}
</style></head>
<body>
  <div id="bar">
    <span class="tag">Live-предпросмотр</span>
    <div class="sep"></div>
    <button data-w="fit" class="active">Fit</button>
    <button data-w="1280">Desktop 1280</button>
    <button data-w="834">Tablet 834</button>
    <button data-w="390">Mobile 390</button>
    <div class="sep"></div>
    <span>Ширина:</span><input id="w" type="number" min="320" max="1920" step="10" placeholder="px"/>
  </div>

  <div id="viewport">
    <iframe id="stage" sandbox="allow-same-origin"></iframe>
  </div>

  <script>
    (function(){
      const ch = new BroadcastChannel("altnet_live_preview:${id}");
      const stage = document.getElementById("stage");
      const buttons = Array.from(document.querySelectorAll("#bar button[data-w]"));
      const input = document.getElementById("w");
      const LS_KEY = "altnet_live_w:${id}";

      function applyWidth(mode){
        buttons.forEach(b => b.classList.toggle("active", b.dataset.w === mode || (mode==="fit" && b.dataset.w==="fit")));
        if(mode === "fit"){
          stage.style.width = "100%";
          localStorage.setItem(LS_KEY, "fit");
          input.value = "";
        }else{
          const px = parseInt(mode, 10);
          if(!isFinite(px)) return;
          stage.style.width = px + "px";
          localStorage.setItem(LS_KEY, String(px));
          input.value = String(px);
        }
      }

      // init from LS
      (function(){
        const saved = localStorage.getItem(LS_KEY) || "fit";
        const isFit = saved === "fit";
        applyWidth(isFit ? "fit" : saved);
      })();

      // buttons
      buttons.forEach(b => {
        b.addEventListener("click", () => applyWidth(b.dataset.w));
      });

      // manual input
      input.addEventListener("change", () => {
        const px = parseInt(input.value, 10);
        if(isFinite(px) && px >= 320 && px <= 1920){
          applyWidth(String(px));
        }
      });

      // paint on messages
      ch.onmessage = function(e){
        if(!e || !e.data) return;
        if(e.data.type === "html" && typeof e.data.html === "string"){
          const doc = stage.contentWindow.document;
          doc.open(); doc.write(e.data.html); doc.close();
        }
      };
    })();
  </script>
</body></html>`;


  const onOpenLivePreview = useCallback(async () => {
    // генерируем id канала на сессию
    const id = `s${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    livePreviewIdRef.current = id;

    // поднимем канал
    if (livePreviewChannelRef.current) {
      try { livePreviewChannelRef.current.close(); } catch { }
    }
    livePreviewChannelRef.current = new BroadcastChannel(`altnet_live_preview:${id}`);

    // откроем вкладку-оболочку
    const shell = buildLiveShellHtml(id);
    const shellBlob = new Blob([shell], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(shellBlob);
    livePreviewWindowRef.current = window.open(url, "_blank", "noopener,noreferrer") || null;

    // первый залив контента
    setTimeout(async () => {
      try {
        const model = adaptFromSiteBuilderDoc(docForBuild);
        const blob = await exportSingleHtml(model, { bundleAssets: true });
        const html = await blob.text();
        livePreviewChannelRef.current?.postMessage({ type: "html", html });
      } catch (e) {
        console.error("Live preview first paint error:", e);
      }
    }, 200);
  }, [doc]);

  const onRefreshLivePreview = useCallback(async () => {
    if (!livePreviewChannelRef.current || !livePreviewIdRef.current) {
      // если еще не открывали live-вкладку — просто откроем
      await onOpenLivePreview();
      return;
    }
    try {
      const model = adaptFromSiteBuilderDoc(docForBuild);
      const blob = await exportSingleHtml(model, { bundleAssets: true });
      const html = await blob.text();
      livePreviewChannelRef.current.postMessage({ type: "html", html });
    } catch (e) {
      console.error("Live preview refresh error:", e);
    }
  }, [doc, onOpenLivePreview]);


  // Авто-обновление live-вкладки при изменении документа (debounce 400 мс)
  useEffect(() => {
    // если live-канал не поднят — ничего не делаем
    if (!livePreviewChannelRef.current) return;

    // сбросить предыдущий таймер
    if (liveDebounceRef.current) {
      window.clearTimeout(liveDebounceRef.current);
    }

    // отложить сборку и отправку HTML
    liveDebounceRef.current = window.setTimeout(async () => {
      try {
        const model = adaptFromSiteBuilderDoc(docForBuild);
        const blob = await exportSingleHtml(model, { bundleAssets: true });
        const html = await blob.text();
        livePreviewChannelRef.current?.postMessage({ type: "html", html });
      } catch (e) {
        console.error("Live preview auto refresh error:", e);
      }
    }, 400);

    // очистка
    return () => {
      if (liveDebounceRef.current) {
        window.clearTimeout(liveDebounceRef.current);
        liveDebounceRef.current = null;
      }
    };
  }, [doc]);

  // Импорт модели из JSON
  const importJsonInputRef = useRef<HTMLInputElement>(null);

  // Live-preview: окно, канал и id канала
  const livePreviewWindowRef = useRef<Window | null>(null);
  const livePreviewChannelRef = useRef<BroadcastChannel | null>(null);
  const livePreviewIdRef = useRef<string>("");
  // debounce-таймер для автообновления live-вкладки
  const liveDebounceRef = useRef<number | null>(null);

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

      const okTypes = new Set<BlockType>(["hero", "h1", "heading", "p", "img", "btn", "cols2", "spacer", "divider"]);


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
    const model = adaptFromSiteBuilderDoc(docForBuild);
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: "application/json" });
    const fname = prettyFileName(doc.title || "site", "json");
    downloadBlob(blob, fname);
  }, [doc]);

  const resetDoc = useCallback(() => {
    setDoc(DEFAULT_DOC);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { }
  }, []);

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
            className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#e6e9f4] hover:bg-[#1f2336]"
            onClick={onOpenPreviewTab}
            title="Открыть предпросмотр сайта в новой вкладке"
          >
            👁 Предпросмотр в новой вкладке
          </button>

          <button
            className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#e6e9f4] hover:bg-[#1f2336]"
            onClick={onOpenLivePreview}
            title="Открыть live-предпросмотр (обновляется через канал)"
          >
            ⚡ Открыть live-предпросмотр
          </button>

          <button
            className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#e6e9f4] hover:bg-[#1f2336]"
            onClick={onRefreshLivePreview}
            title="Отправить текущую версию сайта во вкладку live-предпросмотра"
          >
            ↻ Обновить live-предпросмотр
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
          <button className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]" onClick={() => addBlock("heading")}>+ Заголовок (H2–H4)</button>
          <button className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]" onClick={() => addBlock("p")}>+ Текст</button>
          <button className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]" onClick={() => addBlock("img")}>+ Картинка</button>
          <button className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]" onClick={() => addBlock("btn")}>+ Кнопка</button>
          <button className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]" onClick={() => addBlock("cols2")}>+ Две колонки</button>
          <button className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]" onClick={() => addBlock("spacer")}>+ Spacer</button>
          <button className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]" onClick={() => addBlock("divider")}>+ Divider</button>
          <button className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]" onClick={() => addBlock("section")}>+ Секция</button>

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

      {/* Предпросмотр (отключён) */}
      <div className="md:col-[2] rounded-2xl p-6 bg-[#0f111a] border border-[#1c2030]">
        <div className="text-sm text-[#9aa3b2] mb-2">
          Встроенный предпросмотр отключён.
        </div>
        <div className="text-sm text-[#9aa3b2]">
          Используйте кнопки слева: <b>«Предпросмотр в новой вкладке»</b> или <b>«Открыть live-предпросмотр»</b>, затем <b>«↻ Обновить live-предпросмотр»</b>.
        </div>
      </div>
    </div>
  );
}
