import { paletteMeta } from "./blocksMeta";
import type { InsertChoice } from "../../../builder/SortableCanvas";

export const WIDGET_DRAG_TYPE = "application/x-altnet-widget";
export const BLOCK_DRAG_TYPE = "application/x-altnet-existing-block";

const allowedTypes = new Set(paletteMeta.map(item => item.type).filter(type => type !== "unsupported"));

export function readWidgetType(transfer: DataTransfer): InsertChoice | null {
  const value = transfer.getData(WIDGET_DRAG_TYPE);
  return allowedTypes.has(value as InsertChoice) ? value as InsertChoice : null;
}
