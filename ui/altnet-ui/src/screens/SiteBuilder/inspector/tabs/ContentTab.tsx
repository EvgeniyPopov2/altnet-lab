import Field from "../../ui/Field";
import { useState } from "react";
import { newId } from "../../registry";
import { safeAnchorName } from "../../blocks/anchor/name";
import MenuEditor from "./MenuEditor";
import CardEditor from "./CardEditor";
import EntriesEditor from "./EntriesEditor";
import TabsEditor from "./TabsEditor";
import AccordionEditor from "./AccordionEditor";
import CarouselEditor from "./CarouselEditor";
import PriceTableEditor from "./PriceTableEditor";
import HotspotEditor from "./HotspotEditor";
import VideoPlaylistEditor from "./VideoPlaylistEditor";
import LocalImageInput from "./LocalImageInput";
import { resolveGridGaps, resolveLayout } from "../../layoutResponsive";
import type { BlockPatch } from "../patch";
import { spacerHeight } from "../../blocks/spacer/size";
import { changeGrid, gridColumnCount, gridCoveredCells, readGridMerges, setGridMerge, splitGridMerge } from "../../gridLayout";
import { buttonIconPath, buttonIcons } from "../../buttonIcons";

type Props = {
  block: any;
  onPatch: (patch: BlockPatch) => void;
  device: "desktop" | "tablet" | "mobile";
};

export default function ContentTab({ block, onPatch, device }: Props) {
  const [selectedCell, setSelectedCell] = useState(0);
  const [mergeWidth, setMergeWidth] = useState(2);
  const [mergeHeight, setMergeHeight] = useState(1);
  const [mergeError, setMergeError] = useState("");
  const t = (block?.type || "") as string;

  if (t === "pricetable") return <PriceTableEditor block={block} onPatch={onPatch} />;
  if (t === "mediacarousel") return <CarouselEditor block={block} onPatch={onPatch} />;
  if (t === "hotspot") return <HotspotEditor block={block} onPatch={onPatch} />;
  if (t === "videoplaylist") return <VideoPlaylistEditor block={block} onPatch={onPatch} />;
  if (t === "divider") {
    const input = "w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2";
    return <div className="grid gap-3">
      <Field label="Тип линии"><select className={input} value={block.lineStyle || "solid"} onChange={event => onPatch({ lineStyle: event.target.value })}><option value="solid">Сплошная</option><option value="dashed">Штриховая</option><option value="dotted">Точечная</option><option value="double">Двойная</option></select></Field>
      <Field label="Толщина, px"><input className={input} type="number" min="1" max="12" value={block.thickness ?? 1} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 12) onPatch({ thickness: value }); }} /></Field>
      <Field label="Ширина, %"><input className={input} type="number" min="1" max="100" value={block.width ?? 100} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 100) onPatch({ width: value }); }} /></Field>
      <Field label="Выравнивание"><select className={input} value={block.align || "left"} onChange={event => onPatch({ align: event.target.value })}><option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option></select></Field>
      <Field label="Цвет линии (HEX)"><input className={input} value={block.color || ""} placeholder="#2a2f45" onChange={event => onPatch({ color: event.target.value })} /></Field>
      {block.color && !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(block.color) && <p className="text-xs text-amber-300">Введите цвет в формате #RGB или #RRGGBB.</p>}
    </div>;
  }

  if (t === "offcanvas") {
    const input = "w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2";
    return <div className="grid gap-3">
      <Field label="Заголовок"><input className={input} value={block.title || ""} onChange={e => onPatch({ title: e.target.value })} /></Field>
      <Field label="Содержимое панели"><textarea className={input} value={block.body || ""} onChange={e => onPatch({ body: e.target.value })} /></Field>
      <Field label="Сторона"><select className={input} value={block.side || "left"} onChange={e => onPatch({ side: e.target.value })}><option value="left">Слева</option><option value="right">Справа</option></select></Field>
      <Field label="Ширина, px"><input className={input} type="number" min="200" max="640" value={block.width ?? 320} onChange={e => onPatch({ width: Math.max(200, Math.min(640, Number(e.target.value) || 200)) })} /></Field>
      <p className="text-xs text-[#c9d0e9]">Дополнительные виджеты можно перетащить в область панели на холсте или добавить в её ячейку.</p>
    </div>;
  }

  if (t === "countdown") {
    const date = new Date(block.target || "");
    const local = Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
    return <div className="grid gap-3">
      <Field label="Дата и время окончания"><input className="w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2" type="datetime-local" value={local} onChange={e => { const next = new Date(e.target.value); onPatch({ target: Number.isFinite(next.getTime()) ? next.toISOString() : "" }); }} /></Field>
      <p className="text-xs text-[#c9d0e9]">Время вводится в часовом поясе этого устройства и сохраняется как единый момент времени.</p>
      {!local && <p className="text-xs text-amber-300">Укажите корректную дату окончания.</p>}
    </div>;
  }

  if (t === "carousel" || t === "slides") return <CarouselEditor block={block} onPatch={onPatch} />;

  if (t === "html") return <div className="grid gap-3">
    <Field label="HTML"><textarea className="min-h-48 w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2 font-mono text-sm" value={block.html ?? block.content ?? ""} onChange={e => onPatch({ html: e.target.value })} spellCheck={false} /></Field>
    <p className="text-xs text-[#c9d0e9]">Разрешён форматированный текст, списки, таблицы и ссылки. Скрипты, стили, формы, встроенные страницы и внешние медиа удаляются при просмотре и экспорте.</p>
  </div>;

  if (t === "share") {
    const networks: string[] = Array.isArray(block.networks) ? block.networks : [];
    return <div className="grid gap-3">
      <Field label="Ссылка для публикации"><input className="w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2" value={block.url || ""} onChange={e => onPatch({ url: e.target.value })} placeholder="Текущая страница" /></Field>
      <p className="text-xs text-[#c9d0e9]">Если поле пустое, посетитель поделится адресом текущей страницы. Передача ссылки происходит только после его нажатия.</p>
      {([ ["copy", "Копировать ссылку"], ["telegram", "Telegram"], ["vk", "ВКонтакте"], ["twitter", "X / Twitter"], ["facebook", "Facebook"] ] as const).map(([id, label]) =>
        <label key={id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={networks.includes(id)} onChange={e => onPatch({ networks: e.target.checked ? [...networks, id] : networks.filter(n => n !== id) })} />{label}</label>)}
    </div>;
  }

  if (t === "accordion") return <AccordionEditor block={block} onPatch={onPatch} />;

  if (t === "tabs") return <TabsEditor block={block} onPatch={onPatch} />;

  if (t === "pagination") {
    const input = "w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2";
    const number = (key: string, label: string, min: number, max: number, fallback: number) => <Field key={key} label={label}><input className={input} type="number" min={min} max={max} value={block[key] ?? fallback} onChange={e => { const value = Math.floor(Number(e.target.value)); if (Number.isFinite(value)) onPatch({ [key]: Math.max(min, Math.min(max, value)) }); }} /></Field>;
    return <div className="grid gap-3">
      {number("total", "Всего страниц", 1, 10000, 1)}
      {number("current", "Текущая страница", 1, Math.max(1, Number(block.total) || 1), 1)}
      {number("siblings", "Соседние страницы", 0, 10, 1)}
      {number("boundary", "Страницы по краям", 0, 10, 1)}
      <Field label="Основа ссылки"><input className={input} value={block.baseHref || ""} onChange={e => onPatch({ baseHref: e.target.value })} placeholder="/page?number=" /></Field>
      <Field label="Размер"><select className={input} value={block.size || "sm"} onChange={e => onPatch({ size: e.target.value })}><option value="sm">Малый</option><option value="md">Средний</option><option value="lg">Большой</option></select></Field>
      <Field label="Название для экранного диктора"><input className={input} value={block.ariaLabel || ""} onChange={e => onPatch({ ariaLabel: e.target.value })} /></Field>
      <p className="text-xs text-[#c9d0e9]">К основе ссылки добавляется номер страницы. Сами страницы или обработчик необходимо создать отдельно.</p>
    </div>;
  }

  if (t === "progresstracker") {
    const steps: any[] = Array.isArray(block.steps) ? block.steps : [];
    const current = Math.max(0, Math.min(steps.length - 1, Number(block.current) || 0));
    const input = "w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2";
    const move = (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= steps.length) return;
      const next = steps.slice(); [next[index], next[target]] = [next[target], next[index]];
      onPatch({ steps: next, current: current === index ? target : current === target ? index : current });
    };
    return <div className="grid gap-3">
      <Field label="Текущий шаг"><select className={input} value={current} onChange={e => onPatch({ current: Number(e.target.value) })}>
        {steps.map((step, i) => <option key={step.id || i} value={i}>{i + 1}. {step.label}</option>)}
      </select></Field>
      {steps.map((step, index) => <fieldset key={step.id || index} className="grid gap-2 rounded border border-[#2a2f45] p-2">
        <legend className="px-1 text-xs">Шаг {index + 1}</legend>
        <Field label="Название шага"><input className={input} value={step.label || ""} onChange={e => onPatch({ steps: steps.map((s, i) => i === index ? { ...s, label: e.target.value } : s) })} /></Field>
        <div className="flex gap-1">
          <button type="button" disabled={index === 0} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => move(index, -1)}>↑</button>
          <button type="button" disabled={index === steps.length - 1} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => move(index, 1)}>↓</button>
          <button type="button" className="rounded border px-2 text-xs" onClick={() => { const next = steps.filter((_, i) => i !== index); onPatch({ steps: next, current: Math.max(0, Math.min(next.length - 1, current - (index < current ? 1 : 0))) }); }}>Удалить</button>
        </div>
      </fieldset>)}
      <button type="button" className="rounded border border-[#6E59F2] px-3 py-2 text-xs" onClick={() => onPatch({ steps: [...steps, { id: newId("step"), label: "Новый шаг" }] })}>Добавить шаг</button>
    </div>;
  }

  if (t === "search") {
    const input = "w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2";
    return <div className="grid gap-3">
      <Field label="Подсказка в поле поиска"><input className={input} value={block.placeholder || ""} onChange={e => onPatch({ placeholder: e.target.value })} /></Field>
      <Field label="Путь обработчика поиска"><input className={input} value={block.action || ""} onChange={e => onPatch({ action: e.target.value })} placeholder="/search" /></Field>
      <Field label="Метод"><select className={input} value={block.method || "GET"} onChange={e => onPatch({ method: e.target.value })}><option value="GET">GET</option><option value="POST">POST</option></select></Field>
      <p className="text-xs text-[#c9d0e9]">Форма отправляет запрос обработчику на этом же сайте. Индекс и сервер поиска необходимо подключить отдельно.</p>
    </div>;
  }

  if (t === "pricelist" || t === "testimonials") return <EntriesEditor block={block} onPatch={onPatch} />;

  if (t === "rating") {
    const input = "w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2";
    return <div className="grid gap-3">
      <Field label="Количество звёзд"><input className={input} type="number" min="1" max="100" value={block.max ?? 5} onChange={e => { const max = Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || 1))); onPatch({ max, value: Math.min(block.value ?? 0, max) }); }} /></Field>
      <Field label="Начальный рейтинг"><input className={input} type="number" min="0" max={block.max ?? 5} value={block.value ?? 0} onChange={e => onPatch({ value: Math.max(0, Math.min(Number(block.max) || 5, Number(e.target.value) || 0)) })} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(block.readonly)} onChange={e => onPatch({ readonly: e.target.checked })} />Только просмотр</label>
      <p className="text-xs text-[#c9d0e9]">Изменение оценки на опубликованной странице действует в текущем просмотре. Хранение и сбор голосов пока не подключены.</p>
    </div>;
  }

  if (t === "icon") {
    const input = "w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2";
    return <div className="grid gap-3">
      <Field label="Иконка"><select className={input} value={block.name || "star"} onChange={e => onPatch({ name: e.target.value })}>
        <option value="star">Звезда</option><option value="check">Галочка</option><option value="heart">Сердце</option><option value="shield">Щит</option><option value="alert">Внимание</option>
      </select></Field>
      <Field label="Размер"><select className={input} value={block.size || "md"} onChange={e => onPatch({ size: e.target.value })}>
        <option value="sm">16 px</option><option value="md">24 px</option><option value="lg">32 px</option><option value="xl">48 px</option>
      </select></Field>
      <Field label="Цвет"><select className={input} value={block.color || "text-[#2a3b8f]"} onChange={e => onPatch({ color: e.target.value })}>
        <option value="text-[#2a3b8f]">Синий</option><option value="text-[#5865F2]">Фиолетовый</option><option value="text-[#ef4444]">Красный</option><option value="text-[#34d399]">Зелёный</option><option value="text-[#ffd166]">Золотой</option>
        {block.color && !["text-[#2a3b8f]", "text-[#5865F2]", "text-[#ef4444]", "text-[#34d399]", "text-[#ffd166]"].includes(block.color) && <option value={block.color}>Сохранённый цвет</option>}
      </select></Field>
    </div>;
  }

  if (t === "iconbox" || t === "imagebox") return <CardEditor block={block} onPatch={onPatch} />;

  if (t === "menu") return <MenuEditor block={block} onPatch={onPatch} />;

  if (t === "toc" || t === "breadcrumbs" || t === "social" || t === "sidebar" || t === "contentnav") {
    const items = Array.isArray(block.items) ? block.items : [];
    const input = "w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2";
    const update = (index: number, patch: Record<string, string>) => onPatch({ items: items.map((item: any, i: number) => i === index ? { ...item, ...patch } : item) });
    return <div className="grid gap-3">
      {t === "toc" ? <p className="text-xs text-[#c9d0e9]">Добавьте пункты и укажите ссылки на якоря, например #section-1. Автоматическое оглавление пока не подключено.</p> : t === "breadcrumbs" ? <>
        <p className="text-xs text-[#c9d0e9]">Последний пункт обозначает текущую страницу.</p>
        <Field label="Разделитель"><select className={input} value={block.separator || "›"} onChange={e => onPatch({ separator: e.target.value })}><option value="/">/</option><option value="›">›</option><option value="»">»</option></select></Field>
        <Field label="Размер"><select className={input} value={block.size || "sm"} onChange={e => onPatch({ size: e.target.value })}><option value="sm">Малый</option><option value="md">Средний</option><option value="lg">Большой</option></select></Field>
        <Field label="Название навигации для экранного диктора"><input className={input} value={block.ariaLabel || ""} onChange={e => onPatch({ ariaLabel: e.target.value })} /></Field>
      </> : t === "contentnav" ? <>
        <Field label="Расположение"><select className={input} value={block.orientation || "horizontal"} onChange={e => onPatch({ orientation: e.target.value })}><option value="horizontal">Горизонтально</option><option value="vertical">Вертикально</option></select></Field>
        <Field label="Название для экранного диктора"><input className={input} value={block.ariaLabel || ""} onChange={e => onPatch({ ariaLabel: e.target.value })} /></Field>
        <Field label="Активная ссылка по умолчанию"><input className={input} value={block.activeHref || ""} onChange={e => onPatch({ activeHref: e.target.value })} placeholder="#intro" /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(block.spy)} onChange={e => onPatch({ spy: e.target.checked })} />Выделять видимый раздел</label>
        <Field label="Отступ верхней границы, px"><input className={input} type="number" min="0" max="2000" value={block.spyOffset ?? 120} onChange={e => onPatch({ spyOffset: Math.max(0, Math.min(2000, Number(e.target.value) || 0)) })} /></Field>
      </> : t === "sidebar" ? <>
        <Field label="Заголовок"><input className={input} value={block.title || ""} onChange={e => onPatch({ title: e.target.value })} /></Field>
        <Field label="Ширина, px"><input className={input} type="number" min="160" max="520" value={block.width ?? 260} onChange={e => onPatch({ width: Math.max(160, Math.min(520, Number(e.target.value) || 160)) })} /></Field>
        <Field label="Расположение"><select className={input} value={block.side || "left"} onChange={e => onPatch({ side: e.target.value })}><option value="left">Слева</option><option value="right">Справа</option></select></Field>
      </> : <p className="text-xs text-[#c9d0e9]">Укажите названия и адреса социальных страниц.</p>}
      {items.map((item: any, index: number) => <fieldset key={item.id || index} className="grid gap-2 rounded border border-[#2a2f45] p-2">
        <legend className="px-1 text-xs">Пункт {index + 1}</legend>
        <Field label="Название"><input className={input} value={item.label || ""} onChange={e => update(index, { label: e.target.value })} /></Field>
        <Field label={t === "toc" || t === "contentnav" ? "Ссылка на якорь" : "Ссылка"}><input className={input} value={item.href || ""} onChange={e => update(index, { href: e.target.value })} /></Field>
        <div className="flex gap-1">
          <button type="button" disabled={index === 0} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => { const next = items.slice(); [next[index - 1], next[index]] = [next[index], next[index - 1]]; onPatch({ items: next }); }}>↑</button>
          <button type="button" disabled={index === items.length - 1} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => { const next = items.slice(); [next[index + 1], next[index]] = [next[index], next[index + 1]]; onPatch({ items: next }); }}>↓</button>
          <button type="button" className="rounded border px-2 text-xs" onClick={() => onPatch({ items: items.filter((_: any, i: number) => i !== index) })}>Удалить</button>
        </div>
      </fieldset>)}
      <button type="button" className="rounded border border-[#6E59F2] px-3 py-2 text-xs" onClick={() => onPatch({ items: [...items, { id: newId("ti"), label: t === "social" ? "Социальная страница" : "Новый раздел", href: t === "social" ? "" : "#" }] })}>Добавить пункт</button>
    </div>;
  }

  if (t === "gallery") {
    const items = Array.isArray(block.items) ? block.items : [];
    const input = "w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2";
    const update = (index: number, patch: Record<string, string>) => onPatch({ items: items.map((item: any, i: number) => i === index ? { ...item, ...patch } : item) });
    return <div className="grid gap-3">
      <Field label="Колонки"><select className={input} value={block.cols || 3} onChange={e => onPatch({ cols: Number(e.target.value) })}>
        <option value="2">2</option><option value="3">3</option><option value="4">4</option>
      </select></Field>
      {items.map((item: any, index: number) => <fieldset key={item.id || index} className="grid gap-2 rounded border border-[#2a2f45] p-2">
        <legend className="px-1 text-xs">Изображение {index + 1}</legend>
        <Field label="Адрес изображения"><input className={input} value={item.src || ""} onChange={e => update(index, { src: e.target.value })} /></Field>
        <LocalImageInput onLoad={src => onPatch((current: any) => ({ items: (Array.isArray(current.items) ? current.items : []).map((entry: any) => (item.id ? entry.id === item.id : entry === item) ? { ...entry, src } : entry) }))} />
        <Field label="Описание изображения"><input className={input} value={item.alt || ""} onChange={e => update(index, { alt: e.target.value })} /></Field>
        <div className="flex gap-1">
          <button type="button" disabled={index === 0} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => { const next = items.slice(); [next[index - 1], next[index]] = [next[index], next[index - 1]]; onPatch({ items: next }); }}>↑</button>
          <button type="button" disabled={index === items.length - 1} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => { const next = items.slice(); [next[index + 1], next[index]] = [next[index], next[index + 1]]; onPatch({ items: next }); }}>↓</button>
          <button type="button" className="rounded border px-2 text-xs" onClick={() => onPatch({ items: items.filter((_: any, i: number) => i !== index) })}>Удалить</button>
        </div>
      </fieldset>)}
      <button type="button" className="rounded border border-[#6E59F2] px-3 py-2 text-xs" onClick={() => onPatch({ items: [...items, { id: newId("gi"), src: "", alt: "" }] })}>Добавить изображение</button>
    </div>;
  }

  if (t === "spacer") return <div className="grid gap-3"><Field label="Базовая высота отступа">
    <select className="w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2" value={block.size || "md"} onChange={e => onPatch({ size: e.target.value })}>
      <option value="xs">Очень маленькая</option><option value="sm">Маленькая</option><option value="md">Средняя</option><option value="lg">Большая</option><option value="xl">Очень большая</option>
    </select>
  </Field><Field label="Высота для выбранного экрана, px"><input className="w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2" type="number" min="0" max="1000" value={block.heightByBp?.[device] ?? ""} placeholder={`Наследовать: ${spacerHeight(block, device)} px`} onChange={event => { const next = { ...block.heightByBp }; if (event.target.value === "") delete next[device]; else { const value = Number(event.target.value); if (!Number.isInteger(value) || value < 0 || value > 1000) return; next[device] = value; } onPatch({ heightByBp: next }); }} /></Field><p className="text-xs text-[#c9d0e9]">Пустое поле наследует размер с большего экрана или базовую высоту.</p></div>;

  if (t === "hero" || t === "cols2") {
    const input = "w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2";
    const fields = t === "hero" ? [["title", "Заголовок"], ["subtitle", "Подзаголовок"], ["ctaText", "Надпись кнопки"], ["ctaLink", "Ссылка кнопки"]]
      : [["title", "Заголовок"], ["text", "Текст"], ["img", "Адрес изображения"], ["alt", "Описание изображения"]];
    return <div className="grid gap-3">
      {fields.map(([key, label]) => <Field key={key} label={label}>{key === "text" || key === "subtitle" ?
        <textarea className={input} value={block[key] || ""} onChange={e => onPatch({ [key]: e.target.value })} /> :
        <input className={input} value={block[key] || ""} onChange={e => onPatch({ [key]: e.target.value })} />}</Field>)}
      {t === "cols2" && <>
        <LocalImageInput onLoad={img => onPatch({ img })} />
        <Field label="Пропорции текста и изображения"><select className={input} value={block.ratio || "6-6"} onChange={e => onPatch({ ratio: e.target.value })}>
          <option value="5-7">5 : 7</option><option value="6-6">6 : 6</option><option value="7-5">7 : 5</option>
        </select></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(block.reverse)} onChange={e => onPatch({ reverse: e.target.checked })} />Изображение слева</label>
      </>}
    </div>;
  }

  if (t === "cta") {
    const input = "w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2";
    return <div className="grid gap-3">
      {([ ["title", "Заголовок"], ["text", "Текст"], ["btnLabel", "Надпись кнопки"], ["btnHref", "Ссылка кнопки"] ] as const).map(([key, label]) =>
        <Field key={key} label={label}>{key === "text" ? <textarea className={input} value={block[key] || ""} onChange={e => onPatch({ [key]: e.target.value })} /> : <input className={input} value={block[key] || ""} onChange={e => onPatch({ [key]: e.target.value })} />}</Field>)}
      <Field label="Кнопка"><select className={input} value={block.variant || "primary"} onChange={e => onPatch({ variant: e.target.value })}>
        <option value="primary">Основная</option><option value="secondary">Вторичная</option><option value="outline">Контур</option><option value="ghost">Прозрачная</option>
      </select></Field>
      <Field label="Выравнивание"><select className={input} value={block.align || "start"} onChange={e => onPatch({ align: e.target.value })}>
        <option value="start">Слева</option><option value="center">По центру</option><option value="end">Справа</option>
      </select></Field>
      <Field label="Фон"><select className={input} value={block.emphasis || "panel"} onChange={e => onPatch({ emphasis: e.target.value })}>
        <option value="none">Без фона</option><option value="panel">Панель</option><option value="brand">Акцент</option>
      </select></Field>
    </div>;
  }

  if (t === "code") return <div className="grid gap-3">
    <Field label="Код"><textarea className="min-h-40 w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2 font-mono text-sm" value={block.code || ""} onChange={e => onPatch({ code: e.target.value })} spellCheck={false} /></Field>
    <Field label="Язык (метка)"><input className="w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2" value={block.lang || ""} onChange={e => onPatch({ lang: e.target.value })} placeholder="Например, javascript" /></Field>
    <p className="text-xs text-[#c9d0e9]">Код отображается как текст и не выполняется. Подсветка синтаксиса пока не подключена.</p>
  </div>;

  if (t === "anchor") return <div className="grid gap-3">
    <Field label="Имя якоря"><input className="w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2" value={block.name || ""} onChange={e => onPatch({ name: e.target.value })} /></Field>
    <Field label="Подпись в редакторе"><input className="w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2" value={block.label || ""} onChange={e => onPatch({ label: e.target.value })} /></Field>
    <p className="text-xs text-[#c9d0e9]">Для перехода укажите в ссылке: #{safeAnchorName(block.name)}. Используйте уникальное имя для каждого якоря.</p>
  </div>;

  if (t === "iconlist") {
    const items = Array.isArray(block.items) ? block.items : [];
    const inputClass = "w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]";
    const update = (index: number, patch: Record<string, string>) => onPatch({ items: items.map((item: any, i: number) => i === index ? { ...item, ...patch } : item) });
    return <div className="grid gap-3">
      <Field label="Маркер"><select className={inputClass} value={block.variant || "dot"} onChange={e => onPatch({ variant: e.target.value })}>
        <option value="dot">Точка</option><option value="check">Галочка</option><option value="star">Звезда</option><option value="custom">Свой текст</option>
      </select></Field>
      {([ ["size", "Размер"], ["gap", "Расстояние"] ] as const).map(([key, label]) => <Field key={key} label={label}><select className={inputClass} value={block[key] || "md"} onChange={e => onPatch({ [key]: e.target.value })}>
        <option value="sm">Малый</option><option value="md">Средний</option><option value="lg">Большой</option>
      </select></Field>)}
      <Field label="Выравнивание"><select className={inputClass} value={block.align || "start"} onChange={e => onPatch({ align: e.target.value })}>
        <option value="start">Слева</option><option value="center">По центру</option><option value="end">Справа</option>
      </select></Field>
      {items.map((item: any, index: number) => <fieldset key={item.id || index} className="grid gap-2 rounded border border-[#2a2f45] p-2">
        <legend className="px-1 text-xs">Пункт {index + 1}</legend>
        {([ ["label", "Текст"], ["description", "Описание"], ["href", "Ссылка"], ...(block.variant === "custom" ? [["icon", "Маркер"]] : []) ] as string[][]).map(([key, label]) =>
          <Field key={key} label={label}><input className={inputClass} value={item[key] || ""} onChange={e => update(index, { [key]: e.target.value })} /></Field>)}
        <div className="flex gap-1">
          <button type="button" disabled={index === 0} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => { const next = items.slice(); [next[index - 1], next[index]] = [next[index], next[index - 1]]; onPatch({ items: next }); }}>↑</button>
          <button type="button" disabled={index === items.length - 1} className="rounded border px-2 text-xs disabled:opacity-40" onClick={() => { const next = items.slice(); [next[index + 1], next[index]] = [next[index], next[index + 1]]; onPatch({ items: next }); }}>↓</button>
          <button type="button" className="rounded border px-2 text-xs" onClick={() => onPatch({ items: items.filter((_: any, i: number) => i !== index) })}>Удалить</button>
        </div>
      </fieldset>)}
      <button type="button" className="rounded border border-[#6E59F2] px-3 py-2 text-xs" onClick={() => onPatch({ items: [...items, { id: newId("ili"), label: "Новый пункт", href: "" }] })}>Добавить пункт</button>
    </div>;
  }

  if ((t === "section" || t === "grid" || t === "container") && Array.isArray(block.layoutCells)) {
    const cells: unknown[][] = block.layoutCells;
    const columnCount = t === "grid" ? gridColumnCount(block) : cells.length;
    const rowCount = t === "grid" ? cells.length / columnCount : 1;
    const merges = t === "grid" ? readGridMerges(block) : [];
    const covered = t === "grid" ? gridCoveredCells(block) : new Set<number>();
    const anchor = selectedCell < cells.length && !covered.has(selectedCell) ? selectedCell : 0;
    const selectedMerge = merges?.find(item => item.start === anchor);
    const weights = resolveLayout(block, device).weights;
    const baseWeights = resolveLayout(block, "desktop").weights;
    const layout = resolveLayout(block, device);
    const gridGaps = resolveGridGaps(block, device);
    const updateResponsive = (patch: Record<string, unknown>) => {
      if (device === "desktop") return;
      onPatch((latest: any) => ({ layoutByBp: { ...latest.layoutByBp, [device]: { ...latest.layoutByBp?.[device], ...patch } } }));
    };
    const inputClass = "w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]";
    return <div className="grid gap-3">
      {t === "section" && <>
        <Field label="Заголовок секции"><input className={inputClass} value={block.title || ""} onChange={e => onPatch({ title: e.target.value })} /></Field>
        <Field label="Текст секции"><textarea className={inputClass} value={block.text || ""} onChange={e => onPatch({ text: e.target.value })} /></Field>
        <Field label="Выравнивание"><select className={inputClass} value={block.align || "left"} onChange={e => onPatch({ align: e.target.value })}>
          <option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option>
        </select></Field>
        <Field label="Тема секции"><select className={inputClass} value={block.theme || "auto"} onChange={e => onPatch({ theme: e.target.value })}>
          <option value="auto">Как на странице</option><option value="light">Светлая</option><option value="dark">Тёмная</option>
        </select></Field>
        <Field label="Отступы секции"><select className={inputClass} value={block.pad || "md"} onChange={e => onPatch({ pad: e.target.value })}>
          <option value="sm">Малые</option><option value="md">Средние</option><option value="lg">Большие</option>
        </select></Field>
        <Field label="Фон секции"><select className={inputClass} value={block.bg || "none"} onChange={e => onPatch({ bg: e.target.value })}>
          <option value="none">Без фона</option><option value="subtle">Мягкий</option><option value="card">Карточка</option><option value="accent">Акцент</option>
        </select></Field>
      </>}
      {t === "container" && <>
        <Field label="Ширина"><select className={inputClass} value={block.width || "md"} onChange={e => onPatch({ width: e.target.value })}>
          <option value="sm">Малая</option><option value="md">Средняя</option><option value="lg">Большая</option><option value="xl">Очень большая</option><option value="full">На всю ширину</option>
        </select></Field>
        <Field label="Внутренний отступ"><select className={inputClass} value={block.padding || "md"} onChange={e => onPatch({ padding: e.target.value })}>
          <option value="none">Нет</option><option value="sm">Малый</option><option value="md">Средний</option><option value="lg">Большой</option>
        </select></Field>
        <Field label="Фон"><select className={inputClass} value={block.bg || "none"} onChange={e => onPatch({ bg: e.target.value })}>
          <option value="none">Нет</option><option value="panel">Панель</option><option value="brand">Акцент</option>
        </select></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(block.border)} onChange={e => onPatch({ border: e.target.checked })} />Рамка</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(block.rounded)} onChange={e => onPatch({ rounded: e.target.checked })} />Скругление</label>
        <Field label="Подпись в редакторе"><input className={inputClass} value={block.note || ""} onChange={e => onPatch({ note: e.target.value })} /></Field>
      </>}
      <div className="text-sm font-semibold">Колонки: {columnCount}{t === "grid" ? ` · Строки: ${rowCount}` : ""}</div>
      <p className="text-xs text-[#c9d0e9]">Настройки относятся к выбранному размеру экрана. Пропорции задают относительную ширину колонок.</p>
      {device !== "desktop" && <Field label="Расположение на выбранном экране"><select className={inputClass} value={layout.mode} onChange={event => updateResponsive({ mode: event.target.value })}><option value="columns">Рядом</option><option value="stack">Друг под другом</option></select></Field>}
      <Field label="Расстояние между колонками (px)"><input className={inputClass} type="number" min={0} max={128} step={1} value={t === "grid" ? gridGaps.x : layout.gap} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 0 && value <= 128) { if (device === "desktop") onPatch(t === "grid" ? { layoutGapX: value } : { layoutGap: value }); else updateResponsive(t === "grid" ? { gapX: value } : { gap: value }); } }} /></Field>
      {t === "grid" && <Field label="Расстояние между строками (px)"><input className={inputClass} type="number" min={0} max={128} step={1} value={gridGaps.y} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 0 && value <= 128) { if (device === "desktop") onPatch({ layoutGapY: value }); else updateResponsive({ gapY: value }); } }} /></Field>}
      {device !== "desktop" && block.layoutByBp?.[device] && <button type="button" className="rounded border border-[#686380] px-3 py-2 text-xs" onClick={() => { const next = { ...block.layoutByBp }; delete next[device]; onPatch({ layoutByBp: next }); }}>Сбросить настройки сетки для этого экрана</button>}
      {cells.slice(0, columnCount).map((_, index) => <Field key={index} label={`Пропорция колонки ${index + 1}`}>
        <input aria-label={`Пропорция колонки ${index + 1}`} className={inputClass} type="number" min={1} max={16} step={1} value={weights[index]}
          onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 16) { const next = weights.map((old, i) => i % columnCount === index ? value : old); if (device === "desktop") onPatch({ layoutPreset: next }); else updateResponsive({ weights: next }); } }} />
      </Field>)}
      {t === "grid" ? <>
        <div className="grid grid-cols-2 gap-2">
          {([["add-row", "Добавить строку"], ["remove-row", "Удалить последнюю строку"], ["add-column", "Добавить колонку"], ["remove-column", "Удалить последнюю колонку"]] as const).map(([operation, label]) =>
            <button key={operation} type="button" disabled={!changeGrid(block, operation)}
              className="rounded border border-[#6E59F2] px-2 py-2 text-xs disabled:opacity-40"
              onClick={() => onPatch((latest: any) => changeGrid(latest, operation) || {})}>{label}</button>)}
        </div>
        <p className="text-xs text-[#c9d0e9]">Удалить можно пустую строку или колонку вне объединений. Максимум — 64 ячейки.</p>
        <div className="border-t border-[#1f2751] pt-3 text-sm font-semibold">Объединение ячеек</div>
        {merges === null ? <p role="alert" className="text-xs text-amber-300">Данные объединения повреждены. Ячейки показаны отдельно, чтобы сохранить содержимое.</p> : <>
          <Field label="Начальная ячейка"><select className={inputClass} value={anchor} onChange={event => {
            const index = Number(event.target.value);
            const existing = merges.find(item => item.start === index);
            setSelectedCell(index); setMergeWidth(existing?.columns || 2); setMergeHeight(existing?.rows || 1); setMergeError("");
          }}>
            {cells.map((_, index) => covered.has(index) ? null : <option key={index} value={index}>Строка {Math.floor(index / columnCount) + 1}, колонка {index % columnCount + 1}{merges.some(item => item.start === index) ? " · объединена" : ""}</option>)}
          </select></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Колонок"><input className={inputClass} type="number" min={1} max={columnCount} value={mergeWidth}
              onChange={event => { setMergeWidth(Number(event.target.value)); setMergeError(""); }} /></Field>
            <Field label="Строк"><input className={inputClass} type="number" min={1} max={rowCount} value={mergeHeight}
              onChange={event => { setMergeHeight(Number(event.target.value)); setMergeError(""); }} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="rounded border border-[#6E59F2] px-2 py-2 text-xs" onClick={() => {
              if (!setGridMerge(block, anchor, mergeWidth, mergeHeight)) {
                setMergeError("Нельзя объединить: проверьте размеры, пересечения и содержимое соседних ячеек."); return;
              }
              onPatch((latest: any) => setGridMerge(latest, anchor, mergeWidth, mergeHeight) || {});
              setMergeError("");
            }}>Объединить</button>
            <button type="button" disabled={!selectedMerge} className="rounded border border-[#686380] px-2 py-2 text-xs disabled:opacity-40"
              onClick={() => { onPatch((latest: any) => splitGridMerge(latest, anchor) || {}); setMergeError(""); }}>Разделить</button>
          </div>
          <p className="text-xs text-[#c9d0e9]">Содержимое остаётся в начальной ячейке; остальные ячейки должны быть пустыми.</p>
          {mergeError && <p role="alert" className="text-xs text-amber-300">{mergeError}</p>}
        </>}
      </> : <>
      <button type="button" disabled={cells.length >= 12} className="rounded border border-[#6E59F2] px-3 py-2 text-xs disabled:opacity-40"
        onClick={() => onPatch({ layoutCells: [...cells, []], layoutPreset: [...baseWeights, 1] })}>Добавить колонку</button>
      <button type="button" disabled={cells.length <= 1 || cells[cells.length - 1].length > 0} className="rounded border border-[#686380] px-3 py-2 text-xs disabled:opacity-40"
        onClick={() => onPatch({ layoutCells: cells.slice(0, -1), layoutPreset: baseWeights.slice(0, -1), layoutByBp: Object.fromEntries(Object.entries(block.layoutByBp || {}).map(([bp, value]: [string, any]) => [bp, { ...value, ...(Array.isArray(value?.weights) ? { weights: value.weights.slice(0, -1) } : {}) }])) })}>Удалить последнюю пустую колонку</button>
      {cells[cells.length - 1]?.length > 0 && <p className="text-xs text-[#c9d0e9]">Чтобы удалить последнюю колонку, сначала переместите из неё виджеты.</p>}
      </>}
    </div>;
  }

  if (["alert", "blockquote", "progress", "counter"].includes(t)) {
    const inputClass = "w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]";
    const field = (key: string, label: string, multiline = false) => <Field key={key} label={label}>
      {multiline ? <textarea className={inputClass} value={block[key] ?? ""} onChange={e => onPatch({ [key]: e.target.value })} />
        : <input className={inputClass} value={block[key] ?? ""} onChange={e => onPatch({ [key]: e.target.value })} />}
    </Field>;
    return <div className="grid gap-3">
      {t === "alert" && <>{field("title", "Заголовок")}{field("text", "Текст", true)}
        <Field label="Вид уведомления"><select className={inputClass} value={block.variant || "info"} onChange={e => onPatch({ variant: e.target.value })}>
          <option value="info">Информация</option><option value="success">Успех</option><option value="warning">Предупреждение</option><option value="danger">Ошибка</option>
        </select></Field></>}
      {t === "blockquote" && <>{field("text", "Цитата", true)}{field("cite", "Автор")}</>}
      {t === "progress" && field("label", "Подпись")}
      {t === "counter" && field("prefix", "Перед числом")}
      {(t === "progress" || t === "counter") && <Field label={t === "progress" ? "Процент" : "Значение"}>
        <input className={inputClass} type="number" min={t === "progress" ? 0 : undefined} max={t === "progress" ? 100 : undefined} value={block.value ?? 0}
          onChange={e => { const value = Number(e.target.value); if (Number.isFinite(value)) onPatch({ value: t === "progress" ? Math.max(0, Math.min(100, value)) : value }); }} />
      </Field>}
      {t === "counter" && field("suffix", "После числа")}
      {t === "counter" && <>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={block.animate === true} onChange={event => onPatch({ animate: event.target.checked })} />Анимировать при появлении</label>
        {block.animate === true && <>
          <Field label="Начальное число"><input className={inputClass} type="number" value={block.start ?? 0} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) onPatch({ start: value }); }} /></Field>
          <Field label="Длительность, мс"><input className={inputClass} type="number" min="200" max="10000" step="100" value={block.durationMs ?? 2000} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) onPatch({ durationMs: Math.max(200, Math.min(10000, value)) }); }} /></Field>
          <Field label="Знаков после запятой"><input className={inputClass} type="number" min="0" max="3" step="1" value={block.decimals ?? 0} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 0 && value <= 3) onPatch({ decimals: value }); }} /></Field>
          <p className="text-xs text-[#c9d0e9]">Анимация запускается один раз при появлении блока и учитывает системную настройку уменьшения движения.</p>
          {(Math.abs(Number(block.value)) > 1e12 || Math.abs(Number(block.start || 0)) > 1e12) && <p className="text-xs text-amber-300">Для чисел по модулю больше 1 000 000 000 000 анимация отключается; на странице сохраняется полное значение.</p>}
        </>}
      </>}
    </div>;
  }

  if (t === "h1" || t === "heading" || t === "p") {
    return (
      <div className="grid gap-3">
        <Field label="Текст">
          {t === "p" ? <textarea
            className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
            value={block.text || ""} onChange={(e) => onPatch({ text: e.target.value })}
          /> : <input
            className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] outline-none text-[#e6e9f4]"
            value={block.text || ""}
            onChange={(e) => onPatch({ text: e.target.value })}
            autoComplete="off"
            spellCheck={false}
          />}
        </Field>
        {t === "heading" && <Field label="Уровень заголовка"><select className="w-full px-2 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-sm"
          value={block.level || "h2"} onChange={e => onPatch({ level: e.target.value })}>
          {["h1", "h2", "h3", "h4", "h5", "h6", "div", "span", "p"].map(tag => <option key={tag} value={tag}>{tag.toUpperCase()}</option>)}
        </select></Field>}
        {t === "heading" && <>
          <Field label="Ссылка заголовка"><input className="w-full px-2 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-sm"
            value={block.href ?? ""} onChange={event => onPatch({ href: event.target.value })} placeholder="Необязательно" /></Field>
          {typeof block.href === "string" && block.href.trim() && <>
            <Field label="Открытие ссылки"><select className="w-full px-2 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-sm"
              value={["same", "new"].includes(block.linkOpen) ? block.linkOpen : "auto"} onChange={event => onPatch({ linkOpen: event.target.value })}>
              <option value="auto">Автоматически</option><option value="same">В текущей вкладке</option><option value="new">В новой вкладке</option>
            </select></Field>
            {block.linkOpen === "new" && <p className="text-xs text-[#c9d0e9]">В изолированном .alt-просмотре локальные страницы открываются внутри .alt; внешние ссылки недоступны до подключения защищённого маршрута.</p>}
            <Field label="Индексация ссылки"><select className="w-full px-2 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-sm"
              value={["nofollow", "follow"].includes(block.linkIndexing) ? block.linkIndexing : "auto"} onChange={event => onPatch({ linkIndexing: event.target.value })}>
              <option value="auto">Автоматически</option><option value="nofollow">Не передавать вес (nofollow)</option><option value="follow">Разрешить переход роботу</option>
            </select></Field>
          </>}
        </>}
        <Field label="Выравнивание">
          <select
            className="w-full px-2 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-sm"
            value={block.align || "left"}
            onChange={(e) => onPatch({ align: e.target.value })}
          >
            <option value="left">Слева</option>
            <option value="center">По центру</option>
            <option value="right">Справа</option>
          </select>
        </Field>
      </div>
    );
  }

  if (t === "btn") {
    return (
      <div className="grid gap-3">
        <Field label="Надпись">
          <input
            className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751]"
            value={block.label || ""}
            onChange={(e) => onPatch({ label: e.target.value })}
          />
        </Field>
        <Field label="Ссылка (href)">
          <input
            className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751]"
            value={block.href || ""}
            onChange={(e) => onPatch({ href: e.target.value })}
          />
        </Field>
        <Field label="Открытие ссылки"><select className="w-full px-2 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-sm"
          value={["same", "new"].includes(block.linkOpen) ? block.linkOpen : "auto"} onChange={event => onPatch({ linkOpen: event.target.value })}>
          <option value="auto">Автоматически</option><option value="same">В текущей вкладке</option><option value="new">В новой вкладке</option>
        </select></Field>
        {block.linkOpen === "new" && <p className="text-xs text-[#c9d0e9]">В изолированном .alt-просмотре локальные страницы открываются внутри .alt; внешние ссылки недоступны до подключения защищённого маршрута.</p>}
        <Field label="Индексация ссылки"><select className="w-full px-2 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-sm"
          value={["nofollow", "follow"].includes(block.linkIndexing) ? block.linkIndexing : "auto"} onChange={event => onPatch({ linkIndexing: event.target.value })}>
          <option value="auto">Автоматически</option><option value="nofollow">Не передавать вес (nofollow)</option><option value="follow">Разрешить переход роботу</option>
        </select></Field>
        <Field label="Доступное имя кнопки"><input className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751]"
          value={block.accessibleLabel ?? ""} maxLength={300} onChange={event => onPatch({ accessibleLabel: event.target.value })}
          placeholder="По умолчанию — надпись кнопки" /></Field>
        <p className="text-xs text-[#c9d0e9]">Доступное имя помогает скринридеру, если надпись не объясняет назначение ссылки.</p>
        <Field label="Иконка кнопки"><select className="w-full px-2 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-sm"
          value={buttonIcons.some(([name]) => name === block.icon) ? block.icon : ""} onChange={event => onPatch({ icon: event.target.value })}>
          <option value="">Без иконки</option>{buttonIcons.map(([name, label]) => <option key={name} value={name}>{label}</option>)}
        </select></Field>
        {block.icon && !buttonIconPath(block.icon) && <p role="status" className="text-xs text-amber-300">Неизвестная иконка сохранена в проекте, но пока не отображается и не экспортируется. Выберите поддерживаемую иконку.</p>}
        {buttonIcons.some(([name]) => name === block.icon) && <Field label="Положение иконки"><select className="w-full px-2 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-sm"
          value={block.iconPosition === "after" ? "after" : "before"} onChange={event => onPatch({ iconPosition: event.target.value })}>
          <option value="before">Перед текстом</option><option value="after">После текста</option>
        </select></Field>}
        <Field label="Вариант">
          <select
            className="w-full px-2 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-sm"
            value={block.variant || "primary"}
            onChange={(e) => onPatch({ variant: e.target.value })}
          >
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
            <option value="ghost">Ghost</option>
          </select>
        </Field>
        <Field label="Выравнивание">
          <select className="w-full px-2 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-sm"
            value={block.align || "left"} onChange={e => onPatch({ align: e.target.value })}>
            <option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option>
          </select>
        </Field>
      </div>
    );
  }

  if (t === "img") {
    const input = "w-full rounded-lg border border-[#1f2751] bg-[#0c0f1a] px-3 py-2";
    return (
      <div className="grid gap-3">
        <Field label="Источник (URL/CID)">
          <input
            className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751]"
            value={block.src ?? block.cid ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onPatch({ src: v, cid: v });
            }}
          />
        </Field>
        <LocalImageInput onLoad={dataUrl => onPatch({ src: dataUrl, cid: dataUrl })} />
        <Field label="Alt">
          <input
            className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751]"
            value={block.alt || ""}
            onChange={(e) => onPatch({ alt: e.target.value })}
          />
        </Field>
        <Field label="Подпись под изображением"><textarea className={input} value={block.caption || ""} onChange={e => onPatch({ caption: e.target.value })} /></Field>
        <Field label="Ссылка изображения"><input className={input} value={block.href || ""} onChange={e => onPatch({ href: e.target.value })} placeholder="https:// или /страница" /></Field>
        {block.href && <>
          <Field label="Открытие ссылки"><select className={input} value={["same", "new"].includes(block.linkOpen) ? block.linkOpen : "auto"} onChange={e => onPatch({ linkOpen: e.target.value })}>
            <option value="auto">Автоматически</option><option value="same">В текущей вкладке</option><option value="new">В новой вкладке</option>
          </select></Field>
          <Field label="Индексация ссылки"><select className={input} value={["nofollow", "follow"].includes(block.linkIndexing) ? block.linkIndexing : "auto"} onChange={e => onPatch({ linkIndexing: e.target.value })}>
            <option value="auto">Автоматически</option><option value="nofollow">Не передавать вес (nofollow)</option><option value="follow">Разрешить переход роботу</option>
          </select></Field>
          {block.linkOpen === "new" && <p className="text-xs text-[#c9d0e9]">В изолированном .alt-просмотре локальные страницы открываются внутри .alt; внешние ссылки недоступны до подключения защищённого маршрута.</p>}
        </>}
      </div>
    );
  }

  if (t === "video") {
    const inputClass = "w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751] text-[#e6e9f4]";
    return <div className="grid gap-3">
      <Field label="Адрес видео"><input className={inputClass} value={block.src || ""} onChange={e => onPatch({ src: e.target.value })} /></Field>
      <Field label="Обложка видео"><input className={inputClass} value={block.poster || ""} onChange={e => onPatch({ poster: e.target.value })} /></Field>
      <LocalImageInput onLoad={poster => onPatch({ poster })} />
      {([ ["controls", "Показывать управление", true], ["muted", "Без звука", false], ["loop", "Повторять", false] ] as const).map(([key, label, initial]) =>
        <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={block[key] ?? initial} onChange={e => onPatch({ [key]: e.target.checked })} />{label}</label>)}
      <p className="text-xs text-[#c9d0e9]">Видео подключается по указанному адресу. Файл видео не включается в экспорт автоматически.</p>
    </div>;
  }

  return (
    <div className="text-xs text-[#c9d0e9]">
      Для блока <b>{t}</b> редактор Content будет добавлен на следующем шаге.
    </div>
  );
}
