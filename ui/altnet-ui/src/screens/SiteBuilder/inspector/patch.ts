import type { Block } from "../types";

export type BlockPatch = Record<string, unknown> | ((current: Block) => Record<string, unknown>);
