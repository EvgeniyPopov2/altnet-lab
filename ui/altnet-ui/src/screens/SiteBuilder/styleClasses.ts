import { asRecord, isRecord } from "../../core/records";
import { cellsOf, findBlock, lockedPath, updateBlock } from "./layoutTree";
import { applyStyleLayer, resolveResponsiveStyle } from "./responsiveStyle";
import type { Block, Device, DeviceStyles, Doc, StyleClass, StyleLayer } from "./types";

const devices: Device[] = ["desktop", "tablet", "mobile"];
export const validClassName = (value: string) => /^[a-z][a-z0-9_-]{0,63}$/i.test(value);
function validLayer(value: unknown): value is StyleLayer {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([key, entry]) =>
        /^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(key) &&
        (typeof entry === "string" || (typeof entry === "number" && Number.isFinite(entry)))
    )
  );
}
export function validStyleClasses(value: unknown): value is StyleClass[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set(),
    names = new Set();
  return value.every((rule) => {
    if (
      !isRecord(rule) ||
      typeof rule.id !== "string" ||
      !validClassName(rule.id) ||
      ids.has(rule.id) ||
      typeof rule.name !== "string" ||
      !validClassName(rule.name) ||
      names.has(rule.name) ||
      !isRecord(rule.layers) ||
      !Object.entries(rule.layers).every(([device, layer]) => devices.includes(device as Device) && validLayer(layer))
    )
      return false;
    ids.add(rule.id);
    names.add(rule.name);
    return true;
  });
}

function layer(value: unknown): StyleLayer {
  return Object.fromEntries(
    Object.entries(asRecord(value)).filter(
      (pair): pair is [string, string | number] =>
        typeof pair[1] === "string" || (typeof pair[1] === "number" && Number.isFinite(pair[1]))
    )
  );
}

export function withStyleClasses(block: Block, rules: StyleClass[]): Block {
  if (!block.styleClassIds?.length) return block;
  const applied = rules.filter((rule) => block.styleClassIds?.includes(rule.id));
  if (!applied.length) return block;
  const styleByBp: DeviceStyles = {};
  for (const device of devices) {
    let effective: StyleLayer = {};
    for (const rule of applied) effective = layer(applyStyleLayer(effective, resolveResponsiveStyle({}, rule.layers, device)));
    styleByBp[device] = layer(applyStyleLayer(effective, resolveResponsiveStyle(block.style, block.styleByBp, device)));
  }
  const classes = [
    ...new Set([
      ...(block.className ?? "").split(/\s+/).filter(Boolean),
      ...applied.map((rule) => "sb-global-" + rule.name),
    ]),
  ];
  return { ...block, styleByBp, className: classes.join(" ") };
}

export function promoteStyle(doc: Doc, blockId: string, name: string, id: string): Doc {
  const block = findBlock(doc.blocks, blockId),
    rules = doc.styleClasses ?? [];
  if (
    !block ||
    lockedPath(doc.blocks, blockId) ||
    !validClassName(id) ||
    !validClassName(name) ||
    rules.some((rule) => rule.id === id || rule.name === name)
  )
    return doc;
  const layers: DeviceStyles = { ...block.styleByBp, desktop: { ...layer(block.style), ...block.styleByBp?.desktop } };
  const rule = { id, name, layers };
  return {
    ...doc,
    styleClasses: [...rules, rule],
    blocks: updateBlock(doc.blocks, blockId, (source) => ({
      ...source,
      style: typeof source.style === "string" ? source.style : undefined,
      styleByBp: undefined,
      styleClassIds: [...(source.styleClassIds ?? []), id],
    })),
  };
}

export function removeStyleClass(doc: Doc, id: string): Doc {
  if (!doc.styleClasses?.some((rule) => rule.id === id)) return doc;
  function remove(blocks: Block[]): Block[] {
    return blocks.map((block) => {
      const refs = block.styleClassIds?.filter((key) => key !== id),
        cells = cellsOf(block);
      return {
        ...block,
        ...(block.styleClassIds && { styleClassIds: refs?.length ? refs : undefined }),
        ...(cells && { layoutCells: cells.map(remove) }),
      };
    });
  }
  return {
    ...doc,
    styleClasses: doc.styleClasses.filter((rule) => rule.id !== id),
    blocks: remove(doc.blocks),
    ...(doc.sitePages && {
      sitePages: {
        ...doc.sitePages,
        pages: doc.sitePages.pages.map((page) =>
          page.document ? { ...page, document: { ...page.document, blocks: remove(page.document.blocks) } } : page
        ),
      },
    }),
  };
}

export function reorderStyleClass(doc: Doc, id: string, direction: -1 | 1): Doc {
  const rules = doc.styleClasses?.slice() ?? [],
    index = rules.findIndex((rule) => rule.id === id),
    next = index + direction;
  if (index < 0 || next < 0 || next >= rules.length) return doc;
  [rules[index], rules[next]] = [rules[next], rules[index]];
  return { ...doc, styleClasses: rules };
}
