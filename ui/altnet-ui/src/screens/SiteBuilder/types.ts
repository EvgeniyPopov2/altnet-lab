// src/screens/SiteBuilder/types.ts
// Типы документа и блоков Конструктора (извлечено из SiteBuilder.tsx)
// Никакой логики — только описательные интерфейсы/типы.

export type BlockType =
  | "hero"
  | "h1"
  | "heading"
  | "p"
  | "btn"
  | "img"
  | "divider"
  | "spacer"
  | "cols2"
  | "section"
  | "grid"
  | "icon"
  | "iconlist"
  | "alert"
  | "html"
  | "code"
  | "tabs"
  | "accordion"
  | "blockquote"
  | "cta"
  | "rating"
  | "counter"
  | "progress"
  | "breadcrumbs"
  | "pagination"
  | "social"
  | "iconbox"
  | "imagebox";
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

export type IconListItem = { id: string; icon: IconName; text: string };

export type IconListBlock = {
  id: string;
  type: "iconlist";
  items: IconListItem[];
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
export type TabItem = { id: string; label: string; content: string };
export type TabsBlock = {
  id: string;
  type: "tabs";
  items: TabItem[];
  initial?: number;
};

export type AccordionItem = { id: string; title: string; content: string; open?: boolean };
export type AccordionBlock = {
  id: string;
  type: "accordion";
  items: AccordionItem[];
  allowMultiple?: boolean;
};

export type BlockquoteBlock = {
  id: string;
  type: "blockquote";
  text: string;
  cite?: string;
};

export type CtaVariant = "primary" | "secondary" | "outline";
export type CtaBlock = {
  id: string;
  type: "cta";
  title: string;
  text?: string;
  btnLabel: string;
  href: string;
  variant?: CtaVariant;
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

export type Block =
  | HeroBlock | H1Block | HeadingBlock | PBlock | ImgBlock | BtnBlock
  | DividerBlock | SpacerBlock | Cols2Block | SectionBlock | GridBlock
  | IconBlock | IconListBlock | AlertBlock | HtmlBlock | CodeBlock
  | TabsBlock | AccordionBlock | BlockquoteBlock | CtaBlock | RatingBlock
  | CounterBlock | ProgressBlock | BreadcrumbsBlock | PaginationBlock | SocialBlock
  | IconBoxBlock | ImageBoxBlock;

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
