import { createContext, useContext } from "react";
import { withStyleClasses } from "./styleClasses";
import { resolveResponsiveStyle } from "./responsiveStyle";
import type { Block, Device, Doc, StyleClass } from "./types";

export const StyleClassesContext = createContext<{
  rules: StyleClass[];
  edit: (update: (doc: Doc) => Doc) => void;
}>({ rules: [], edit: () => {} });

export function useClassStyle(block: Block, device: Device) {
  const { rules } = useContext(StyleClassesContext);
  const styled = withStyleClasses(block, rules);
  return resolveResponsiveStyle(styled.style, styled.styleByBp, device);
}
