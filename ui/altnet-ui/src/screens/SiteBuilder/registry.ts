// src/screens/SiteBuilder/registry.ts
// Единый реестр создания блоков и утилиты для SiteBuilder.

import type {
  Block, H1Block, PBlock, BtnBlock, ImgBlock,
  DividerBlock, SpacerBlock,
  HeadingBlock, HeroBlock, Cols2Block, SectionBlock, GridBlock,
  IconBlock, IconListBlock, AlertBlock, HtmlBlock, CodeBlock
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
export function createDefaultBlock(type: InsertChoice): Block {
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
        text: ""
      };
      return b;
    }
    case "grid": {
      const b: GridBlock = { id: newId("grid"), type: "grid", cols: 3, items: [] };
      return b;
    }

    case "icon": {
      const b: IconBlock = { id: newId("ico"), type: "icon", name: "star", size: "md", color: "text-[#2a3b8f]" };
      return b;
    }
    case "iconlist": {
      const b: IconListBlock = {
        id: newId("icol"),
        type: "iconlist",
        items: [
          { id: newId("it"), icon: "check", text: "Пункт списка 1" },
          { id: newId("it"), icon: "check", text: "Пункт списка 2" },
          { id: newId("it"), icon: "check", text: "Пункт списка 3" },
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

    default: {
      // Fallback: безопасный абзац.
      const b: PBlock = { id: newId("p"), type: "p", text: `Unsupported type: ${String(type)}`, align: "left" };
      return b;
    }
  }
}
