import { useId, type CSSProperties } from "react";
import { textPathOptions } from "../textPath";
import type { TextPathBlock } from "../types";
import { sanitizeHref } from "../../../builder/cdr";

export default function TextPathView({ block }: { block: TextPathBlock }) {
  const id = "path-" + useId().replace(/[^A-Za-z0-9_-]/g, ""),
    s = textPathOptions(block);
  const vars = { "--sb-path-hover": s.hoverColor, "--sb-path-stroke": s.hoverStroke } as CSSProperties;
  const svg = (
    <svg
      className="sb-text-path"
      style={vars}
      width={s.size + s.unit}
      viewBox={s.viewBox}
      role="img"
      aria-label={s.text}
    >
      <g transform={"rotate(" + s.rotate + " " + s.cx + " " + s.cy + ")"}>
        <defs>
          <path id={id} d={s.d} />
        </defs>
        {s.showPath && <use href={"#" + id} fill="none" stroke={s.stroke} strokeWidth={s.strokeWidth} />}
        <text
          fill={s.color}
          fontSize={s.fontSize}
          wordSpacing={s.wordSpacing}
          textAnchor={s.align}
          direction={s.direction === "auto" ? undefined : s.direction}
        >
          <textPath href={"#" + id} startOffset={s.start + "%"}>
            {s.text}
          </textPath>
        </text>
      </g>
    </svg>
  );
  return block.href ? <a href={sanitizeHref(block.href)}>{svg}</a> : svg;
}
