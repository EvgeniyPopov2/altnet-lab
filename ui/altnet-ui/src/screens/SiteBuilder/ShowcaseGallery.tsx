import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { adaptFromSiteBuilderDoc, exportSingleHtml } from "../../builder/exporter";
import { prepareLocalSite } from "../../core/sites/localPreview";
import { importProject, projectsOf } from "./projects";
import { SHOWCASE_TEMPLATES, createShowcaseDocument, type ShowcaseTemplate } from "./showcaseTemplates";
import type { Doc } from "./types";
import architecture from "./template-assets/architecture.jpg";
import landscape from "./template-assets/landscape.jpg";
import bakery from "./template-assets/bakery.jpg";
import studio from "./template-assets/studio.jpg";
import books from "./template-assets/books.jpg";
import digital from "./template-assets/digital.jpg";
import "./showcaseGallery.css";

const images = { architecture, landscape, bakery, studio, books, digital };
const cache = new Map<string, string>();

async function localImage(src: string): Promise<string> {
  const cached = cache.get(src);
  if (cached) return cached;
  const url = new URL(src, window.location.href);
  if (url.origin !== window.location.origin) throw new Error("Изображение шаблона должно быть локальным.");
  const response = await fetch(url, { mode: "same-origin", redirect: "error" });
  if (!response.ok) throw new Error("Не удалось загрузить изображение шаблона.");
  const blob = await response.blob();
  if (!/^image\/(png|jpeg|webp|gif)$/.test(blob.type) || !blob.size || blob.size > 8 * 1024 * 1024) throw new Error("Изображение шаблона повреждено.");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Не удалось прочитать изображение."));
    reader.onerror = () => reject(new Error("Не удалось прочитать изображение."));
    reader.readAsDataURL(blob);
  });
  cache.set(src, data);
  return data;
}

type Props = { doc: Doc; setDoc: Dispatch<SetStateAction<Doc>>; onChangeProject: () => void; theme: "light" | "dark" };

export default function ShowcaseGallery({ doc, setDoc, onChangeProject, theme }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ShowcaseTemplate>(SHOWCASE_TEMPLATES[0]);
  const [ready, setReady] = useState<{ id: string; doc: Doc; html: string } | null>(null);
  const [error, setError] = useState("");
  const [device, setDevice] = useState<"desktop" | "mobile">(() => typeof window !== "undefined" && window.matchMedia?.("(max-width: 767px)").matches ? "mobile" : "desktop");
  const [previewSize, setPreviewSize] = useState({ width: 480, height: 430 });
  const dialog = useRef<HTMLDialogElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);

  useEffect(() => {
    if (!open || !preview.current) return;
    const observer = new ResizeObserver(entries => setPreviewSize({ width: entries[0].contentRect.width, height: entries[0].contentRect.height }));
    observer.observe(preview.current);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setReady(null);
    setError("");
    void (async () => {
      const image = await localImage(images[selected.image]);
      const document = createShowcaseDocument(selected, image);
      const html = await (await exportSingleHtml(adaptFromSiteBuilderDoc(document), { bundleAssets: true, restrictExternalMedia: true, deterministic: true })).text();
      // В уменьшенном iframe отложенная загрузка может не считать первый экран видимым.
      const safe = await prepareLocalSite(html.replaceAll('loading="lazy"', 'loading="eager"'));
      if (active) setReady({ id: selected.id, doc: document, html: safe });
    })().catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Не удалось подготовить шаблон."); });
    return () => { active = false; };
  }, [open, selected]);

  function useTemplate() {
    if (busy.current || !ready || ready.id !== selected.id) return;
    if (projectsOf(doc).projects.length >= 100) { setError("Достигнут предел в 100 проектов."); return; }
    busy.current = true;
    const next = ready.doc;
    try {
      // Новый проект добавляется к текущему состоянию, не заменяя открытый проект.
      setDoc(current => projectsOf(current).projects.length >= 100 ? current : importProject(current, { name: selected.name, document: next }));
      onChangeProject();
      setOpen(false);
    } finally { busy.current = false; }
  }

  const viewport = device === "mobile" ? 320 : 1200;
  const scale = Math.min(1, Math.max(0.1, (previewSize.width - 16) / viewport));
  const previewHeight = Math.max(100, previewSize.height - 16);

  return <>
    <button type="button" onClick={() => setOpen(true)} className="w-full rounded-lg border border-[#6e59f2] bg-[#221d3d] px-3 py-2 text-left text-sm text-white hover:bg-[#302751]">Готовые сайты · {SHOWCASE_TEMPLATES.length}</button>
    {typeof document !== "undefined" && createPortal(<dialog ref={dialog} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} aria-labelledby="showcase-title" data-theme={theme}
      className="showcase-dialog m-auto max-h-[94vh] w-[min(1280px,96vw)] max-w-none overflow-hidden rounded-2xl border border-[#3d3854] bg-[#14131c] p-0 text-[#f7f5ff] shadow-2xl backdrop:bg-black/70">
      <div className="sg-header flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div><h2 id="showcase-title" className="text-lg font-semibold">Галерея готовых сайтов</h2><p className="sg-muted text-xs text-[#b5afc4]">Выберите основу: она откроется как новый редактируемый проект.</p></div>
        <button type="button" onClick={() => setOpen(false)} className="sg-outline rounded-md border border-white/20 px-3 py-2 text-sm">Закрыть</button>
      </div>
      <div className="grid max-h-[calc(94vh-82px)] grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(360px,1fr)]">
        <div className="flex content-start gap-3 overflow-x-auto p-4 lg:grid lg:grid-cols-3 lg:overflow-x-visible" aria-label="Тематики сайтов">
          {SHOWCASE_TEMPLATES.map((template, index) => <button type="button" key={template.id} aria-pressed={selected.id === template.id}
            onClick={() => setSelected(template)} className={`w-[154px] shrink-0 overflow-hidden rounded-xl border text-left transition lg:w-auto ${selected.id === template.id ? "border-[#a99aff] ring-2 ring-[#6e59f2]" : "border-white/10 hover:border-white/40"}`}>
            <img src={open ? images[template.image] : undefined} alt="" loading={index < 3 ? "eager" : "lazy"} decoding="async" className="h-24 w-full object-cover sm:h-28" />
            <span className="sg-card-copy block bg-[#201e2a] p-2.5"><span className="sg-title block text-sm font-semibold text-white">{template.name}</span><span className="sg-muted mt-0.5 block text-xs text-[#b5afc4]">{template.category}</span></span>
          </button>)}
        </div>
        <div className="sg-preview min-w-0 border-t border-white/10 bg-[#0c0b12] p-4 lg:border-l lg:border-t-0">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{selected.name}</h3><p className="sg-muted text-xs text-[#b5afc4]">{selected.category} · демонстрационные материалы</p></div>
            <div className="flex gap-1" aria-label="Размер предпросмотра"><button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")} className="sg-outline rounded border border-white/20 px-2 py-1 text-xs">Десктоп</button><button type="button" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")} className="sg-outline rounded border border-white/20 px-2 py-1 text-xs">Телефон</button></div>
          </div>
          <div ref={preview} className="mt-3 flex h-[min(430px,43dvh)] justify-center overflow-hidden rounded-lg bg-[#25232e] p-2 lg:h-[430px]">
            {ready?.id === selected.id ? <div style={{ width: viewport * scale, height: previewHeight, overflow: "hidden" }}>
              <iframe title={`Предпросмотр: ${selected.name}`} sandbox="allow-scripts" srcDoc={ready.html} className="border-0 bg-white"
                style={{ width: viewport, height: previewHeight / scale, transform: `scale(${scale})`, transformOrigin: "top left" }} />
            </div> : <p role="status" className="m-auto text-sm text-[#b5afc4]">Готовим безопасный предпросмотр…</p>}
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-amber-300">{error}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" disabled={!ready || ready.id !== selected.id} onClick={useTemplate} className="rounded-lg bg-[#7662e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#8876f1] disabled:opacity-40">Создать проект из шаблона</button>
            <span className="sg-muted text-xs text-[#b5afc4]">Текст, цвета и изображения можно заменить.</span></div>
        </div>
      </div>
    </dialog>, document.body)}
  </>;
}
