import { useEffect, useRef, useState } from "react";
import type { OffcanvasBlock } from "../../types";

export default function OffcanvasView({ block }: { block: OffcanvasBlock }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const width = Math.max(200, Math.min(640, Math.floor(block.width ?? 320)));
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  return <div>
    <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-[#1f2751] bg-[#101735] px-3 py-2 text-[#e6e9f4]">Открыть {block.title || "панель"}</button>
    <dialog ref={dialog} onClose={() => setOpen(false)} aria-label={block.title || "Панель"}
      style={{ width: `${width}px`, maxWidth: "100vw", height: "100dvh", maxHeight: "100dvh", margin: block.side === "right" ? "0 0 0 auto" : "0 auto 0 0" }}
      className="border border-[#1f2751] bg-[#0b1022] p-4 text-[#e6e9f4] backdrop:bg-black/50">
      <div className="mb-3 flex items-center justify-between gap-2"><strong>{block.title || "Панель"}</strong><button type="button" className="rounded border border-[#1f2751] px-2 py-1" onClick={() => setOpen(false)}>Закрыть</button></div>
      <div className="whitespace-pre-wrap text-sm text-[#c9d0e9]">{block.body ?? ""}</div>
    </dialog>
  </div>;
}
