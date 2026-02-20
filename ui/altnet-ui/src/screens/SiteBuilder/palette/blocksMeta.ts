// src/screens/SiteBuilder/palette/blocksMeta.ts
// Источник правды для Палитры: метаданные карточек и сопоставление с InsertChoice.

import type { InsertChoice } from "../../../builder/SortableCanvas";

export type BlockGroup =
  | "Базовые"
  | "Контент/Медиа"
  | "Планировка"
  | "Встраивания"
  | "Утилиты"
  | "Брендинг"
  | "Навигация"
  | "Пресеты";

export type PaletteMeta =
  | ({
      id: string;
      title: string;
      group: BlockGroup;
      icon: string; // имя файла svg в public/icons/aura/
      description?: string;
      type: InsertChoice; // поддерживаем и можем вставить
    })
  | ({
      id: string;
      title: string;
      group: BlockGroup;
      icon: string;
      description?: string;
      type: "unsupported"; // пока нет реализации — кнопка disabled
    });

// ⚠️ Здесь — только те, что уже умеем вставлять + несколько «скоро».
export const paletteMeta: PaletteMeta[] = [
  // — Базовые
  { id: "basic-heading", title: "Heading", group: "Базовые", icon: "basic-heading.svg", description: "Заголовок H2/H3/H4", type: "heading" },
  { id: "basic-text",    title: "Text",    group: "Базовые", icon: "basic-text.svg",    description: "Абзац текста",       type: "p" },
  { id: "basic-button",  title: "Button",  group: "Базовые", icon: "basic-button.svg",  description: "Кнопка (CTA)",        type: "btn" },
  { id: "basic-image",   title: "Image",   group: "Базовые", icon: "basic-image.svg",   description: "Изображение",         type: "img" },
  { id: "basic-divider", title: "Divider", group: "Базовые", icon: "basic-divider.svg", description: "Разделитель",          type: "divider" },
  { id: "basic-spacer",  title: "Spacer",  group: "Базовые", icon: "basic-spacer.svg",  description: "Отступ",              type: "spacer" },

  // — Контент/Медиа
  { id: "cnt-code",      title: "Code",    group: "Контент/Медиа", icon: "cnt-code.svg",      description: "Фрагмент кода",        type: "code" },
  { id: "cnt-icon-list", title: "Icon list",group: "Контент/Медиа",icon: "cnt-icon-list.svg", description: "Список с иконками",     type: "iconlist" },
  { id: "cnt-icon-box",  title: "Icon box", group: "Контент/Медиа",icon: "cnt-icon-box.svg",  description: "Иконка + заголовок",   type: "unsupported" },
  { id: "cnt-gallery",   title: "Gallery",  group: "Контент/Медиа",icon: "cnt-gallery.svg",   description: "Галерея",             type: "unsupported" },
  { id: "cnt-tabs",      title: "Tabs",      group: "Контент/Медиа", icon: "cnt-tabs.svg",      description: "Вкладки с ARIA",          type: "tabs" },
  { id: "cnt-accordion", title: "Accordion", group: "Контент/Медиа", icon: "cnt-accordion.svg", description: "Аккордеон с ARIA",       type: "accordion" },
  { id: "cnt-blockquote",title: "Blockquote",group: "Контент/Медиа", icon: "cnt-blockquote.svg",description: "Цитата/выдержка",         type: "blockquote" },
  { id: "cnt-cta",       title: "CTA",       group: "Контент/Медиа", icon: "cnt-cta.svg",       description: "Призыв к действию",      type: "cta" },
  { id: "cnt-counter",      title: "Counter",      group: "Контент/Медиа", icon: "cnt-counter.svg",      description: "Счётчик",             type: "counter" },
  { id: "cnt-progress-bar", title: "Progress",     group: "Контент/Медиа", icon: "cnt-progress-bar.svg", description: "Полоса прогресса",    type: "progress" },
  { id: "cnt-icon-box",     title: "Icon box",     group: "Контент/Медиа", icon: "cnt-icon-box.svg",     description: "Иконка + текст",      type: "iconbox" }, // было unsupported — теперь вставляем
  { id: "cnt-image-box",    title: "Image box",    group: "Контент/Медиа", icon: "cnt-image-box.svg",    description: "Картинка + подпись",  type: "imagebox" },
  { id: "cnt-price-list",    title: "Price list",    group: "Контент/Медиа", icon: "cnt-price-list.svg",    description: "Список цен",       type: "pricelist" },
  { id: "util-testimonials", title: "Testimonials",  group: "Утилиты",        icon: "util-testimonials.svg", description: "Отзывы",           type: "testimonials" },
  { id: "cnt-toc", title: "ToC", group: "Контент/Медиа", icon: "cnt-toc.svg", description: "Содержание", type: "toc" },
  { id: "basic-video",   title: "Video",     group: "Базовые",        icon: "basic-video.svg",   description: "HTML5 видео",           type: "video" },
  { id: "cnt-gallery",   title: "Gallery",   group: "Контент/Медиа",  icon: "cnt-gallery.svg",   description: "Галерея изображений",   type: "gallery" },
  { id: "cnt-carousel",  title: "Carousel",  group: "Контент/Медиа",  icon: "cnt-carousel.svg",  description: "Карусель слайдов",      type: "carousel" },
  { id: "cnt-lottie",            title: "Lottie",         group: "Контент/Медиа",  icon: "cnt-lottie.svg",            description: "Анимация Lottie (превью)",       type: "lottie" },
  { id: "cnt-media-carousel",    title: "Media carousel", group: "Контент/Медиа",  icon: "cnt-media-carousel.svg",    description: "Карусель медиа",                 type: "mediacarousel" },
  { id: "cnt-slides",            title: "Slides",         group: "Контент/Медиа",  icon: "cnt-slides.svg",            description: "Текстовые слайды",               type: "slides" },
  { id: "cnt-video-playlist",    title: "Video playlist", group: "Контент/Медиа",  icon: "cnt-video-playlist.svg",    description: "Плейлист видео",                  type: "videoplaylist" },
  { id: "cnt-hotspot",           title: "Hotspot",        group: "Контент/Медиа",  icon: "cnt-hotspot.svg",           description: "Изображение с метками",          type: "hotspot" },
  { id: "nav-pagination",  title: "Pagination",  group: "Навигация", icon: "nav-pagination.svg",  description: "Навигация по страницам", type: "pagination" },

  // — Встраивания
  { id: "emb-html",      title: "HTML (Safe)", group: "Встраивания", icon: "emb-html.svg", description: "Санитизированный HTML", type: "html" },

  // — Планировка
  { id: "layout-grid",   title: "Grid",     group: "Планировка", icon: "layout-grid.svg",     description: "Сетка 1–4",          type: "grid" },
  { id: "layout-container", title: "Section", group: "Планировка", icon: "layout-container.svg", description: "Секция / контейнер", type: "section" },
  { id: "layout-offcanvas", title: "Offcanvas", group: "Планировка", icon: "layout-offcanvas.svg", description: "Боковая панель", type: "unsupported" },

  // — Утилиты
  { id: "util-alert",    title: "Alert",    group: "Утилиты", icon: "util-alert.svg", description: "Информационный блок", type: "alert" },
  { id: "util-rating",   title: "Rating",    group: "Утилиты", icon: "util-rating.svg", description: "Звёздный рейтинг", type: "rating" },
  { id: "util-social",     title: "Social",      group: "Утилиты",  icon: "util-social.svg",     description: "Соц. ссылки",      type: "social" },
  { id: "util-share",            title: "Share",            group: "Утилиты", icon: "util-share.svg",            description: "Поделиться",        type: "share" },
  { id: "util-progress-tracker", title: "Progress tracker", group: "Утилиты", icon: "util-progress-tracker.svg", description: "Шаги процесса",     type: "progresstracker" },
  { id: "util-countdown", title: "Countdown", group: "Утилиты",       icon: "util-countdown.svg", description: "Обратный отсчёт", type: "countdown" },
  { id: "util-map",              title: "Map",            group: "Утилиты",       icon: "util-map.svg",              description: "Карта (заглушка + ссылка OSM)", type: "map" },

  // — Брендинг (пока как image/presets)
  { id: "brand-logo",    title: "Logo",     group: "Брендинг", icon: "brand-logo.svg", description: "Логотип", type: "img" },

  // — Навигация (позже)
  { id: "nav-menu",      title: "Menu",     group: "Навигация", icon: "nav-menu.svg", description: "Меню навигации", type: "unsupported" },
  { id: "nav-breadcrumbs", title: "Breadcrumbs", group: "Навигация", icon: "nav-breadcrumbs.svg", description: "Хлебные крошки", type: "breadcrumbs" },
  { id: "nav-pagination",  title: "Pagination",  group: "Навигация", icon: "nav-pagination.svg",  description: "Пагинация",       type: "pagination" },
  { id: "nav-anchor", title: "Anchor", group: "Навигация", icon: "nav-anchor.svg", description: "Якорь для переходов", type: "anchor" },
  { id: "nav-menu",        title: "Menu",        group: "Навигация", icon: "nav-menu.svg",        description: "Гориз./верт. меню", type: "menu" },
  { id: "nav-search",      title: "Search",      group: "Навигация", icon: "nav-search.svg",      description: "Поле поиска",        type: "search" },
  { id: "nav-content-nav", title: "Content nav", group: "Навигация", icon: "nav-content-nav.svg", description: "Навигатор по секциям", type: "contentnav" },
  { id: "layout-container", title: "Container", group: "Планировка", icon: "layout-container.svg", description: "Контейнер ширины/отступов", type: "container" },
  { id: "layout-sidebar",   title: "Sidebar",   group: "Планировка", icon: "layout-sidebar.svg",   description: "Боковая панель",         type: "sidebar" },
  { id: "layout-offcanvas", title: "Offcanvas", group: "Планировка", icon: "layout-offcanvas.svg", description: "Выезжающая панель",       type: "offcanvas" },

  // — Пресеты (позже, составные)
  { id: "preset-bio-card", title: "Bio card", group: "Пресеты", icon: "preset-bio-card.svg", description: "Готовая карточка", type: "unsupported" },
];

// Удобный порядок групп в UI:
export const paletteGroupOrder: BlockGroup[] = [
  "Базовые", "Контент/Медиа", "Планировка", "Встраивания", "Утилиты", "Брендинг", "Навигация", "Пресеты",
];

export function groupsWithItems() {
  const byGroup = new Map<BlockGroup, PaletteMeta[]>();
  for (const g of paletteGroupOrder) byGroup.set(g, []);
  for (const m of paletteMeta) {
    const arr = byGroup.get(m.group) ?? [];
    arr.push(m);
    byGroup.set(m.group, arr);
  }
  return Array.from(byGroup.entries()).map(([group, items]) => ({ group, items }));
}
