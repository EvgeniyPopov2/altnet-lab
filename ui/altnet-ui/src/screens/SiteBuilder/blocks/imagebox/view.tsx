import type { ImageBoxBlock } from "../../types";

export default function ImageBoxView({ block }: { block: ImageBoxBlock }) {
  return (
    <figure className="grid gap-2">
      {block.src && (
        <img
          src={block.src}
          alt={block.alt || ""}
          className="w-full rounded-xl border border-[#2a2f45]"
          draggable={false}
        />
      )}
      {(block.title || block.text) && (
        <figcaption className="grid gap-1">
          {block.title && <div className="text-sm font-semibold text-[#e6e9f4]">{block.title}</div>}
          {block.text && <div className="text-xs text-[#9aa3b2]">{block.text}</div>}
        </figcaption>
      )}
    </figure>
  );
}
