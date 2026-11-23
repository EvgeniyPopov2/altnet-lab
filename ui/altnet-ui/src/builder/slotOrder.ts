import { arrayMove } from "@dnd-kit/sortable";

export function moveBlockToSlot<T>(blocks: T[], oldIndex: number, slotIndex: number): T[] {
  if (oldIndex < 0 || oldIndex >= blocks.length || slotIndex < 0 || slotIndex > blocks.length) return blocks;
  const targetIndex = slotIndex - (oldIndex < slotIndex ? 1 : 0);
  return targetIndex === oldIndex ? blocks : arrayMove(blocks, oldIndex, targetIndex);
}
