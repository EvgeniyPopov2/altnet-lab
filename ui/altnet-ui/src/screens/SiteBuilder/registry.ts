// src/screens/SiteBuilder/registry.ts
// Единый реестр создания блоков и утилиты для SiteBuilder.

import type {
  Block, H1Block, PBlock, BtnBlock, ImgBlock,
  DividerBlock, SpacerBlock,
  HeadingBlock, HeroBlock, Cols2Block, SectionBlock, GridBlock,
  IconBlock, IconListBlock, AlertBlock, HtmlBlock, CodeBlock,
  TabsBlock, AccordionBlock, BlockquoteBlock, CtaBlock, RatingBlock,
  CounterBlock, ProgressBlock, BreadcrumbsBlock, PaginationBlock, SocialBlock, IconBoxBlock, ImageBoxBlock,
  PriceListBlock, TestimonialsBlock, ShareBlock, ProgressTrackerBlock, AnchorBlock, TocBlock,
  VideoBlock, GalleryBlock, CarouselBlock, CountdownBlock, MenuBlock, SearchBlock, ContentNavBlock,
  MapBlock, LottieBlock, MediaCarouselBlock, SlidesBlock, VideoPlaylistBlock, HotspotBlock,
  ContainerBlock, SidebarBlock, OffcanvasBlock, ShortcodeBlock, PriceTableBlock,
  BlockType, FlexPreset, GridPreset,
} from "./types";

// Берём точный union InsertChoice из SortableCanvas.
import SortableCanvas from "../../builder/SortableCanvas";
type NativeProps = React.ComponentProps<typeof SortableCanvas>;
type NativeOnInsertAt = NonNullable<NativeProps["onInsertAt"]>;
export type InsertChoice = Parameters<NativeOnInsertAt>[1];

// Простая генерация id (локально, без коллизий в рамках сессии).
export function newId(prefix = "blk"): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  const t = Date.now().toString(36).slice(-4);
  return `${prefix}_${rnd}${t}`;
}

// Создание дефолтного блока по типу InsertChoice
export function createDefaultBlock(type: BlockType, preset?: FlexPreset | GridPreset): Block {
  switch (type) {
    case "h1": {
      const b: H1Block = { id: newId("h1"), type: "h1", text: "Заголовок", align: "left" };
      return b;
    }
    case "heading": {
      const b: HeadingBlock = { id: newId("h2"), type: "heading", level: "h2", text: "Подзаголовок", align: "left" };
      return b;
    }
    case "p": {
      const b: PBlock = { id: newId("p"), type: "p", text: "Текст абзаца. Нажмите, чтобы отредактировать.", align: "left" };
      return b;
    }
    case "btn": {
      const b: BtnBlock = { id: newId("btn"), type: "btn", label: "Кнопка", href: "#", variant: "primary", align: "left" };
      return b;
    }
    case "img": {
      const b: ImgBlock = { id: newId("img"), type: "img", cid: "", alt: "Изображение" };
      return b;
    }
    case "divider": {
      const b: DividerBlock = { id: newId("hr"), type: "divider" };
      return b;
    }
    case "spacer": {
      const b: SpacerBlock = { id: newId("sp"), type: "spacer", size: "md" };
      return b;
    }
    case "hero": {
      const b: HeroBlock = { id: newId("hero"), type: "hero", title: "Заголовок", subtitle: "", ctaText: "Подробнее", ctaLink: "#" };
      return b;
    }
    case "cols2": {
      const b: Cols2Block = {
        id: newId("cols2"),
        type: "cols2",
        ratio: "6-6",
        reverse: false,
        title: "Заголовок",
        text: "Описание секции",
        img: "",
        alt: ""
      };
      return b;
    }
    case "section": {
      const b: SectionBlock = {
        id: newId("sec"),
        type: "section",
        theme: "auto",
        pad: "md",
        bg: "none",
        align: "left",
        title: "",
        text: "",
        layoutPreset: preset,
      };
      return b;
    }
    case "grid": {
      const b: GridBlock = { id: newId("grid"), type: "grid", cols: 3, items: [], layoutPreset: preset };
      return b;
    }

    case "icon": {
      const b: IconBlock = { id: newId("ico"), type: "icon", name: "star", size: "md", color: "text-[#2a3b8f]" };
      return b;
    }
    case "iconlist": {
      const b: IconListBlock = {
        id: newId("icl"),
        type: "iconlist",
        variant: "dot",
        size: "md",
        gap: "md",
        align: "start",
        items: [
          { id: newId("ili"), label: "Пункт 1", href: "#one", description: "Короткое описание" },
          { id: newId("ili"), label: "Пункт 2", href: "#two" },
          { id: newId("ili"), label: "Пункт 3", href: "#three" },
        ],
      };
      return b;
    }
    case "alert": {
      const b: AlertBlock = {
        id: newId("alt"),
        type: "alert",
        variant: "info",
        title: "Заголовок",
        text: "Короткое пояснение.",
      };
      return b;
    }
    case "html": {
      const b: HtmlBlock = {
        id: newId("html"),
        type: "html",
        html: "<p><b>Безопасный HTML:</b> <i>жирный</i>, <code>code</code>, списки, ссылки.</p>",
      };
      return b;
    }
    case "code": {
      const b: CodeBlock = {
        id: newId("code"),
        type: "code",
        code: 'console.log("Hello AltNet");',
        lang: "js",
      };
      return b;
    }

    case "tabs": {
      const b: TabsBlock = {
        id: newId("tb"),
        type: "tabs",
        tabs: [
          { id: newId("ti"), label: "Вкладка 1", content: "Контент вкладки 1" },
          { id: newId("ti"), label: "Вкладка 2", content: "Контент вкладки 2" },
        ],
        active: 0,
        variant: "underline",
        size: "md",
        align: "start",
        orientation: "horizontal",
      };
      return b;
    }
    case "accordion": {
      const b: AccordionBlock = {
        id: newId("acc"),
        type: "accordion",
        allowMultiple: false,
        items: [
          { id: newId("ai"), title: "Раздел 1", content: "Текст раздела 1", open: true },
          { id: newId("ai"), title: "Раздел 2", content: "Текст раздела 2", open: false },
        ],
      };
      return b;
    }
    case "blockquote": {
      const b: BlockquoteBlock = {
        id: newId("bq"),
        type: "blockquote",
        text: "«Хороший код — тот, который понятен завтра.»",
        cite: "AltNet",
      };
      return b;
    }
    case "cta": {
      const b: CtaBlock = {
        id: newId("cta"),
        type: "cta",
        title: "Присоединяйтесь к AltNet",
        text: "Короткий призыв с безопасной ссылкой.",
        btnLabel: "Подробнее",
        btnHref: "#more",
        variant: "primary",
        align: "start",
        emphasis: "panel",
      };
      return b;
    }
    case "rating": {
      const b: RatingBlock = {
        id: newId("rt"),
        type: "rating",
        value: 4,
        max: 5,
        readonly: false,
      };
      return b;
    }

    case "counter": {
      const b: CounterBlock = { id: newId("cnt"), type: "counter", value: 42, suffix: "+" };
      return b;
    }
    case "progress": {
      const b: ProgressBlock = { id: newId("prg"), type: "progress", value: 65, label: "Готовность" };
      return b;
    }
    case "breadcrumbs": {
      const b: BreadcrumbsBlock = {
        id: newId("bc"),
        type: "breadcrumbs",
        items: [
          { id: newId("c"), label: "Главная", href: "#" },
          { id: newId("c"), label: "Раздел", href: "#" },
          { id: newId("c"), label: "Текущая" },
        ],
        size: "sm",
        separator: "›",
        ariaLabel: "Хлебные крошки",
      };
      return b;
    }
    case "pagination": {
      const b: PaginationBlock = {
        id: newId("pg"),
        type: "pagination",
        current: 2,
        total: 9,
        baseHref: "#p=",
        size: "sm",
        siblings: 1,
        boundary: 1,
        ariaLabel: "Навигация по страницам",
      };
      return b;
    }
    case "social": {
      const b: SocialBlock = {
        id: newId("soc"),
        type: "social",
        items: [
          { id: newId("s"), label: "Telegram", href: "#" },
          { id: newId("s"), label: "YouTube", href: "#" },
          { id: newId("s"), label: "GitHub", href: "#" },
        ],
      };
      return b;
    }
    case "iconbox": {
      const b: IconBoxBlock = {
        id: newId("ibox"),
        type: "iconbox",
        icon: "star",
        title: "Заголовок",
        text: "Короткое описание.",
      };
      return b;
    }
    case "imagebox": {
      const b: ImageBoxBlock = {
        id: newId("imgb"),
        type: "imagebox",
        src: "https://picsum.photos/800/450",
        alt: "Демо",
        title: "Картинка с заголовком",
        text: "Подпись к изображению.",
      };
      return b;
    }

    case "pricelist": {
      const b: PriceListBlock = {
        id: newId("pl"),
        type: "pricelist",
        items: [
          { id: newId("pi"), title: "Базовый", price: "990 ₽", desc: "Для старта" },
          { id: newId("pi"), title: "Профи", price: "2 490 ₽", desc: "Для команды" },
        ],
      };
      return b;
    }
    case "testimonials": {
      const b: TestimonialsBlock = {
        id: newId("ts"),
        type: "testimonials",
        items: [
          { id: newId("t"), author: "Анна", text: "Очень удобно и быстро!", role: "PM" },
          { id: newId("t"), author: "Илья", text: "Классный конструктор.", role: "Разработчик" },
        ],
      };
      return b;
    }
    case "share": {
      const b: ShareBlock = {
        id: newId("sh"),
        type: "share",
        url: "",
        networks: ["copy", "telegram", "twitter"],
      };
      return b;
    }
    case "progresstracker": {
      const b: ProgressTrackerBlock = {
        id: newId("pt"),
        type: "progresstracker",
        steps: [
          { id: newId("s"), label: "Шаг 1" },
          { id: newId("s"), label: "Шаг 2" },
          { id: newId("s"), label: "Готово" },
        ],
        current: 1,
      };
      return b;
    }
    case "anchor": {
      const b: AnchorBlock = {
        id: newId("anc"),
        type: "anchor",
        name: "section-1",
        label: "Секция 1",
      };
      return b;
    }
    case "toc": {
      const b: TocBlock = {
        id: newId("toc"),
        type: "toc",
        items: [
          { id: newId("ti"), label: "Вступление", href: "#intro" },
          { id: newId("ti"), label: "Раздел 1", href: "#section-1" },
        ],
      };
      return b;
    }

    case "video": {
      const b: VideoBlock = {
        id: newId("vid"),
        type: "video",
        src: "https://www.w3schools.com/html/mov_bbb.mp4",
        poster: "",
        muted: false,
        loop: false,
      };
      return b;
    }
    case "gallery": {
      const b: GalleryBlock = {
        id: newId("gal"),
        type: "gallery",
        cols: 3,
        items: [
          { id: newId("gi"), src: "https://picsum.photos/seed/1/800/600", alt: "Фото 1" },
          { id: newId("gi"), src: "https://picsum.photos/seed/2/800/600", alt: "Фото 2" },
          { id: newId("gi"), src: "https://picsum.photos/seed/3/800/600", alt: "Фото 3" },
        ],
      };
      return b;
    }
    case "carousel": {
      const b: CarouselBlock = {
        id: newId("car"),
        type: "carousel",
        initial: 0,
        slides: [
          { id: newId("cs"), src: "https://picsum.photos/seed/a/1200/600", caption: "Слайд A" },
          { id: newId("cs"), src: "https://picsum.photos/seed/b/1200/600", caption: "Слайд B" },
        ],
      };
      return b;
    }
    case "countdown": {
      const b: CountdownBlock = {
        id: newId("cd"),
        type: "countdown",
        target: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      };
      return b;
    }
    case "menu": {
      const b: MenuBlock = {
        id: newId("mn"),
        type: "menu",
        orientation: "horizontal",
        items: [
          { id: newId("mi"), label: "Главная", href: "#intro" },
          {
            id: newId("mi"), label: "Разделы", href: "#section-1", children: [
              { id: newId("mi"), label: "Раздел 1.1", href: "#s11" },
              { id: newId("mi"), label: "Раздел 1.2", href: "#s12" },
            ]
          },
          { id: newId("mi"), label: "Контакты", href: "#contacts" },
        ],
        activeHref: "#intro",
        ariaLabel: "Главное меню",
      };
      return b;
    }
    case "search": {
      const b: SearchBlock = {
        id: newId("sr"),
        type: "search",
        placeholder: "Поиск…",
        action: "#",
        method: "GET",
      };
      return b;
    }
    case "contentnav": {
      const b: ContentNavBlock = {
        id: newId("cn"),
        type: "contentnav",
        orientation: "horizontal",
        items: [
          { id: newId("ci"), label: "Вступление", href: "#intro" },
          { id: newId("ci"), label: "Часть 1", href: "#part-1" },
          { id: newId("ci"), label: "Выводы", href: "#summary" },
        ],
        spy: true,
        spyOffset: 120,
        activeHref: "#intro",
        ariaLabel: "Навигация по контенту",
      };
      return b;
    }

    case "map": {
      const b: MapBlock = { id: newId("map"), type: "map", lat: 55.751244, lon: 37.618423, zoom: 12, label: "Метка", style: "auto" };
      return b;
    }
    case "lottie": {
      const b: LottieBlock = { id: newId("lot"), type: "lottie", src: "", poster: "", autoplay: true, loop: true, caption: "Lottie (превью)" };
      return b;
    }
    case "mediacarousel": {
      const b: MediaCarouselBlock = {
        id: newId("mc"),
        type: "mediacarousel",
        initial: 0,
        slides: [
          { id: newId("ms"), kind: "img", src: "https://picsum.photos/seed/m1/1200/600", caption: "Кадр 1" },
          { id: newId("ms"), kind: "video", src: "https://www.w3schools.com/html/mov_bbb.mp4", caption: "Видео" },
          { id: newId("ms"), kind: "img", src: "https://picsum.photos/seed/m2/1200/600", caption: "Кадр 2" },
        ],
      };
      return b;
    }
    case "slides": {
      const b: SlidesBlock = {
        id: newId("sl"),
        type: "slides",
        initial: 0,
        slides: [
          { id: newId("ts"), title: "Слайд 1", text: "Описание", ctaLabel: "Подробнее", ctaHref: "#" },
          { id: newId("ts"), title: "Слайд 2", text: "Ещё текст" },
        ],
      };
      return b;
    }
    case "videoplaylist": {
      const b: VideoPlaylistBlock = {
        id: newId("vp"),
        type: "videoplaylist",
        initial: 0,
        items: [
          { id: newId("vi"), src: "https://www.w3schools.com/html/mov_bbb.mp4", title: "Демо 1" },
          { id: newId("vi"), src: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4", title: "Демо 2" },
        ],
      };
      return b;
    }
    case "hotspot": {
      const b: HotspotBlock = {
        id: newId("hs"),
        type: "hotspot",
        src: "https://picsum.photos/seed/spot/1200/600",
        alt: "Изображение с маркерами",
        markers: [
          { id: newId("hm"), x: 25, y: 40, label: "Точка A", href: "#" },
          { id: newId("hm"), x: 70, y: 55, label: "Точка B", href: "#" },
        ],
      };
      return b;
    }

    case "container": {
      const b: ContainerBlock = {
        id: newId("cont"),
        type: "container",
        width: "md",
        padding: "md",
        bg: "none",
        border: false,
        rounded: true,
        note: "Контейнер (макс. ширина + отступы)",
      };
      return b;
    }
    case "sidebar": {
      const b: SidebarBlock = {
        id: newId("side"),
        type: "sidebar",
        side: "left",
        width: 260,
        title: "Навигация",
        items: [
          { id: newId("si"), label: "Вступление", href: "#intro" },
          { id: newId("si"), label: "Раздел 1", href: "#section-1" },
          { id: newId("si"), label: "Контакты", href: "#contacts" },
        ],
      };
      return b;
    }
    case "offcanvas": {
      const b: OffcanvasBlock = {
        id: newId("oc"),
        type: "offcanvas",
        side: "left",
        width: 320,
        title: "Меню",
        body: "Панель Offcanvas. Здесь будет содержимое.",
      };
      return b;
    }

    case "shortcode": {
      const b: ShortcodeBlock = {
        id: newId("sc"),
        type: "shortcode",
        title: "Видео (YouTube, безопасно)",
        code: '[youtube id="dQw4w9WgXcQ"]',
      };
      return b;
    }

    case "pricetable": {
      const b: PriceTableBlock = {
        id: newId("pt"),
        type: "pricetable",
        plans: [
          {
            id: newId("pl"),
            name: "Старт",
            price: "0 ₽",
            period: "/мес",
            ctaLabel: "Начать",
            ctaHref: "#start",
            features: [
              { id: newId("pf"), label: "1 сайт", included: true },
              { id: newId("pf"), label: "Базовые блоки", included: true },
              { id: newId("pf"), label: "Поддержка", included: false },
            ],
          },
          {
            id: newId("pl"),
            name: "Про",
            price: "299 ₽",
            period: "/мес",
            popular: true,
            ctaLabel: "Выбрать",
            ctaHref: "#pro",
            features: [
              { id: newId("pf"), label: "Безлимит блоков", included: true },
              { id: newId("pf"), label: "CDR-защита загрузок", included: true },
              { id: newId("pf"), label: "Приоритетная поддержка", included: true },
            ],
          },
        ],
      };
      return b;
    }

    default: {
      // Fallback: безопасный абзац.
      const b: PBlock = { id: newId("p"), type: "p", text: `Unsupported type: ${String(type)}`, align: "left" };
      return b;
    }
  }
}
