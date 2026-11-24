import { resolveLayout, type LayoutByBreakpoint } from "./layoutResponsive";

export const MAX_GRID_CELLS = 64;
export const MAX_GRID_COLUMNS = 12;
export type GridMerge = { start: number; columns: number; rows: number };
type Grid = { layoutCells?: unknown[][]; layoutColumns?: unknown; layoutPreset?: unknown; layoutByBp?: LayoutByBreakpoint; layoutGap?: unknown; layoutMerges?: unknown };

/** Старые документы без числа колонок остаются однострочными. */
export function gridColumnCount(block: Grid): number {
  const count = Array.isArray(block.layoutCells) ? block.layoutCells.length : 0;
  const n = block.layoutColumns;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_GRID_COLUMNS && n <= count && count % n === 0 ? n : count;
}

export function gridTracks(block: Grid, device: "desktop" | "tablet" | "mobile"): number[] {
  return resolveLayout(block, device).weights.slice(0, gridColumnCount(block));
}

/** Некорректные или занятые объединения не скрывают пользовательские данные. */
export function readGridMerges(block: Grid): GridMerge[] | null {
  if (block.layoutMerges === undefined) return [];
  if (!Array.isArray(block.layoutMerges) || !Array.isArray(block.layoutCells)) return null;
  const columns = gridColumnCount(block);
  if (!columns || block.layoutMerges.length > block.layoutCells.length) return null;
  const used = new Set<number>(), result: GridMerge[] = [];
  for (const item of block.layoutMerges) {
    if (!item || typeof item !== "object") return null;
    const { start, rows, columns: width } = item;
    if (![start, rows, width].every(Number.isInteger) || start < 0 || start >= block.layoutCells.length ||
        rows < 1 || width < 1 || (rows === 1 && width === 1)) return null;
    const row = Math.floor(start / columns), col = start % columns;
    if (col + width > columns || (row + rows) * columns > block.layoutCells.length) return null;
    for (let y = 0; y < rows; y++) for (let x = 0; x < width; x++) {
      const index = (row + y) * columns + col + x;
      if (used.has(index) || (index !== start && (!Array.isArray(block.layoutCells[index]) || block.layoutCells[index].length > 0))) return null;
      used.add(index);
    }
    result.push({ start, rows, columns: width });
  }
  return result;
}

export function gridCoveredCells(block: Grid): Set<number> {
  const covered = new Set<number>(), columns = gridColumnCount(block);
  for (const merge of readGridMerges(block) || []) {
    for (let y = 0; y < merge.rows; y++) for (let x = 0; x < merge.columns; x++) {
      const index = merge.start + y * columns + x;
      if (index !== merge.start) covered.add(index);
    }
  }
  return covered;
}

export function setGridMerge(block: Grid, start: number, width: number, height: number): Record<string, unknown> | null {
  const merges = readGridMerges(block);
  if (!merges) return null;
  const next = [...merges.filter(item => item.start !== start), { start, columns: width, rows: height }];
  return readGridMerges({ ...block, layoutMerges: next }) ? { layoutMerges: next } : null;
}

export function splitGridMerge(block: Grid, start: number): Record<string, unknown> | null {
  const merges = readGridMerges(block);
  if (!merges || !merges.some(item => item.start === start)) return null;
  return { layoutMerges: merges.filter(item => item.start !== start) };
}

/** Операция не удаляет непустые ячейки и не изменяет исходный документ. */
export function changeGrid(block: Grid, operation: "add-row" | "remove-row" | "add-column" | "remove-column"): Record<string, unknown> | null {
  const cells = block.layoutCells;
  if (!Array.isArray(cells) || !cells.length || !cells.every(Array.isArray)) return null;
  const columns = gridColumnCount(block);
  if (!columns || cells.length % columns) return null;
  const rows = cells.length / columns;
  const merges = readGridMerges(block);
  if (!merges) return null;
  const matrix = Array.from({ length: rows }, (_, index) => cells.slice(index * columns, (index + 1) * columns));
  let nextColumns = columns;
  if (operation === "add-row") {
    if (cells.length + columns > MAX_GRID_CELLS) return null;
    matrix.push(Array.from({ length: columns }, () => []));
  } else if (operation === "remove-row") {
    if (rows <= 1 || matrix[rows - 1].some(cell => cell.length > 0) || merges.some(item => Math.floor(item.start / columns) + item.rows === rows)) return null;
    matrix.pop();
  } else if (operation === "add-column") {
    if (columns >= MAX_GRID_COLUMNS || cells.length + rows > MAX_GRID_CELLS) return null;
    matrix.forEach(row => row.push([]));
    nextColumns++;
  } else {
    if (columns <= 1 || matrix.some(row => row[columns - 1].length > 0) || merges.some(item => item.start % columns + item.columns === columns)) return null;
    matrix.forEach(row => row.pop());
    nextColumns--;
  }
  const repeat = (source: number[]) => {
    const weights = Array.from({ length: nextColumns }, (_, i) => source[i] || 1);
    return matrix.flatMap(() => weights);
  };
  const base = repeat(gridTracks(block, "desktop"));
  const by: LayoutByBreakpoint = { ...block.layoutByBp };
  for (const device of ["tablet", "mobile"] as const) {
    const setting = block.layoutByBp?.[device];
    if (setting && typeof setting === "object") {
      by[device] = { ...setting, ...(Array.isArray(setting.weights) ? { weights: repeat(gridTracks(block, device)) } : {}) };
    }
  }
  const updatedMerges = merges.map(item => ({ ...item, start: Math.floor(item.start / columns) * nextColumns + item.start % columns }));
  return { layoutCells: matrix.flat(), layoutColumns: nextColumns, layoutPreset: base, ...(block.layoutMerges !== undefined ? { layoutMerges: updatedMerges } : {}), ...(block.layoutByBp ? { layoutByBp: by } : {}) };
}
