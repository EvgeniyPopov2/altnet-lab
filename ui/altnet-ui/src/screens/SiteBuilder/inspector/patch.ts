export type BlockPatch = Record<string, any> | ((current: any) => Record<string, any>);
