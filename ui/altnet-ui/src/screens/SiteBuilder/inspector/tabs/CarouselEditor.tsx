import { asRecord } from "../../../../core/records";
import type { MediaCarouselBlock, SlidesBlock, CarouselBlock, TextSlide, LegacyMediaSlide } from "../../types";
import Field from "../../ui/Field";
import { newId } from "../../registry";
import LocalImageInput from "./LocalImageInput";
import type { BlockPatch } from "../patch";

type Props = { block: MediaCarouselBlock | SlidesBlock | CarouselBlock; onPatch: (patch: BlockPatch) => void };
const input = "w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2";

export default function CarouselEditor({ block, onPatch }: Props) {
  const mediaSlides = block.type === "mediacarousel";
  const slides: Array<Partial<TextSlide> & Omit<LegacyMediaSlide, "kind"> & { kind?: string }> = Array.isArray(block.slides) ? block.slides : mediaSlides && Array.isArray(block.items) ? block.items.map((item) => ({ ...item, kind: item.kind || item.type || "img", src: item.src || item.cid || "" })) : [];
  const textSlides = block.type === "slides";
  const initial = Math.max(0, Math.min(slides.length - 1, Number(block.initial) || 0));
  const update = (index: number, patch: Record<string, string>) => onPatch({ slides: slides.map((slide, i: number) => i === index ? { ...slide, ...patch } : slide) });
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction; if (target < 0 || target >= slides.length) return;
    const next = slides.slice(); [next[index], next[target]] = [next[target], next[index]];
    onPatch({ slides: next, initial: initial === index ? target : initial === target ? index : initial });
  };
  return <div className="grid gap-3">
    {slides.length > 0 && <Field label="Первый слайд"><select className={input} value={initial} onChange={e => onPatch({ initial: Number(e.target.value) })}>{slides.map((slide, i: number) => <option key={slide.id || i} value={i}>{i + 1}. {slide.title || slide.caption || slide.alt || "Слайд"}</option>)}</select></Field>}
    {slides.map((slide, index: number) => <fieldset key={slide.id || index} className="grid gap-2 rounded border border-[#2a2f45] p-2">
      <legend className="px-1 text-xs">Слайд {index + 1}</legend>
      {mediaSlides && <Field label="Тип медиа"><select className={input} value={slide.kind === "video" ? "video" : "img"} onChange={e => update(index, { kind: e.target.value })}><option value="img">Изображение</option><option value="video">Видео</option></select></Field>}
      {(textSlides ? [["title", "Заголовок"], ["text", "Текст"], ["ctaLabel", "Надпись кнопки"], ["ctaHref", "Ссылка кнопки"]] : [["src", mediaSlides && slide.kind === "video" ? "Адрес видео" : "Изображение"], ["alt", "Описание изображения"], ["caption", "Подпись"]]).map(([key, label]) => <Field key={key} label={label}>{key === "text" ? <textarea className={input} value={String(asRecord(slide)[key] ?? "")} onChange={e => update(index, { [key]: e.target.value })} /> : <input className={input} value={String(asRecord(slide)[key] ?? "")} onChange={e => update(index, { [key]: e.target.value })} />}</Field>)}
      {!textSlides && (!mediaSlides || slide.kind !== "video") && <LocalImageInput onLoad={src => onPatch((current) => {
        const source = "slides" in current && Array.isArray(current.slides) ? current.slides : current.type === "mediacarousel" && Array.isArray(current.items) ? current.items : [];
        return { slides: source.map((entry) => (slide.id ? entry.id === slide.id : entry === (Array.isArray(block.slides) ? slide : (block.type === "mediacarousel" ? block.items?.[index] : undefined))) ? { ...entry, ...(mediaSlides ? { kind: asRecord(entry).kind || asRecord(entry).type || "img" } : {}), src } : entry) };
      })} />}
      <div className="flex gap-1">
        <button type="button" disabled={index === 0} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => move(index, -1)}>↑</button>
        <button type="button" disabled={index === slides.length - 1} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => move(index, 1)}>↓</button>
        <button type="button" className="rounded border px-2 text-xs" onClick={() => { const next = slides.filter((_, i: number) => i !== index); onPatch({ slides: next, initial: Math.max(0, Math.min(next.length - 1, initial - (index < initial ? 1 : 0))) }); }}>Удалить</button>
      </div>
    </fieldset>)}
    {mediaSlides && <p className="text-xs text-[#c9d0e9]">Внешние медиа в редакторе не загружаются до подключения защищённого транспорта; видео в экспортированном HTML остаётся внешним ресурсом.</p>}
    <button type="button" className="rounded border border-[#6E59F2] px-3 py-2 text-xs" onClick={() => onPatch({ slides: [...slides, textSlides ? { id: newId("slide"), title: "Новый слайд", text: "", ctaLabel: "", ctaHref: "" } : { id: newId("slide"), ...(mediaSlides ? { kind: "img" } : {}), src: "", alt: "", caption: "" }] })}>Добавить слайд</button>
  </div>;
}
