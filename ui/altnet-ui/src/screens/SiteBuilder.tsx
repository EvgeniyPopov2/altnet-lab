import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { exportSiteZip, exportSingleHtml, downloadBlob, adaptFromSiteBuilderDoc } from "../builder/exporter";
import Canvas from "./SiteBuilder/canvas/Canvas";
import Outline from "./SiteBuilder/outline/Outline";
import Inspector from "./SiteBuilder/inspector/Inspector";
import Field from "./SiteBuilder/ui/Field";
import type {
  BlockType,
  HeroBlock, H1Block, HeadingBlock, PBlock, ImgBlock, BtnBlock,
  ColsRatio, Cols2Block, SectionBlock,
  GridBlock, Block, Doc
} from "./SiteBuilder/types";
type CheckItem = { id: string; ok: boolean; text: string };



const isHttp = (s: string) => /^https?:\/\//i.test(s || "");
const isHash = (s: string) => (s || "").trim().startsWith("#");
const notEmpty = (s?: string) => !!(s && s.trim().length > 0);



const STORAGE_KEY = "altnet.sitebuilder.v1";

const DEFAULT_DOC: Doc = {
  title: "Мой сайт",
  description: "",
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
  checks.push({
    id: "title",
    ok: titleOk,
    text: titleOk ? "Заголовок задан." : "Добавьте заголовок сайта (≥ 3 символов).",
  });

  const desc = (doc as any).description || "";
  const descOk = !!desc && desc.trim().length >= 50 && desc.trim().length <= 160;
  checks.push({
    id: "desc",
    ok: descOk,
    text: descOk ? "Описание 50–160 символов." : "Заполните «Описание сайта» (желательно 50–160 символов).",
  });

  const hasHero = doc.blocks.some((b) => b.type === "hero");
  checks.push({ id: "hero", ok: hasHero, text: hasHero ? "Есть блок Hero." : "Добавьте блок Hero." });

  const hero = doc.blocks.find((b) => b.type === "hero") as HeroBlock | undefined;
  const ctaOk = !!hero && notEmpty(hero.ctaText) && notEmpty(hero.ctaLink);
  checks.push({
    id: "hero-cta",
    ok: ctaOk,
    text: ctaOk ? "CTA в Hero заполнен." : "В Hero заполните «Текст кнопки» и «Ссылка».",
  });

  const imgBlocks = doc.blocks.filter((b) => b.type === "img") as ImgBlock[];
  const allImgAlt = imgBlocks.every((b) => notEmpty(b.alt));
  checks.push({
    id: "img-alt",
    ok: allImgAlt || imgBlocks.length === 0,
    text:
      imgBlocks.length === 0 ? "Картинок нет — ок." : allImgAlt ? "У всех изображений заполнен alt." : "Добавьте alt ко всем изображениям.",
  });

  const btnBlocks = doc.blocks.filter((b) => b.type === "btn") as BtnBlock[];
  const allBtnHrefOk = btnBlocks.every((b) => notEmpty(b.href) && (isHttp(b.href) || isHash(b.href) || b.href.startsWith("/")));
  checks.push({
    id: "btn-href",
    ok: allBtnHrefOk || btnBlocks.length === 0,
    text: btnBlocks.length === 0 ? "Кнопок нет — ок." : allBtnHrefOk ? "Ссылки у кнопок валидны." : "Проверьте ссылки у кнопок (http(s), /путь или #якорь).",
  });

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
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return (base || "site") + "." + ext;
}

/* =========================
 * Основной экран
 * ========================= */
export default function SiteBuilder() {
  const [doc, setDoc] = useState<Doc>(() => loadFromStorage() ?? DEFAULT_DOC);
  const [canvasCols, setCanvasCols] = useState<1 | 2 | 3 | 4>(3);
  const [canvasGapX, setCanvasGapX] = useState<number>(16);
  const [canvasGapY, setCanvasGapY] = useState<number>(16);
  type Breakpoint = "desktop" | "tablet" | "mobile";
  type BlockStyle = { mt?: number; mb?: number; pt?: number; pb?: number; py?: number };
  type StyleByBp = { desktop?: BlockStyle; tablet?: BlockStyle; mobile?: BlockStyle };

  const [bp, setBp] = useState<Breakpoint>("desktop");
  const [iframeMode, setIframeMode] = useState<"fit" | Breakpoint>("fit");
  const widthByBp: Record<Breakpoint, number> = { desktop: 1280, tablet: 834, mobile: 390 };

  // выбор блока
  const [selId, setSelId] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<"content" | "style" | "advanced">("content");
  useEffect(() => { setEditorTab("content"); }, [selId]);
  const sel = useMemo(() => doc.blocks.find((b) => b.id === selId) ?? null, [doc.blocks, selId]);

  const patchBlock = useCallback((id: string, patch: Partial<any>) => {
    setDoc((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  }, []);

  const removeBlock = useCallback(
    (id: string) => {
      setDoc((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }));
      if (selId === id) setSelId(null);
    },
    [selId]
  );

  const duplicateBlock = useCallback((id: string) => {
    setDoc((d) => {
      const i = d.blocks.findIndex((b) => b.id === id);
      if (i < 0) return d;
      const copy = { ...(d.blocks[i] as any), id: uid() } as any;
      const next = d.blocks.slice();
      next.splice(i + 1, 0, copy);
      return { ...d, blocks: next };
    });
  }, []);



  const moveBlock = useCallback((id: string, dir: -1 | 1) => {
    setDoc((d) => {
      const i = d.blocks.findIndex((b) => b.id === id);
      if (i < 0) return d;
      const j = i + dir;
      if (j < 0 || j >= d.blocks.length) return d;
      const next = d.blocks.slice();
      const [it] = next.splice(i, 1);
      next.splice(j, 0, it);
      return { ...d, blocks: next };
    });
  }, []);

  const resolveStyle = (b: any, cur: Breakpoint): BlockStyle => {
    const base: BlockStyle = (b && b.style) || {};
    const perAll: StyleByBp = (b && b.styleByBp) || {};
    const per: BlockStyle = (perAll && (perAll as any)[cur]) || {};
    return { ...base, ...per };
  };

  const styleInline = useCallback((b: any): React.CSSProperties => {
    const s = resolveStyle(b, bp);
    const pt = s.py != null ? s.py : s.pt;
    const pb = s.py != null ? s.py : s.pb;
    const mt = s.mt;
    const mb = s.mb;
    return {
      ...(pt != null ? { paddingTop: Number(pt) } : {}),
      ...(pb != null ? { paddingBottom: Number(pb) } : {}),
      ...(mt != null ? { marginTop: Number(mt) } : {}),
      ...(mb != null ? { marginBottom: Number(mb) } : {}),
    };
  }, [bp]);


  // ── Превью блоков (мини-карточки на канвасе) ────────────────────────────────
  const renderPreviewBlock = useCallback((b: Block) => {
    switch (b.type) {
      case "h1":
        return <h3 className="text-lg font-extrabold tracking-tight">{(b as H1Block).text || "Заголовок"}</h3>;
      case "heading":
        return <h4 className="text-base font-semibold">{(b as HeadingBlock).text || "Заголовок"}</h4>;
      case "p":
        return <p className="text-sm opacity-80">{(b as PBlock).text || "Абзац"}</p>;
      case "img":
        return (
          <img
            className="rounded-xl border border-[#2a2f45]"
            src={(b as any).src || (b as ImgBlock).cid || ""}
            alt={(b as ImgBlock).alt || ""}
          />
        );
      case "btn":
        return <button className="btn">{(b as BtnBlock).label || "Кнопка"}</button>;
      case "spacer":
        return <div className="h-6 opacity-40" />;
      case "divider":
        return <div className="h-px bg-[#2a2f45]" />;
      case "cols2":
        return <div className="grid grid-cols-2 gap-4 opacity-70">Две колонки</div>;
      case "section":
        return <div className="section-band pad-md">Секция</div>;
      case "grid":
        return <div className="grid grid-cols-3 gap-3 opacity-70">Сетка 1–4</div>;
      case "hero":
        return (
          <div className="hero">
            <h2>{(b as HeroBlock).title || "Заголовок"}</h2>
            <p className="muted">{(b as HeroBlock).subtitle || ""}</p>
          </div>
        );
      default:
        return <div className="text-xs opacity-60">[{(b as any).type}]</div>;
    }
  }, []);

  // ── Полноценное превью для «мини-сайта» внутри карточки блока (инлайн правка текстов)
  const previewOf = useCallback((b: Block) => {
    // общий враппер: применяем отступы/паддинги текущего устройства через styleInline
    const wrapStyled = (children: React.ReactNode, pad = true) => (
      <div
        id={(b as any).anchorId || undefined}
        className={`${pad ? "p-3 " : ""}${(b as any).className || ""}`}
        style={styleInline(b as any)}
      >
        {children}
      </div>
    );

    if ((b as any).hidden) {
      return wrapStyled(<div className="text-xs text-[#9aa3b2] italic">Блок скрыт</div>);
    }

    switch (b.type) {
      case "hero": {
        const hb = b as HeroBlock;
        return wrapStyled(
          <div className="rounded-xl border border-[#2a2f45] bg-gradient-to-br from-[#0e1327] to-[#0c0f1a] p-6">
            <div
              className="text-2xl font-bold text-[#e6e9f4] mb-1"
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => patchBlock(b.id, { title: e.currentTarget.innerText })}
              onDoubleClick={() => setSelId(b.id)}
            >
              {hb.title || "Заголовок героя"}
            </div>
            <div
              className="text-sm text-[#9aa3b2] mb-3"
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => patchBlock(b.id, { subtitle: e.currentTarget.innerText })}
              onDoubleClick={() => setSelId(b.id)}
            >
              {hb.subtitle || "Подзаголовок или краткое описание секции"}
            </div>
            {(hb.ctaText || hb.ctaLink) && (
              <a
                href={hb.ctaLink || "#"}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-[#1a203b] border border-[#2a2f45] text-[#e6e9f4] hover:bg-[#222a4a]"
                rel="noopener noreferrer nofollow"
                onClick={(e) => e.preventDefault()}
                title="Кнопка (клик в предпросмотре заблокирован)"
              >
                {hb.ctaText || "Кнопка"}
              </a>
            )}
          </div>
        );
      }

      case "h1": {
        const h = b as H1Block;
        const align = h.align || "left";
        return wrapStyled(
          <div
            className={`text-2xl font-semibold text-[#e6e9f4] text-${align}`}
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => patchBlock(b.id, { text: e.currentTarget.innerText })}
            onDoubleClick={() => setSelId(b.id)}
          >
            {h.text || "Заголовок H1"}
          </div>
        );
      }

      case "p": {
        const p = b as PBlock;
        const align = p.align || "left";
        return wrapStyled(
          <div
            className={`text-sm leading-6 text-[#cfd5e6] whitespace-pre-wrap text-${align}`}
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => patchBlock(b.id, { text: e.currentTarget.innerText })}
            onDoubleClick={() => setSelId(b.id)}
          >
            {p.text || "Текстовый абзац. Дважды кликните, чтобы отредактировать."}
          </div>
        );
      }

      case "img": {
        const im = b as ImgBlock;
        const src = im.cid || "";
        return wrapStyled(
          <figure className="grid gap-2">
            <img
              src={src}
              alt={im.alt || ""}
              className="max-w-full rounded-lg border border-[#2a2f45] bg-[#0b0e18] object-contain"
              onDoubleClick={() => setSelId(b.id)}
              draggable={false}
            />
            <figcaption className="text-xs text-[#9aa3b2]">{im.alt || "alt-текст"}</figcaption>
          </figure>
        );
      }

      case "btn": {
        const bt = b as BtnBlock;
        const align = bt.align || "left";
        return wrapStyled(
          <div className={`text-${align}`}>
            <a
              href={bt.href || "#"}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border ${bt.variant === "secondary"
                ? "bg-transparent border-[#2a2f45] text-[#e6e9f4] hover:bg-[#111425]"
                : "bg-[#1a203b] border-[#2a2f45] text-[#e6e9f4] hover:bg-[#222a4a]"
                }`}
              rel="noopener noreferrer nofollow"
              onClick={(e) => e.preventDefault()}
              title="Кнопка (клик в предпросмотре заблокирован)"
              onDoubleClick={() => setSelId(b.id)}
            >
              {bt.label || "Кнопка"}
            </a>
          </div>
        );
      }

      case "divider": {
        return wrapStyled(<hr className="border-t border-[#2a2f45]" />, false);
      }

      case "spacer": {
        return wrapStyled(<div className="h-8" />, false);
      }

      default:
        return wrapStyled(<div className="text-xs text-[#9aa3b2]">[Превью для типа «{(b as any).type}» пока нет]</div>);
    }
  }, [patchBlock, setSelId, styleInline]);



  // Вставка нового блока в «слот» канваса
  const handleInsertAt = useCallback((index: number, type: "hero" | "h1" | "p" | "btn" | "img" | "divider" | "spacer") => {
    const id = uid();
    const base: any =
      type === "hero"
        ? { id, type: "hero", title: "Заголовок героя", subtitle: "Короткий подзаголовок", ctaText: "Подробнее", ctaLink: "#" }
        : type === "h1"
          ? { id, type: "h1", text: "Новый заголовок", align: "left" }
          : type === "p"
            ? { id, type: "p", text: "Новый абзац. Опишите мысль.", align: "left" }
            : type === "btn"
              ? { id, type: "btn", label: "Кнопка", href: "#", variant: "primary", align: "left" }
              : type === "img"
                ? { id, type: "img", cid: "https://picsum.photos/1200/600", alt: "Изображение" }
                : type === "divider"
                  ? { id, type: "divider" }
                  : { id, type: "spacer", size: "md" };

    setDoc((d) => {
      const next = d.blocks.slice();
      next.splice(index, 0, base);
      return { ...d, blocks: next };
    });
  }, []);

  const labelOf = useCallback((b: Block): string => {
    switch (b.type) {
      case "hero":
        return "Hero";
      case "h1":
        return "Заголовок (H1)";
      case "heading":
        return `Заголовок (${(b as any).level?.toUpperCase() || "H2"})`;
      case "p":
        return "Текст";
      case "img":
        return "Картинка";
      case "btn":
        return "Кнопка";
      case "cols2":
        return "Две колонки";
      case "spacer":
        return "Разделитель (высота)";
      case "divider":
        return "Линия";
      case "section":
        return "Секция";
      case "grid":
        return "Сетка";
      default:
        return String((b as any).type);
    }
  }, []);

  // — канвас-предпросмотр (сборка в один HTML для iframe справа) —
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [autoPreview, setAutoPreview] = useState<boolean>(true);
  const [isBuilding, setIsBuilding] = useState<boolean>(false);
  const [elQuery, setElQuery] = useState<string>("");

  // Скрытые блоки вырезаем из модели для экспорта/предпросмотра
  const docForBuild = useMemo(() => ({ ...doc, blocks: doc.blocks.filter((b) => !(b as any).hidden) }), [doc]);

  const buildPreview = useCallback(async () => {
    setIsBuilding(true);
    try {
      const model = adaptFromSiteBuilderDoc(docForBuild);
      const blob = await exportSingleHtml(model, { bundleAssets: true });
      const html = await blob.text();
      setPreviewHtml(html);
    } catch (e) {
      console.error("Preview build failed:", e);
    } finally {
      setIsBuilding(false);
    }
  }, [docForBuild]);

  useEffect(() => {
    if (!autoPreview) return;
    const t = setTimeout(() => {
      void buildPreview();
    }, 350);
    return () => clearTimeout(t);
  }, [docForBuild, autoPreview, buildPreview]);

  const checks = useMemo(() => validateDoc(doc), [doc]);
  const okCount = useMemo(() => checks.filter((c) => c.ok).length, [checks]);
  const [showChecklist, setShowChecklist] = useState(false);

  const layoutItems: Array<[BlockType, string]> = [
    ["section", "Контейнер"],
    ["grid", "Сетка"],
    ["cols2", "Две колонки"],
    ["hero", "Hero"],
  ];
  const basicItems: Array<[BlockType, string]> = [
    ["h1", "Заголовок"],
    ["p", "Текст"],
    ["img", "Изображение"],
    ["btn", "Кнопка"],
    ["divider", "Разделитель"],
    ["spacer", "Интервал"],
  ];
  const q = elQuery.trim().toLowerCase();
  const layoutFiltered = layoutItems.filter(([, label]) => label.toLowerCase().includes(q));
  const basicFiltered = basicItems.filter(([, label]) => label.toLowerCase().includes(q));

  const isValidOgImage = (s: string) => {
    if (!s) return true;
    const v = s.trim().toLowerCase();
    return v.startsWith("https://") || v.startsWith("http://") || v.startsWith("altfs://") || v.startsWith("ipfs://") || v.startsWith("data:image/");
  };

  // Автосохранение
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    } catch { }
  }, [doc]);

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
                        : type === "grid"
                          ? {
                            id: uid(),
                            type: "grid",
                            cols: 3,
                            items: [
                              { id: uid(), src: "", alt: "Изображение 1", caption: "Подпись 1" },
                              { id: uid(), src: "", alt: "Изображение 2", caption: "Подпись 2" },
                              { id: uid(), src: "", alt: "Изображение 3", caption: "Подпись 3" },
                            ],
                          }
                          : { id: uid(), type: "btn", label: "Кнопка", href: "#", align: "center" };

    setDoc((d) => ({ ...d, blocks: [...d.blocks, block] }));
  }, []);

  // Экспорт/импорт/предпросмотр
  const onExportZip = useCallback(async () => {
    const model = adaptFromSiteBuilderDoc(docForBuild);
    const blob = await exportSiteZip(model, { bundleAssets: true });
    const fname = prettyFileName(doc.title || "site", "zip");
    downloadBlob(blob, fname);
  }, [docForBuild, doc.title]);

  const onExportSingle = useCallback(async () => {
    const model = adaptFromSiteBuilderDoc(docForBuild);
    const blob = await exportSingleHtml(model, { bundleAssets: true });
    downloadBlob(blob, prettyFileName(doc.title || "site", "html"));
  }, [docForBuild, doc.title]);

  const onOpenPreviewTab = useCallback(async () => {
    const model = adaptFromSiteBuilderDoc(docForBuild);
    const blob = await exportSingleHtml(model, { bundleAssets: true });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, [docForBuild]);

  // HTML-оболочка для live-предпросмотра (с responsive-панелью)
  const buildLiveShellHtml = (id: string) => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"/>
<meta name="color-scheme" content="dark light"/>
<title>AltNet — live-предпросмотр</title>
<style>
  :root{--bg:#0b0f17;--fg:#e6e9f4;--muted:#9aa3b2;--bar:#151a25;--bd:#22283a}
  html,body{height:100%;margin:0;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,Segoe UI,Roboto,Arial}
  #bar{position:fixed;top:8px;left:8px;right:8px;z-index:10;background:var(--bar);border:1px solid var(--bd);border-radius:12px;padding:8px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  #bar .tag{opacity:.8}
  #bar button{border:1px solid var(--bd);background:#0f1420;color:#cfd5e6;padding:6px 10px;border-radius:8px;cursor:pointer}
  #bar button.active{outline:2px solid #5865F2}
  #bar input[type="number"]{width:92px;padding:6px 8px;border:1px solid var(--bd);border-radius:8px;background:#0f1420;color:#cfd5e6}
  #viewport{position:absolute;inset:0;display:flex;justify-content:center;align-items:stretch;overflow:auto;padding:56px 16px 16px}
  iframe#stage{border:0;height:100%;width:100%;background:#0b0f17;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
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
      (function(){
        const saved = localStorage.getItem(LS_KEY) || "fit";
        const isFit = saved === "fit";
        applyWidth(isFit ? "fit" : saved);
      })();
      buttons.forEach(b => { b.addEventListener("click", () => applyWidth(b.dataset.w)); });
      input.addEventListener("change", () => {
        const px = parseInt(input.value, 10);
        if(isFinite(px) && px >= 320 && px <= 1920){ applyWidth(String(px)); }
      });
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

  // Live-preview: окно, канал и id канала
  const importJsonInputRef = useRef<HTMLInputElement>(null);
  const livePreviewWindowRef = useRef<Window | null>(null);
  const livePreviewChannelRef = useRef<BroadcastChannel | null>(null);
  const livePreviewIdRef = useRef<string>("");
  const liveDebounceRef = useRef<number | null>(null);

  const onOpenLivePreview = useCallback(async () => {
    const id = `s${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    livePreviewIdRef.current = id;

    if (livePreviewChannelRef.current) {
      try {
        livePreviewChannelRef.current.close();
      } catch { }
    }
    livePreviewChannelRef.current = new BroadcastChannel(`altnet_live_preview:${id}`);

    const shell = buildLiveShellHtml(id);
    const shellBlob = new Blob([shell], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(shellBlob);
    livePreviewWindowRef.current = window.open(url, "_blank", "noopener,noreferrer") || null;

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
  }, [docForBuild]);

  const onRefreshLivePreview = useCallback(async () => {
    if (!livePreviewChannelRef.current || !livePreviewIdRef.current) {
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
  }, [docForBuild, onOpenLivePreview]);

  // Авто-обновление live-вкладки при изменениях
  useEffect(() => {
    if (!livePreviewChannelRef.current) return;
    if (liveDebounceRef.current) {
      window.clearTimeout(liveDebounceRef.current);
    }
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
    return () => {
      if (liveDebounceRef.current) {
        window.clearTimeout(liveDebounceRef.current);
        liveDebounceRef.current = null;
      }
    };
  }, [docForBuild]);

  // Импорт JSON
  const onImportJsonClick = () => {
    importJsonInputRef.current?.click();
  };

  const onImportJsonChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;

    try {
      const text = await f.text();
      const data = JSON.parse(text);

      if (!data || typeof data !== "object" || !Array.isArray((data as any).blocks)) {
        throw new Error("Ожидался объект с массивом blocks.");
      }

      const okTypes = new Set<BlockType>([
        "hero",
        "h1",
        "heading",
        "p",
        "img",
        "btn",
        "cols2",
        "spacer",
        "divider",
        "section",
        "grid",
      ]);

      const title = typeof (data as any).title === "string" ? (data as any).title : "Мой сайт";
      const description = typeof (data as any).description === "string" ? (data as any).description : "";
      const blocksRaw: any[] = (data as any).blocks;

      const blocks: Block[] = blocksRaw
        .map((b: any) => {
          if (!b || !okTypes.has(b.type)) return null;
          const id = uid();
          const p = (b && typeof b.props === "object" && b.props) || b;

          switch (b.type as BlockType) {
            case "hero":
              return {
                id,
                type: "hero",
                title: String(p.title ?? ""),
                subtitle: String(p.subtitle ?? ""),
                ctaText: String(p.ctaText ?? p.ctaLabel ?? ""),
                ctaLink: String(p.ctaLink ?? p.ctaHref ?? "#"),
              } as HeroBlock;
            case "h1":
              return { id, type: "h1", text: String(p.text ?? p.title ?? "") } as H1Block;
            case "p":
              return { id, type: "p", text: String(p.text ?? "") } as PBlock;
            case "img":
              return { id, type: "img", cid: String(p.cid ?? p.src ?? ""), alt: String(p.alt ?? "") } as ImgBlock;
            case "btn":
              return {
                id,
                type: "btn",
                label: String(p.label ?? p.text ?? "Кнопка"),
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
            default:
              return null;
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
  }, [docForBuild, doc.title]);

  const resetDoc = useCallback(() => {
    setDoc(DEFAULT_DOC);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { }
  }, []);

  // — Навигатор (Outline) —
  const Navigator = useCallback(
    () => (
      <div className="grid gap-2">
        {doc.blocks.map((b, idx) => (
          <div
            key={b.id}
            className={`group flex items-center justify-between gap-2 rounded-lg border ${selId === b.id ? "border-[#6E59F2] bg-[#121528]" : "border-[#2a2f45] bg-[#0c0f1a]"
              } px-2 py-1`}
          >
            <button
              onClick={() => setSelId(b.id)}
              className={`rounded-xl border ${selId === b.id ? "border-indigo-500/50 ring-1 ring-indigo-500/30" : "border-[#2a2f45]"
                } bg-[#0c0f1a] p-3 cursor-pointer`}
              title={labelOf(b)}
            >
              <span className="opacity-60 mr-1">#{idx + 1}</span>
              {labelOf(b)}
            </button>
            <div className="flex items-center gap-1">
              <button title="Вверх" onClick={() => moveBlock(b.id, -1)} className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs">
                ↑
              </button>
              <button title="Вниз" onClick={() => moveBlock(b.id, 1)} className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs">
                ↓
              </button>
              <button
                title={(b as any).hidden ? "Показать" : "Скрыть"}
                onClick={() => patchBlock(b.id, { hidden: !((b as any).hidden) })}
                className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs"
              >
                {(b as any).hidden ? "👁" : "👁‍🗨"}
              </button>
              <button
                title={(b as any).locked ? "Разблокировать" : "Заблокировать"}
                onClick={() => patchBlock(b.id, { locked: !((b as any).locked) })}
                className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs"
              >
                {(b as any).locked ? "🔓" : "🔒"}
              </button>
              <button title="Дублировать" onClick={() => duplicateBlock(b.id)} className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs">
                ⧉
              </button>
              <button
                title="Удалить"
                onClick={() => removeBlock(b.id)}
                className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs text-[#ffb3a8]"
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>
    ),
    [doc.blocks, selId, labelOf, moveBlock, patchBlock, duplicateBlock, removeBlock]
  );

  // — Редактор свойств выбранного блока —
  const Editor = useCallback(() => {
    if (!sel) return <div className="text-xs text-[#9aa3b2]">Выберите блок слева.</div>;
    const sBy: StyleByBp = (sel as any).styleByBp || {};
    const sCur: BlockStyle = sBy[bp] || {};

    // показываем число как строку в input
    const readNum = (v: any) => (v == null ? "" : String(v));

    // принимаем string|number, нормализуем -> number|undefined
    const updCur = (patch: Partial<Record<keyof BlockStyle, string | number>>) => {
      const normalized = Object.fromEntries(
        Object.entries(patch).map(([k, v]) => [k, v === "" || v == null ? undefined : Number(v)])
      ) as Partial<BlockStyle>;

      const next: BlockStyle = { ...(sBy[bp] || {}), ...normalized };
      patchBlock(sel.id, { styleByBp: { ...sBy, [bp]: next } } as any);
    };

    const tabBtn = (t: "content" | "style" | "advanced") =>
      `px-3 py-1.5 text-sm rounded-md border ${editorTab === t ? "border-indigo-500/60 bg-[#121528] text-[#e6e9f4]" : "border-[#2a2f45] bg-[#0c0f1a] text-[#cfd5e6]"
      }`;
    const id = sel.id;
    const row = (children: React.ReactNode) => <div className="grid gap-3">{children}</div>;

    // Вкладки
    const Tabs = (
      <div className="mb-3 flex items-center gap-2">
        {(["content", "style", "advanced"] as const).map(t => (
          <button
            key={t}
            className={[
              "px-2.5 py-1.5 rounded-md border text-xs",
              editorTab === t ? "border-[#6E59F2] bg-[#121528] text-[#e6e9f4]" : "border-[#2a2f45] bg-[#0c0f1a] text-[#cfd5e6]"
            ].join(" ")}
            onClick={() => setEditorTab(t)}
          >
            {t === "content" ? "Контент" : t === "style" ? "Стиль" : "Расширенные"}
          </button>
        ))}
      </div>
    );

    {/* STYLE: общие отступы по устройствам */ }
    {
      editorTab === "style" && (
        <div className="grid gap-3">
          <div className="flex items-center gap-1 text-xs">
            <span className="opacity-70">Устройство:</span>
            <button className={tabBtn("content").replace("text-sm", "text-xs")} onClick={() => setBp("desktop")}>Desktop</button>
            <button className={tabBtn("content").replace("text-sm", "text-xs")} onClick={() => setBp("tablet")}>Tablet</button>
            <button className={tabBtn("content").replace("text-sm", "text-xs")} onClick={() => setBp("mobile")}>Mobile</button>
            <span className="ml-2 opacity-70">({bp})</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            <Field label="mt"><input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={readNum(sCur.mt)} onChange={e => updCur({ mt: e.target.value })} placeholder="px" /></Field>
            <Field label="mb"><input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={readNum(sCur.mb)} onChange={e => updCur({ mb: e.target.value })} placeholder="px" /></Field>
            <Field label="pt"><input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={readNum(sCur.pt)} onChange={e => updCur({ pt: e.target.value })} placeholder="px" /></Field>
            <Field label="pb"><input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={readNum(sCur.pb)} onChange={e => updCur({ pb: e.target.value })} placeholder="px" /></Field>
            <Field label="py"><input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={readNum(sCur.py)} onChange={e => updCur({ py: e.target.value })} placeholder="px" /></Field>
          </div>
        </div>
      )
    }
    { editorTab === "style" && <></> }
    {
      editorTab === "advanced" && (
        <div className="grid gap-3">
          <div className="flex gap-2">
            <button className="px-2 py-1 rounded border border-[#2a2f45] bg-[#0c0f1a]" onClick={() => patchBlock(sel.id, { hidden: !((sel as any).hidden) } as any)}>
              {(sel as any).hidden ? "Показать" : "Скрыть"}
            </button>
            <button className="px-2 py-1 rounded border border-[#2a2f45] bg-[#0c0f1a]" onClick={() => patchBlock(sel.id, { locked: !((sel as any).locked) } as any)}>
              {(sel as any).locked ? "Разблокировать" : "Заблокировать"}
            </button>
          </div>
          <Field label="ID (якорь)">
            <input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
              value={(sel as any).anchorId || ""}
              onChange={e => patchBlock(sel.id, { anchorId: e.target.value } as any)} />
          </Field>
          <Field label="CSS класс">
            <input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
              value={(sel as any).className || ""}
              onChange={e => patchBlock(sel.id, { className: e.target.value } as any)} />
          </Field>
        </div>
      )
    }
    { editorTab !== "content" && <></> }

    // Контентные формы (как было)
    let contentNode: React.ReactNode = null;
    switch (sel.type) {
      case "hero": {
        const b = sel as HeroBlock;
        contentNode = row(
          <>
            <Field label="Заголовок">
              <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={b.title} onChange={e => patchBlock(id, { title: e.target.value })} autoComplete="off" spellCheck={false} />
            </Field>
            <Field label="Подзаголовок">
              <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={b.subtitle || ""} onChange={e => patchBlock(id, { subtitle: e.target.value })} autoComplete="off" spellCheck={false} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Текст кнопки">
                <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                  value={b.ctaText || ""} onChange={e => patchBlock(id, { ctaText: e.target.value })} autoComplete="off" spellCheck={false} />
              </Field>
              <Field label="Ссылка (http/altfs/ipfs/#)">
                <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                  value={b.ctaLink || ""} onChange={e => patchBlock(id, { ctaLink: e.target.value })} autoComplete="off" spellCheck={false} />
              </Field>
            </div>
          </>
        );
        break;
      }
      case "h1": {
        const b = sel as H1Block;
        contentNode = row(
          <Field label="Текст H1">
            <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
              value={b.text} onChange={e => patchBlock(id, { text: e.target.value })} autoComplete="off" spellCheck={false} />
          </Field>
        );
        break;
      }
      case "heading": {
        const b = sel as HeadingBlock;
        contentNode = row(
          <>
            <Field label="Текст заголовка">
              <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={b.text} onChange={e => patchBlock(id, { text: e.target.value })} autoComplete="off" spellCheck={false} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Уровень">
                <select className="px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
                  value={b.level || "h2"} onChange={e => patchBlock(id, { level: e.target.value as any })}>
                  <option value="h2">H2</option><option value="h3">H3</option><option value="h4">H4</option>
                </select>
              </Field>
              <Field label="Выравнивание">
                <select className="px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
                  value={b.align || "left"} onChange={e => patchBlock(id, { align: e.target.value as any })}>
                  <option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option>
                </select>
              </Field>
            </div>
          </>
        );
        break;
      }
      case "p": {
        const b = sel as PBlock;
        contentNode = row(
          <>
            <Field label="Текст">
              <textarea className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4] min-h-[96px]"
                value={b.text} onChange={e => patchBlock(id, { text: e.target.value })} spellCheck={false} />
            </Field>
            <Field label="Выравнивание">
              <select className="px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
                value={b.align || "left"} onChange={e => patchBlock(id, { align: e.target.value as any })}>
                <option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option>
              </select>
            </Field>
          </>
        );
        break;
      }
      case "img": {
        const b = sel as ImgBlock;
        contentNode = row(
          <>
            <Field label="CID/URL изображения">
              <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={b.cid} onChange={e => patchBlock(id, { cid: e.target.value })} autoComplete="off" spellCheck={false} />
            </Field>
            <Field label="Alt-текст (доступность/SEO)">
              <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={b.alt || ""} onChange={e => patchBlock(id, { alt: e.target.value })} autoComplete="off" spellCheck={false} />
            </Field>
          </>
        );
        break;
      }
      case "btn": {
        const b = sel as BtnBlock;
        contentNode = row(
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Текст кнопки">
                <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                  value={b.label} onChange={e => patchBlock(id, { label: e.target.value })} autoComplete="off" spellCheck={false} />
              </Field>
              <Field label="Ссылка">
                <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                  value={b.href} onChange={e => patchBlock(id, { href: e.target.value })} autoComplete="off" spellCheck={false} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Стиль">
                <select className="px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
                  value={b.variant || "primary"} onChange={e => patchBlock(id, { variant: e.target.value as any })}>
                  <option value="primary">Primary</option><option value="secondary">Secondary</option>
                </select>
              </Field>
              <Field label="Выравнивание">
                <select className="px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
                  value={b.align || "center"} onChange={e => patchBlock(id, { align: e.target.value as any })}>
                  <option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option>
                </select>
              </Field>
            </div>
          </>
        );
        break;
      }
      case "cols2": {
        const b = sel as Cols2Block;
        contentNode = row(
          <>
            <Field label="Заголовок">
              <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={b.title} onChange={e => patchBlock(id, { title: e.target.value })} autoComplete="off" spellCheck={false} />
            </Field>
            <Field label="Текст">
              <textarea className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4] min-h-[96px]"
                value={b.text} onChange={e => patchBlock(id, { text: e.target.value })} spellCheck={false} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Изображение (CID/URL)">
                <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                  value={b.img} onChange={e => patchBlock(id, { img: e.target.value })} autoComplete="off" spellCheck={false} />
              </Field>
              <Field label="Alt">
                <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                  value={b.alt} onChange={e => patchBlock(id, { alt: e.target.value })} autoComplete="off" spellCheck={false} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Соотношение колонок">
                <select className="px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
                  value={b.ratio} onChange={e => patchBlock(id, { ratio: e.target.value as ColsRatio })}>
                  <option value="5-7">5–7</option><option value="6-6">6–6</option><option value="7-5">7–5</option>
                </select>
              </Field>
              <Field label="Порядок (реверс)">
                <select className="px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
                  value={b.reverse ? "1" : "0"} onChange={e => patchBlock(id, { reverse: e.target.value === "1" })}>
                  <option value="0">Обычный</option><option value="1">Реверс</option>
                </select>
              </Field>
            </div>
          </>
        );
        break;
      }
      case "section": {
        const b = sel as SectionBlock;
        contentNode = row(
          <>
            <Field label="Заголовок секции">
              <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={b.title || ""} onChange={e => patchBlock(id, { title: e.target.value })} />
            </Field>
            <Field label="Текст секции">
              <textarea className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4] min-h-[72px]"
                value={b.text || ""} onChange={e => patchBlock(id, { text: e.target.value })} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Тема">
                <select className="px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={b.theme || "auto"}
                  onChange={e => patchBlock(id, { theme: e.target.value as any })}>
                  <option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option>
                </select>
              </Field>
              <Field label="Паддинги">
                <select className="px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={b.pad || "md"}
                  onChange={e => patchBlock(id, { pad: e.target.value as any })}>
                  <option value="sm">sm</option><option value="md">md</option><option value="lg">lg</option>
                </select>
              </Field>
              <Field label="Фон">
                <select className="px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={b.bg || "none"}
                  onChange={e => patchBlock(id, { bg: e.target.value as any })}>
                  <option value="none">none</option><option value="subtle">subtle</option><option value="card">card</option><option value="accent">accent</option>
                </select>
              </Field>
            </div>
          </>
        );
        break;
      }
      case "grid": {
        const b = sel as GridBlock;
        contentNode = row(
          <>
            <Field label="Кол-во колонок">
              <select className="px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={b.cols}
                onChange={e => patchBlock(id, { cols: Number(e.target.value) as any })}>
                <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
              </select>
            </Field>
            <div className="grid gap-2">
              {b.items.map((it, i) => (
                <div key={it.id} className="rounded-lg border border-[#2a2f45] p-2 grid gap-2">
                  <div className="text-xs text-[#9aa3b2]">Элемент {i + 1}</div>
                  <input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
                    value={it.src} onChange={e => { const items = b.items.slice(); items[i] = { ...items[i], src: e.target.value }; patchBlock(id, { items }); }} placeholder="CID/URL" />
                  <input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
                    value={it.alt || ""} onChange={e => { const items = b.items.slice(); items[i] = { ...items[i], alt: e.target.value }; patchBlock(id, { items }); }} placeholder="Alt" />
                  <input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
                    value={it.caption || ""} onChange={e => { const items = b.items.slice(); items[i] = { ...items[i], caption: e.target.value }; patchBlock(id, { items }); }} placeholder="Подпись" />
                </div>
              ))}
              <button className="px-2 py-1 rounded bg-[#1a1d2e] border border-[#2a2f45] text-[#b8c1ff]"
                onClick={() => { const items = b.items.slice(); items.push({ id: uid(), src: "", alt: "", caption: "" }); patchBlock(id, { items }); }}>
                + Добавить элемент
              </button>
            </div>
          </>
        );
        break;
      }
      default:
        contentNode = <div className="text-xs text-[#9aa3b2]">Редактор для этого блока пока не реализован.</div>;
    }

    // Стиль (общий для всех типов)
    const s = ((sel as any).style || {}) as { mt?: number; mb?: number; py?: number; pt?: number; pb?: number };
    const styleNode = row(
      <>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Отступ сверху (px)">
            <input type="number" className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
              value={s.mt ?? 0}
              onChange={(e) => patchBlock(id, { style: { ...(s || {}), mt: Math.max(0, parseInt(e.target.value || "0", 10)) } } as any)} />
          </Field>
          <Field label="Отступ снизу (px)">
            <input type="number" className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
              value={s.mb ?? 0}
              onChange={(e) => patchBlock(id, { style: { ...(s || {}), mb: Math.max(0, parseInt(e.target.value || "0", 10)) } } as any)} />
          </Field>
          <Field label="Паддинг по Y (px)">
            <input type="number" className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
              value={s.py ?? 0}
              onChange={(e) => patchBlock(id, { style: { ...(s || {}), py: Math.max(0, parseInt(e.target.value || "0", 10)) } } as any)} />
          </Field>
        </div>
        <div className="text-xs text-[#9aa3b2]">
          Вдохновлено Elementor → Basic Spacing. Breakpoints и другие стили добавим на следующих шагах.
        </div>
      </>
    );

    // Advanced (минимум: скрыть/заблокировать)
    const advancedNode = row(
      <>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Скрыть блок">
            <button
              className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#e6e9f4]"
              onClick={() => patchBlock(id, { hidden: !((sel as any).hidden) })}
            >
              {((sel as any).hidden ? "Показан → Скрыть" : "Скрыт → Показать")}
            </button>
          </Field>
          <Field label="Блокировка">
            <button
              className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#e6e9f4]"
              onClick={() => patchBlock(id, { locked: !((sel as any).locked) })}
            >
              {((sel as any).locked ? "Разблокировать" : "Заблокировать")}
            </button>
          </Field>
        </div>
      </>
    );

    return (
      <>
        {Tabs}
        {editorTab === "content" ? contentNode : editorTab === "style" ? styleNode : advancedNode}
      </>
    );
  }, [sel, patchBlock, bp, editorTab]);


  // Разметка: 3 колонки — слева настройки/палитра, центр — канвас, справа — свойства + предпросмотр
  return (
    <div className="h-full grid grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)_360px] xl:grid-cols-[340px_minmax(0,1fr)_420px] gap-4">
      {/* Левая панель — настройки, кнопки, палитра, чек-лист, навигатор */}
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
                onChange={(e) => setDoc((d) => ({ ...d, theme: { ...(d.theme || {}), accent: e.target.value.trim() } }))}
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
                    theme: { ...(d.theme || {}), container: Math.max(640, Math.min(1920, parseInt(e.target.value || "960", 10))) },
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
                (isValidOgImage(doc.ogImage || "") ? "border-[#1f2751] text-[#e6e9f4]" : "border-red-500 text-red-300")
              }
              value={doc.ogImage || ""}
              onChange={(e) => setDoc((d) => ({ ...d, ogImage: e.target.value }))}
              placeholder="altfs://CID или https://… или data:image/…"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          {!isValidOgImage(doc.ogImage || "") && (
            <div className="mt-1 text-xs text-red-400">Разрешены: https://, http://, altfs://, ipfs:// или data:image/…</div>
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
            onClick={() => setShowChecklist((v) => !v)}
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

          <input ref={importJsonInputRef} type="file" accept="application/json" className="hidden" onChange={onImportJsonChange} />

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

        {/* Палитра элементов */}
        <div className="mb-4">
          <div className="mb-2 text-sm text-[#9aa3b2]">Элементы</div>

          <input
            className="w-full mb-2 px-3 py-2 rounded-md bg-[#0f1420] border border-[#2a2f45] text-[#e6e9f4]"
            placeholder="Поиск виджета…"
            value={elQuery}
            onChange={(e) => setElQuery(e.target.value)}
          />

          <div className="text-xs text-[#9aa3b2] mb-1">Layout</div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {layoutFiltered.map(([t, label]) => (
              <button
                key={t}
                onClick={() => addBlock(t)}
                onDragStart={(e) => e.dataTransfer.setData("application/x-block", t)}
                draggable
                className="flex items-center justify-center h-9 rounded-md bg-[#F8FAFC] border border-[#e5e7eb] text-xs text-[#111827] hover:bg-white"
                title={label}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="text-xs text-[#9aa3b2] mb-1">Базовый</div>
          <div className="grid grid-cols-2 gap-2">
            {basicFiltered.map(([t, label]) => (
              <button
                key={t}
                onClick={() => addBlock(t)}
                onDragStart={(e) => e.dataTransfer.setData("application/x-block", t)}
                draggable
                className="flex items-center justify-center h-9 rounded-md bg-[#F8FAFC] border border-[#e5e7eb] text-xs text-[#111827] hover:bg-white"
                title={label}
              >
                {label}
              </button>
            ))}
          </div>

  <div className="mt-2 text-xs text-[#9aa3b2]">
    Совет: перетащите элемент на канвас между слотами «+ Добавить блок».
  </div>
</div>

        {showChecklist && (
          <div className="mb-4 rounded-xl border border-[#2a2f45] bg-[#0c0f1a] p-3">
            <div className="text-sm mb-2 text-[#9aa3b2]">Проверки качества</div>
            <ul className="space-y-1 text-sm">
              {checks.map((it) => (
                <li key={it.id} className="flex items-start gap-2">
                  <span className={it.ok ? "text-green-400" : "text-red-400"}>{it.ok ? "✔" : "✖"}</span>
                  <span className={it.ok ? "text-[#9aa3b2]" : "text-[#ffb3a8]"}>{it.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-[#2a2f45] bg-[#0c0f1a] p-3">
          <div className="mb-2 text-sm text-[#cfd5e6]">Навигатор</div>
          <Navigator />
        </div>
      </div>

      {/* Средняя панель — Канвас */}
      <div className="md:col-[2] min-h-0 overflow-y-auto p-4">
        <div className="sticky top-0 z-10 mb-3 flex items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white p-2 shadow-sm">
          {/* Переключатели устройств как в Elementor */}
          <div className="flex items-center gap-1 text-xs">
            <button className={`px-2 py-1 rounded border ${iframeMode === "fit" ? "border-indigo-500/60" : "border-[#e5e7eb]"}`} onClick={() => setIframeMode("fit")}>Fit</button>
            <button className={`px-2 py-1 rounded border ${iframeMode === "desktop" ? "border-indigo-500/60" : "border-[#e5e7eb]"}`} onClick={() => { setIframeMode("desktop"); setBp("desktop"); }}>🖥 1280</button>
            <button className={`px-2 py-1 rounded border ${iframeMode === "tablet" ? "border-indigo-500/60" : "border-[#e5e7eb]"}`} onClick={() => { setIframeMode("tablet"); setBp("tablet"); }}>📱 834</button>
            <button className={`px-2 py-1 rounded border ${iframeMode === "mobile" ? "border-indigo-500/60" : "border-[#e5e7eb]"}`} onClick={() => { setIframeMode("mobile"); setBp("mobile"); }}>📱 390</button>
          </div>

          {/* Настройки сетки — в выпадашке */}
          <details className="ml-2">
            <summary className="cursor-pointer px-2 py-1 rounded border border-[#e5e7eb] bg-[#F8FAFC] text-xs">Сетка</summary>
            <div className="mt-2 flex flex-wrap items-center gap-3 p-2 rounded border border-[#e5e7eb] bg-[#F8FAFC]">
              <label className="text-xs text-[#374151]">
                Колонки:&nbsp;
                <select className="px-2 py-1 rounded-md bg-white border border-[#e5e7eb]"
                  value={canvasCols}
                  onChange={(e) => setCanvasCols(Number(e.target.value) as 1 | 2 | 3 | 4)}>
                  <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
                </select>
              </label>
              <label className="text-xs text-[#374151]">
                Gap X:&nbsp;
                <input type="number" className="w-20 px-2 py-1 rounded-md bg-white border border-[#e5e7eb]"
                  value={canvasGapX}
                  onChange={(e) => setCanvasGapX(Math.max(0, parseInt(e.target.value || "0", 10)))} />
              </label>
              <label className="text-xs text-[#374151]">
                Gap Y:&nbsp;
                <input type="number" className="w-20 px-2 py-1 rounded-md bg-white border border-[#e5e7eb]"
                  value={canvasGapY}
                  onChange={(e) => setCanvasGapY(Math.max(0, parseInt(e.target.value || "0", 10)))} />
              </label>
            </div>
          </details>

          {/* Кнопки справа */}
          <div className="ml-auto flex items-center gap-2">
            <button className="px-3 py-1.5 rounded-md bg-[#1f2937] text-white" onClick={onOpenPreviewTab} title="Открыть предпросмотр">
              Предпросмотр
            </button>
            <button className="px-3 py-1.5 rounded-md bg-[#10B981] text-white" onClick={onExportSingle} title="Экспорт одним HTML">
              Опубликовать
            </button>
          </div>
        </div>

        <div className="flex justify-center">
          <div className="w-full" style={{ maxWidth: `${doc.theme?.container ?? 960}px` }}>
            <div className="rounded-2xl bg-white text-[#0f172a] shadow-[0_10px_40px_rgba(0,0,0,0.35)] border border-[#e5e7eb] p-6">
              <Canvas
                cols={canvasCols}
                gapX={canvasGapX}
                gapY={canvasGapY}
                blocks={doc.blocks}
                renderBlock={(b) => (
                  <div
                    onClick={() => setSelId(b.id)}
                    className={`rounded-xl border ${selId === b.id ? "border-[#6E59F2]" : "border-[#e5e7eb]"} bg-white p-3 cursor-pointer`}
                  >
                    {selId === b.id ? previewOf(b) : renderPreviewBlock(b)}
                  </div>
                )}
                onReorder={(next) => setDoc((d) => ({ ...d, blocks: next as any }))}
                onInsertAt={(index, type) => handleInsertAt(index, type)}
              />
              {/* Навигатор блоков (пока только выбор). Показываем на широком экране. */}
              <div className="mt-4 hidden xl:block">
                <Outline blocks={doc.blocks} selId={selId} onSelect={(id) => setSelId(id)} />
              </div>
              {/* Inspector (каркас). Пока просто ниже; затем перенесём в правую колонку. */}
              <div className="mt-4">
                <Inspector block={doc.blocks.find((b) => b.id === selId)} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Правая панель — Свойства + Предпросмотр */}
      <div className="md:col-[3] h-full overflow-y-auto border-l border-[#1c2030] bg-[#0b0e18] p-4 flex flex-col gap-4">
        <div className="rounded-2xl border border-[#2a2f45] bg-[#0c0f1a] p-3">
          <div className="mb-2 text-sm text-[#cfd5e6]">Свойства блока</div>
          <Editor />
        </div>

        <div className="rounded-2xl border border-[#1c2030] bg-[#0b0e18] overflow-hidden flex flex-col min-h-[320px]">
          <div className="flex items-center w-full gap-2">
            <span className="text-sm opacity-80">Предпросмотр (sandbox)</span>

            <div className="flex items-center gap-2 text-xs ml-4">
              <button className={`px-2 py-1 rounded border ${iframeMode === "fit" ? "border-indigo-500/60" : "border-[#2a2f45]"}`} onClick={() => setIframeMode("fit")}>Fit</button>
              <button className={`px-2 py-1 rounded border ${iframeMode === "desktop" ? "border-indigo-500/60" : "border-[#2a2f45]"}`} onClick={() => { setIframeMode("desktop"); setBp("desktop"); }}>🖥 1280</button>
              <button className={`px-2 py-1 rounded border ${iframeMode === "tablet" ? "border-indigo-500/60" : "border-[#2a2f45]"}`} onClick={() => { setIframeMode("tablet"); setBp("tablet"); }}>📱 834</button>
              <button className={`px-2 py-1 rounded border ${iframeMode === "mobile" ? "border-indigo-500/60" : "border-[#2a2f45]"}`} onClick={() => { setIframeMode("mobile"); setBp("mobile"); }}>📱 390</button>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <label className="flex items-center gap-1 text-xs opacity-80">
                <input type="checkbox" checked={autoPreview} onChange={(e) => setAutoPreview(e.target.checked)} />
                автообновление
              </label>
              <button
                className="px-2 py-1 rounded bg-[#1a1d2e] border border-[#2a2f45] hover:bg-[#1f2336] text-xs"
                onClick={() => void buildPreview()}
                disabled={isBuilding}

              >
                {isBuilding ? "Сборка…" : "Обновить"}
              </button>
            </div>
          </div>
          <div className="flex-1 w-full overflow-auto">
            <iframe
              title="preview"
              sandbox="allow-same-origin"
              className="block"
              style={{
                width: iframeMode === "fit" ? "100%" : `${widthByBp[iframeMode as Breakpoint]}px`,
                height: "100%",
                margin: "0 auto",
              }}
              srcDoc={previewHtml}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
