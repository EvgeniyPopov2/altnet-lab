import React, { useCallback, useMemo, useRef, useState } from "react";
import SafePreview from "../components/SafePreview";
import { exportSiteZip, downloadBlob, adaptFromSiteBuilderDoc } from "../builder/exporter";


/* =========================
 * Типы документа и блоков
 * ========================= */
type BlockType = "hero" | "h1" | "p" | "img" | "btn";

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
};

type Block = HeroBlock | H1Block | PBlock | ImgBlock | BtnBlock;

type Doc = {
  title: string;
  blocks: Block[];
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

/* =========================
 * Рендер HTML для предпросмотра
 * ========================= */
function renderDocToHTML(doc: Doc): string {
  const blocks = doc.blocks
    .map((b) => {
      switch (b.type) {
        case "hero":
          return `
<section style="padding:64px 24px; text-align:center; max-width:960px; margin:0 auto;">
  <h1 style="font-size:40px; line-height:1.1; margin:0 0 12px;">${escapeHtml(b.title || "")}</h1>
  <p style="font-size:18px; color:#9aa3b2; margin:0 0 20px;">${escapeHtml(b.subtitle || "")}</p>
  ${
    b.ctaText
      ? `<a href="${escapeAttr(b.ctaLink || "#")}" style="display:inline-block; padding:10px 16px; border-radius:10px; background:#5865F2; color:#fff; text-decoration:none;">${escapeHtml(
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
        case "btn":
          return `<a href="${escapeAttr(b.href)}" style="display:inline-block; padding:8px 14px; border-radius:10px; background:#1f2336; color:#e6e9f4; text-decoration:none; border:1px solid #2a2f45; margin:8px 0;">${escapeHtml(
            b.label
          )}</a>`;
      }
    })
    .join("\n");

  const siteTitle = doc.title
    ? `<header style="max-width:960px;margin:0 auto;padding:24px;">
         <h1 style="font-size:28px; line-height:1.2; margin:16px 0 12px; opacity:.85;">${escapeHtml(doc.title)}</h1>
       </header>`
    : "";

  return `<!doctype html>
<html lang="ru"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(doc.title || "Сайт")}</title>
<body style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background:#0b0f1a; color:#e6e9f4; padding:24px;">
  ${siteTitle}
  <main style="max-width:960px; margin:0 auto;">
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
};

const BlockCard = React.memo(function BlockCard(props: BlockCardProps) {
  const { block: b, index, onChange, onRemove, onDragStartByHandle, onDragOverCard, onDropOnCard } =
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
              onRemove();
            }}
            className="px-2 py-1 rounded-md bg-[#1a1d2e] border border-[#2a2f45] text-[#ffb3a8] hover:bg-[#221f2e]"
          >
            Удалить
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
            <Field label="Ссылка">
              <input
                className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={b.ctaLink || ""}
                onChange={(e) => onChange({ ctaLink: e.target.value } as Partial<Block>)}
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
          <Field label="CID / URL">
            <input
              className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
              value={b.cid}
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
          </Field>
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
          <Field label="Ссылка">
            <input
              className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
              value={b.href}
              onChange={(e) => onChange({ href: e.target.value } as Partial<Block>)}
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
  }
}

/* =========================
 * Основной экран
 * ========================= */
export default function SiteBuilder() {
  const [doc, setDoc] = useState<Doc>(() => ({
    title: "Мой сайт",
    blocks: [
      {
        id: uid(),
        type: "hero",
        title: "Заголовок героя",
        subtitle: "Короткий подзаголовок",
        ctaText: "Подробнее",
        ctaLink: "#",
      },
    ],
  }));

  const html = useMemo(() => renderDocToHTML(doc), [doc]);

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

  const onExportZip = useCallback(async () => {
    const model = adaptFromSiteBuilderDoc(doc);
    const blob = await exportSiteZip(model, { bundleAssets: true });
    downloadBlob(blob, "altnet-site.zip");
  }, [doc]);

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

  const CONTENT_WIDTH = 960; // ширина макета предпросмотра

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

        {/* Кнопки действий */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]"
            onClick={onExportZip}
            title="Скачать ZIP (index.html + styles.css + manifest.json)"
          >
            ⬇️ Экспорт статического сайта (ZIP)
          </button>
        </div>

        <div className="mb-3 text-sm text-[#9aa3b2]">Палитра</div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]" onClick={() => addBlock("hero")}>+ Hero</button>
          <button className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]" onClick={() => addBlock("h1")}>+ Заголовок</button>
          <button className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]" onClick={() => addBlock("p")}>+ Текст</button>
          <button className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]" onClick={() => addBlock("img")}>+ Картинка</button>
          <button className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff] hover:bg-[#1f2336]" onClick={() => addBlock("btn")}>+ Кнопка</button>
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
              onDragStartByHandle={onDragStartByHandle}
              onDragOverCard={(e) => onDragOverCard(e)}   // предотвращаем default
              onDropOnCard={onDropOnCard}
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
          <div className="text-sm text-[#9aa3b2]">Предпросмотр</div>
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
            style={{ width: `${960 * zoom}px`, height: "100%" }}
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
