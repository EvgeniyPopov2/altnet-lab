// src/screens/SiteBuilder/registry.ts
// Единый реестр создания блоков и утилиты для SiteBuilder.

import type {
  Block, H1Block, PBlock, BtnBlock, ImgBlock,
  DividerBlock, SpacerBlock
} from "./types";

// Берём точный union InsertChoice из нативного SortableCanvas,
// чтобы совпасть с его типами и не спорить с TS.
import SortableCanvas from "../../builder/SortableCanvas";
type NativeProps = React.ComponentProps<typeof SortableCanvas>;
type NativeOnInsertAt = NonNullable<NativeProps["onInsertAt"]>;
export type InsertChoice = Parameters<NativeOnInsertAt>[1];

// Простая генерация id (локально, без коллизий в рамках сессии).
export function newId(prefix = "blk"): string {
  // rnd 6 символов base36 + time короткое
  const rnd = Math.random().toString(36).slice(2, 8);
  const t = Date.now().toString(36).slice(-4);
  return `${prefix}_${rnd}${t}`;
}

// Создание дефолтного блока по типу InsertChoice
export function createDefaultBlock(type: InsertChoice): Block {
  switch (type) {
    case "h1": {
      const b: H1Block = {
        id: newId("h1"),
        type: "h1",
        text: "Заголовок",
        align: "left",
      };
      return b;
    }
    case "p": {
      const b: PBlock = {
        id: newId("p"),
        type: "p",
        text: "Текст абзаца. Нажмите, чтобы отредактировать.",
        align: "left",
      };
      return b;
    }
    case "btn": {
      const b: BtnBlock = {
        id: newId("btn"),
        type: "btn",
        label: "Кнопка",
        href: "#",
        variant: "primary",
        align: "left",
      };
      return b;
    }
    case "img": {
      const b: ImgBlock = {
        id: newId("img"),
        type: "img",
        cid: "",
        alt: "Изображение",
      };
      return b;
    }
    case "divider": {
      const b: DividerBlock = {
        id: newId("hr"),
        type: "divider",
      };
      return b;
    }
    case "spacer": {
      const b: SpacerBlock = {
        id: newId("sp"),
        type: "spacer",
        size: "md",
      };
      return b;
    }
default: {
  // Fallback для будущих типов: вернём безопасный абзац.
  const b: PBlock = {
    id: newId("p"),
    type: "p",
    text: `Unsupported type: ${String(type)}`,
    align: "left",
  };
  return b;
}
  }
}
