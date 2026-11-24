import InlineRuns from "./SiteBuilder/blocks/p/InlineRuns";
import {editParagraph} from "./SiteBuilder/inlineText";
import React, { useCallback, useMemo, useRef, useState, useEffect, useReducer } from "react";
import { exportSiteZip, exportSingleHtml, downloadBlob, adaptFromSiteBuilderDoc, unsupportedBlockTypes } from "../builder/exporter";
import { upsertPublishedSite } from "../core/sites/published";
import type { PublishedPage } from "../core/sites/publishedDb";
import { shareStatus, startOnionShare, stopOnionShare, type OnionShareStatus } from "../core/sites/onionShare";
import { pushSecurityEvent } from "../core/security/bus";
import Canvas from "./SiteBuilder/canvas/Canvas";
import Outline from "./SiteBuilder/outline/Outline";
import Palette from "./SiteBuilder/palette/Palette";
import { renderBlockView } from "./SiteBuilder/blocks";
import { createInsertedBlock, editableLegacyLayout } from "./SiteBuilder/registry";
import { spacingStyle } from "./SiteBuilder/boxDimensions";
import { backgroundStyle } from "./SiteBuilder/backgroundStyle";
import { blockCornerStyle } from "./SiteBuilder/blockCorners";
import { blockBorderStyle } from "./SiteBuilder/blockBorders";
import { blockFilterStyle, filterTransition } from "./SiteBuilder/blockFilters";
import { blockClipStyle } from "./SiteBuilder/blockClip";
import { blockShadowStyle } from "./SiteBuilder/blockShadowStyle";
import { advancedLayoutStyle } from "./SiteBuilder/advancedLayoutStyle";
import { transformStyle } from "./SiteBuilder/transforms";
import MediaLibraryButton from "./SiteBuilder/MediaLibraryButton";
import { MediaLibraryContext } from "./SiteBuilder/mediaLibraryContext";
const Inspector = React.lazy(() => import("./SiteBuilder/inspector/Inspector"));
import Field from "./SiteBuilder/ui/Field";
import Topbar from "./SiteBuilder/layout/Topbar";
import type { BlockPatch } from "./SiteBuilder/inspector/patch";
import InspectorTabs from "./SiteBuilder/inspector/InspectorTabs";
import { exportDraft, importDraft, loadDraft, STORAGE_KEY, validateDraft } from "./SiteBuilder/storage";
import { importLegacyDoc } from "./SiteBuilder/legacyImport";
import { getSharedDraftWriter, readIndexedDraft, type SaveStatus } from "./SiteBuilder/draftPersistence";
import { getSharedEditorLease, type LeaseResult } from "./SiteBuilder/editorLease";
import { historyReducer } from "./SiteBuilder/history";
import LayoutCanvas from "./SiteBuilder/layout/LayoutCanvas";
import { cellsOf, copyTree, findBlock, findLocation, insertIntoCell, moveToCell, moveToRoot, removeFromTree, updateBlock } from "./SiteBuilder/layoutTree";
import { textAppearance } from "./SiteBuilder/textAppearance";
import { resolveResponsiveStyle } from "./SiteBuilder/responsiveStyle";
import { gridColumnCount, gridCoveredCells } from "./SiteBuilder/gridLayout";
import { hasBlockedPreviewAssets, previewSafeBlock } from "./SiteBuilder/previewAssets";
import { prepareLocalSite } from "../core/sites/localPreview";
import SpacerView from "./SiteBuilder/blocks/spacer/view";
import ImgView from "./SiteBuilder/blocks/img/view";
import BtnView from "./SiteBuilder/blocks/btn/view";
import "./SiteBuilder/builderChrome.css";
import RevisionPanel from "./SiteBuilder/RevisionPanel";
import PagePanel from "./SiteBuilder/PagePanel";
import ProjectPanel from "./SiteBuilder/ProjectPanel";
import { pagesOf, switchPage } from "./SiteBuilder/pages";
import { activePageForBuild, pagesForBuild } from "./SiteBuilder/siteTemplates";
import { assignedTemplate } from "./SiteBuilder/templateRules";
import { StyleClassesContext } from "./SiteBuilder/styleClassesContext";
import { SiteDataContext } from "./SiteBuilder/siteDataContext";
import LoopGridView from "./SiteBuilder/blocks/loopgrid/view";
import TemplatePanel from "./SiteBuilder/TemplatePanel";
import { exportPagesZip } from "./SiteBuilder/exportPages";
import { exportProject, importProject, parseProject, projectsOf } from "./SiteBuilder/projects";
import type {
  HeroBlock,
  H1Block,
  PBlock,
  ImgBlock,
  BtnBlock,
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

  const desc = doc.description || "";
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
const widthByBp: Record<Breakpoint, number> = { desktop: 1280, tablet: 834, mobile: 390 };
type BlockStyle = {
  transformDuration?: number;
  blockFilterDuration?: number;
  w?: number;
  minh?: number;
  op?: number;
  mt?: number;
  mb?: number;
  ml?: number;
  mr?: number;
  pt?: number;
  pb?: number;
  pl?: number;
  pr?: number;
  py?: number;
  fs?: number;
  fw?: number;
  lh?: number;
  ff?: string;
  ta?: "left" | "center" | "right" | "justify";
  tc?: string;
  bg?: string;
  bw?: number;
  bc?: string;
  bs?: "none" | "solid" | "dashed" | "dotted";
  br?: number;
  sh?: string;
};
function resolveStyle(block: Block, device: Breakpoint): BlockStyle {
  return resolveResponsiveStyle(block.style, block.styleByBp, device);
}

// ─────────────────────────────────────────────────────────────────────────────
// Основной экран
// ─────────────────────────────────────────────────────────────────────────────
export default function SiteBuilder({
  onClose,
  onPublished,
}: {
  onClose?: () => void;
  onPublished?: (url: string) => void;
}) {
  const [draftWriter] = useState(() => {
    try { return getSharedDraftWriter(); } catch { return undefined; }
  });
  const [draftLease] = useState(() => getSharedEditorLease(draftWriter));
  const [leaseStatus, setLeaseStatus] = useState<LeaseResult | "checking">("checking");
  const [leaseAttempt, setLeaseAttempt] = useState(0);
  const [history, dispatchHistory] = useReducer(historyReducer, {
    past: [], current: DEFAULT_DOC, future: [],
  });
  const doc = history.current;
  const currentDocRef = useRef(doc);
  currentDocRef.current = doc;
  const setDoc = useCallback((value: React.SetStateAction<Doc>) => dispatchHistory({ type: "edit", value }), []);
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [draftBlocked, setDraftBlocked] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(draftWriter?.status ?? "failed");
  const [revisionConflict, setRevisionConflict] = useState(false);
  const [importConflict, setImportConflict] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const publishingRef = useRef(false);
  const saveFailed = saveStatus === "failed";

  useEffect(() => draftWriter?.subscribe(setSaveStatus), [draftWriter]);
  useEffect(() => {
    let active = true;
    void draftLease.acquire().then(result => { if (active) setLeaseStatus(result); });
    return () => { active = false; draftLease.release(); };
  }, [draftLease, leaseAttempt]);
  useEffect(() => {
    if (leaseStatus !== "owned" && leaseStatus !== "unsupported") return;
    let active = true;
    const restore = async () => {
      try {
        if (draftWriter?.status === "saving") await draftWriter.waitForIdle();
        const unsaved = draftWriter?.getUnsaved();
        let result = unsaved ? validateDraft(unsaved) : loadDraft(window.localStorage);
        if (result.status === "indexeddb") {
          const raw = await readIndexedDraft();
          result = raw === undefined ? { status: "unavailable" } : validateDraft(JSON.parse(raw));
        }
        if (!active) return;
        if (result.status === "loaded") dispatchHistory({ type: "restore", doc: result.doc });
        else if (result.status !== "empty") throw new Error("Черновик недоступен.");
        setDraftBlocked(false);
      } catch {
        if (active) setDraftBlocked(true);
      } finally {
        if (active) setLoadingDraft(false);
      }
    };
    void restore();
    return () => { active = false; };
  }, [leaseStatus, draftWriter]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, [contenteditable=true]"))) return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        dispatchHistory({ type: event.shiftKey ? "redo" : "undo" });
      } else if (key === "y" && !event.shiftKey) {
        event.preventDefault();
        dispatchHistory({ type: "redo" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Канвас: кол-во колонок и зазоры
  const [canvasCols] = useState<1 | 2 | 3 | 4>(3);
  const [canvasGapX] = useState<number>(16);
  const [canvasGapY] = useState<number>(16);

  // Responsive режим
  const [bp, setBp] = useState<Breakpoint>("desktop");
  const [iframeMode, setIframeMode] = useState<"fit" | Breakpoint>("fit");
  const canvasTargetWidth =
    iframeMode === "fit" || iframeMode === "desktop"
      ? null
      : widthByBp[iframeMode as Breakpoint];

  // Выбор блока
  const [selId, setSelId] = useState<string | null>(null);
  const [targetCell, setTargetCell] = useState<{ parentId: string; cellIndex: number } | null>(null);
  const selBlock = useMemo(
    () => selId ? findBlock(doc.blocks, selId) : undefined,
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

  function toggleOutline() {
    if (!isOutlineOpen) setOutlinePos({ x: Math.max(16, window.innerWidth - outlineSize.w - 24), y: 80 });
    setIsOutlineOpen(!isOutlineOpen);
  }

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.("(max-width: 767px)").matches));
  const [editorTheme, setEditorTheme] = useState<"dark" | "light">(() => {
    try { return localStorage.getItem("altnet.builder.theme") === "light" ? "light" : "dark"; }
    catch { return "dark"; }
  });
  const toggleEditorTheme = () => {
    const next = editorTheme === "dark" ? "light" : "dark";
    setEditorTheme(next);
    try { localStorage.setItem("altnet.builder.theme", next); } catch { /* тема остаётся доступной в текущем сеансе */ }
  };

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
  const autoPreviewRef = useRef(autoPreview);
  autoPreviewRef.current = autoPreview;
  const [previewError, setPreviewError] = useState("");

  type ExportPhase = "cdr" | "build" | "pages";
  const [exportState, setExportState] = useState<{
    format: "html" | "zip" | "car";
    phase: ExportPhase;
    done: number;
    total: number;
  } | null>(null);
  const isExporting = exportState !== null;
  const [exportError, setExportError] = useState("");
  const [carRoot, setCarRoot] = useState("");
  const [carCopyStatus, setCarCopyStatus] = useState("");
  const [onionPanel, setOnionPanel] = useState(false);
  const [onionShare, setOnionShare] = useState<OnionShareStatus | null>(null);
  const [onionError, setOnionError] = useState("");
  const [onionBusy, setOnionBusy] = useState(false);
  const [onionCopyStatus, setOnionCopyStatus] = useState("");
  const onionEpoch = useRef(0);

  useEffect(() => {
    if (!onionPanel) return;
    let running = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const epoch = onionEpoch.current;
      try {
        const status = await shareStatus();
        if (running && epoch === onionEpoch.current) setOnionShare(status);
      } catch {
        if (running && epoch === onionEpoch.current) setOnionShare(null);
      }
      if (running) timer = setTimeout(poll, document.hidden ? 15000 : 5000);
    };
    void poll();
    return () => { running = false; clearTimeout(timer); };
  }, [onionPanel]);

  // Для live-preview (отдельная вкладка)
  const importJsonInputRef = useRef<HTMLInputElement>(null);
  const importProjectInputRef = useRef<HTMLInputElement>(null);
  const livePreviewChannelRef = useRef<BroadcastChannel | null>(null);
  const liveDebounceRef = useRef<number | null>(null);
  const livePreviewSequence = useRef(0);
  const livePreviewReady = useRef(false);
  const livePreviewRunning = useRef(false);
  const livePreviewPending = useRef<{ channel: BroadcastChannel; force: boolean; sequence: number; snapshot: Doc } | null>(null);
  const livePreviewUrls = useRef<string[]>([]);

  // ── Хелперы правки документа ───────────────────────────────────────────────
  const patchBlock = useCallback((id: string, patch: BlockPatch, group?: string) => {
    dispatchHistory({ type: "edit", group, value: (d) => ({ ...d, blocks: updateBlock(d.blocks, id, b => ({ ...b, ...(typeof patch === "function" ? patch(b) : patch) })) }) });
  }, []);

  const removeBlock = useCallback(
    (id: string) => {
      setDoc((d) => ({ ...d, blocks: removeFromTree(d.blocks, id) }));
      if (selId === id) setSelId(null);
    },
    [selId, setDoc]
  );

  const duplicateBlock = useCallback((id: string) => {
    const original = findBlock(doc.blocks, id);
    if (!original) return;
    const copy = copyTree(original, uid);
    setDoc((d) => {
      const location = findLocation(d.blocks, id);
      if (location?.parentId) {
        const blocks = insertIntoCell(d.blocks, location.parentId, location.cellIndex, copy, location.index + 1);
        return blocks === d.blocks ? d : { ...d, blocks };
      }
      const i = d.blocks.findIndex((b) => b.id === id);
      if (i < 0) return d;
      const next = d.blocks.slice();
      next.splice(i + 1, 0, copy);
      return { ...d, blocks: next };
    });
  }, [doc.blocks, setDoc]);

  const moveBlock = useCallback((id: string, dir: -1 | 1) => {
    setDoc((d) => {
      const location = findLocation(d.blocks, id);
      if (location?.parentId) {
        const parent = findBlock(d.blocks, location.parentId);
        const siblings = parent && cellsOf(parent)?.[location.cellIndex];
        if (!siblings || location.index + dir < 0 || location.index + dir >= siblings.length) return d;
        const blocks = moveToCell(d.blocks, id, location.parentId, location.cellIndex, location.index + (dir > 0 ? 2 : -1));
        return blocks === d.blocks ? d : { ...d, blocks };
      }
      const i = d.blocks.findIndex((b) => b.id === id);
      if (i < 0) return d;
      if ("locked" in d.blocks[i] && d.blocks[i].locked) return d;
      const j = i + dir;
      if (j < 0 || j >= d.blocks.length) return d;
      const next = d.blocks.slice();
      const [it] = next.splice(i, 1);
      next.splice(j, 0, it);
      return { ...d, blocks: next };
    });
  }, [setDoc]);

  // ── Style helpers ──────────────────────────────────────────────────────────
  const styleInline = useCallback(
    (b: Block): React.CSSProperties => {
      const s = resolveStyle(b, bp);
      return {
        ...(typeof s.w === "number" && Number.isFinite(s.w) ? { width: `${Math.max(1, Math.min(200, s.w))}%` } : {}),
        ...(typeof s.minh === "number" && Number.isFinite(s.minh) ? { minHeight: Math.max(0, Math.min(1200, s.minh)) } : {}),
        ...(typeof s.op === "number" && Number.isFinite(s.op) ? { opacity: Math.max(0, Math.min(100, s.op)) / 100 } : {}),
        ...spacingStyle(s),
        ...backgroundStyle(s),
        ...advancedLayoutStyle(s),
        ...transformStyle(s),
        ...blockFilterStyle(s),
        ...blockClipStyle(s),
        ...filterTransition(s),

        ...(s.fs != null ? { fontSize: Number(s.fs) } : {}),
        ...(s.ff && ["system-ui", "sans-serif", "serif", "monospace", "Arial", "Georgia", "Verdana", "Tahoma"].includes(s.ff) ? { fontFamily: s.ff } : {}),
        ...(s.fw != null ? { fontWeight: Number(s.fw) } : {}),
        ...(s.lh != null ? { lineHeight: Number(s.lh) } : {}),
        ...(s.ta ? { textAlign: s.ta } : {}),

        ...(s.tc ? { color: s.tc } : {}),
        ...(s.bg ? { backgroundColor: s.bg } : {}),

        ...(s.bw != null ? { borderWidth: Number(s.bw) } : {}),
        ...blockBorderStyle(s),
        ...(s.bs ? { borderStyle: s.bs } : {}),
        ...(s.bc ? { borderColor: s.bc } : {}),
        ...(s.br != null ? { borderRadius: Number(s.br) } : {}),
        ...blockCornerStyle(s),

        ...(s.sh ? { boxShadow: s.sh } : {}),
        ...blockShadowStyle(s),
      };
    },
    [bp]
  );

  // ── Превью блока в канвасе (инлайн правка текстов) ─────────────────────────
  const previewOf = useCallback(
    (b: Block) => {
      const wrapStyled = (children: React.ReactNode, pad = true) => (
        <div
          className={pad ? "p-3" : ""}
        >
          {children}
        </div>
      );

      if (b.hidden) {
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
              className="text-2xl font-semibold text-[#0b1022]"
              style={{ textAlign: align }}
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
              className="text-sm leading-6 text-[#2b3050] whitespace-pre-wrap"
              style={{ textAlign: align }}
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => patchBlock(b.id, editParagraph(p.text,p.richRuns,e.currentTarget.innerText))}
              onDoubleClick={() => setSelId(b.id)}
            >
              <InlineRuns text={p.text} runs={p.richRuns}/>
            </div>
          );
        }

        case "divider":
          return wrapStyled(renderBlockView(b), false);

        case "spacer":
          return wrapStyled(renderBlockView(b), false);

        default:
          return wrapStyled(renderBlockView(b));
      }
    },
    [patchBlock, setSelId]
  );

  // Ярлык блока
  const labelOf = useCallback((b: Block): string => {
    switch (b.type) {
      case "hero":
        return "Hero";
      case "h1":
        return "Заголовок (H1)";
      case "heading":
        return `Заголовок (${b.level?.toUpperCase() || "H2"})`;
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
        return String(b.type);
    }
  }, []);

  // ── Документ без скрытых блоков — для экспорта/предпросмотра ───────────────
  const docForBuild = useMemo(
    () => activePageForBuild(doc),
    [doc]
  );
  const previewBlocks = useMemo(() => {
    const prepared = new Map<string,Block>();
    function index(blocks:Block[]) { for (const block of blocks) { prepared.set(block.id,block); for(const cell of cellsOf(block)??[]) index(cell); } }
    index(docForBuild.blocks);
    const result = new WeakMap<Block,Block>();
    function pair(blocks:Block[]) { for (const block of blocks) { const bound=prepared.get(block.id); if(bound)result.set(block,bound); for(const cell of cellsOf(block)??[]) pair(cell); } }
    pair(doc.blocks);
    return result;
  }, [docForBuild.blocks,doc.blocks]);
  const siteData = useMemo(() => {
    const ws=pagesOf(doc), fields=new Set<string>(Object.keys(doc.entry?.fields??{}));
    for(const page of ws.pages) for(const key of Object.keys(page.document?.entry?.fields??{})) fields.add(key);
    return {templates:ws.pages.filter(page=>page.template?.kind==="section").map(page=>({id:page.id,name:page.id===ws.activeId?doc.title:page.document?.title??""})),fields:[...fields].sort()};
  }, [doc]);
  const docForBuildRef = useRef(docForBuild);
  docForBuildRef.current = docForBuild;
  const unsupportedTypes = useMemo(() => unsupportedBlockTypes(adaptFromSiteBuilderDoc(docForBuild)), [docForBuild]);
  const blockedPreviewAssets = useMemo(() => hasBlockedPreviewAssets(doc.blocks), [doc.blocks]);

  // ── Экспорт / импорт / live-preview ────────────────────────────────────────
  const runExport = useCallback(
    async (format: "zip" | "html") => {
      if (isExporting) return;

      const model = adaptFromSiteBuilderDoc(docForBuild);
      setExportError("");
      setExportState({ format, phase: "cdr", done: 0, total: 0 });

      try {
        const blob =
          format === "zip"
            ? (doc.sitePages?.pages.length ?? 1) > 1
              ? await exportPagesZip(doc, (done, total) => setExportState({ format: "zip", phase: "pages", done, total }))
              : await exportSiteZip(model, {
                bundleAssets: true,
                onProgress: (done, total) => setExportState({ format: "zip", phase: "cdr", done, total }),
              })
            : await exportSingleHtml(model, {
                bundleAssets: true,
                onProgress: (done, total) => setExportState({ format: "html", phase: "cdr", done, total }),
              });

        setExportState((prev) => (prev ? { ...prev, phase: "build" } : prev));

        const ext = format === "zip" ? "zip" : "html";
        downloadBlob(blob, prettyFileName(doc.title || "site", ext));

        pushSecurityEvent({
          severity: "info",
          code: "SITE_EXPORT_DONE",
          title: `Экспорт ${format === "zip" ? "ZIP" : "HTML"} завершён`,
          message: "Файл сохранён на устройство.",
        });
      } catch (error) {
        setExportError(error instanceof Error ? error.message : "Не удалось подготовить экспорт.");
        pushSecurityEvent({
          severity: "warning",
          code: "SITE_EXPORT_FAILED",
          title: `Экспорт ${format === "zip" ? "ZIP" : "HTML"} не выполнен`,
          message: "Попробуйте ещё раз. Если ошибка повторяется — проверьте входные данные блоков.",
        });
      } finally {
        setExportState(null);
      }
    },
    [doc, docForBuild, isExporting]
  );

  const onExportZip = useCallback(async () => {
    await runExport("zip");
  }, [runExport]);

  const onExportSingle = useCallback(async () => {
    await runExport("html");
  }, [runExport]);

  const onExportCar = useCallback(async (mode: "download" | "share") => {
    if (isExporting || publishingRef.current) return;
    if (mode === "share" && onionShare?.active) return;
    setExportError("");
    setOnionError("");
    setCarRoot("");
    setCarCopyStatus("");
    setExportState({format:"car",phase:"pages",done:0,total:0});
    try {
      const entries = pagesForBuild(doc);
      if (entries.length < 1 || entries.length > 500) throw new Error("Недопустимое число страниц сайта.");
      const {createSitePackage,verifySitePackage,SITE_MAX_PAGE_BYTES,SITE_MAX_TOTAL_BYTES} = await import("../core/sites/ipfsSitePackage");
      const pages: PublishedPage[] = [];
      let totalBytes = 0;
      for (const [index, entry] of entries.entries()) {
        const model = adaptFromSiteBuilderDoc(entry.document);
        const unsupported = unsupportedBlockTypes(model);
        if (unsupported.length) throw new Error(`Страница «${entry.document.title}»: неподдерживаемые виджеты ${unsupported.join(", ")}.`);
        const blob = await exportSingleHtml(model, {bundleAssets:true, restrictExternalMedia:true, deterministic:true});
        totalBytes += blob.size;
        if (blob.size > SITE_MAX_PAGE_BYTES || totalBytes > SITE_MAX_TOTAL_BYTES) throw new Error("Сайт превышает допустимый размер пакета.");
        const html = await blob.text();
        pages.push({path:entry.path,title:entry.document.title,html});
        setExportState({format:"car",phase:"pages",done:index+1,total:entries.length});
      }
      setExportState({format:"car",phase:"build",done:0,total:0});
      const result = await createSitePackage(doc.title || "Сайт", pages);
      await verifySitePackage(result.car, result.root);
      if (mode === "download") {
        downloadBlob(new Blob([new Uint8Array(result.car).buffer], {type:"application/vnd.ipld.car"}), prettyFileName(doc.title || "site", "car"));
        setCarRoot(result.root);
      } else {
        onionEpoch.current++;
        const status = await startOnionShare(result.root, result.car);
        onionEpoch.current++;
        setOnionShare(status);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось создать пакет сайта.";
      if (mode === "share") setOnionError(message);
      else setExportError(message);
    } finally { setExportState(null); }
  }, [doc,isExporting,onionShare]);

  const onStopOnionShare = useCallback(async () => {
    if (onionBusy) return;
    setOnionBusy(true);
    setOnionError("");
    onionEpoch.current++;
    try {
      const status = await stopOnionShare();
      onionEpoch.current++;
      setOnionShare(status);
    } catch (error) {
      setOnionError(error instanceof Error ? error.message : "Не удалось остановить раздачу.");
    } finally { setOnionBusy(false); }
  }, [onionBusy]);

  const onPublishAlt = useCallback(async () => {
    if (isExporting || publishingRef.current) return;
    publishingRef.current = true;
    setPublishing(true);
    setPublishError("");
    try {
      const sitePages = pagesForBuild(doc);
      for (const page of sitePages) {
        const unsupported = unsupportedBlockTypes(adaptFromSiteBuilderDoc(page.document));
        if (unsupported.length) throw new Error(`Страница «${page.document.title}»: неподдерживаемые виджеты ${unsupported.join(", ")}.`);
      }
      const pages: PublishedPage[] | undefined = sitePages.length > 1 ? [] : undefined;
      if (pages) {
        for (const page of sitePages) {
          const model = adaptFromSiteBuilderDoc(page.document);
          const blob = await exportSingleHtml(model, { bundleAssets: true, restrictExternalMedia: true });
          pages.push({ path: page.path, title: page.document.title, html: await blob.text() });
        }
      }
      const home = sitePages.find(page => page.path === "index.html")!.document;
      const homepage = pages?.find(page => page.path === "index.html");
      const html = homepage?.html ?? await (await exportSingleHtml(adaptFromSiteBuilderDoc(home), { bundleAssets: true, restrictExternalMedia: true })).text();

      const meta = await upsertPublishedSite({
        title: home.title || "site",
        html,
        pages,
      });
      const url = `alt://site/${meta.slug}`;

      pushSecurityEvent({
        severity: "info",
        code: "SITE_PUBLISHED",
        title: "Сайт опубликован локально",
        message: `Сайт доступен только на этом устройстве. Сетевая публикация ещё не подключена. Адрес: ${url}`,
        actions: [
          {
            label: "Открыть в .alt",
            kind: "primary",
            onClick: () => onPublished?.(url),
          },
          {
            label: "Скопировать локальный адрес",
            kind: "secondary",
            onClick: async () => {
              try {
                await navigator.clipboard.writeText(url);
              } catch {
                pushSecurityEvent({ severity: "warning", code: "SITE_COPY_FAILED", title: "Не удалось скопировать адрес", message: `Скопируйте адрес вручную: ${url}` });
              }
            },
          },
        ],
      });

      // UX: после публикации сразу открыть в .alt-браузере (если контекст передан)
      onPublished?.(url);
    } catch (error) {
      setPublishError(`Публикация не сохранена. ${error instanceof Error && error.message ? error.message : "Проверьте доступность и свободное место хранилища браузера и повторите попытку."}`);
      pushSecurityEvent({
        severity: "warning",
        code: "SITE_PUBLISH_FAILED",
        title: "Не удалось опубликовать",
        message: "Проверьте доступность и свободное место хранилища браузера и повторите попытку.",
      });
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  }, [doc, isExporting, onPublished]);


  const exportPhaseLabel = exportState?.phase === "cdr"
    ? `CDR: ${exportState.done}/${exportState.total}`
    : exportState?.phase === "pages"
      ? `Страницы: ${exportState.done}/${exportState.total}`
    : exportState?.phase === "build"
      ? "Сборка файла…"
      : "";

  const exportFormatLabel = exportState?.format === "zip" ? "ZIP" : exportState?.format === "car" ? "CAR" : "HTML";

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
  <div id="viewport"><iframe id="stage" sandbox="allow-scripts"></iframe></div>
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
          stage.srcdoc = e.data.html;
        } else if(e.data.type === "width"){ var m = e.data.mode; applyWidth(String(m)); }
      };
      ch.postMessage({type:"ready"});
    })();
  </script>
</body></html>`;

  const sendLivePreview = useCallback(async (channel: BroadcastChannel, force: boolean) => {
    livePreviewPending.current = { channel, force, sequence: ++livePreviewSequence.current, snapshot: docForBuildRef.current };
    if (livePreviewRunning.current) return;
    livePreviewRunning.current = true;
    try {
      while (livePreviewPending.current) {
        const job = livePreviewPending.current;
        livePreviewPending.current = null;
        try {
          const model = adaptFromSiteBuilderDoc(job.snapshot);
          const blob = await exportSingleHtml(model, { bundleAssets: true, restrictExternalMedia: true });
          const html = await prepareLocalSite(await blob.text());
          if (job.sequence !== livePreviewSequence.current || job.channel !== livePreviewChannelRef.current || (!job.force && !autoPreviewRef.current)) continue;
          job.channel.postMessage({ type: "html", html });
          livePreviewReady.current = true;
          setPreviewError("");
        } catch {
          if (job.sequence === livePreviewSequence.current && job.channel === livePreviewChannelRef.current) setPreviewError("Не удалось обновить предпросмотр. Проверьте содержимое страницы и откройте его повторно.");
        }
      }
    } finally { livePreviewRunning.current = false; }
  }, []);

  const onOpenLivePreview = useCallback(() => {
    const id = `s${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    livePreviewSequence.current++;
    livePreviewReady.current = false;
    livePreviewPending.current = null;
    if (livePreviewChannelRef.current) {
      try {
        livePreviewChannelRef.current.close();
      } catch { /* Канал предыдущего окна уже закрыт. */ }
    }
    try {
      const channel = new BroadcastChannel(`altnet_live_preview:${id}`);
      livePreviewChannelRef.current = channel;
      channel.onmessage = event => { if (event.data?.type === "ready") void sendLivePreview(channel, true); };
      const shellBlob = new Blob([buildLiveShellHtml(id)], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(shellBlob);
      for (const previous of livePreviewUrls.current) URL.revokeObjectURL(previous);
      livePreviewUrls.current = [];
      livePreviewUrls.current.push(url);
      window.open(url, "_blank", "noopener,noreferrer");
      setPreviewError("");
    } catch {
      livePreviewChannelRef.current?.close();
      livePreviewChannelRef.current = null;
      setPreviewError("Не удалось открыть предпросмотр. Проверьте поддержку браузера и разрешение на открытие окон.");
    }
  }, [sendLivePreview]);

  // Авто-обновление live-вкладки при изменениях
  useEffect(() => {
    livePreviewSequence.current++;
    livePreviewPending.current = null;
    if (!livePreviewChannelRef.current) return;
    if (liveDebounceRef.current) {
      window.clearTimeout(liveDebounceRef.current);
    }
    const channel = livePreviewChannelRef.current;
    if (autoPreview || !livePreviewReady.current) liveDebounceRef.current = window.setTimeout(() => { void sendLivePreview(channel, !livePreviewReady.current); }, 400);
    return () => {
      if (liveDebounceRef.current) {
        window.clearTimeout(liveDebounceRef.current);
        liveDebounceRef.current = null;
      }
    };
  }, [docForBuild, autoPreview, sendLivePreview]);

  useEffect(() => () => {
    livePreviewSequence.current++;
    livePreviewPending.current = null;
    livePreviewChannelRef.current?.close();
    livePreviewChannelRef.current = null;
    for (const url of livePreviewUrls.current) URL.revokeObjectURL(url);
    livePreviewUrls.current = [];
  }, []);

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
    const expected = currentDocRef.current;

    try {
      const text = await f.text();
      const data = JSON.parse(text);

      let importedDoc: Doc;
      if (data?.format === "altnet.sitebuilder.document") {
        const imported = importDraft(data);
        if (imported.status !== "loaded") throw new Error("Версия или содержимое документа не поддерживаются.");
        importedDoc = imported.doc;
      } else {
        importedDoc = importLegacyDoc(data);
      }
      if (currentDocRef.current !== expected) { setImportConflict(true); return; }
      if (!confirm("Импортировать JSON и заменить все текущие проекты и страницы?")) return;
      if (currentDocRef.current !== expected) { setImportConflict(true); return; }
      setImportConflict(false);
      setDoc(current => current === expected ? importedDoc : current);
    } catch (err) {
      alert("Не удалось импортировать JSON: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const onExportJson = useCallback(() => {
    const blob = new Blob([exportDraft(doc)], { type: "application/json" });
    const fname = prettyFileName(doc.title || "site", "json");
    downloadBlob(blob, fname);
  }, [doc]);

  const onExportProject = useCallback(() => {
    const workspace = projectsOf(doc);
    const name = workspace.projects.find(project => project.id === workspace.activeId)?.name || "project";
    downloadBlob(new Blob([exportProject(doc)], { type: "application/json" }), prettyFileName(name, "json"));
  }, [doc]);

  const onImportProjectChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const expected = currentDocRef.current;
    try {
      const project = parseProject(JSON.parse(await file.text()));
      if (currentDocRef.current !== expected) { setImportConflict(true); return; }
      const updated = importProject(expected, project);
      setImportConflict(false);
      setDoc(current => current === expected ? updated : current);
      setSelId(null); setTargetCell(null);
    } catch (error) {
      alert("Не удалось импортировать проект: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  const resetDoc = useCallback(() => {
    if (!draftBlocked) {
      if (!window.confirm("Сбросить текущую страницу? Остальные страницы сохранятся. Действие можно отменить в текущей сессии.")) return;
      setDoc(current => ({ ...DEFAULT_DOC, ...(current.mediaLibrary ? { mediaLibrary: current.mediaLibrary } : {}), ...(current.sitePages ? { sitePages: current.sitePages } : {}), ...(current.siteProjects ? { siteProjects: current.siteProjects } : {}) }));
      setSelId(null); setTargetCell(null);
      return;
    }
    if (!window.confirm("Заменить недоступный черновик новым документом? Все сохранённые в нём проекты и страницы будут заменены.")) return;
    draftWriter?.invalidate();
    setDoc(DEFAULT_DOC);
    try {
      localStorage.removeItem(STORAGE_KEY);
      setDraftBlocked(false);
    } catch {
      setSaveStatus("failed");
    }
  }, [draftWriter, setDoc, draftBlocked]);

  // Автосохранение
  useEffect(() => {
    if (draftBlocked || loadingDraft || (leaseStatus !== "owned" && leaseStatus !== "unsupported")) return;
    if (draftWriter) draftWriter.save(doc);
    else setSaveStatus("failed");
  }, [doc, draftBlocked, loadingDraft, draftWriter, leaseStatus]);

  // ── Навигатор (Outline) ────────────────────────────────────────────────────
  const Navigator = useCallback(
    () => {
      const renderChildren = (parent: Block): React.ReactNode => {
        const cells = cellsOf(parent);
        if (!cells) return null;
        const covered = parent.type === "grid" ? gridCoveredCells(parent) : new Set<number>();
        const columns = parent.type === "grid" ? gridColumnCount(parent) : cells.length;
        return cells.map((cell, index) => {
        if (covered.has(index)) return null;
        const previous = Array.from({ length: index }, (_, i) => i).reverse().find(i => !covered.has(i));
        const next = Array.from({ length: cells.length - index - 1 }, (_, i) => i + index + 1).find(i => !covered.has(i));
        return (
        <div key={index} className="ml-3 border-l border-[#57516c] pl-2" data-navigator-cell={`${parent.id}:${index}`}>
          <div className="my-1 text-xs text-[#9aa3b2]">{parent.type === "grid" ? `Строка ${Math.floor(index / columns) + 1}, колонка ${index % columns + 1}` : `Колонка ${index + 1}`}</div>
          {cell.map(child => <div key={child.id}>
            <div className="flex min-w-0 flex-wrap items-center gap-1 rounded border border-[#2a2f45] bg-[#0c0f1a] p-1" data-navigator-block={child.id}>
              <button type="button" onClick={() => { setTargetCell(null); setSelId(child.id); }} className="min-w-0 flex-auto basis-16 truncate text-left text-xs" title={labelOf(child)}>{labelOf(child)}</button>
              <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
              <button type="button" title="В предыдущую колонку" aria-label="В предыдущую колонку" disabled={previous === undefined} onClick={() => { if (previous !== undefined) setDoc(d => ({ ...d, blocks: moveToCell(d.blocks, child.id, parent.id, previous) })); }}>←</button>
              <button type="button" title="В следующую колонку" aria-label="В следующую колонку" disabled={next === undefined} onClick={() => { if (next !== undefined) setDoc(d => ({ ...d, blocks: moveToCell(d.blocks, child.id, parent.id, next) })); }}>→</button>
              <button type="button" title="Вверх" aria-label="Вверх" onClick={() => moveBlock(child.id, -1)}>↑</button>
              <button type="button" title="Вниз" aria-label="Вниз" onClick={() => moveBlock(child.id, 1)}>↓</button>
              <button type="button" title="В конец страницы" aria-label="В конец страницы" onClick={() => setDoc(d => ({ ...d, blocks: moveToRoot(d.blocks, child.id, d.blocks.length) }))}>⇱</button>
              <button type="button" title={child.hidden ? "Показать" : "Скрыть"} onClick={() => patchBlock(child.id, { hidden: !child.hidden })}>{child.hidden ? "◉" : "◌"}</button>
              <button type="button" title="Дублировать" onClick={() => duplicateBlock(child.id)}>⧉</button>
              <button type="button" title="Удалить" disabled={child.locked} onClick={() => removeBlock(child.id)}>×</button>
              </div>
            </div>
            {renderChildren(child)}
          </div>)}
        </div>
        ); });
      };
      return (
      <div className="grid gap-2">
        {doc.blocks.map((b, idx) => (
          <div key={b.id}>
          <div
            className={`group flex min-w-0 flex-wrap items-center gap-1 rounded-lg border ${selId === b.id ? "border-[#6E59F2] bg-[#121528]" : "border-[#2a2f45] bg-[#0c0f1a]"
              } px-2 py-1`}
          >
            <button
              onClick={() => setSelId(b.id)}
              className={`min-w-0 flex-auto basis-16 truncate rounded-xl border text-left text-xs ${selId === b.id ? "border-indigo-500/50 ring-1 ring-indigo-500/30" : "border-[#2a2f45]"
                } bg-[#0c0f1a] px-2 py-2 cursor-pointer`}
              title={labelOf(b)}
            >
              <span className="opacity-60 mr-1">#{idx + 1}</span>
              {labelOf(b)}
            </button>
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
              <button
                title="Вверх"
                aria-label="Вверх"
                onClick={() => moveBlock(b.id, -1)}
                className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs"
              >
                ↑
              </button>
              <button
                title="Вниз"
                aria-label="Вниз"
                onClick={() => moveBlock(b.id, 1)}
                className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs"
              >
                ↓
              </button>
              <button
                title={b.hidden ? "Показать" : "Скрыть"}
                aria-label={b.hidden ? "Показать" : "Скрыть"}
                onClick={() => patchBlock(b.id, { hidden: !b.hidden })}
                className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs"
              >
                {b.hidden ? "👁" : "👁‍🗨"}
              </button>
              <button
                title={b.locked ? "Разблокировать" : "Заблокировать"}
                aria-label={b.locked ? "Разблокировать" : "Заблокировать"}
                onClick={() => patchBlock(b.id, { locked: !b.locked })}
                className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs"
              >
                {b.locked ? "🔓" : "🔒"}
              </button>
              <button
                title="Дублировать"
                aria-label="Дублировать"
                onClick={() => duplicateBlock(b.id)}
                className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs"
              >
                ⧉
              </button>
              <button
                title="Удалить"
                aria-label="Удалить"
                onClick={() => removeBlock(b.id)}
                className="px-1 py-0.5 rounded border border-[#2a2f45] text-xs text-[#ffb3a8]"
              >
                🗑
              </button>
            </div>
          </div>
          {renderChildren(b)}
          </div>
        ))}
      </div>
    ); },
    [doc.blocks, selId, labelOf, moveBlock, patchBlock, duplicateBlock, removeBlock, setDoc]
  );

  function renderEditorContent(block: Block, selected: boolean): React.ReactNode {
    if (block.type === "loopgrid") return <LoopGridView block={block} device={bp} render={child => renderEditorBlock(child,false)} />;
    if (block.type === "img") return <ImgView block={block} device={bp} />;
    if (block.type === "btn") return <BtnView block={block} device={bp} accent={doc.theme?.accent} />;
    if (block.type === "spacer") return <SpacerView block={block} device={bp} />;
    if (block.type === "shortcode") return <div className="rounded border border-amber-400/50 bg-amber-50 p-3 text-xs text-amber-900">Внешнее встраивание не загружается до подключения проверенного маршрута.</div>;
    if ((block.type === "grid" || block.type === "section" || block.type === "container" || block.type === "offcanvas") && cellsOf(block)) {
      return <LayoutCanvas block={block} device={bp} selectedId={selId}
        onSelect={id => { setTargetCell(null); setSelId(id); if (window.matchMedia?.("(max-width: 767px)").matches) setSidebarCollapsed(false); }}
        onChooseCell={(parentId, cellIndex) => { setSelId(null); setTargetCell({ parentId, cellIndex }); if (window.matchMedia?.("(max-width: 767px)").matches) setSidebarCollapsed(false); }}
        onInsert={(parentId, cellIndex, type, preset, at) => {
          const child = createInsertedBlock(type, preset);
          setDoc(d => ({ ...d, blocks: insertIntoCell(d.blocks, parentId, cellIndex, child, at) }));
          setTargetCell(null); setSelId(child.id);
        }}
        onMove={(id, parentId, cellIndex, at) => setDoc(d => ({ ...d, blocks: moveToCell(d.blocks, id, parentId, cellIndex, at) }))}
        onRemove={removeBlock}
        renderChild={child => renderEditorBlock(child, child.id === selId)} />;
    }
    if (block.type === "offcanvas" && !cellsOf(block)) return <>{selected ? previewOf(block) : renderBlockView(block)}
      <button type="button" className="m-2 rounded border border-[#6E59F2] px-3 py-1 text-xs text-[#5140ad]"
        onClick={event => { event.stopPropagation(); patchBlock(block.id, { layoutPreset: [1], layoutCells: [[]] }); }}>
        Добавить вложенные виджеты в панель
      </button></>;
    if (block.type === "grid" || block.type === "section" || block.type === "container") {
      return <>{selected ? previewOf(block) : renderBlockView(block)}
        <button type="button" className="m-2 rounded border border-[#6E59F2] px-3 py-1 text-xs text-[#5140ad]"
          onClick={event => { event.stopPropagation(); patchBlock(block.id, editableLegacyLayout(block)); }}>
          {block.type === "container" ? "Сделать контейнер редактируемым" : "Сделать ячейки редактируемыми"}
        </button></>;
    }
    return selected ? previewOf(block) : renderBlockView(block);
  }

  function renderEditorBlock(source: Block, selected: boolean): React.ReactNode {
    const block = previewBlocks.get(source) ?? source;
    const typographic = ["h1", "heading", "p", "btn"].includes(block.type);
    const styles = resolveStyle(block, bp);
    const classes = typographic ? (["ff", "fs", "fw", "lh", "tc", "ta"] as const).filter(key => styles[key] != null).map(key => `editor-typo-${key}`).join(" ") : "";
    const text = typographic ? textAppearance(styles) : textAppearance({});
    const vars = Object.fromEntries(Object.entries(text.normal).map(([k,v]) => ["--sb-type-" + k, v]));
    const hoverTransform = transformStyle(styles, true);
    const hoverFilter = blockFilterStyle(styles, true);
    for (const [key, value] of Object.entries(hoverTransform)) vars["--sb-hover-" + key] = value;
    if (hoverFilter.filter) vars["--sb-hover-filter"] = hoverFilter.filter;
    if (text.hover.color) vars["--sb-type-hover-color"] = text.hover.color;
    const appearanceClasses = Object.keys(text.normal).map(k => "sb-type-" + k).join(" ") + (text.hover.color ? " sb-type-hover-color" : "");
    const hiddenOnDevice = block.hideOn?.[bp] === true;
    return <div data-styled-block={block.id} className={`relative ${classes} ${appearanceClasses} ${hoverTransform.transform ? "sb-hover-transform" : ""} ${hoverTransform.transformOrigin ? "sb-hover-origin" : ""} ${hoverFilter.filter ? "sb-filter-hover" : ""} ${styles.transformDuration !== undefined || styles.blockFilterDuration !== undefined ? "sb-transform-duration" : ""}`} style={{ ...styleInline(block), ...vars, ...(hiddenOnDevice ? { opacity: 0.5 } : {}) }}
      onClickCapture={event => { if (event.target instanceof Element && event.target.closest("a")) event.preventDefault(); }}
      onSubmitCapture={event => event.preventDefault()}>{hiddenOnDevice && <span className="absolute right-1 top-1 z-10 rounded bg-[#312767] px-2 py-1 text-xs text-white">Скрыт на этом экране</span>}{renderEditorContent(previewSafeBlock(block), selected && !block.dynamic)}</div>;
  }

  if (leaseStatus === "checking") return <div role="status" className="p-4 text-sm text-[#e6e9f4]">Проверяем доступ к черновику…</div>;
  if (leaseStatus === "busy") return <div role="alert" className="grid gap-3 p-4 text-sm text-[#e6e9f4]">
    <p>Конструктор этого профиля уже открыт в другой вкладке. Закройте его там, затем повторите попытку: это защищает черновик от перезаписи.</p>
    <div className="flex gap-2"><button type="button" className="rounded border px-3 py-2" onClick={() => { setLeaseStatus("checking"); setLeaseAttempt(value => value + 1); }}>Попробовать снова</button>{onClose && <button type="button" className="rounded border px-3 py-2" onClick={onClose}>Закрыть</button>}</div>
  </div>;
  if (loadingDraft) return <div role="status" className="p-4 text-sm text-[#e6e9f4]">Восстанавливаем сохранённый черновик…</div>;

  function templateOnCanvas(kind: "header" | "footer") {
    const blocks = docForBuild.themeAreas?.[kind];
    if (!blocks) return null;
    const ws = pagesOf(doc);
    const template = assignedTemplate(ws.pages,ws.activeId,kind);
    if (!template) return null;
    return <section className="sb-canvas-template" data-theme-area={kind}>
      <button type="button" onClick={() => { setDoc(current => switchPage(current,template.id)); setSelId(null); setTargetCell(null); }}>
        {kind === "header" ? "Шапка" : "Подвал"} · {template.document?.title} · Редактировать
      </button>
      <div inert>{blocks.map(block => <React.Fragment key={block.id}>{renderEditorBlock(block,false)}</React.Fragment>)}</div>
    </section>;
  }
  const mediaProject = projectsOf(doc).activeId;
  return (
    <StyleClassesContext.Provider value={{rules:doc.styleClasses ?? [],edit:setDoc}}>
    <SiteDataContext.Provider value={siteData}>
    <MediaLibraryContext.Provider value={{ assets: doc.mediaLibrary ?? [], update: change => setDoc(current => projectsOf(current).activeId === mediaProject ? change(current) : current) }}>
    <div data-editor-theme={editorTheme} data-sidebar-collapsed={sidebarCollapsed} className="altnet-builder relative w-full grid grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)] gap-3">
      {leaseStatus === "unsupported" && <div role="alert" className="col-span-full rounded-lg border border-amber-500/50 bg-amber-950/70 p-3 text-sm text-amber-100">Этот браузер не поддерживает блокировку черновика между вкладками. Не редактируйте одну страницу одновременно в нескольких вкладках.</div>}
      {publishError && <div role="alert" className="col-span-full rounded-lg border border-amber-500/50 bg-amber-950/70 p-3 text-sm text-amber-100">{publishError}</div>}
      {exportError && <div role="alert" className="col-span-full rounded-lg border border-amber-500/50 bg-amber-950/70 p-3 text-sm text-amber-100">Экспорт не выполнен: {exportError}</div>}
      {carRoot && <div role="status" className="col-span-full rounded-lg border border-[#6E59F2] bg-[#121528] p-3 text-sm text-[#e6e9f4]">
        Пакет CAR сохранён на устройство. Он ещё не опубликован в сети. CID: <code>{carRoot}</code>{" "}
        <button type="button" className="underline" onClick={async () => {
          try { await navigator.clipboard.writeText(carRoot); setCarCopyStatus("CID скопирован."); }
          catch { setCarCopyStatus("Не удалось скопировать CID. Выделите и скопируйте его вручную."); }
        }}>Копировать CID</button>{" "}
        <button type="button" className="underline" onClick={() => setCarRoot("")}>Закрыть</button>
        {carCopyStatus && <span> {carCopyStatus}</span>}
      </div>}
      {onionPanel && <section aria-label="Временная раздача через Tor" className="col-span-full rounded-lg border border-[#6E59F2] bg-[#121528] p-3 text-sm text-[#e6e9f4]">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>Временная раздача сайта через Tor</strong><button type="button" className="underline" onClick={() => setOnionPanel(false)}>Скрыть</button></div>
        <p className="mt-2">Сайт сможет получить каждый, кому известны адрес onion и CID. Не размещайте здесь приватные данные. Доступность с другого устройства пока не проверяется автоматически.</p>
        <p className="mt-1 text-[#c2c7db]">Адрес временный: раздача остановится при выключении приложения, потере Tor или смене моста. Это передача CAR через Tor, а не поиск сайтов в сети IPFS.</p>
        {onionShare?.active ? <>
          <p role="status" className="mt-2">Раздача запущена; доступность ещё не подтверждена.</p>
          <p className="mt-1 break-all">Onion: <code>{onionShare.onion}</code></p>
          <p className="break-all">CID: <code>{onionShare.cid}</code></p>
          <div className="mt-2 flex flex-wrap gap-3">
            <button type="button" className="underline" onClick={async () => {
              try { await navigator.clipboard.writeText(`${onionShare.onion}\n${onionShare.cid}`); setOnionCopyStatus("Адрес и CID скопированы."); }
              catch { setOnionCopyStatus("Не удалось скопировать. Выделите адрес и CID вручную."); }
            }}>Копировать адрес и CID</button>
            <button type="button" disabled={onionBusy} className="underline disabled:opacity-50" onClick={() => void onStopOnionShare()}>Остановить раздачу</button>
          </div>
          {onionCopyStatus && <p role="status">{onionCopyStatus}</p>}
        </> : <>
          {onionShare?.reason === "route_lost" && <p role="status" className="mt-2 text-amber-300">Раздача остановлена из-за изменения маршрута Tor.</p>}
          {!onionShare && <p className="mt-2 text-amber-300">Проверяем локальный клиент. Если состояние не появилось, обновите клиент.</p>}
          <button type="button" disabled={isExporting || publishing || !onionShare || onionBusy} onClick={() => void onExportCar("share")} className="mt-2 rounded bg-indigo-600 px-3 py-2 text-white disabled:opacity-40">Начать открытую раздачу</button>
        </>}
        {onionError && <p role="alert" className="mt-2 text-amber-300">{onionError}</p>}
      </section>}
      {previewError && <div role="alert" className="col-span-full rounded-lg border border-amber-500/50 bg-amber-950/70 p-3 text-sm text-amber-100">{previewError}</div>}
      {revisionConflict && <div role="alert" className="col-span-full rounded-lg border border-amber-500/50 bg-amber-950/70 p-3 text-sm text-amber-100">Страница изменилась во время чтения версии. Восстановление отменено, текущие изменения не заменены. <button type="button" className="underline" onClick={() => setRevisionConflict(false)}>Закрыть</button></div>}
      {importConflict && <div role="alert" className="col-span-full rounded-lg border border-amber-500/50 bg-amber-950/70 p-3 text-sm text-amber-100">Документ изменился во время чтения файла. Импорт отменён, текущие изменения сохранены. <button type="button" className="underline" onClick={() => setImportConflict(false)}>Закрыть</button></div>}
      {blockedPreviewAssets && <div role="status" className="col-span-full rounded-lg border border-amber-500/50 bg-amber-950/70 p-3 text-sm text-amber-100">
        Часть медиа в редакторе и локальном предпросмотре не загружается: защищённый маршрут ещё не подключён. Адреса сохраняются в проекте; внешние изображения в HTML/ZIP пока заменяются заглушками. Для локального предпросмотра используйте PNG, JPEG, WebP или GIF в формате data.
      </div>}
      {unsupportedTypes.length > 0 && <div role="status" className="col-span-full rounded-lg border border-amber-500/50 bg-amber-950/70 p-3 text-sm text-amber-100">
        Экспорт этих виджетов ещё не подключён: {unsupportedTypes.join(", ")}. На опубликованной странице вместо них будет показана заглушка.
      </div>}
      {saveStatus === "saving" && !draftBlocked && <div role="status" className="col-span-full rounded-lg border border-[#6E59F2] bg-[#121528] p-3 text-sm text-[#e6e9f4]">Сохраняем большой черновик… <button type="button" className="underline" onClick={onExportJson}>Скачать текущий JSON</button></div>}
      {(draftBlocked || saveFailed) && (
        <div role="alert" className="col-span-full rounded-lg border border-amber-500/50 bg-amber-950/70 p-3 text-sm text-amber-100">
          {draftBlocked
            ? "Не удалось восстановить сохранённый черновик. Автосохранение приостановлено, чтобы сохранить исходные данные."
            : "Не удалось сохранить изменения на устройстве. Скачайте JSON, чтобы сохранить текущую работу."}
          {draftBlocked && (
            <button type="button" className="ml-2 underline" onClick={async () => {
              try {
                const raw = loadDraft(localStorage).status === "indexeddb" ? await readIndexedDraft() : localStorage.getItem(STORAGE_KEY);
                if (typeof raw === "string") downloadBlob(new Blob([raw], { type: "application/json" }), "altnet-draft-recovery.json");
                else setSaveStatus("failed");
              } catch {
                setSaveStatus("failed");
              }
            }}>Скачать сохранённые данные</button>
          )}
          {saveFailed && !draftBlocked && <button type="button" className="ml-2 underline" onClick={onExportJson}>Скачать текущий JSON</button>}
        </div>
      )}
      <button
        type="button"
        aria-label={sidebarCollapsed ? "Открыть панель виджетов" : "Закрыть панель виджетов"}
        aria-expanded={!sidebarCollapsed}
        aria-controls="builder-sidebar"
        className={`builder-collapse absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-30 flex h-16 w-6 items-center justify-center rounded-r-full border border-l-0 border-[#2a2f45] bg-[#050816] text-xs text-[#cfd5e6] hover:bg-[#0c1020] ${sidebarCollapsed ? "left-3" : "left-[280px] xl:left-[300px]"}`}
        onClick={(e) => {
          e.stopPropagation();
          setSidebarCollapsed((v: boolean) => !v);
        }}
      >
        {sidebarCollapsed ? "›" : "‹"}
      </button>
      {/* Левая колонка */}
      <div
        id="builder-sidebar"
        className={
          "builder-sidebar grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3 max-h-[calc(100dvh-140px)] overflow-x-hidden overflow-y-auto pr-1 " +
          "rounded-2xl bg-[#050816]/90 border border-[#1f2751] px-3 py-3" +
          (sidebarCollapsed ? " hidden" : "")
        }
      >
        <div>
          {!selBlock && <Field label="Поиск виджета">
            <input
              className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
              value={elQuery}
              onChange={(e) => setElQuery(e.target.value)}
              placeholder="Найти: заголовок, кнопка, сетка…"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>}
          {targetCell && !selBlock && <p className="mb-2 text-xs text-[#c9d0e9]">Выберите виджет для ячейки.</p>}
          {/* Левая панель: если выбран блок — показываем редактор; иначе — палитру */}
          {selBlock ? (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs text-[#9aa3b2]">Редактор блока</div>
                <button type="button" onClick={() => setSelId(null)} className="rounded-md border border-[#2a2f45] px-2 py-1 text-xs text-[#e6e9f4] hover:border-[#6E59F2]">Все виджеты</button>
              </div>
              <InspectorTabs active={editorTab} onChange={(t) => setEditorTab(t)} />
              <React.Suspense fallback={<div role="status" className="p-2 text-xs">Открываем настройки…</div>}>
              <Inspector key={JSON.stringify([mediaProject, doc.sitePages?.activeId, selId])}
                block={selBlock}
                onPatch={(patch, group) => { if (selId) patchBlock(selId, patch, group); }}
                tab={editorTab}
                device={bp}
                onDeviceChange={device => { setBp(device); setIframeMode(device); }}
              />
              </React.Suspense>
            </>
          ) : (
            <Palette
              query={elQuery}
              onInsert={(type) => {
                const withId = { ...createInsertedBlock(type), id: uid() };

                setDoc((d) => {
                  if (targetCell) return { ...d, blocks: insertIntoCell(d.blocks, targetCell.parentId, targetCell.cellIndex, withId) };
                  const idx = selId ? d.blocks.findIndex((b) => b.id === selId) : -1;
                  const next = d.blocks.slice();
                  if (idx >= 0) next.splice(idx + 1, 0, withId);
                  else next.push(withId);
                  return { ...d, blocks: next };
                });

                setSelId(withId.id);
                setTargetCell(null);
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

        {!selBlock && <RevisionPanel doc={doc} canSave={!draftBlocked} canRestore={!draftBlocked && saveStatus !== "saving" && !saveFailed}
          onRestore={(version, expected) => {
            if (currentDocRef.current !== expected) { setRevisionConflict(true); return false; }
            setDoc(current => current === expected ? version : current);
            return true;
          }} />}

        {!selBlock && <MediaLibraryButton key={mediaProject} />}
        {!selBlock && <ProjectPanel doc={doc} setDoc={setDoc} onChangeProject={() => { setSelId(null); setTargetCell(null); }}
          onExportProject={onExportProject} onImportProject={() => importProjectInputRef.current?.click()} />}
        {!selBlock && <TemplatePanel doc={doc} setDoc={setDoc} onChangePage={() => { setSelId(null); setTargetCell(null); }} />}
        {!selBlock && <PagePanel doc={doc} setDoc={setDoc} onChangePage={() => { setSelId(null); setTargetCell(null); }} />}

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
          <input ref={importProjectInputRef} className="hidden" type="file" accept="application/json" onChange={onImportProjectChange} />
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
          title={doc.title}
          bp={bp}
          onChangeBp={setBp}
          mode={iframeMode}
          onChangeMode={setIframeMode}
          right={
            <div className="flex items-center gap-3">
              <button type="button" className="builder-theme-toggle" onClick={toggleEditorTheme}
                aria-label={editorTheme === "dark" ? "Включить светлую тему конструктора" : "Включить тёмную тему конструктора"}
                title={editorTheme === "dark" ? "Светлая тема" : "Тёмная тема"}>
                <span aria-hidden="true">{editorTheme === "dark" ? "☀" : "☾"}</span>
              </button>
              <button type="button" title="Отменить (Ctrl+Z)" aria-label="Отменить изменение" disabled={!history.past.length}
                onClick={() => dispatchHistory({ type: "undo" })} className="px-3 py-1.5 rounded-md border border-[#2a2f45] text-[#e6e9f4] disabled:opacity-40">↶</button>
              <button type="button" title="Вернуть (Ctrl+Shift+Z)" aria-label="Вернуть изменение" disabled={!history.future.length}
                onClick={() => dispatchHistory({ type: "redo" })} className="px-3 py-1.5 rounded-md border border-[#2a2f45] text-[#e6e9f4] disabled:opacity-40">↷</button>
              {onClose && (
                <button
                  type="button"
                  className="px-3 py-2 rounded-md border border-[#2a2f45] bg-[#0f1420] text-[#cfd5e6] hover:border-[#6E59F2]"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                  }}
                  title="Закрыть конструктор"
                >
                  Закрыть
                </button>
              )}

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
                    toggleOutline();
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
                className={
                  "px-3 py-1.5 rounded-md border " +
                  (isExporting
                    ? "border-[#2a2f45] bg-[#0a0e1a] text-[#76809a] cursor-not-allowed"
                    : "border-[#2a2f45] bg-[#0f1420] text-[#e6e9f4] hover:border-[#22c55e]")
                }
                onClick={onPublishAlt}
                title="Сохранить на этом устройстве и открыть в .alt-браузере"
                disabled={isExporting || publishing}
              >
                {publishing ? "Сохраняем…" : "Публиковать"}
              </button>
              <span className="text-xs text-[#aab3c8]" title="Сетевая публикация через IPFS ещё не подключена">Только на этом устройстве</span>

              {isExporting ? (
                <div className="px-3 py-1.5 rounded-md border border-[#6E59F2] bg-[#15192c] text-[#e6e9f4] text-xs">
                  Экспорт {exportFormatLabel} · {exportPhaseLabel}
                </div>
              ) : (
                <>
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
                  <button type="button" className="px-3 py-1.5 rounded-md border border-[#2a2f45] bg-[#0f1420] text-[#e6e9f4] hover:border-[#6E59F2]" onClick={() => void onExportCar("download")} title="Подготовить файл для IPFS без сетевой публикации">
                    IPFS-пакет CAR
                  </button>
                  <button type="button" className="px-3 py-1.5 rounded-md border border-[#2a2f45] bg-[#0f1420] text-[#e6e9f4] hover:border-[#6E59F2]" onClick={() => setOnionPanel(true)} title="Раздать сайт через временный onion-сервис Tor">
                    Раздача через Tor
                  </button>
                </>
              )}
              <label className="ml-2 inline-flex items-center gap-2 text-xs text-[#cfd5e6]" title="Автообновление отдельного предпросмотра">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[#2a2f45] bg-[#0f1420]"
                  checked={autoPreview}
                  onChange={(e) => setAutoPreview(e.target.checked)}
                />
                Автообновление
              </label>
            </div>
          }
        />

        <div
          className="mx-auto w-full grid gap-4 p-2"
          style={
            canvasTargetWidth
              ? { maxWidth: canvasTargetWidth, width: "100%" }
              : undefined
          }
        >
          {/* Палитра-каркас, вставляет после выбранного — скрыта, т.к. есть левая панель */}
          <div className="mb-2 hidden">
            <Palette
              onInsert={(type) => {
                const pos = doc.blocks.findIndex((b) => b.id === selId);
                const index = pos >= 0 ? pos + 1 : doc.blocks.length;
                const nb = createInsertedBlock(type);
                setDoc((d) => {
                  const blocks = [...d.blocks];
                  const clamped = Math.max(0, Math.min(index, blocks.length));
                  blocks.splice(clamped, 0, nb);
                  return { ...d, blocks };
                });
              }}
            />
          </div>

          {/* Внутренняя сетка: канвас + панель «Структура» справа */}
          <div className={`grid gap-4 items-start ${bp === "desktop" ? "xl:grid-cols-[minmax(0,1fr)_260px]" : ""}`}>
            {/* Канвас + структура под ним на узких экранах */}
            <div>
              {/* Фон канваса (лист сайта), отделённый от темы приложения */}
              <div
                className={
                  bp === "desktop"
                    ? "w-full bg-white"
                    : "w-full bg-transparent"
                }
              >
                <div
                  className={
                    bp === "desktop"
                      ? "mx-auto w-full max-w-[1140px] min-h-[100vh] px-8 py-8"
                      : "mx-auto w-full max-w-[1140px] min-h-[calc(100vh-160px)] rounded-xl shadow-sm px-8 py-8"
                  }
                  style={{ backgroundColor: "#ffffff" }}
                >
                  {templateOnCanvas("header")}
                  <Canvas
                    cols={canvasCols}
                    gapX={canvasGapX}
                    gapY={canvasGapY}
                    blocks={doc.blocks}
                    renderBlock={(b) => {
                      const isSectionish =
                        b.type === "section" || b.type === "hero";
                      const isActive = selId === b.id;

                      // Базовые классы обёртки секции/виджета
                      const baseClasses = isSectionish
                        ? // Секция: большая область с мягкими углами
                        "cursor-pointer transition-colors rounded-[18px] bg-white"
                        : // Обычный виджет внутри секции
                        "cursor-pointer transition-colors rounded-xl bg-white p-3";

                      // Состояния рамки
                      const stateClasses = (() => {
                        if (isSectionish) {
                          // Активная секция — плотная фиолетовая рамка и лёгкий розовый фон,
                          // максимально похоже на Elementor
                          if (isActive) {
                            return "border border-[#e879f9] bg-[#fdf2ff] shadow-[0_0_0_1px_rgba(232,121,249,0.55)]";
                          }
                          // Неактивная секция — тонкая рамка, проявляется при ховере
                          return "border border-[#f9a8ff]/60 hover:border-[#e879f9] hover:bg-[#fdf2ff]/40";
                        }

                        // Обычные виджеты внутри секции
                        if (isActive) {
                          return "border border-[#6E59F2] shadow-[0_0_0_1px_rgba(110,89,242,0.6)]";
                        }
                        return "border border-[#e5e7eb] hover:border-[#6E59F2]/50";
                      })();

                      return (
                        <div className="relative">
                          {/* Верхний таб секции à la Elementor */}
                          {isSectionish && (
                            <div className="pointer-events-auto absolute -top-5 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full border border-[#f9a8ff] bg-[#fdf2ff] px-3 py-0.5 shadow-sm text-[11px] text-[#6b21a8]">
                              {/* Добавить секцию непосредственно после текущей */}
                              <button
                                type="button"
                                className="h-6 w-6 rounded-full border border-[#f9a8ff] bg-white flex items-center justify-center text-base leading-none hover:bg-[#fdf2ff] hover:text-[#4c1d95] transition"
                                title="Добавить секцию ниже"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const nextBlock = createInsertedBlock("section", [1]);
                                  setDoc(d => {
                                    const index = d.blocks.findIndex(item => item.id === b.id);
                                    if (index < 0) return d;
                                    const blocks = d.blocks.slice();
                                    blocks.splice(index + 1, 0, nextBlock);
                                    return { ...d, blocks };
                                  });
                                  setSelId(nextBlock.id);
                                }}
                              >
                                +
                              </button>

                              {/* крестик — удаление секции/hero */}
                              <button
                                type="button"
                                className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-[#fee2e2] transition"
                                title="Удалить секцию"
                                disabled={"locked" in b && Boolean(b.locked)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeBlock(b.id);
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          )}

                          {/* Сам блок секции / виджета */}
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelId(b.id);
                              if (window.matchMedia?.("(max-width: 767px)").matches) setSidebarCollapsed(false);
                            }}
                            className={`${baseClasses} ${stateClasses}`}
                          >
                            {renderEditorBlock(b, isActive)}
                          </div>
                        </div>
                      );
                    }}
                    onReorder={(next) =>
                      setDoc((d) => ({ ...d, blocks: next }))
                    }
                    onMoveToRoot={(index, id) => setDoc(d => ({ ...d, blocks: moveToRoot(d.blocks, id, index) }))}
                    onInsertAt={(index, type, preset) => {
                      const nb = createInsertedBlock(type, preset);
                      setDoc((d) => {
                        const blocks = [...d.blocks];
                        const clamped = Math.max(
                          0,
                          Math.min(index, blocks.length),
                        );
                        blocks.splice(clamped, 0, nb);
                        return { ...d, blocks };
                      });
                      setSelId(nb.id);
                    }}
                  />




                  {templateOnCanvas("footer")}
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
    </div>
    </MediaLibraryContext.Provider>
    </SiteDataContext.Provider>
    </StyleClassesContext.Provider>
  );
}

