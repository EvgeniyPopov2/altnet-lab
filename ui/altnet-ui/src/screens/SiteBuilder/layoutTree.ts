import type { Block } from "./types";
import { gridCoveredCells } from "./gridLayout";

type LayoutBlock = Extract<Block, { type: "grid" | "section" | "container" | "offcanvas" }>;

export function cellsOf(block: Block): Block[][] | undefined {
  return block.type === "grid" || block.type === "section" || block.type === "container" || block.type === "offcanvas" ? block.layoutCells : undefined;
}

export function findBlock(blocks: Block[], id: string): Block | undefined {
  for (const block of blocks) {
    if (block.id === id) return block;
    for (const cell of cellsOf(block) ?? []) {
      const found = findBlock(cell, id);
      if (found) return found;
    }
  }
  return undefined;
}

export function findLocation(blocks: Block[], id: string): { parentId: string | null; cellIndex: number; index: number } | undefined {
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (block.id === id) return { parentId: null, cellIndex: -1, index };
    const cells = cellsOf(block) ?? [];
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
      const found = findLocation(cells[cellIndex], id);
      if (found) return found.parentId === null ? { parentId: block.id, cellIndex, index: found.index } : found;
    }
  }
  return undefined;
}

export function lockedPath(blocks: Block[], id: string, locked = false): boolean {
  for (const block of blocks) {
    const here = locked || ("locked" in block && Boolean(block.locked));
    if (block.id === id) return here;
    for (const cell of cellsOf(block) ?? []) {
      if (findBlock(cell, id)) return lockedPath(cell, id, here);
    }
  }
  return false;
}

export function updateBlock(blocks: Block[], id: string, update: (block: Block) => Block): Block[] {
  let changed = false;
  const result = blocks.map(block => {
    if (block.id === id) {
      const next = update(block);
      changed ||= next !== block;
      return next;
    }
    const cells = cellsOf(block);
    if (!cells) return block;
    const next = cells.map(cell => updateBlock(cell, id, update));
    if (next.every((cell, index) => cell === cells[index])) return block;
    changed = true;
    return { ...block, layoutCells: next } as LayoutBlock;
  });
  return changed ? result : blocks;
}

export function insertIntoCell(blocks: Block[], parentId: string, cellIndex: number, block: Block, at?: number): Block[] {
  if (findBlock(blocks, block.id) || lockedPath(blocks, parentId)) return blocks;
  return updateBlock(blocks, parentId, parent => {
    const cells = cellsOf(parent);
    if (!cells || !Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= cells.length || ("locked" in parent && parent.locked) ||
        (parent.type === "grid" && gridCoveredCells(parent).has(cellIndex))) return parent;
    const next = cells.map(cell => cell.slice());
    const index = at === undefined ? next[cellIndex].length : Math.max(0, Math.min(at, next[cellIndex].length));
    next[cellIndex].splice(index, 0, block);
    return { ...parent, layoutCells: next } as LayoutBlock;
  });
}

export function removeFromTree(blocks: Block[], id: string): Block[] {
  if (lockedPath(blocks, id)) return blocks;
  let changed = false;
  const result: Block[] = [];
  for (const block of blocks) {
    if (block.id === id) {
      changed = true;
      continue;
    }
    const cells = cellsOf(block);
    if (!cells) {
      result.push(block);
      continue;
    }
    const next = cells.map(cell => removeFromTree(cell, id));
    if (next.some((cell, index) => cell !== cells[index])) {
      changed = true;
      result.push({ ...block, layoutCells: next } as LayoutBlock);
    } else {
      result.push(block);
    }
  }
  return changed ? result : blocks;
}

export function moveToCell(blocks: Block[], id: string, parentId: string, cellIndex: number, at?: number): Block[] {
  const block = findBlock(blocks, id);
  const parent = findBlock(blocks, parentId);
  if (!block || !parent || lockedPath(blocks, id) || lockedPath(blocks, parentId) || findBlock([block], parentId) || !cellsOf(parent)?.[cellIndex] ||
      ("locked" in parent && parent.locked) || ("locked" in block && block.locked)) return blocks;
  const oldIndex = cellsOf(parent)![cellIndex].findIndex(child => child.id === id);
  const target = at !== undefined && oldIndex >= 0 && oldIndex < at ? at - 1 : at;
  const without = removeFromTree(blocks, id);
  const inserted = insertIntoCell(without, parentId, cellIndex, block, target);
  return inserted === without ? blocks : inserted;
}

export function moveToRoot(blocks: Block[], id: string, slot: number): Block[] {
  const block = findBlock(blocks, id);
  if (!block || lockedPath(blocks, id) || !Number.isInteger(slot) || slot < 0 || slot > blocks.length) return blocks;
  const originalIndex = blocks.findIndex(item => item.id === id);
  const target = slot - (originalIndex >= 0 && originalIndex < slot ? 1 : 0);
  if (originalIndex === target) return blocks;
  const remaining = removeFromTree(blocks, id);
  const next = remaining.slice();
  next.splice(target, 0, block);
  return next;
}

export function copyTree(block: Block, makeId: () => string): Block {
  const cells = cellsOf(block);
  return {
    ...block,
    id: makeId(),
    ...(cells ? { layoutCells: cells.map(cell => cell.map(child => copyTree(child, makeId))) } : {}),
  } as Block;
}

export function visibleBlocks(blocks: Block[]): Block[] {
  return blocks.filter(block => !("hidden" in block && block.hidden)).map(block => {
    const cells = cellsOf(block);
    return cells ? { ...block, layoutCells: cells.map(visibleBlocks) } as LayoutBlock : block;
  });
}
