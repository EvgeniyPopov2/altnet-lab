// src/screens/SiteBuilder/types.ts
// Типы документа и блоков Конструктора (извлечено из SiteBuilder.tsx)
// Никакой логики — только описательные интерфейсы/типы.

export type BlockType =
  | "hero"
  | "h1"
  | "heading"
  | "p"
  | "img"
  | "btn"
  | "cols2"
  | "spacer"
  | "divider"
  | "section"
  | "grid";

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

export type Block =
  | HeroBlock
  | H1Block
  | HeadingBlock
  | PBlock
  | ImgBlock
  | BtnBlock
  | Cols2Block
  | SpacerBlock
  | DividerBlock
  | SectionBlock
  | GridBlock;

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
