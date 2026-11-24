import { createDefaultBlock } from "./registry";
import type { ShowcaseTemplate } from "./showcaseTemplates";
import type { Block, Doc } from "./types";

// Витринные сайты состоят из обычных редактируемых блоков, без пользовательского кода.
type Paint = Record<string, string | number>;
const base = (extra: Paint = {}) => ({ pt: 0, pb: 0, bs: "none", ...extra });

function text(value: string, color: string, size = 16, extra: Paint = {}): Block {
  return { ...createDefaultBlock("p"), text: value, style: base({ fs: size, lh: 1.55, tc: color, mb: 12, ...extra }) };
}
function title(value: string, color: string, size: number, level: "h1" | "h2" | "h3", font: string, mobile: number): Block {
  return { ...createDefaultBlock("heading"), text: value, level,
    style: base({ ff: font, fs: size, fw: font === "Georgia" ? 400 : 750, lh: 1.05, tc: color, mb: 16 }),
    styleByBp: { mobile: { fs: mobile, lh: 1.1 } } };
}
function button(label: string, href: string, bg: string, color: string, round = 0): Block {
  return { ...createDefaultBlock("btn"), label, href, style: base({ mt: 12, mb: 12 }),
    buttonStyleByBp: { desktop: { bg, color, radius: round, paddingX: 25, paddingY: 15, hoverBg: color, hoverColor: bg } } };
}
function section(cells: Block[][], weights: number[], style: Paint = {}, anchorId?: string): Block {
  return { ...createDefaultBlock("section", weights), layoutCells: cells, layoutPreset: weights, anchorId,
    layoutGap: 24, pad: "sm", theme: "auto", bg: "none", style: base(style),
    layoutByBp: { mobile: { mode: "stack", gap: 16 } } };
}
function photo(image: string, alt: string, height: number, radius = 0, lightbox = false): Block {
  return { ...createDefaultBlock("img"), cid: image, alt, linkTo: lightbox ? "media" : "none", lightbox, style: base(),
    imageStyleByBp: { desktop: { width: 100, height, fit: "cover", radius }, mobile: { height: 265 } } };
}
function navigation(spec: ShowcaseTemplate): Block {
  const nav = section([[text(spec.brand, spec.fg, 13, { fw: 750, letterSpacing: 1.5 })], [button("Контакты", "#contacts", spec.accent, spec.buttonText, spec.showcaseStyle === "playful" ? 50 : 0)]], [3, 1]);
  if (nav.type === "section") nav.layoutByBp = { mobile: { mode: "columns", weights: [3, 2], gap: 8 } };
  return nav;
}
function accordion(spec: ShowcaseTemplate): Block[] {
  if (!spec.faq?.length) return [];
  return [section([[title("Частые вопросы", spec.fg, 38, "h2", "system-ui", 30)],
    [{ ...createDefaultBlock("accordion"), variant: "ghost", size: "lg", allowMultiple: false, allowToggle: true,
      items: spec.faq.map(([question, answer], index) => ({ id: `question-${index + 1}`, title: question, content: answer, open: false })), style: base() }]], [2, 3], { mt: 50 })];
}

function magazine(spec: ShowcaseTemplate, image: string, extra: string[]): Block[] {
  const cover = section([
    [text("НОВЫЙ ВЫПУСК / 01", spec.accent, 12, { fw: 750, letterSpacing: 1.4 }),
      title(spec.headline, spec.fg, 76, "h1", "Georgia", 47),
      text(spec.intro, spec.muted, 18), button(spec.action, "#offer", spec.fg, "#ffffff")],
    [photo(image, spec.imageAlt, 540), text("ВИЗУАЛЬНАЯ КУЛЬТУРА / 01", spec.muted, 11, { letterSpacing: 1 })],
  ], [4, 5], { mt: 30 });
  const lead = section([[text("01 / ТЕМА НОМЕРА", spec.accent, 12, { fw: 750 }), title("Форма, которая говорит.", spec.fg, 48, "h2", "Georgia", 36)],
    [text("Искусство начинается с внимания: к материалу, к свету и к тому, как они меняют наше восприятие.", spec.fg, 23, { lh: 1.45 })]], [3, 2], { mt: 56 }, "offer");
  const feature = section([[photo(extra[0], "Бумажные формы в синих и терракотовых тонах", 360, 0, true)],
    [text("ЭССЕ / ДЕТАЛИ", spec.accent, 12, { fw: 750 }), title("Материал становится историей.", spec.fg, 38, "h3", "Georgia", 29),
      text("Свет, цвет и фактура раскрывают привычные вещи по-новому. Изображение можно открыть крупнее и заменить своей работой.", spec.muted, 16)]], [3, 2], { mt: 30 });
  const rows = spec.features.map((feature, index) => section([
    [text(`0${index + 1} /`, spec.accent, 16, { fw: 750 })],
    [title(feature, spec.fg, 35, "h3", "Georgia", 29)],
    [text(spec.descriptions[index], spec.muted, 15)],
  ], [1, 3, 3], { mt: 12, mb: 12 }));
  const statement = section([[text("РЕДАКЦИОННАЯ ЗАМЕТКА", "#f7f2e7", 12, { letterSpacing: 1 }),
    title(spec.story, "#f7f2e7", 42, "h2", "Georgia", 32), text(spec.storyText, "#d8deed", 16)]], [1],
    { mt: 56, bg: "#16264a", br: 0, pl: 32, pr: 32, pt: 32, pb: 32 });
  const contact = section([[text("СЛЕДУЮЩАЯ СТРАНИЦА / ВАША", spec.accent, 12, { fw: 750 }), title(spec.closing, spec.fg, 42, "h2", "Georgia", 32)],
    [text("Добавьте контакты редакции и приглашение к сотрудничеству.", spec.muted), button("Связаться", "#contacts", spec.accent, "#ffffff")]], [3, 2], { mt: 56, mb: 32 }, "contacts");
  return [navigation(spec), cover, lead, feature, ...rows, statement, contact];
}

function cinema(spec: ShowcaseTemplate, image: string, extra: string[]): Block[] {
  const opening = section([[text("НЕЗАВИСИМАЯ СТУДИЯ ВИЗУАЛЬНЫХ ИСТОРИЙ", spec.accent, 12, { fw: 750, letterSpacing: 2 }),
    title(spec.headline, spec.fg, 82, "h1", "system-ui", 45)],
    [text("01 / ВЫБРАННАЯ ИСТОРИЯ", spec.muted, 12, { letterSpacing: 1 }), text(spec.intro, spec.muted, 18), button(spec.action, "#offer", spec.accent, "#ffffff")]], [5, 2], { mt: 48 });
  const cover = section([[photo(image, spec.imageAlt, 570)]], [1], { mt: 14 }, "offer");
  const caption = section([[text("HORIZON / FILM NOTES", spec.muted, 11, { letterSpacing: 1.6 })],
    [text("01 — ЗЕМЛЯ / МОРЕ / ЧЕЛОВЕК", spec.muted, 11, { letterSpacing: 1.2 })]], [1, 1]);
  const intro = section([[text("СМОТРЕТЬ ВНИМАТЕЛЬНЕЕ", spec.accent, 12, { letterSpacing: 1 }), title(spec.story, spec.fg, 48, "h2", "Georgia", 34)],
    [text(spec.storyText, spec.muted, 18), text("Каждая история — отдельный взгляд, собственный ритм и пространство для воображения.", spec.muted, 16)]], [3, 2], { mt: 70 });
  const projects = section([[text("02 / КОЛЛЕКЦИЯ", spec.accent, 12, { letterSpacing: 1 }), title(spec.section, spec.fg, 40, "h2", "system-ui", 30)]], [1], { mt: 64 });
  const gallery = section([
    [photo(extra[0], "Путешественник в горах на рассвете", 365, 0, true), text("01 / СЕВЕРНЫЙ СВЕТ", spec.muted, 11, { letterSpacing: 1 })],
    [photo(extra[1], "Травы и тёмные морские скалы в тумане", 365, 0, true), text("02 / ТИХИЕ ГОЛОСА", spec.muted, 11, { letterSpacing: 1 })],
  ], [1, 1], { mt: 16 });
  const rows = spec.features.map((feature, index) => section([
    [text(`0${index + 1}`, spec.accent, 34, { fw: 750 })],
    [title(feature, spec.fg, 35, "h3", "Georgia", 28)],
    [text(spec.descriptions[index], spec.muted, 15)],
  ], [1, 3, 3], { mt: 14, mb: 14, bg: index === 1 ? "#222627" : "#171b1c", pl: 22, pr: 22, pt: 18, pb: 18 }));
  const contact = section([[text("НАЧАТЬ ДИАЛОГ", "#fff4f0", 12, { letterSpacing: 1.5 }), title(spec.closing, "#ffffff", 50, "h2", "system-ui", 34)],
    [text("Укажите реальные контакты и расскажите о будущем проекте.", "#fff4f0", 16), button("Контакты", "#contacts", "#ffffff", "#9c302b")]], [3, 2],
    { mt: 64, mb: 28, bg: "#9c302b", pl: 30, pr: 30, pt: 28, pb: 28 }, "contacts");
  return [navigation(spec), opening, cover, caption, intro, projects, gallery, ...rows, contact];
}

function playful(spec: ShowcaseTemplate, image: string): Block[] {
  const opening = section([[text("ПРИВЕТ! МЫ РАДЫ ТЕБЕ", "#db4934", 12, { fw: 750, letterSpacing: 1 }),
    title(spec.headline, spec.fg, 69, "h1", "system-ui", 42), text(spec.intro, spec.muted, 18), button(spec.action, "#offer", "#1d49be", "#ffffff", 50)],
    [photo(image, spec.imageAlt, 450, 28)]], [4, 5], { mt: 24, bg: "#ffe28b", br: 30, pl: 28, pr: 28, pt: 30, pb: 30 });
  const header = section([[text("ВРЕМЯ ДЛЯ ВООБРАЖЕНИЯ", "#db4934", 12, { fw: 750, letterSpacing: 1 }),
    title(spec.section, spec.fg, 48, "h2", "system-ui", 35)]], [1], { mt: 55 }, "offer");
  const colors = ["#bdddeb", "#f8c4b8", "#cfe7ba"];
  const tiles = section(spec.features.map((feature, index) => [section([[text(["✦ / 01", "● / 02", "▲ / 03"][index], spec.fg, 20, { fw: 750 }),
    title(feature, spec.fg, 31, "h3", "system-ui", 28), text(spec.descriptions[index], spec.fg, 16)]], [1],
    { bg: colors[index], br: 25, pl: 22, pr: 22, pt: 25, pb: 25 })]), [1, 1, 1]);
  const story = section([[title(spec.story, spec.fg, 45, "h2", "system-ui", 33)],
    [text(spec.storyText, spec.muted, 18), button("Связаться", "#contacts", "#e6533b", "#ffffff", 50)]], [3, 2], { mt: 60 });
  const contact = section([[text("ДО НОВЫХ ВСТРЕЧ!", "#d2e3ff", 12, { fw: 750, letterSpacing: 1 }), title(spec.closing, "#ffffff", 45, "h2", "system-ui", 33),
    text("Добавьте актуальные контакты, время работы и информацию для родителей.", "#e1edff", 16)]], [1],
    { mt: 55, mb: 28, bg: "#1d49be", br: 30, pl: 30, pr: 30, pt: 30, pb: 30 }, "contacts");
  return [navigation(spec), opening, header, tiles, story, ...accordion(spec), contact];
}

function future(spec: ShowcaseTemplate, image: string, extra: string[]): Block[] {
  const artwork = photo(image, spec.imageAlt, 430, 24);
  artwork.style = base({ clipShape: "ellipse" });
  const opening = section([[text("НЕЗАВИСИМАЯ СТУДИЯ / 01", spec.accent, 12, { fw: 750, letterSpacing: 1.6 }),
    title(spec.headline, spec.fg, 76, "h1", "system-ui", 44), text(spec.intro, spec.muted, 18), button(spec.action, "#offer", spec.accent, spec.buttonText, 50)],
    [artwork]], [4, 5], { mt: 28, pl: 32, pr: 32, pt: 36, pb: 36, br: 28, backgroundType: "linear", gradientFrom: "#121d42", gradientTo: "#29305d", gradientAngle: 125 });
  const metrics = section([[text("01 / СМЫСЛ", spec.accent, 12, { letterSpacing: 1 }), title("Ясность", spec.fg, 31, "h2", "system-ui", 26)],
    [text("02 / ФОРМА", spec.accent, 12, { letterSpacing: 1 }), title("Характер", spec.fg, 31, "h2", "system-ui", 26)],
    [text("03 / ДЕЙСТВИЕ", spec.accent, 12, { letterSpacing: 1 }), title("Польза", spec.fg, 31, "h2", "system-ui", 26)]], [1, 1, 1], { mt: 22 });
  const intro = section([[text("ПРИНЦИПЫ / ПОДХОД", spec.accent, 12, { letterSpacing: 1 }), title(spec.section, spec.fg, 48, "h2", "system-ui", 34)],
    [text("Технология становится ценнее, когда помогает человеку. Мы начинаем с задачи и оставляем место неожиданным решениям.", spec.muted, 18)]], [3, 2], { mt: 64 }, "offer");
  const panels = section(spec.features.map((feature, index) => [section([[text(`0${index + 1} /`, spec.accent, 13, { fw: 750 }),
    title(feature, spec.fg, 28, "h3", "system-ui", 25), text(spec.descriptions[index], spec.muted, 15)]], [1],
    { bg: index === 1 ? "#27344e" : "#19263a", br: 18, pl: 22, pr: 22, pt: 24, pb: 24 })]), [1, 1, 1]);
  const story = section([[photo(extra[0], "Абстрактная световая форма на тёмном фоне", 350, 18, true)],
    [text("ПРОСТРАНСТВО ДЛЯ ИДЕЙ", spec.accent, 12, { letterSpacing: 1 }), title(spec.story, spec.fg, 43, "h2", "system-ui", 32), text(spec.storyText, spec.muted, 17)]], [3, 2], { mt: 64 });
  const contact = section([[text("НАЧНЁМ С ВОПРОСА", spec.accent, 12, { letterSpacing: 1 }), title(spec.closing, spec.fg, 44, "h2", "system-ui", 32)],
    [text("Добавьте свои контакты и расскажите, как начать сотрудничество.", spec.muted, 16), button("Контакты", "#contacts", spec.accent, spec.buttonText, 50)]], [3, 2],
    { mt: 64, mb: 28, bg: "#19263a", br: 24, pl: 30, pr: 30, pt: 30, pb: 30 }, "contacts");
  return [navigation(spec), opening, metrics, intro, panels, story, contact];
}

function dining(spec: ShowcaseTemplate, image: string, extra: string[]): Block[] {
  const heading = section([[text("СЕЗОННАЯ КУХНЯ / НЕСПЕШНЫЕ ВСТРЕЧИ", spec.accent, 12, { letterSpacing: 1.8 }),
    title(spec.headline, spec.fg, 76, "h1", "Georgia", 45)],
    [text(spec.intro, spec.muted, 18), button(spec.action, "#offer", spec.accent, spec.buttonText)]], [3, 2], { mt: 44 });
  const cover = section([[photo(image, spec.imageAlt, 510)]], [1], { mt: 16 });
  const intro = section([[text("О КУХНЕ", spec.accent, 12, { letterSpacing: 1.2 }), title(spec.story, spec.fg, 48, "h2", "Georgia", 34)],
    [text(spec.storyText, spec.muted, 18), text("Продукты меняются вместе с сезоном, а внимание к гостям остаётся.", spec.muted, 16)]], [2, 3], { mt: 64 });
  const menuTabs: Block = { ...createDefaultBlock("tabs"), active: 0, variant: "underline", size: "lg", align: "start", orientation: "horizontal", tabs: [
    { id: "menu-start", label: "Начало", content: "Овощи, травы и маленькие открытия.\nЗамените этот текст своим меню." },
    { id: "menu-main", label: "Главное", content: "Сезонный продукт, огонь и внимание к деталям.\nДобавьте ваши блюда." },
    { id: "menu-dessert", label: "Десерт", content: "Неспешное завершение вечера.\nРасскажите о десертах и напитках." },
  ] };
  const menu = section([[text("МЕНЮ / ЗНАКОМСТВО", spec.accent, 12, { letterSpacing: 1.2 }), title(spec.section, spec.fg, 48, "h2", "Georgia", 34),
    text("Названия и состав блюд в шаблоне демонстрационные.", spec.muted, 15)], [menuTabs]], [2, 3], { mt: 64 }, "offer");
  const detail = section([[photo(extra[0], "Сезонное блюдо на керамической тарелке", 400, 0, true)],
    [text("ВНИМАНИЕ К ДЕТАЛЯМ", spec.accent, 12, { letterSpacing: 1 }), title("Время остановиться и почувствовать вкус.", spec.fg, 40, "h2", "Georgia", 31),
      text("Покажите ингредиенты, команду и атмосферу вашего места. Изображения можно заменить и открыть крупнее.", spec.muted, 17)]], [3, 2], { mt: 64 });
  const contact = section([[text("АДРЕС / ВРЕМЯ / КОНТАКТЫ", "#69442a", 12, { letterSpacing: 1 }), title(spec.closing, "#2d211b", 44, "h2", "Georgia", 32)],
    [text("Добавьте актуальный адрес, часы работы и удобный способ связи.", "#604c3e", 16)]], [3, 2], { mt: 64, mb: 28, bg: "#e3c49a", pl: 30, pr: 30, pt: 30, pb: 30 }, "contacts");
  return [navigation(spec), heading, cover, intro, menu, detail, contact];
}

function botanical(spec: ShowcaseTemplate, image: string, extra: string[]): Block[] {
  const opening = section([[photo(image, spec.imageAlt, 520, 28)],
    [text("МАСТЕРСКАЯ / ОРАНЖЕРЕЯ", spec.accent, 12, { fw: 750, letterSpacing: 1.3 }), title(spec.headline, spec.fg, 66, "h1", "Georgia", 43),
      text(spec.intro, spec.muted, 18), button(spec.action, "#offer", spec.accent, "#ffffff", 50)]], [5, 4], { mt: 35 });
  const ribbon = section([[text("РАСТЕНИЯ", "#ffffff", 13, { letterSpacing: 1.4 })], [text("ПРОСТРАНСТВА", "#ffffff", 13, { letterSpacing: 1.4 })],
    [text("ЖИВЫЕ ИСТОРИИ", "#ffffff", 13, { letterSpacing: 1.4 })]], [1, 1, 1], { mt: 40, bg: "#275d47", br: 20, pl: 24, pr: 24, pt: 20, pb: 20 });
  const lead = section([[text("ПОДХОД / ЗАБОТА", spec.accent, 12, { fw: 750, letterSpacing: 1 }), title(spec.section, spec.fg, 48, "h2", "Georgia", 34)],
    [text("Зелень делает пространство живым, а повседневные заботы — чуть более осознанными.", spec.muted, 19)]], [3, 2], { mt: 62 }, "offer");
  const rows = spec.features.map((feature, index) => section([[text(`0${index + 1}`, spec.accent, 14, { fw: 750 })],
    [title(feature, spec.fg, 32, "h3", "Georgia", 27)], [text(spec.descriptions[index], spec.muted, 16)]], [1, 3, 3], { mt: 8, mb: 8 }));
  const detail = section([[text("ИСТОРИЯ МАСТЕРСКОЙ", spec.accent, 12, { fw: 750, letterSpacing: 1 }), title(spec.story, spec.fg, 45, "h2", "Georgia", 33),
    text(spec.storyText, spec.muted, 17)], [photo(extra[0], "Цветы и листья в светлой мастерской", 370, 24, true)]], [2, 3], { mt: 62 });
  const contact = section([[text("БУДЕМ НА СВЯЗИ", "#e4f0df", 12, { letterSpacing: 1 }), title(spec.closing, "#ffffff", 44, "h2", "Georgia", 32),
    text("Добавьте ваши контакты, часы работы и адрес мастерской.", "#e4f0df", 16)]], [1], { mt: 60, mb: 28, bg: "#275d47", br: 24, pl: 30, pr: 30, pt: 30, pb: 30 }, "contacts");
  return [navigation(spec), opening, ribbon, lead, ...rows, detail, ...accordion(spec), contact];
}

export function createArtDirectedDocument(spec: ShowcaseTemplate, image: string, extra: string[]): Doc {
  const blocks = spec.showcaseStyle === "magazine" ? magazine(spec, image, extra)
    : spec.showcaseStyle === "cinema" ? cinema(spec, image, extra)
    : spec.showcaseStyle === "future" ? future(spec, image, extra)
    : spec.showcaseStyle === "dining" ? dining(spec, image, extra)
    : spec.showcaseStyle === "botanical" ? botanical(spec, image, extra) : playful(spec, image);
  return { title: spec.name, description: spec.intro, theme: { accent: spec.accent, background: spec.bg, foreground: spec.fg, container: 1200, showTitle: false }, blocks };
}
