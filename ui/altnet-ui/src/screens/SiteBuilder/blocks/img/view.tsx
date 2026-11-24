// src/screens/SiteBuilder/blocks/img/view.tsx
import { imageCaption } from "../../mediaLibrary";
import type { ImgBlock } from "../../types";
import type { CSSProperties } from "react";
import { imageAlignment, imageCaptionStyle, imageHoverStyle, imageStyle, imageTransition } from "../../imageStyle";
import { sanitizeHref } from "../../../../builder/cdr";

export default function ImgView({ block, device = "desktop" }: { block: ImgBlock; device?: "desktop" | "tablet" | "mobile" }) {
  const src = block.src ?? block.cid ?? ""; // поддерживаем http(s)/ipfs/altfs/data:
  if (!src) {
    // Плейсхолдер, когда изображения ещё нет
    return (
      <div className="aspect-video w-full rounded-xl border border-dashed border-[#2a2f45] bg-[#0f1630] grid place-items-center text-xs text-[#9aa3b2]">
        Изображение не выбрано
      </div>
    );
  }
  const hover = imageHoverStyle(block.imageStyleByBp, device);
  const duration = imageTransition(block.imageStyleByBp, device);
  const variables = Object.fromEntries(Object.entries(hover).map(([key, value]) => [`--sb-image-hover-${key.replace(/[A-Z]/g, char => "-" + char.toLowerCase())}`, value]));
  const classes = Object.keys(hover).map(key => `sb-image-hover-${key.replace(/[A-Z]/g, char => "-" + char.toLowerCase())}`).join(" ");
  const picture = (
    <img
      src={src}
      alt={block.alt || ""}
      className={`max-w-full rounded-xl border border-[#2a2f45] sb-editor-image ${classes}`}
      style={{ ...imageStyle(block.imageStyleByBp, device), ...variables, ...(duration === undefined ? {} : { transitionProperty: "opacity,filter,border-color,border-radius,border-width,box-shadow", transitionDuration: `${duration}ms` }) } as CSSProperties}
      draggable={false}
      referrerPolicy="no-referrer"
    />
  );
  const caption = imageCaption(block);
  const linked = (!block.linkTo || block.linkTo === "custom") && typeof block.href === "string" && block.href.trim() ? <a className="sb-editor-image-link" href={sanitizeHref(block.href)} onClick={event => event.preventDefault()}>{picture}</a> : picture;
  const captioned = caption ? <figure className="sb-editor-image-figure">{linked}<figcaption style={imageCaptionStyle(block.imageStyleByBp, device)}>{caption}</figcaption></figure> : linked;
  const alignment = imageAlignment(block.imageStyleByBp, device);
  return alignment ? <div style={{ textAlign: alignment as CSSProperties["textAlign"] }}>{captioned}</div> : captioned;
}
