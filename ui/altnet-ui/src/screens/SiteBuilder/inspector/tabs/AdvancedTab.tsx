import type { Block } from "../../types";
import TransformControls from "./TransformControls";
import LayoutEffects from "./LayoutEffects";
import BlockFilterControls from "./BlockFilterControls";
import BlockClipControls from "./BlockClipControls";
import EntranceControls from "./EntranceControls";
import SpacingControl from "./SpacingControl";
import type { BlockPatch } from "../patch";
import Field from "../../ui/Field";

type Props = {
  block: Block;
  onPatch: (patch: BlockPatch, group?: string) => void;
  device: "desktop" | "tablet" | "mobile";
};

export default function AdvancedTab({ block, onPatch, device }: Props) {
  return (
    <div className="grid gap-3">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={block.hideOn?.[device] === true} onChange={event => onPatch({ hideOn: { ...block.hideOn, [device]: event.target.checked } })} />Скрыть на выбранном экране</label>
      <p className="text-xs text-[#c9d0e9]">В редакторе скрытый блок остаётся доступен для настройки. На опубликованной странице он не показывается на выбранном устройстве.</p>
      <SpacingControl block={block} device={device} kind="padding" onPatch={onPatch} />
      <SpacingControl block={block} device={device} kind="margin" onPatch={onPatch} />
      <TransformControls block={block} device={device} onPatch={onPatch} />
      <LayoutEffects block={block} device={device} onPatch={onPatch} />
      <BlockFilterControls block={block} device={device} onPatch={onPatch} />
      <BlockClipControls block={block} device={device} onPatch={onPatch} />
      <EntranceControls block={block} device={device} onPatch={onPatch} />
      <Field label="CSS class">
        <input
          className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751]"
          value={block.className || ""}
          onChange={(e) => onPatch({ className: e.target.value })}
          placeholder="например: my-card"
        />
      </Field>
      <Field label="Anchor (id)">
        <input
          className="w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751]"
          value={block.anchorId || block.anchor || ""}
          onChange={(e) => onPatch({ anchorId: e.target.value, anchor: e.target.value })}
          placeholder="например: section-1"
        />
      </Field>
      {(block.anchorId || block.anchor) && !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(block.anchorId || block.anchor || "") &&
        <p className="text-xs text-amber-300">ID должен начинаться с латинской буквы и содержать только латинские буквы, цифры, дефис или подчёркивание.</p>}
    </div>
  );
}
