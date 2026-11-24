import { asRecord, oneOf } from "../../core/records";
import { postExcerpt } from "./postExcerpt";
import { withStyleClasses } from "./styleClasses";
import { cellsOf } from "./layoutTree";
import { safeAnchorName } from "./blocks/anchor/name";
import type {
  Block,
  BlockType,
  DynamicBinding,
  EntryDetails,
  LoopGridBlock,
  PageDocument,
  SitePages,
  StyleClass,
} from "./types";

export const bindingTargets: Partial<Record<BlockType, ReadonlyArray<readonly [string, string]>>> = {
  textpath: [
    ["text", "Текст"],
    ["href", "Ссылка"],
  ],
  readmore: [["label", "Надпись"]],
  h1: [["text", "Текст"]],
  heading: [
    ["text", "Текст"],
    ["href", "Ссылка"],
  ],
  p: [["text", "Текст"]],
  img: [
    ["src", "Изображение"],
    ["alt", "Альтернативный текст"],
    ["caption", "Подпись"],
    ["href", "Ссылка"],
  ],
  btn: [
    ["label", "Надпись"],
    ["href", "Ссылка"],
  ],
  hero: [
    ["title", "Заголовок"],
    ["subtitle", "Подзаголовок"],
    ["ctaText", "Надпись кнопки"],
    ["ctaLink", "Ссылка кнопки"],
  ],
  cta: [
    ["title", "Заголовок"],
    ["text", "Текст"],
    ["btnLabel", "Надпись кнопки"],
    ["btnHref", "Ссылка"],
  ],
  blockquote: [
    ["text", "Цитата"],
    ["cite", "Источник"],
  ],
  alert: [
    ["title", "Заголовок"],
    ["text", "Текст"],
  ],
  video: [
    ["src", "Видео"],
    ["poster", "Обложка"],
  ],
  map: [["label", "Метка"]],
  lottie: [["caption", "Подпись"]],
};
export const sources = {
  "site.title": "Название сайта",
  "page.title": "Заголовок страницы",
  "page.description": "Описание страницы",
  "page.url": "Адрес страницы",
  "page.image": "Изображение страницы",
  "page.excerpt": "Анонс записи",
  "entry.author": "Автор",
  "entry.date": "Дата",
  "entry.terms": "Рубрики",
} as const;
export type EntryPage = { id: string; path: string; document: PageDocument };
function validDate(value: unknown): boolean {
  if (value === "") return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function validEntry(value: unknown): value is EntryDetails {
  const e = asRecord(value);
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (e.kind === undefined || oneOf(e.kind, ["page", "post"])) &&
    (e.author === undefined || typeof e.author === "string") &&
    (e.date === undefined || validDate(e.date)) &&
    (e.terms === undefined || (Array.isArray(e.terms) && e.terms.every((t) => typeof t === "string"))) &&
    (e.fields === undefined ||
      (typeof e.fields === "object" &&
        e.fields !== null &&
        !Array.isArray(e.fields) &&
        Object.entries(e.fields).every(([k, v]) => /^[A-Za-z][\w.-]{0,63}$/.test(k) && typeof v === "string")))
  );
}
function fieldsOf(page: EntryPage, siteTitle: string, excerpt: () => string): Record<string, string> {
  const doc = page.document,
    entry = doc.entry ?? {};
  return {
    "site.title": siteTitle,
    "page.title": doc.title,
    get "page.excerpt"() {
      return excerpt();
    },
    "page.description": doc.description ?? "",
    "page.url": "./" + page.path,
    "page.image": doc.ogImage ?? "",
    "entry.author": entry.author ?? "",
    "entry.date": entry.date ?? "",
    "entry.terms": (entry.terms ?? []).join(", "),
    ...Object.fromEntries(Object.entries(entry.fields ?? {}).map(([key, val]) => ["custom." + key, val])),
  };
}
export function bindContent(block: Block, values: Record<string, string>): Block {
  const targets = bindingTargets[block.type];
  if (!targets || !block.dynamic) return block;
  const resolved: Record<string, string> = {};
  for (const [key] of targets) {
    const binding = asRecord(block.dynamic[key]);
    if (typeof binding.source !== "string") continue;
    const value = Object.hasOwn(values, binding.source) ? values[binding.source] : "";
    const text =
      (typeof value === "string" ? value : "") || (typeof binding.fallback === "string" ? binding.fallback : "");
    resolved[key] =
      (typeof binding.before === "string" ? binding.before : "") +
      text +
      (typeof binding.after === "string" ? binding.after : "");
  }
  if (block.type === "img") {
    if ("src" in resolved) resolved.cid = resolved.src;
    if ("caption" in resolved) resolved.captionSource = "custom";
    if ("href" in resolved) resolved.linkTo = "custom";
  }
  return { ...block, ...resolved };
}

export function loopSettings(value: unknown) {
  const data = asRecord(value),
    cols = asRecord(data.columns);
  const n = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback;
  const desktop = n(cols.desktop, 1, 12, 3),
    tablet = n(cols.tablet, 1, 12, Math.min(desktop, 2)),
    mobile = n(cols.mobile, 1, 12, 1);
  return {
    source: oneOf(data.source, ["all", "page", "post"]) ? data.source : "post",
    sort: oneOf(data.sort, ["menu", "title", "date"]) ? data.sort : "menu",
    descending: data.descending === true,
    omitCurrent: data.omitCurrent === true,
    terms: Array.isArray(data.terms) ? data.terms.filter((x): x is string => typeof x === "string") : [],
    columns: { desktop, tablet, mobile },
    pageSize: n(data.pageSize, 1, 100, 6),
    gap: n(data.gap, 0, 128, 16),
    offset: n(data.offset, 0, 500, 0),
    filter: data.filter === true,
    emptyText: typeof data.emptyText === "string" && data.emptyText ? data.emptyText : "Материалы не найдены.",
  };
}
export function queryEntries(block: LoopGridBlock, entries: EntryPage[], currentId: string) {
  const settings = loopSettings(block);
  let list = entries.filter(
    (page) =>
      (!settings.omitCurrent || page.id !== currentId) &&
      (settings.source === "all" || (page.document.entry?.kind ?? "page") === settings.source) &&
      (!settings.terms.length || settings.terms.some((term) => page.document.entry?.terms?.includes(term)))
  );
  if (settings.sort === "title")
    list.sort((a, b) => a.document.title.localeCompare(b.document.title, "ru", { numeric: true }));
  if (settings.sort === "date")
    list.sort((a, b) => (a.document.entry?.date ?? "").localeCompare(b.document.entry?.date ?? ""));
  if (settings.descending) list = list.reverse();
  return list.slice(settings.offset);
}

// A card template can appear several times in one document. Keep its local links in that instance.
function scopeCardAnchors(blocks: Block[], prefix: string): Block[] {
  const names = new Map<string, string>();
  function collect(list: Block[]) {
    for (const block of list) {
      const id = block.anchorId || block.anchor;
      if (id && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id)) names.set(id, prefix + id);
      if (block.type === "anchor") {
        const name = safeAnchorName(block.name);
        names.set(name, prefix + name);
      }
      for (const cell of cellsOf(block) ?? []) collect(cell);
    }
  }
  collect(blocks);
  if (!names.size) return blocks;
  const linkKeys = ["href", "ctaLink", "btnHref", "ctaHref", "link", "url"];
  const listKeys = ["items", "links", "slides", "markers", "children", "entries"];
  function links(value: Record<string, unknown>): Record<string, unknown> {
    const result = { ...value };
    for (const key of linkKeys) {
      const link = value[key];
      if (typeof link === "string" && link.startsWith("#") && names.has(link.slice(1)))
        result[key] = "#" + names.get(link.slice(1));
    }
    for (const key of listKeys) {
      const items = value[key];
      if (Array.isArray(items))
        result[key] = items.map((item) => (item && typeof item === "object" ? links(asRecord(item)) : item));
    }
    return result;
  }
  function rewrite(block: Block): Block {
    const cells = cellsOf(block);
    const copy: Block = { ...block, ...links(block) };
    if (copy.anchorId) copy.anchorId = names.get(copy.anchorId) ?? copy.anchorId;
    if (copy.anchor) copy.anchor = names.get(copy.anchor) ?? copy.anchor;
    if (copy.type === "anchor") copy.name = names.get(safeAnchorName(copy.name)) ?? copy.name;
    if (
      cells &&
      (copy.type === "grid" || copy.type === "section" || copy.type === "container" || copy.type === "offcanvas")
    )
      copy.layoutCells = cells.map((cell) => cell.map(rewrite));
    return copy;
  }
  return blocks.map(rewrite);
}

export function contentResolver(workspace: SitePages, documents: EntryPage[], styleClasses: StyleClass[] = []) {
  const byId = new Map(documents.map((p) => [p.id, p]));
  const templates = new Set(workspace.pages.filter((p) => p.template).map((p) => p.id));
  const sections = new Set(workspace.pages.filter((p) => p.template?.kind === "section").map((p) => p.id));
  const pages = documents.filter((p) => !templates.has(p.id));
  const summaries = new Map<string, ReturnType<typeof postExcerpt>>();
  function summaryFor(page: EntryPage) {
    let summary = summaries.get(page.id);
    if (!summary) {
      summary = postExcerpt(page.document);
      summaries.set(page.id, summary);
    }
    return summary;
  }
  const siteTitle = pages.find((p) => p.path === "index.html")?.document.title ?? "";
  return (blocks: Block[], context: EntryPage, area = "main"): Block[] => {
    let count = 0,
      cardIndex = 0;
    function render(list: Block[], page: EntryPage, stack: string[]): Block[] {
      let values: Record<string, string> | undefined;
      return list
        .filter((block) => !block.hidden && (block.type !== "readmore" || (!stack.length && area === "main")))
        .map((raw) => {
          if (++count > 50000) throw new Error("Циклы на странице создают больше 50 000 блоков.");
          const bound = raw.dynamic
            ? bindContent(raw, (values ??= fieldsOf(page, siteTitle, () => summaryFor(page).excerpt)))
            : raw;
          const block = withStyleClasses(bound, styleClasses);
          if (block.type === "loopgrid") {
            const template =
              block.templateId && sections.has(block.templateId) ? byId.get(block.templateId) : undefined;
            if (block.templateId && !template)
              return { ...block, cards: [], loopError: "Шаблон карточки отсутствует." };
            if (template && stack.includes(template.id))
              return { ...block, cards: [], loopError: "Шаблон карточки ссылается на собственный цикл." };
            const entries = queryEntries(block, pages, page.id);
            const cards = entries.map((record) => ({
              entryId: record.id,
              title: record.document.title,
              description: summaryFor(record).excerpt,
              more: summaryFor(record).more,
              href: "./" + record.path,
              terms: record.document.entry?.terms ?? [],
              ...(template && {
                blocks: scopeCardAnchors(
                  render(template.document.blocks, record, [...stack, template.id]),
                  "loop-" + area + "-" + ++cardIndex + "-"
                ),
              }),
            }));
            return { ...block, cards, loopError: undefined };
          }
          const cells = cellsOf(block);
          if (!cells) return block;
          return { ...block, layoutCells: cells.map((cell) => render(cell, page, stack)) };
        });
    }
    try {
      return render(blocks, context, []);
    } catch (cause) {
      return [
        {
          id: "render-limit",
          type: "loopgrid",
          cards: [],
          loopError: cause instanceof Error ? cause.message : "Не удалось построить список записей.",
        },
      ];
    }
  };
}

export function setBinding(block: Block, key: string, value: DynamicBinding | undefined) {
  const dynamic = { ...block.dynamic };
  if (value) dynamic[key] = value;
  else delete dynamic[key];
  return { dynamic: Object.keys(dynamic).length ? dynamic : undefined };
}
