import { oneOf } from "../../core/records";

// Только встроенные геометрические формы. Внешние SVG и пользовательский CSS не загружаются.
export const clipShapes = ["none", "circle", "ellipse", "triangle", "diamond", "hexagon", "star"] as const;
export const clipLabels: Record<typeof clipShapes[number], string> = {
  none: "Без обрезки", circle: "Круг", ellipse: "Эллипс", triangle: "Треугольник",
  diamond: "Ромб", hexagon: "Шестиугольник", star: "Звезда",
};
const paths: Record<typeof clipShapes[number], string> = {
  none: "none", circle: "circle(50% at 50% 50%)", ellipse: "ellipse(50% 50% at 50% 50%)",
  triangle: "polygon(50% 0%,100% 100%,0% 100%)", diamond: "polygon(50% 0%,100% 50%,50% 100%,0% 50%)",
  hexagon: "polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%)",
  star: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)",
};
export function blockClipStyle(style: Record<string, unknown>): Record<string, string> {
  return oneOf(style.clipShape, clipShapes) ? { clipPath: paths[style.clipShape] } : {};
}
