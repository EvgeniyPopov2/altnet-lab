// src/screens/SiteBuilder/blocks/index.tsx
import type { Block } from "../types";
import H1View from "./h1/view";
import PView from "./p/view";
import BtnView from "./btn/view";

/** Возвращает React-элемент превью для любого блока. */
export function renderBlockView(b: Block) {
  switch (b.type) {
    case "h1":
      return <H1View block={b} />;
    case "p":
      return <PView block={b} />;
    case "btn":
      return <BtnView block={b} />;
    // Остальные типы подключим в следующих шагах:
    // case "img": ...
    // case "divider": ...
    // case "spacer": ...
    default:
      // Фоллбэк: просто вывести тип
      return (
        <div className="text-sm text-[#6b7390]">
          Превью для блока <b>{b.type}</b> пока не реализовано.
        </div>
      );
  }
}
