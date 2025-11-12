import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { exportSiteZip, exportSingleHtml, downloadBlob, adaptFromSiteBuilderDoc } from "../builder/exporter";
import Canvas from "./SiteBuilder/canvas/Canvas";
import Outline from "./SiteBuilder/outline/Outline";
import Palette from "./SiteBuilder/palette/Palette";
import { renderBlockView } from "./SiteBuilder/blocks";
import { createDefaultBlock } from "./SiteBuilder/registry";
import Inspector from "./SiteBuilder/inspector/Inspector";
import Field from "./SiteBuilder/ui/Field";
import Topbar from "./SiteBuilder/layout/Topbar";

import type {
  BlockType,
  HeroBlock,
  H1Block,
  HeadingBlock,
  PBlock,
  ImgBlock,
  BtnBlock,
  ColsRatio,
  Cols2Block,
  SectionBlock,
  GridBlock,
  Block,
  Doc,
} from "./SiteBuilder/types";

type CheckItem = { id: string; ok: boolean; text: string };

// ─────────────────────────────────────────────────────────────────────────────
// Утилиты
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Типы для стилей по брейкпоинтам (Style Tab)
// ─────────────────────────────────────────────────────────────────────────────
type Breakpoint = "desktop" | "tablet" | "mobile";
type BlockStyle = {
  mt?: number; mb?: number; pt?: number; pb?: number; py?: number;
  fs?: number; fw?: number; lh?: number; ta?: "left" | "center" | "right" | "justify";
  tc?: string; bg?: string;
  bw?: number; bc?: string; bs?: "none" | "solid" | "dashed" | "dotted"; br?: number;
  sh?: string;
};
type StyleByBp = { desktop?: BlockStyle; tablet?: BlockStyle; mobile?: BlockStyle };

// ─────────────────────────────────────────────────────────────────────────────
// Основной экран
// ─────────────────────────────────────────────────────────────────────────────
export default function SiteBuilder() {
  const [doc, setDoc] = useState<Doc>(() => loadFromStorage() ?? DEFAULT_DOC);

  // Канвас: кол-во колонок и зазоры
  const [canvasCols] = useState<1 | 2 | 3 | 4>(3);
  const [canvasGapX] = useState<number>(16);
  const [canvasGapY] = useState<number>(16);

  // Responsive режим
  const [bp, setBp] = useState<Breakpoint>("desktop");
  const [iframeMode, setIframeMode] = useState<"fit" | Breakpoint>("fit");
  const widthByBp: Record<Breakpoint, number> = { desktop: 1280, tablet: 834, mobile: 390 };

  // Выбор блока
  const [selId, setSelId] = useState<string | null>(null);
  const selBlock = useMemo(() => doc.blocks.find((b: any) => b.id === selId), [doc.blocks, selId]);
  const sel = useMemo(() => doc.blocks.find((b) => b.id === selId) ?? null, [doc.blocks, selId]);

  // Табы редактора
  const [editorTab, setEditorTab] = useState<"content" | "style" | "advanced">("content");
  useEffect(() => { setEditorTab("content"); }, [selId]);

  // Поиск по палитре
  const [elQuery, setElQuery] = useState<string>("");

  // Валидация/чеклист
  const checks = useMemo(() => validateDoc(doc), [doc]);
  const okCount = useMemo(() => checks.filter((c) => c.ok).length, [checks]);
  const [showChecklist, setShowChecklist] = useState(false);

  // Мини-предпросмотр (встроенный iframe) — чтобы не было «не прочитан» у переменных
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [autoPreview, setAutoPreview] = useState<boolean>(true);
  const [isBuilding, setIsBuilding] = useState<boolean>(false);

  // Для live-preview (отдельная вкладка)
  const importJsonInputRef = useRef<HTMLInputElement>(null);
  const livePreviewWindowRef = useRef<Window | null>(null);
  const livePreviewChannelRef = useRef<BroadcastChannel | null>(null);
  const livePreviewIdRef = useRef<string>("");
  const liveDebounceRef = useRef<number | null>(null);

  // ── Хелперы правки документа ───────────────────────────────────────────────
  const patchBlock = useCallback((id: string, patch: Partial<any>) => {
    setDoc((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  }, []);

  const removeBlock = useCallback((id: string) => {
    setDoc((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }));
    if (selId === id) setSelId(null);
  }, [selId]);

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

  // ── Style helpers ──────────────────────────────────────────────────────────
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

      ...(s.fs != null ? { fontSize: Number(s.fs) } : {}),
      ...(s.fw != null ? { fontWeight: Number(s.fw) as any } : {}),
      ...(s.lh != null ? { lineHeight: Number(s.lh) } : {}),
      ...(s.ta ? { textAlign: s.ta as any } : {}),

      ...(s.tc ? { color: s.tc } : {}),
      ...(s.bg ? { backgroundColor: s.bg } : {}),

      ...(s.bw != null ? { borderWidth: Number(s.bw) } : {}),
      ...(s.bs ? { borderStyle: s.bs as any } : {}),
      ...(s.bc ? { borderColor: s.bc } : {}),
      ...(s.br != null ? { borderRadius: Number(s.br) } : {}),

      ...(s.sh ? { boxShadow: s.sh } : {}),
    };
  }, [bp]);

  // ── Превью блока в канвасе (инлайн правка текстов) ─────────────────────────
  const previewOf = useCallback((b: Block) => {
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
        const align = (h as any).align || "left";
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

      case "divider":
        return wrapStyled(<hr className="border-t border-[#2a2f45]" />, false);

      case "spacer":
        return wrapStyled(<div className="h-8" />, false);

      default:
        return wrapStyled(<div className="text-xs text-[#9aa3b2]">[Превью для типа «{(b as any).type}» пока нет]</div>);
    }
  }, [patchBlock, setSelId, styleInline]);

  // Ярлык блока
  const labelOf = useCallback((b: Block): string => {
    switch (b.type) {
      case "hero": return "Hero";
      case "h1": return "Заголовок (H1)";
      case "heading": return `Заголовок (${(b as any).level?.toUpperCase() || "H2"})`;
      case "p": return "Текст";
      case "img": return "Картинка";
      case "btn": return "Кнопка";
      case "cols2": return "Две колонки";
      case "spacer": return "Разделитель (высота)";
      case "divider": return "Линия";
      case "section": return "Секция";
      case "grid": return "Сетка";
      default: return String((b as any).type);
    }
  }, []);

  // ── Документ без скрытых блоков — для экспорта/предпросмотра ───────────────
  const docForBuild = useMemo(
    () => ({ ...doc, blocks: doc.blocks.filter((b) => !(b as any).hidden) }),
    [doc]
  );

  // ── Сборка встроенного мини-предпросмотра (iframe справа) ──────────────────
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
    const t = setTimeout(() => { void buildPreview(); }, 350);
    return () => clearTimeout(t);
  }, [docForBuild, autoPreview, buildPreview]);

  // ── Экспорт / импорт / live-preview ────────────────────────────────────────
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
  <div id="viewport"><iframe id="stage" sandbox="allow-same-origin"></iframe></div>
  <script>
    (function(){
      const ch = new BroadcastChannel("altnet_live_preview:${id}");
      const stage = document.getElementById("stage");
      const buttons = Array.from(document.querySelectorAll("#bar button[data-w]"));
      const input = document.getElementById("w");
      const LS_KEY = "altnet_live_w:${id}";
      function applyWidth(mode){
        buttons.forEach(b => b.classList.toggle("active", b.dataset.w === mode || (mode==="fit" && b.dataset.w==="fit")));
        if(mode === "fit"){ stage.style.width = "100%"; localStorage.setItem(LS_KEY, "fit"); input.value = ""; }
        else { const px = parseInt(mode, 10); if(!isFinite(px)) return; stage.style.width = px + "px"; localStorage.setItem(LS_KEY, String(px)); input.value = String(px); }
      }
      (function(){ const saved = localStorage.getItem(LS_KEY) || "fit"; applyWidth(saved); })();
      buttons.forEach(b => b.addEventListener("click", () => applyWidth(b.dataset.w)));
      input.addEventListener("change", () => { const px = parseInt(input.value, 10); if(isFinite(px) && px >= 320 && px <= 1920){ applyWidth(String(px)); }});
      ch.onmessage = function(e){
        if(!e || !e.data) return;
        if(e.data.type === "html" && typeof e.data.html === "string"){
          const doc = stage.contentWindow.document; doc.open(); doc.write(e.data.html); doc.close();
        } else if(e.data.type === "width"){ var m = e.data.mode; applyWidth(String(m)); }
      };
    })();
  </script>
</body></html>`;

  const onOpenLivePreview = useCallback(async () => {
    const id = `s${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    livePreviewIdRef.current = id;

    if (livePreviewChannelRef.current) {
      try { livePreviewChannelRef.current.close(); } catch { }
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
    if (liveDebounceRef.current) { window.clearTimeout(liveDebounceRef.current); }
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
      if (liveDebounceRef.current) { window.clearTimeout(liveDebounceRef.current); liveDebounceRef.current = null; }
    };
  }, [docForBuild]);

  // Синхронизация режима ширины с Live-preview
  useEffect(() => {
    if (!livePreviewChannelRef.current) return;
    const mode = iframeMode === "fit" ? "fit" : String(widthByBp[iframeMode]);
    livePreviewChannelRef.current.postMessage({ type: "width", mode });
  }, [iframeMode, bp]);

  // Импорт/экспорт JSON
  const onImportJsonClick = () => importJsonInputRef.current?.click();

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
        "hero", "h1", "heading", "p", "img", "btn", "cols2", "spacer", "divider", "section", "grid",
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
                id, type: "hero",
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
                id, type: "btn",
                label: String(p.label ?? p.text ?? "Кнопка"),
                href: String(p.href ?? p.url ?? "#"),
              } as BtnBlock;
            case "cols2":
              return {
                id, type: "cols2",
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
    try { localStorage.removeItem(STORAGE_KEY); } catch { }
  }, []);

  // Автосохранение
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(doc)); } catch { }
  }, [doc]);

  // ── Навигатор (Outline) ────────────────────────────────────────────────────
  const Navigator = useCallback(() => (
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
            <button title="Вверх" onClick={() => moveBlock(b.id, -1)} className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs">↑</button>
            <button title="Вниз" onClick={() => moveBlock(b.id, 1)} className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs">↓</button>
            <button
              title={(b as any).hidden ? "Показать" : "Скрыть"}
              onClick={() => patchBlock(b.id, { hidden: !((b as any).hidden) })}
              className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs"
            >{(b as any).hidden ? "👁" : "👁‍🗨"}</button>
            <button
              title={(b as any).locked ? "Разблокировать" : "Заблокировать"}
              onClick={() => patchBlock(b.id, { locked: !((b as any).locked) })}
              className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs"
            >{(b as any).locked ? "🔓" : "🔒"}</button>
            <button title="Дублировать" onClick={() => duplicateBlock(b.id)} className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs">⧉</button>
            <button title="Удалить" onClick={() => removeBlock(b.id)} className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs text-[#ffb3a8]">🗑</button>
          </div>
        </div>
      ))}
    </div>
  ), [doc.blocks, selId, labelOf, moveBlock, patchBlock, duplicateBlock, removeBlock]);

  // ── Редактор свойств выбранного блока ──────────────────────────────────────
  const Editor = useCallback(() => {
    if (!sel) return <div className="text-xs text-[#9aa3b2]">Выберите блок слева.</div>;

    const sBy: StyleByBp = (sel as any).styleByBp || {};
    const sCur: BlockStyle = sBy[bp] || {};

    const readNum = (v: any) => (v == null ? "" : String(v));

    const updCur = (patch: Partial<Record<keyof BlockStyle, string | number>>) => {
      const numericKeys: (keyof BlockStyle)[] = ["mt", "mb", "pt", "pb", "py", "fs", "fw", "lh", "bw", "br"];
      const normalized = Object.fromEntries(
        Object.entries(patch).map(([k, v]) => {
          if (v === "" || v == null) return [k, undefined];
          return [k, numericKeys.includes(k as keyof BlockStyle) ? Number(v) : v];
        })
      ) as Partial<BlockStyle>;
      const next: BlockStyle = { ...(sBy[bp] || {}), ...normalized };
      patchBlock(sel.id, { styleByBp: { ...sBy, [bp]: next } } as any);
    };

    const tabBtn = (t: "content" | "style" | "advanced") =>
      `px-3 py-1.5 text-sm rounded-md border ${editorTab === t ? "border-indigo-500/60 bg-[#121528] text-[#e6e9f4]" : "border-[#2a2f45] bg-[#0c0f1a] text-[#cfd5e6]"
      }`;
    const id = sel.id;
    const row = (children: React.ReactNode) => <div className="grid gap-3">{children}</div>;
    const TabsBar: React.FC = () => (
      <div className="mb-3 flex items-center gap-2">
        {(["content", "style", "advanced"] as const).map((t) => (
          <button
            key={t}
            className={[
              "px-2.5 py-1.5 rounded-md border text-xs",
              editorTab === t
                ? "border-[#6E59F2] bg-[#121528] text-[#e6e9f4]"
                : "border-[#2a2f45] bg-[#0c0f1a] text-[#cfd5e6]"
            ].join(" ")}
            onClick={() => setEditorTab(t)}
          >
            {t === "content" ? "Контент" : t === "style" ? "Стиль" : "Расширенные"}
          </button>
        ))}
      </div>
    );


    // Style tab (по брейкпоинтам)
    const styleByBpNode = (
      <div className="grid gap-3">
        <div className="flex items-center gap-1 text-xs">
          <span className="opacity-70">Устройство:</span>
          <button className={tabBtn("content").replace("text-sm", "text-xs")} onClick={() => setBp("desktop")}>Desktop</button>
          <button className={tabBtn("content").replace("text-sm", "text-xs")} onClick={() => setBp("tablet")}>Tablet</button>
          <button className={tabBtn("content").replace("text-sm", "text-xs")} onClick={() => setBp("mobile")}>Mobile</button>
          <span className="ml-2 opacity-70">({bp})</span>
        </div>

        <div className="grid grid-cols-5 gap-2">
          <Field label="mt"><input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={readNum(sCur.mt)} onChange={(e) => updCur({ mt: e.target.value })} placeholder="px" /></Field>
          <Field label="mb"><input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={readNum(sCur.mb)} onChange={(e) => updCur({ mb: e.target.value })} placeholder="px" /></Field>
          <Field label="pt"><input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={readNum(sCur.pt)} onChange={(e) => updCur({ pt: e.target.value })} placeholder="px" /></Field>
          <Field label="pb"><input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={readNum(sCur.pb)} onChange={(e) => updCur({ pb: e.target.value })} placeholder="px" /></Field>
          <Field label="py"><input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={readNum(sCur.py)} onChange={(e) => updCur({ py: e.target.value })} placeholder="px" /></Field>
        </div>

        <div className="mt-3 text-xs text-[#9aa3b2]">Типографика</div>
        <div className="grid grid-cols-5 gap-2">
          <Field label="fontSize (px)"><input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={readNum(sCur.fs)} onChange={(e) => updCur({ fs: e.target.value })} placeholder="напр. 16" inputMode="numeric" /></Field>
          <Field label="fontWeight">
            <select className="px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={readNum(sCur.fw)} onChange={(e) => updCur({ fw: e.target.value })}>
              <option value=""></option><option value="300">300</option><option value="400">400</option><option value="500">500</option>
              <option value="600">600</option><option value="700">700</option><option value="800">800</option>
            </select>
          </Field>
          <Field label="lineHeight"><input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={readNum(sCur.lh)} onChange={(e) => updCur({ lh: e.target.value })} placeholder="напр. 22" inputMode="numeric" /></Field>
          <Field label="textAlign">
            <select className="px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={sCur.ta || ""} onChange={(e) => updCur({ ta: e.target.value })}>
              <option value=""></option><option value="left">left</option><option value="center">center</option><option value="right">right</option><option value="justify">justify</option>
            </select>
          </Field>
          <div />
        </div>

        <div className="mt-3 text-xs text-[#9aa3b2]">Цвета, границы, тени</div>
        <div className="grid grid-cols-6 gap-2">
          <Field label="textColor"><input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={sCur.tc || ""} onChange={(e) => updCur({ tc: e.target.value })} placeholder="#e6e9f4" autoComplete="off" spellCheck={false} /></Field>
          <Field label="bgColor"><input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={sCur.bg || ""} onChange={(e) => updCur({ bg: e.target.value })} placeholder="#0b0e18" autoComplete="off" spellCheck={false} /></Field>
          <Field label="borderWidth"><input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={readNum(sCur.bw)} onChange={(e) => updCur({ bw: e.target.value })} placeholder="px" inputMode="numeric" /></Field>
          <Field label="borderStyle">
            <select className="px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={sCur.bs || ""} onChange={(e) => updCur({ bs: e.target.value })}>
              <option value=""></option><option value="none">none</option><option value="solid">solid</option><option value="dashed">dashed</option><option value="dotted">dotted</option>
            </select>
          </Field>
          <Field label="borderColor"><input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={sCur.bc || ""} onChange={(e) => updCur({ bc: e.target.value })} placeholder="#2a2f45" autoComplete="off" spellCheck={false} /></Field>
          <Field label="radius (px)"><input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={readNum(sCur.br)} onChange={(e) => updCur({ br: e.target.value })} placeholder="px" inputMode="numeric" /></Field>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <Field label="boxShadow (CSS)"><input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={sCur.sh || ""} onChange={(e) => updCur({ sh: e.target.value })} placeholder="0 4px 16px rgba(0,0,0,.25)" autoComplete="off" spellCheck={false} /></Field>
        </div>
      </div>
    );

    // Контентные формы
    let contentNode: React.ReactNode = null;
    switch (sel.type) {
      case "hero": {
        const b = sel as HeroBlock;
        contentNode = row(
          <>
            <Field label="Заголовок">
              <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={b.title} onChange={(e) => patchBlock(id, { title: e.target.value })} autoComplete="off" spellCheck={false} />
            </Field>
            <Field label="Подзаголовок">
              <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={b.subtitle || ""} onChange={(e) => patchBlock(id, { subtitle: e.target.value })} autoComplete="off" spellCheck={false} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Текст кнопки">
                <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                  value={b.ctaText || ""} onChange={(e) => patchBlock(id, { ctaText: e.target.value })} autoComplete="off" spellCheck={false} />
              </Field>
              <Field label="Ссылка (http/altfs/ipfs/#)">
                <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                  value={b.ctaLink || ""} onChange={(e) => patchBlock(id, { ctaLink: e.target.value })} autoComplete="off" spellCheck={false} />
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
              value={b.text} onChange={(e) => patchBlock(id, { text: e.target.value })} autoComplete="off" spellCheck={false} />
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
                value={b.text} onChange={(e) => patchBlock(id, { text: e.target.value })} autoComplete="off" spellCheck={false} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Уровень">
                <select className="px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
                  value={b.level || "h2"} onChange={(e) => patchBlock(id, { level: e.target.value as any })}>
                  <option value="h2">H2</option><option value="h3">H3</option><option value="h4">H4</option>
                </select>
              </Field>
              <Field label="Выравнивание">
                <select className="px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
                  value={b.align || "left"} onChange={(e) => patchBlock(id, { align: e.target.value as any })}>
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
                value={b.text} onChange={(e) => patchBlock(id, { text: e.target.value })} spellCheck={false} />
            </Field>
            <Field label="Выравнивание">
              <select className="px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
                value={b.align || "left"} onChange={(e) => patchBlock(id, { align: e.target.value as any })}>
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
                value={b.cid} onChange={(e) => patchBlock(id, { cid: e.target.value })} autoComplete="off" spellCheck={false} />
            </Field>
            <Field label="Alt-текст (доступность/SEO)">
              <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                value={b.alt || ""} onChange={(e) => patchBlock(id, { alt: e.target.value })} autoComplete="off" spellCheck={false} />
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
                  value={b.label} onChange={(e) => patchBlock(id, { label: e.target.value })} autoComplete="off" spellCheck={false} />
              </Field>
              <Field label="Ссылка">
                <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                  value={b.href} onChange={(e) => patchBlock(id, { href: e.target.value })} autoComplete="off" spellCheck={false} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Стиль">
                <select className="px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
                  value={b.variant || "primary"} onChange={(e) => patchBlock(id, { variant: e.target.value as any })}>
                  <option value="primary">Primary</option><option value="secondary">Secondary</option>
                </select>
              </Field>
              <Field label="Выравнивание">
                <select className="px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
                  value={b.align || "center"} onChange={(e) => patchBlock(id, { align: e.target.value as any })}>
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
                value={b.title} onChange={(e) => patchBlock(id, { title: e.target.value })} autoComplete="off" spellCheck={false} />
            </Field>
            <Field label="Текст">
              <textarea className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4] min-h-[96px]"
                value={b.text} onChange={(e) => patchBlock(id, { text: e.target.value })} spellCheck={false} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Изображение (CID/URL)">
                <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                  value={b.img} onChange={(e) => patchBlock(id, { img: e.target.value })} autoComplete="off" spellCheck={false} />
              </Field>
              <Field label="Alt">
                <input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
                  value={b.alt} onChange={(e) => patchBlock(id, { alt: e.target.value })} autoComplete="off" spellCheck={false} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Соотношение колонок">
                <select className="px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
                  value={b.ratio} onChange={(e) => patchBlock(id, { ratio: e.target.value as ColsRatio })}>
                  <option value="5-7">5–7</option><option value="6-6">6–6</option><option value="7-5">7–5</option>
                </select>
              </Field>
              <Field label="Порядок (реверс)">
                <select className="px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
                  value={b.reverse ? "1" : "0"} onChange={(e) => patchBlock(id, { reverse: e.target.value === "1" })}>
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
                value={b.title || ""} onChange={(e) => patchBlock(id, { title: e.target.value })} />
            </Field>
            <Field label="Текст секции">
              <textarea className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4] min-h-[72px]"
                value={b.text || ""} onChange={(e) => patchBlock(id, { text: e.target.value })} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Тема">
                <select className="px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={b.theme || "auto"}
                  onChange={(e) => patchBlock(id, { theme: e.target.value as any })}>
                  <option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option>
                </select>
              </Field>
              <Field label="Паддинги">
                <select className="px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={b.pad || "md"}
                  onChange={(e) => patchBlock(id, { pad: e.target.value as any })}>
                  <option value="sm">sm</option><option value="md">md</option><option value="lg">lg</option>
                </select>
              </Field>
              <Field label="Фон">
                <select className="px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]" value={b.bg || "none"}
                  onChange={(e) => patchBlock(id, { bg: e.target.value as any })}>
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
                onChange={(e) => patchBlock(id, { cols: Number(e.target.value) as any })}>
                <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
              </select>
            </Field>
            <div className="grid gap-2">
              {b.items.map((it, i) => (
                <div key={it.id} className="rounded-lg border border-[#2a2f45] p-2 grid gap-2">
                  <div className="text-xs text-[#9aa3b2]">Элемент {i + 1}</div>
                  <input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
                    value={it.src} onChange={(e) => { const items = b.items.slice(); items[i] = { ...items[i], src: e.target.value }; patchBlock(id, { items }); }} placeholder="CID/URL" />
                  <input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
                    value={it.alt || ""} onChange={(e) => { const items = b.items.slice(); items[i] = { ...items[i], alt: e.target.value }; patchBlock(id, { items }); }} placeholder="Alt" />
                  <input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
                    value={it.caption || ""} onChange={(e) => { const items = b.items.slice(); items[i] = { ...items[i], caption: e.target.value }; patchBlock(id, { items }); }} placeholder="Подпись" />
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

    const advancedNode = (
      <div className="grid grid-cols-2 gap-3">
        <Field label="Скрыть блок">
          <button className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#e6e9f4]"
            onClick={() => patchBlock(sel.id, { hidden: !((sel as any).hidden) })}>
            {(sel as any).hidden ? "Показан → Скрыть" : "Скрыт → Показать"}
          </button>
        </Field>
        <Field label="Блокировка">
          <button className="px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2f45] text-[#e6e9f4]"
            onClick={() => patchBlock(sel.id, { locked: !((sel as any).locked) })}>
            {(sel as any).locked ? "Разблокировать" : "Заблокировать"}
          </button>
        </Field>
        <Field label="ID (якорь)">
          <input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
            value={(sel as any).anchorId || ""} onChange={(e) => patchBlock(sel.id, { anchorId: e.target.value } as any)} />
        </Field>
        <Field label="CSS класс">
          <input className="w-full px-2 py-1 rounded bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]"
            value={(sel as any).className || ""} onChange={(e) => patchBlock(sel.id, { className: e.target.value } as any)} />
        </Field>
      </div>
    );

    return (
      <>
        <TabsBar />
        {editorTab === "content" ? contentNode : editorTab === "style" ? styleByBpNode : advancedNode}
      </>
    );
  }, [sel, patchBlock, bp, editorTab]);

  // ── Разметка: слева палитра/навигация, центр канвас, справа свойства+предпросмотр ──
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

  return (
    <div className="h-full grid grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)_420px] xl:grid-cols-[340px_minmax(0,1fr)_480px] gap-4">
      {/* Левая колонка */}
      <div className="grid content-start gap-4">
        <div className="mt-3">
          <Field label="Поиск виджета">
            <input
              className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
              value={elQuery} onChange={(e) => setElQuery(e.target.value)}
              placeholder="Найти: заголовок, кнопка, сетка…" autoComplete="off" spellCheck={false}
            />
          </Field>
        </div>

        <div>
          <div className="text-xs text-[#9aa3b2] mb-2">Планировка</div>
          <div className="grid grid-cols-2 gap-2">
            {layoutFiltered.map(([type, label]) => (
              <button key={type} onClick={() => setDoc(d => ({ ...d, blocks: [...d.blocks, createDefaultBlock(type)] }))}
                className="px-3 py-2 rounded-md border border-[#2a2f45] bg-[#0c0f1a] text-[#e6e9f4] hover:bg-[#121528]">
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs text-[#9aa3b2] mb-2">Базовые</div>
          <div className="grid grid-cols-2 gap-2">
            {basicFiltered.map(([type, label]) => (
              <button key={type} onClick={() => setDoc(d => ({ ...d, blocks: [...d.blocks, createDefaultBlock(type)] }))}
                className="px-3 py-2 rounded-md border border-[#2a2f45] bg-[#0c0f1a] text-[#e6e9f4] hover:bg-[#121528]">
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Навигатор */}
        <div>
          <div className="text-xs text-[#9aa3b2] mb-2">Навигатор</div>
          <Navigator />
        </div>

        {/* Чек-лист качества */}
        <div className="rounded-lg border border-[#2a2f45] p-3">
          <div className="text-xs text-[#9aa3b2] flex items-center justify-between">
            <span>Проверки ({okCount}/{checks.length})</span>
            <button className="px-2 py-0.5 rounded border border-[#2a2f45]" onClick={() => setShowChecklist(v => !v)}>{showChecklist ? "−" : "+"}</button>
          </div>
          {showChecklist && (
            <ul className="mt-2 grid gap-1 text-xs">
              {checks.map(c => (
                <li key={c.id} className={c.ok ? "text-[#9dd79d]" : "text-[#ffb3a8]"}>• {c.text}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Импорт/Экспорт JSON */}
        <div className="grid grid-cols-2 gap-2">
          <button className="px-3 py-2 rounded-md border border-[#2a2f45] bg-[#0f1420] text-[#e6e9f4]" onClick={onExportJson}>Скачать JSON</button>
          <button className="px-3 py-2 rounded-md border border-[#2a2f45] bg-[#0f1420] text-[#e6e9f4]" onClick={onImportJsonClick}>Импорт JSON</button>
          <input ref={importJsonInputRef} className="hidden" type="file" accept="application/json" onChange={onImportJsonChange} />
          <button className="px-3 py-2 rounded-md border border-[#2a2f45] bg-[#0f1420] text-[#e6e9f4]" onClick={resetDoc}>Сбросить</button>
          <button className="px-3 py-2 rounded-md border border-[#2a2f45] bg-[#0f1420] text-[#e6e9f4]" onClick={onOpenLivePreview}>Live-предпросмотр</button>
        </div>
      </div>

      {/* Центральная колонка — Канвас + Палитра (вставка после выбранного) */}
      <div className="md:col-[2] h-full overflow-y-auto">
        <Topbar
          bp={bp}
          onChangeBp={setBp}
          mode={iframeMode}
          onChangeMode={setIframeMode}
          right={
            <div className="flex items-center gap-2">
              <button className="px-3 py-1.5 rounded-md border border-[#2a2f45] bg-[#0f1420] text-[#e6e9f4] hover:border-[#6E59F2]" onClick={onExportSingle}>
                Экспорт HTML
              </button>
              <button className="px-3 py-1.5 rounded-md border border-[#2a2f45] bg-[#0f1420] text-[#e6e9f4] hover:border-[#6E59F2]" onClick={onExportZip}>
                Экспорт ZIP
              </button>
              <label className="ml-2 inline-flex items-center gap-2 text-xs text-[#cfd5e6]">
                <input type="checkbox" className="h-4 w-4 rounded border-[#2a2f45] bg-[#0f1420]" checked={autoPreview} onChange={(e) => setAutoPreview(e.target.checked)} />
                Автопревью
              </label>
            </div>
          }
        />

        <div className="mx-auto w-full max-w-[960px] grid gap-4 p-2">
          {/* Палитра-каркас, вставляет после выбранного */}
          <div className="mb-2">
            <Palette
              onInsert={(type) => {
                const pos = doc.blocks.findIndex((b) => b.id === selId);
                const index = pos >= 0 ? pos + 1 : doc.blocks.length;
                setDoc((d) => {
                  const blocks = [...d.blocks];
                  const clamped = Math.max(0, Math.min(index, blocks.length));
                  const nb = createDefaultBlock(type);
                  blocks.splice(clamped, 0, nb);
                  return { ...d, blocks };
                });
              }}
            />
          </div>

          {/* Канвас */}
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
                {selId === b.id ? previewOf(b) : renderBlockView(b)}
              </div>
            )}
            onReorder={(next) => setDoc((d) => ({ ...d, blocks: next as any }))}
            onInsertAt={(index, type) => {
              setDoc((d) => {
                const blocks = [...d.blocks];
                const clamped = Math.max(0, Math.min(index, blocks.length));
                const nb = createDefaultBlock(type);
                blocks.splice(clamped, 0, nb);
                return { ...d, blocks };
              });
            }}
          />

          <Outline blocks={doc.blocks} selId={selId} onSelect={(id) => setSelId(id)} />
        </div>
      </div>
      <div className="rounded-lg border border-[#2a2f45] p-3 mb-3">
        <div className="text-xs text-[#9aa3b2] mb-2">Редактор блока</div>
        {Editor()}
      </div>
      {/* Правая колонка — Инспектор + мини-предпросмотр */}
      <div className="hidden md:block md:col-[3] h-full overflow-y-auto p-2">
        <div className="rounded-lg border border-[#2a2f45] p-3">
          <div className="text-xs text-[#9aa3b2] mb-2">Инспектор</div>
          <Inspector
            block={selBlock}
            onPatch={(patch) =>
              setDoc((d: any) => ({
                ...d,
                blocks: d.blocks.map((b: any) => (b.id === selId ? { ...b, ...patch } : b)),
              }))
            }
          />
        </div>

        <div className="mt-3 rounded-lg border border-[#2a2f45] p-3">
          <div className="text-xs text-[#9aa3b2] mb-2">Мини-предпросмотр</div>
          <div className="rounded overflow-hidden border border-[#2a2f45]">
            <iframe title="preview" className="w-full h-[360px] bg-[#0b0f17] border-0" sandbox="allow-same-origin" srcDoc={previewHtml || "<!doctype html><html><body style='background:#0b0f17;color:#9aa3b2;font:14px system-ui;display:flex;align-items:center;justify-content:center;height:100%'>Пока пусто…</body></html>"} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button className="px-3 py-1.5 rounded-md border border-[#2a2f45] bg-[#0f1420] text-[#e6e9f4]" onClick={buildPreview} disabled={isBuilding}>
              {isBuilding ? "Сборка…" : "Собрать"}
            </button>
            <button className="px-3 py-1.5 rounded-md border border-[#2a2f45] bg-[#0f1420] text-[#e6e9f4]" onClick={onRefreshLivePreview}>
              В live-вкладку
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
