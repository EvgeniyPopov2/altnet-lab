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
import InspectorTabs from "./SiteBuilder/inspector/InspectorTabs";
import type {
  BlockType,
  HeroBlock,
  H1Block,
  PBlock,
  ImgBlock,
  BtnBlock,
  ColsRatio,
  Cols2Block,
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
  blocks: [],
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
  const allBtnHrefOk = btnBlocks.every(
    (b) => notEmpty(b.href) && (isHttp(b.href) || isHash(b.href) || b.href.startsWith("/"))
  );
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
  // ВРЕМЕННО отключаем автозагрузку черновика из localStorage,
  // чтобы всегда стартовать с DEFAULT_DOC и видеть мастер Flex/Grid.
  return null;
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
  mt?: number;
  mb?: number;
  pt?: number;
  pb?: number;
  py?: number;
  fs?: number;
  fw?: number;
  lh?: number;
  ta?: "left" | "center" | "right" | "justify";
  tc?: string;
  bg?: string;
  bw?: number;
  bc?: string;
  bs?: "none" | "solid" | "dashed" | "dotted";
  br?: number;
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
  const canvasTargetWidth =
  iframeMode === "fit" || iframeMode === "desktop"
    ? null
    : widthByBp[iframeMode as Breakpoint];

  // Выбор блока
  const [selId, setSelId] = useState<string | null>(null);
  const selBlock = useMemo(
    () => doc.blocks.find((b: any) => b.id === selId),
    [doc.blocks, selId]
  );

  // Плавающая панель «Структура» (Navigator как в Elementor)
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);

  // Стартовая позиция и размер плавающей панели «Структура»
  const DEFAULT_OUTLINE_SIZE: { w: number; h: number } = { w: 320, h: 420 };

  const [outlineSize, setOutlineSize] = useState<{ w: number; h: number }>(DEFAULT_OUTLINE_SIZE);
  const [outlinePos, setOutlinePos] = useState<{ x: number; y: number }>({ x: 40, y: 80 });

  const [outlineCursor, setOutlineCursor] = useState<string>("default");
  const EDGE_HIT_SIZE = 8;

  // При каждом открытии плавающей панели «Структура» ставим её справа,
  // на уровне верхней части палитры. После этого позиция живёт только
  // через drag/resize — эффект больше не вмешивается.
  useEffect(() => {
    if (!isOutlineOpen) return;
    if (typeof window === "undefined") return;

    const margin = 24;
    const newX = window.innerWidth - outlineSize.w - margin;
    const x = newX < 16 ? 16 : newX;

    const y = 80; // визуально как ты ставил руками

    setOutlinePos({ x, y });
  }, [isOutlineOpen]);

  // Временное состояние drag для панели «Структура»
  const outlineDragRef = useRef<{
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
  } | null>(null);

  // Временное состояние resize для панели «Структура»
  const outlineResizeRef = useRef<{
    handle: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startLeft: number;
    startTop: number;
  } | null>(null);

  const handleOutlineHeaderMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Запоминаем начальные координаты мышки и панели
    e.preventDefault();
    e.stopPropagation();
    outlineDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: outlinePos.x,
      startTop: outlinePos.y,
    };

    // ВЕШАЕМ ГЛОБАЛЬНЫЕ СЛУШАТЕЛИ
    window.addEventListener("mousemove", handleOutlineMouseMove);
    window.addEventListener("mouseup", handleOutlineMouseUp);
  };

  const handleOutlineResizeMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    handle: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"
  ) => {
    // Запоминаем начальные размеры панели, положение мыши и направление
    e.preventDefault();
    e.stopPropagation();

    // Для отладки — увидим, что клик по ручке долетел
    console.log("[Outline] resize start", handle, e.clientX, e.clientY);

    outlineResizeRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startW: outlineSize.w,
      startH: outlineSize.h,
      startLeft: outlinePos.x,
      startTop: outlinePos.y,
    };

    // ВЕШАЕМ ГЛОБАЛЬНЫЕ СЛУШАТЕЛИ
    window.addEventListener("mousemove", handleOutlineMouseMove);
    window.addEventListener("mouseup", handleOutlineMouseUp);
  };

  const updateOutlineCursor = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;

      const onLeft = x - rect.left <= EDGE_HIT_SIZE;
      const onRight = rect.right - x <= EDGE_HIT_SIZE;
      const onTop = y - rect.top <= EDGE_HIT_SIZE;
      const onBottom = rect.bottom - y <= EDGE_HIT_SIZE;

      let cursor: string | null = null;

      if ((onTop && onLeft) || (onBottom && onRight)) {
        cursor = "nwse-resize";
      } else if ((onTop && onRight) || (onBottom && onLeft)) {
        cursor = "nesw-resize";
      } else if (onLeft || onRight) {
        cursor = "ew-resize";
      } else if (onTop || onBottom) {
        cursor = "ns-resize";
      } else {
        cursor = null;
      }

      setOutlineCursor(cursor || "default");
    },
    [EDGE_HIT_SIZE]
  );

  const handleOutlinePanelMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    const onLeft = x - rect.left <= EDGE_HIT_SIZE;
    const onRight = rect.right - x <= EDGE_HIT_SIZE;
    const onTop = y - rect.top <= EDGE_HIT_SIZE;
    const onBottom = rect.bottom - y <= EDGE_HIT_SIZE;

    let handle: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | null = null;

    if (onTop && onLeft) handle = "nw";
    else if (onTop && onRight) handle = "ne";
    else if (onBottom && onLeft) handle = "sw";
    else if (onBottom && onRight) handle = "se";
    else if (onLeft) handle = "w";
    else if (onRight) handle = "e";
    else if (onTop) handle = "n";
    else if (onBottom) handle = "s";

    // Не по краю — не ресайзим (дадим шапке/контенту жить своей жизнью)
    if (!handle) {
      return;
    }

    // Стартуем ресайз через уже готовый обработчик
    handleOutlineResizeMouseDown(e, handle);
  };

  const handleOutlineMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!outlineDragRef.current && !outlineResizeRef.current) return;
      e.preventDefault();

      const minW = 260;
      const minH = 200;

      // Ресайз панели
      if (outlineResizeRef.current) {
        const { handle, startX, startY, startW, startH, startLeft, startTop } = outlineResizeRef.current;

        // DEBUG: движение мыши во время ресайза
        console.log("[Outline] resize move", handle, e.clientX, e.clientY);

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        let newX = startLeft;
        let newY = startTop;
        let newW = startW;
        let newH = startH;

        // Логика для Горизонтального ресайза (West/East)
        if (handle.includes("e")) {
          newW = Math.max(minW, startW + dx);
        } else if (handle.includes("w")) {
          const potentialW = startW - dx;
          newW = Math.max(minW, potentialW);
          if (newW === minW) {
            newX = startLeft + (startW - minW);
          } else {
            newX = startLeft + dx;
          }
        }

        // Логика для Вертикального ресайза (North/South)
        if (handle.includes("s")) {
          newH = Math.max(minH, startH + dy);
        } else if (handle.includes("n")) {
          const potentialH = startH - dy;
          newH = Math.max(minH, potentialH);
          if (newH === minH) {
            newY = startTop + (startH - minH);
          } else {
            newY = startTop + dy;
          }
        }

        setOutlineSize({ w: newW, h: newH });
        setOutlinePos({ x: newX, y: newY });
      }

      // Перетаскивание панели
      if (outlineDragRef.current) {
        const dx = e.clientX - outlineDragRef.current.startX;
        const dy = e.clientY - outlineDragRef.current.startY;

        setOutlinePos({
          x: outlineDragRef.current.startLeft + dx,
          y: outlineDragRef.current.startTop + dy,
        });
      }
    },
    [setOutlineSize, setOutlinePos] // Добавляем зависимости
  );

  const handleOutlineMouseUp = useCallback(() => {
    // Отпустили мышку — заканчиваем drag и ресайз
    outlineDragRef.current = null;
    outlineResizeRef.current = null;

    // СНИМАЕМ ГЛОБАЛЬНЫЕ СЛУШАТЕЛИ
    window.removeEventListener("mousemove", handleOutlineMouseMove);
    window.removeEventListener("mouseup", handleOutlineMouseUp);
  }, [handleOutlineMouseMove]); // Добавляем зависимость



  // Сворачивание левой панели (как в Elementor)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Табы редактора
  const [editorTab, setEditorTab] = useState<"content" | "style" | "advanced">("content");
  useEffect(() => {
    setEditorTab("content");
  }, [selId]);

  // Поиск по палитре
  const [elQuery, setElQuery] = useState<string>("");

  // Валидация/чеклист
  const checks = useMemo(() => validateDoc(doc), [doc]);
  const okCount = useMemo(() => checks.filter((c) => c.ok).length, [checks]);
  const [showChecklist, setShowChecklist] = useState(false);

  // Мини-предпросмотр (встроенный iframe) — чтобы не было «не прочитан» у переменных
  const [autoPreview, setAutoPreview] = useState<boolean>(true);

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

  // ── Style helpers ──────────────────────────────────────────────────────────
  const resolveStyle = (b: any, cur: Breakpoint): BlockStyle => {
    const base: BlockStyle = (b && b.style) || {};
    const perAll: StyleByBp = (b && b.styleByBp) || {};
    const per: BlockStyle = (perAll && (perAll as any)[cur]) || {};
    return { ...base, ...per };
  };

  const styleInline = useCallback(
    (b: any): React.CSSProperties => {
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
    },
    [bp]
  );

  // ── Превью блока в канвасе (инлайн правка текстов) ─────────────────────────
  const previewOf = useCallback(
    (b: Block) => {
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
                className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border ${
                  bt.variant === "secondary"
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
          return wrapStyled(
            <div className="text-xs text-[#9aa3b2]">
              [Превью для типа «{(b as any).type}» пока нет]
            </div>
          );
      }
    },
    [patchBlock, setSelId, styleInline]
  );

  // Ярлык блока
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

  // ── Документ без скрытых блоков — для экспорта/предпросмотра ───────────────
  const docForBuild = useMemo(
    () => ({ ...doc, blocks: doc.blocks.filter((b) => !(b as any).hidden) }),
    [doc]
  );

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
      try {
        livePreviewChannelRef.current.close();
      } catch {}
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
              return {
                id,
                type: "img",
                cid: String(p.cid ?? p.src ?? ""),
                alt: String(p.alt ?? ""),
              } as ImgBlock;
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
    } catch {}
  }, []);

  // Автосохранение
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    } catch {}
  }, [doc]);

  // ── Навигатор (Outline) ────────────────────────────────────────────────────
  const Navigator = useCallback(
    () => (
      <div className="grid gap-2">
        {doc.blocks.map((b, idx) => (
          <div
            key={b.id}
            className={`group flex items-center justify-between gap-2 rounded-lg border ${
              selId === b.id ? "border-[#6E59F2] bg-[#121528]" : "border-[#2a2f45] bg-[#0c0f1a]"
            } px-2 py-1`}
          >
            <button
              onClick={() => setSelId(b.id)}
              className={`rounded-xl border ${
                selId === b.id ? "border-indigo-500/50 ring-1 ring-indigo-500/30" : "border-[#2a2f45]"
              } bg-[#0c0f1a] p-3 cursor-pointer`}
              title={labelOf(b)}
            >
              <span className="opacity-60 mr-1">#{idx + 1}</span>
              {labelOf(b)}
            </button>
            <div className="flex items-center gap-1">
              <button
                title="Вверх"
                onClick={() => moveBlock(b.id, -1)}
                className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs"
              >
                ↑
              </button>
              <button
                title="Вниз"
                onClick={() => moveBlock(b.id, 1)}
                className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs"
              >
                ↓
              </button>
              <button
                title={(b as any).hidden ? "Показать" : "Скрыть"}
                onClick={() => patchBlock(b.id, { hidden: !(b as any).hidden })}
                className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs"
              >
                {(b as any).hidden ? "👁" : "👁‍🗨"}
              </button>
              <button
                title={(b as any).locked ? "Разблокировать" : "Заблокировать"}
                onClick={() => patchBlock(b.id, { locked: !(b as any).locked })}
                className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs"
              >
                {(b as any).locked ? "🔓" : "🔒"}
              </button>
              <button
                title="Дублировать"
                onClick={() => duplicateBlock(b.id)}
                className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs"
              >
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

  return (
    <div className="relative w-full grid grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] gap-4">
      <button
        type="button"
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-30 flex h-16 w-6 items-center justify-center rounded-r-full border border-l-0 border-[#2a2f45] bg-[#050816] text-xs text-[#cfd5e6] hover:bg-[#0c1020]"
        style={{ left: sidebarCollapsed ? 12 : 280 }}
        onClick={(e) => {
          e.stopPropagation();
          setSidebarCollapsed((v: boolean) => !v);
        }}
      >
        {sidebarCollapsed ? "›" : "‹"}
      </button>
      {/* Левая колонка */}
      <div
        className={
          "grid content-start gap-4 max-h-[calc(100dvh-140px)] overflow-y-auto pr-1 " +
          "rounded-2xl bg-[#050816]/90 border border-[#1f2751] px-3 py-3" +
          (sidebarCollapsed ? " hidden" : "")
        }
      >
        <div className="mt-3">
          <Field label="Поиск виджета">
            <input
              className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
              value={elQuery}
              onChange={(e) => setElQuery(e.target.value)}
              placeholder="Найти: заголовок, кнопка, сетка…"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          {/* Левая панель: если выбран блок — показываем редактор; иначе — палитру */}
          {selBlock ? (
            <>
              <div className="text-xs text-[#9aa3b2] mb-2">Редактор блока</div>
              <InspectorTabs active={editorTab} onChange={(t) => setEditorTab(t)} />
              <Inspector
                block={selBlock}
                onPatch={(patch) =>
                  setDoc((d: any) => ({
                    ...d,
                    blocks: d.blocks.map((b: any) => (b.id === selId ? { ...b, ...patch } : b)),
                  }))
                }
              />
            </>
          ) : (
            <Palette
              onInsert={(type) => {
                const make = createDefaultBlock as (t: any) => any;
                const fresh = make(type as any);
                if (!fresh) return;
                const withId = { ...(fresh as any), id: uid() };

                setDoc((d) => {
                  const idx = selId ? d.blocks.findIndex((b) => b.id === selId) : -1;
                  const next = d.blocks.slice();
                  if (idx >= 0) next.splice(idx + 1, 0, withId);
                  else next.push(withId);
                  return { ...d, blocks: next };
                });

                setSelId(withId.id);
              }}
            />
          )}
        </div>

        {/* Навигатор */}
        {!selBlock && (
          <div>
            <div className="text-xs text-[#9aa3b2] mb-2">Навигатор</div>
            <Navigator />
          </div>
        )}

        {/* Чек-лист качества */}
        <div className="rounded-lg border border-[#2a2f45] p-3">
          <div className="text-xs text-[#9aa3b2] flex items-center justify-between">
            <span>
              Проверки ({okCount}/{checks.length})
            </span>
            <button
              className="px-2 py-0.5 rounded border border-[#2a2f45]"
              onClick={() => setShowChecklist((v) => !v)}
            >
              {showChecklist ? "−" : "+"}
            </button>
          </div>
          {showChecklist && (
            <ul className="mt-2 grid gap-1 text-xs">
              {checks.map((c) => (
                <li key={c.id} className={c.ok ? "text-[#9dd79d]" : "text-[#ffb3a8]"}>
                  • {c.text}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Импорт/Экспорт JSON */}
        <div className="grid grid-cols-2 gap-2">
          <button
            className="px-3 py-2 rounded-md border border-[#2a2f45] bg-[#0f1420] text-[#e6e9f4]"
            onClick={onExportJson}
          >
            Скачать JSON
          </button>
          <button
            className="px-3 py-2 rounded-md border border-[#2a2f45] bg-[#0f1420] text-[#e6e9f4]"
            onClick={onImportJsonClick}
          >
            Импорт JSON
          </button>
          <input
            ref={importJsonInputRef}
            className="hidden"
            type="file"
            accept="application/json"
            onChange={onImportJsonChange}
          />
          <button
            className="px-3 py-2 rounded-md border border-[#2a2f45] bg-[#0f1420] text-[#e6e9f4]"
            onClick={resetDoc}
          >
            Сбросить
          </button>
          <button
            className="px-3 py-2 rounded-md border border-[#2a2f45] bg-[#0f1420] text-[#e6e9f4]"
            onClick={onOpenLivePreview}
          >
            Live-предпросмотр
          </button>
        </div>
      </div>

      {/* Центральная колонка — Канвас + Палитра (вставка после выбранного) */}
      <div
        className={(sidebarCollapsed ? "col-span-2 " : "col-[2] ") + "h-[100dvh] overflow-y-auto relative"}
        onClick={() => setSelId(null)}
      >
        <Topbar
          bp={bp}
          onChangeBp={setBp}
          mode={iframeMode}
          onChangeMode={setIframeMode}
          right={
            <div className="flex items-center gap-3">
              {/* Кнопка открытия панели «Структура» — только на desktop */}
              {bp === "desktop" && (
                <button
                  type="button"
                  className={
                    "inline-flex h-9 w-9 items-center justify-center rounded-md border text-xs " +
                    (isOutlineOpen
                      ? "border-[#6E59F2] bg-[#15192c] text-[#e6e9f4]"
                      : "border-[#2a2f45] bg-[#050816] text-[#cfd5e6] hover:border-[#6E59F2]")
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOutlineOpen((v) => !v);
                  }}
                  title="Структура"
                >
                  {/* Иконка «слои» как в Elementor (три слоя) */}
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    aria-hidden="true"
                  >
                    {/* верхний ромб */}
                    <path
                      d="M12 4L4 8l8 4 8-4-8-4Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinejoin="round"
                    />
                    {/* средний слой */}
                    <path
                      d="M4 12l8 4 8-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinejoin="round"
                    />
                    {/* нижний слой */}
                    <path
                      d="M4 16l8 4 8-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}

              <button
                className="px-3 py-1.5 rounded-md border border-[#2a2f45] bg-[#0f1420] text-[#e6e9f4] hover:border-[#6E59F2]"
                onClick={onExportSingle}
              >
                Экспорт HTML
              </button>
              <button
                className="px-3 py-1.5 rounded-md border border-[#2a2f45] bg-[#0f1420] text-[#e6e9f4] hover:border-[#6E59F2]"
                onClick={onExportZip}
              >
                Экспорт ZIP
              </button>
              <label className="ml-2 inline-flex items-center gap-2 text-xs text-[#cfd5e6]">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[#2a2f45] bg-[#0f1420]"
                  checked={autoPreview}
                  onChange={(e) => setAutoPreview(e.target.checked)}
                />
                Автопревью
              </label>
            </div>
          }
        />

        <div
          className="mx-auto w-full grid gap-4 p-2"
          style={
            canvasTargetWidth
              ? { maxWidth: canvasTargetWidth, width: canvasTargetWidth }
              : undefined
          }
        >
          {/* Палитра-каркас, вставляет после выбранного — скрыта, т.к. есть левая панель */}
          <div className="mb-2 hidden">
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

           {/* Внутренняя сетка: канвас + панель «Структура» справа */}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px] items-start">
            {/* Канвас + структура под ним на узких экранах */}
            <div>
                           {/* Фон канваса (фон сайта), отделённый от темы приложения */}
              <div className="w-full bg-[#020617]">
                <div className="mx-auto max-w-[1140px] px-6 py-8">
                  <div className="rounded-xl border border-dashed border-[#d4d4d8] bg-white">
                <Canvas
                  cols={canvasCols}
                  gapX={canvasGapX}
                  gapY={canvasGapY}
                  blocks={doc.blocks}
                  renderBlock={(b) => {
                    const isSectionish = b.type === "section" || b.type === "hero";
                    const isActive = selId === b.id;

                    const baseClasses =
                      "rounded-xl bg-white p-3 cursor-pointer transition-colors";

                    const stateClasses = isActive
                      ? // активный блок — фиолетовое выделение, как сейчас
                      "border border-[#6E59F2] shadow-[0_0_0_1px_rgba(110,89,242,0.6)]"
                      : isSectionish
                        ? // секции/hero — почти невидимая пунктирная рамка,
                        // проявляется при ховере как у Elementor
                        "border border-dashed border-transparent hover:border-[#d4d4d8] hover:bg-[#f5f3ff]"
                        : // обычные виджеты — тонкая сплошная рамка
                        "border border-[#e5e7eb] hover:border-[#6E59F2]/50";

                    return (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelId(b.id);
                        }}
                        className={`${baseClasses} ${stateClasses}`}
                      >
                        {isActive ? previewOf(b) : renderBlockView(b)}
                      </div>
                    );
                  }}

                  onReorder={(next) => setDoc((d) => ({ ...d, blocks: next as any }))}
                  onInsertAt={(index, type, preset) => {
                    setDoc((d) => {
                      const blocks = [...d.blocks];
                      const clamped = Math.max(0, Math.min(index, blocks.length));
                      const nb = createDefaultBlock(type as BlockType, preset as any);
                      blocks.splice(clamped, 0, nb);
                      return { ...d, blocks };
                    });
                  }}
                />
                  </div>
                </div>
              </div>


              {/* Структура под канвасом на мобильных/узких экранах (tablet/mobile) */}
              {bp !== "desktop" && (
                <div className="mt-4 rounded-2xl border border-[#1f2751] bg-[#050816]/90">
                  <div className="px-3 py-2 border-b border-[#1f2751] text-xs font-medium uppercase tracking-wide text-[#9aa3b2]">
                    Структура
                  </div>
                  <div className="p-3">
                    <Outline blocks={doc.blocks} selId={selId} onSelect={(id) => setSelId(id)} />
                  </div>
                </div>
              )}
            </div>


            {/* Структура справа (десктоп ≥ xl, только когда bp === "desktop") */}
            {bp === "desktop" && (
              <div className="hidden xl:flex flex-col rounded-2xl border border-[#1f2751] bg-[#050816]/90 max-h-[calc(100dvh-160px)]">
                <div className="px-3 py-2 border-b border-[#1f2751] text-xs font-medium uppercase tracking-wide text-[#9aa3b2]">
                  Структура
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  <Outline blocks={doc.blocks} selId={selId} onSelect={(id) => setSelId(id)} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

{/* Плавающая панель «Структура» (Navigator как в Elementor) */}
      {bp === "desktop" && isOutlineOpen && (
        <div
          className="fixed z-40 group rounded-2xl border border-[#1f2751] bg-[#050816]/95 shadow-2xl backdrop-blur-sm"
          style={{
            left: outlinePos.x,
            top: outlinePos.y,
            width: outlineSize.w,
            height: outlineSize.h,
            cursor: outlineCursor,
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseMove={updateOutlineCursor}
          onMouseLeave={() => setOutlineCursor("default")}
          onMouseDown={handleOutlinePanelMouseDown}
        >
          {/* Хедер: название + закрыть, зона для drag */}
          <div
            className="flex items-center justify-between px-3 py-2 border-b border-[#1f2751] cursor-move select-none"
            onMouseDown={handleOutlineHeaderMouseDown}
          >
            <div className="text-xs font-medium uppercase tracking-wide text-[#9aa3b2]">
              Структура
            </div>
            <button
              type="button"
              className="h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-[#15192c] text-[#9aa3b2]"
              onClick={() => setIsOutlineOpen(false)}
            >
              ✕
            </button>
          </div>

           {/* Содержимое панели */}
          <div className="h-[calc(100%-36px)] overflow-y-auto p-3 text-sm">
            <Outline blocks={doc.blocks} selId={selId} onSelect={(id) => setSelId(id)} />
          </div>

        </div>
      )}
    </div>
  );
}
