// src/screens/SiteBuilder/types.ts
// Типы документа и блоков Конструктора (извлечено из SiteBuilder.tsx)
// Никакой логики — только описательные интерфейсы/типы.

export type BlockType =
  | "hero" | "h1" | "heading" | "p" | "btn" | "img" | "divider" | "spacer"
  | "cols2" | "section" | "grid"
  | "icon" | "iconlist" | "alert" | "html" | "code"
  | "tabs" | "accordion" | "blockquote" | "cta" | "rating"
  | "counter" | "progress" | "breadcrumbs" | "pagination" | "social"
  | "iconbox" | "imagebox"
  | "pricelist" | "testimonials" | "share" | "progresstracker" | "anchor" | "toc"
  | "video" | "gallery" | "carousel" | "countdown" | "menu" | "search" | "contentnav"
  | "map" | "lottie" | "mediacarousel" | "slides" | "videoplaylist" | "hotspot"
  | "container" | "sidebar" | "offcanvas";
export type ColsRatio = "5-7" | "6-6" | "7-5";

export type Align = "left" | "center" | "right";

export type HeroBlock = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  type: "hero";
  title: string;
  subtitle?: string;
  ctaText?: string;
  ctaLink?: string;
  // Расширения:
  anchorId?: string;
  className?: string;
  style?: { mt?: number; mb?: number; pt?: number; pb?: number; py?: number };
  styleByBp?: {
    desktop?: { mt?: number; mb?: number; pt?: number; pb?: number; py?: number };
    tablet?: { mt?: number; mb?: number; pt?: number; pb?: number; py?: number };
    mobile?: { mt?: number; mb?: number; pt?: number; pb?: number; py?: number };
  };
};

export type H1Block = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  align?: Align;
  type: "h1";
  text: string;
  anchorId?: string;
  className?: string;
  style?: { mt?: number; mb?: number; pt?: number; pb?: number; py?: number };
  styleByBp?: HeroBlock["styleByBp"];
};

export type HeadingBlock = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  type: "heading";
  text: string;
  level?: "h2" | "h3" | "h4";
  align?: Align;
  anchorId?: string;
  className?: string;
  style?: { mt?: number; mb?: number; pt?: number; pb?: number; py?: number };
  styleByBp?: HeroBlock["styleByBp"];
};

export type PBlock = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  align?: Align;
  type: "p";
  text: string;
  anchorId?: string;
  className?: string;
  style?: { mt?: number; mb?: number; pt?: number; pb?: number; py?: number };
  styleByBp?: HeroBlock["styleByBp"];
};

export type ImgBlock = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  type: "img";
  cid: string; // altfs://CID, ipfs://, http(s) или data:
  alt?: string;
  anchorId?: string;
  className?: string;
  style?: { mt?: number; mb?: number; pt?: number; pb?: number; py?: number };
  styleByBp?: HeroBlock["styleByBp"];
};

export type BtnBlock = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  type: "btn";
  label: string;
  href: string;
  variant?: "primary" | "secondary";
  align?: Align;
  anchorId?: string;
  className?: string;
  style?: { mt?: number; mb?: number; pt?: number; pb?: number; py?: number };
  styleByBp?: HeroBlock["styleByBp"];
};

export type Cols2Block = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  type: "cols2";
  title: string;
  text: string;
  img: string; // CID/URL
  alt: string;
  ratio: ColsRatio;
  reverse?: boolean;
  anchorId?: string;
  className?: string;
  style?: { mt?: number; mb?: number; pt?: number; pb?: number; py?: number };
  styleByBp?: HeroBlock["styleByBp"];
};

export type SpacerBlock = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  type: "spacer";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  anchorId?: string;
  className?: string;
  style?: { mt?: number; mb?: number; pt?: number; pb?: number; py?: number };
  styleByBp?: HeroBlock["styleByBp"];
};

export type DividerBlock = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  type: "divider";
  anchorId?: string;
  className?: string;
  style?: { mt?: number; mb?: number; pt?: number; pb?: number; py?: number };
  styleByBp?: HeroBlock["styleByBp"];
};

export type SectionBlock = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  type: "section";
  title?: string;
  text?: string;
  align?: Align;
  theme?: "auto" | "light" | "dark";
  pad?: "sm" | "md" | "lg";
  bg?: "none" | "subtle" | "card" | "accent";
  anchorId?: string;
  className?: string;
  style?: { mt?: number; mb?: number; pt?: number; pb?: number; py?: number };
  styleByBp?: HeroBlock["styleByBp"];
};

export type GridItem = { id: string; src: string; alt?: string; caption?: string };

export type GridBlock = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  type: "grid";
  cols: 1 | 2 | 3 | 4;
  items: GridItem[];
  anchorId?: string;
  className?: string;
  style?: { mt?: number; mb?: number; pt?: number; pb?: number; py?: number };
  styleByBp?: HeroBlock["styleByBp"];
};

// ── B6: лёгкие контент-блоки ─────────────────────────────────────────────────
export type IconName = "star" | "check" | "heart" | "shield" | "alert";

export type IconBlock = {
  id: string;
  type: "icon";
  name: IconName;
  size?: "sm" | "md" | "lg" | "xl"; // 16 / 24 / 32 / 48
  color?: string; // tailwind-класс цвета текста, напр. "text-[#2a3b8f]"
};

export type IconListVariant = "dot" | "check" | "star" | "custom";
export type IconListSize = "sm" | "md" | "lg";
export type IconListAlign = "start" | "center" | "end";
export type IconListItem = { id: string; label: string; href?: string; description?: string; icon?: string };

export type IconListBlock = {
  id: string;
  type: "iconlist";
  items: IconListItem[];
  variant?: IconListVariant;       // dot|check|star|custom
  size?: IconListSize;             // sm|md|lg
  gap?: IconListSize;              // sm|md|lg
  align?: IconListAlign;           // start|center|end
};

export type AlertVariant = "info" | "success" | "warning" | "danger";

export type AlertBlock = {
  id: string;
  type: "alert";
  variant: AlertVariant;
  title?: string;
  text?: string;
};

export type HtmlBlock = {
  id: string;
  type: "html";
  html: string; // будет жёстко санитизироваться при рендере
};

export type CodeBlock = {
  id: string;
  type: "code";
  code: string;
  lang?: string;
};

// ── B6.c: вкладки/аккордеон/цитата/CTA/рейтинг ───────────────────────────────
export type TabsVariant = "underline" | "boxed" | "pill";
export type TabsSize = "sm" | "md" | "lg";
export type TabsAlign = "start" | "center" | "end";
export type TabsOrientation = "horizontal" | "vertical";
export type TabItem = { id: string; label: string; content?: string; disabled?: boolean };

export type TabsBlock = {
  id: string;
  type: "tabs";
  tabs: TabItem[];                 // прежнее поле tabs — оставляем
  active?: number;                 // индекс 0..N-1
  variant?: TabsVariant;           // underline|boxed|pill
  size?: TabsSize;                 // sm|md|lg
  align?: TabsAlign;               // start|center|end
  orientation?: TabsOrientation;   // horizontal|vertical
};

export type AccordionVariant = "ghost" | "filled" | "outline";
export type AccordionSize = "sm" | "md" | "lg";
export type AccordionItem = { id: string; title: string; content?: string; open?: boolean };

export type AccordionBlock = {
  id: string;
  type: "accordion";
  items: AccordionItem[];          // было items — не ломаем
  allowMultiple?: boolean;         // можно открывать несколько
  allowToggle?: boolean;           // можно закрыть последний открытый
  variant?: AccordionVariant;      // ghost|filled|outline
  size?: AccordionSize;            // sm|md|lg
};

export type BlockquoteBlock = {
  id: string;
  type: "blockquote";
  text: string;
  cite?: string;
};

export type CtaVariant = "primary" | "secondary" | "outline" | "ghost";
export type CtaAlign = "start" | "center" | "end";
export type CtaEmphasis = "none" | "panel" | "brand";

export type CtaBlock = {
  id: string;
  type: "cta";
  title?: string;
  text?: string;
  btnLabel?: string;
  btnHref?: string;
  variant?: CtaVariant;            // стиль кнопки
  align?: CtaAlign;                // выравнивание
  emphasis?: CtaEmphasis;          // фон/акцент
};

export type RatingBlock = {
  id: string;
  type: "rating";
  value: number; // 0..max
  max?: number; // по умолчанию 5
  readonly?: boolean; // в предпросмотре можно изменять, если false
};

// ── B6.d: простые контент/навигац. блоки ─────────────────────────────────────
export type CounterBlock = {
  id: string;
  type: "counter";
  value: number;            // текущее значение
  prefix?: string;          // например "≈"
  suffix?: string;          // например "+"
};

export type ProgressBlock = {
  id: string;
  type: "progress";
  value: number;            // 0..100
  label?: string;
};

export type Crumb = { id: string; label: string; href?: string };
export type BreadcrumbsBlock = {
  id: string;
  type: "breadcrumbs";
  items: Crumb[];
};

export type PaginationBlock = {
  id: string;
  type: "pagination";
  total: number;            // страниц
  current: number;          // 1..total
};

export type SocialItem = { id: string; label: string; href: string };
export type SocialBlock = {
  id: string;
  type: "social";
  items: SocialItem[];
};

export type IconBoxBlock = {
  id: string;
  type: "iconbox";
  icon: IconName;
  title: string;
  text?: string;
};

export type ImageBoxBlock = {
  id: string;
  type: "imagebox";
  src?: string;     // url или cid
  alt?: string;
  title?: string;
  text?: string;
};

// ── B6.e: price/testimonials/share/tracker/anchor/toc ────────────────────────
export type PriceItem = { id: string; title: string; price: string; desc?: string };
export type PriceListBlock = {
  id: string;
  type: "pricelist";
  items: PriceItem[];
};

export type TestimonialItem = { id: string; author: string; text: string; role?: string };
export type TestimonialsBlock = {
  id: string;
  type: "testimonials";
  items: TestimonialItem[];
};

export type ShareNetwork = "copy" | "telegram" | "vk" | "twitter" | "facebook";
export type ShareBlock = {
  id: string;
  type: "share";
  url?: string;                // если не задан — берём location.href в рантайме (в SafePreview не будет доступа, поэтому опционально)
  networks: ShareNetwork[];
};

export type ProgressStep = { id: string; label: string };
export type ProgressTrackerBlock = {
  id: string;
  type: "progresstracker";
  steps: ProgressStep[];
  current: number;            // индекс 0..N-1
};

export type AnchorBlock = {
  id: string;
  type: "anchor";
  name: string;               // якорь (id) для навигации, только [a-z0-9-_]
  label?: string;             // человекочитаемое
};

export type TocItem = { id: string; label: string; href: string }; // href= "#id"
export type TocBlock = {
  id: string;
  type: "toc";
  items: TocItem[];          // пока ручной список; авто-скан добавим позже
};

// ── B6.f: video/gallery/carousel/countdown/menu/search/contentnav ────────────
export type VideoBlock = {
  id: string;
  type: "video";
  src?: string;       // https:, ipfs:, data: — санитизируем
  poster?: string;
  loop?: boolean;
  muted?: boolean;
};

export type GalleryItem = { id: string; src: string; alt?: string };
export type GalleryBlock = {
  id: string;
  type: "gallery";
  cols?: 2 | 3 | 4;
  items: GalleryItem[];
};

export type CarouselSlide = { id: string; src: string; alt?: string; caption?: string };
export type CarouselBlock = {
  id: string;
  type: "carousel";
  slides: CarouselSlide[];
  initial?: number;
};

export type CountdownBlock = {
  id: string;
  type: "countdown";
  target: string;  // ISO-дата/время
};

export type MenuItem = { id: string; label: string; href: string };
export type MenuOrientation = "horizontal" | "vertical";
export type MenuBlock = {
  id: string;
  type: "menu";
  items: MenuItem[];
  orientation?: MenuOrientation;
};

export type SearchBlock = {
  id: string;
  type: "search";
  placeholder?: string;
  action?: string; // по умолчанию '#'
  method?: "GET" | "POST";
};

export type ContentNavItem = { id: string; label: string; href: string }; // href="#id"
export type ContentNavBlock = {
  id: string;
  type: "contentnav";
  items: ContentNavItem[];
  orientation?: MenuOrientation;
};

// ── B6.g: map/lottie/mediacarousel/slides/videoplaylist/hotspot ──────────────
export type MapBlock = {
  id: string;
  type: "map";
  lat: number;
  lon: number;
  zoom?: number;                 // 1..20
  label?: string;
  style?: "auto" | "light" | "dark";
};

export type LottieBlock = {
  id: string;
  type: "lottie";
  src?: string;                  // ссылка на .json (без внешних скриптов)
  autoplay?: boolean;
  loop?: boolean;
  poster?: string;               // картинка-заглушка
  caption?: string;
};

export type MediaSlide = { id: string; kind: "img" | "video"; src: string; alt?: string; caption?: string };
export type MediaCarouselBlock = {
  id: string;
  type: "mediacarousel";
  slides: MediaSlide[];
  initial?: number;
};

export type TextSlide = { id: string; title?: string; text?: string; ctaLabel?: string; ctaHref?: string };
export type SlidesBlock = {
  id: string;
  type: "slides";
  slides: TextSlide[];
  initial?: number;
};

export type VideoItem = { id: string; src: string; title?: string; poster?: string };
export type VideoPlaylistBlock = {
  id: string;
  type: "videoplaylist";
  items: VideoItem[];
  initial?: number;
};

export type HotspotMarker = { id: string; x: number; y: number; label?: string; href?: string }; // x/y — проценты 0..100
export type HotspotBlock = {
  id: string;
  type: "hotspot";
  src: string;
  alt?: string;
  markers: HotspotMarker[];
};

// ── B6.h: layout container / sidebar / offcanvas ─────────────────────────────
export type ContainerWidth = "sm" | "md" | "lg" | "xl" | "full";
export type ContainerPadding = "none" | "sm" | "md" | "lg";
export type ContainerBg = "none" | "panel" | "brand";

export type ContainerBlock = {
  id: string;
  type: "container";
  width?: ContainerWidth;     // по умолчанию md
  padding?: ContainerPadding; // по умолчанию md
  bg?: ContainerBg;           // фон: none|panel|brand
  border?: boolean;           // рамка
  rounded?: boolean;          // скругления
  note?: string;              // подпись/описание
};

export type SidebarItem = { id: string; label: string; href: string };
export type SidebarSide = "left" | "right";
export type SidebarBlock = {
  id: string;
  type: "sidebar";
  side?: SidebarSide;         // left/right (для предпросмотра — оформление)
  width?: number;             // px, по умолчанию 260
  items: SidebarItem[];       // пункты навигации
  title?: string;
};

export type OffcanvasSide = "left" | "right";
export type OffcanvasBlock = {
  id: string;
  type: "offcanvas";
  side?: OffcanvasSide;       // слева/справа
  width?: number;             // px, по умолчанию 320
  title?: string;
  body?: string;              // текст-заглушка (пока без вложенных блоков)
};

export type Block =
  | HeroBlock | H1Block | HeadingBlock | PBlock | ImgBlock | BtnBlock
  | DividerBlock | SpacerBlock | Cols2Block | SectionBlock | GridBlock
  | IconBlock | IconListBlock | AlertBlock | HtmlBlock | CodeBlock
  | TabsBlock | AccordionBlock | BlockquoteBlock | CtaBlock | RatingBlock
  | CounterBlock | ProgressBlock | BreadcrumbsBlock | PaginationBlock | SocialBlock
  | IconBoxBlock | ImageBoxBlock | PriceListBlock | TestimonialsBlock | ShareBlock
  | ProgressTrackerBlock | AnchorBlock | TocBlock
  | VideoBlock | GalleryBlock | CarouselBlock | CountdownBlock | MenuBlock | SearchBlock | ContentNavBlock
  | MapBlock | LottieBlock | MediaCarouselBlock | SlidesBlock | VideoPlaylistBlock | HotspotBlock
  | ContainerBlock | SidebarBlock | OffcanvasBlock;

export type Doc = {
  title: string;
  description?: string; // meta description
  ogImage?: string;
  theme?: {
    accent?: string;   // HEX или css-цвет
    container?: number; // px
  };
  blocks: Block[];
};
