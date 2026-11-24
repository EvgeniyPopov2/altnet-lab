import { asRecord, isRecord, oneOf } from "../../core/records";

export const triggers = ["viewport", "click", "hover", "scroll", "none"] as const;
export const MAX_LOTTIE_BYTES = 2 * 1024 * 1024;
const unsafeKeys = new Set(["__proto__", "prototype", "constructor", "segments", "timeCompleted"]);
export function readAnimation(text: string): Record<string, unknown> {
  if (text.length > MAX_LOTTIE_BYTES) throw new Error("Файл анимации больше 2 МиБ.");
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw new Error("В файле некорректный JSON.");
  }
  const positive = (v: unknown, max: number) => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= max;
  if (
    !isRecord(root) ||
    !positive(root.w, 8192) ||
    !positive(root.h, 8192) ||
    !positive(root.fr, 240) ||
    typeof root.ip !== "number" ||
    !Number.isFinite(root.ip) ||
    typeof root.op !== "number" ||
    !positive(root.op - root.ip, 100000) ||
    !Array.isArray(root.layers) ||
    !root.layers.length
  )
    throw new Error("Укажите Lottie JSON с размером композиции, частотой кадров и слоями.");
  const pending = [{ value: root as unknown, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (depth > 64 || ++count > 240000) throw new Error("Анимация превышает предел сложности.");
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("В анимации недопустимое число.");
    if (!value || typeof value !== "object") continue;
    for (const [key, child] of Object.entries(value)) {
      if (
        unsafeKeys.has(key) ||
        (key === "x" && typeof child === "string") ||
        (typeof child === "string" &&
          (/(?:url\s*\(|https?:|javascript:|^\/\/)/i.test(child) || (key === "fPath" && child)))
      ) {
        throw new Error("Для автономного воспроизведения нужны встроенные ресурсы и ключевые кадры без выражений.");
      }
      pending.push({ value: child, depth: depth + 1 });
    }
  }
  const assets = new Map<string, Record<string, unknown>>();
  if (root.assets !== undefined && !Array.isArray(root.assets)) throw new Error("Список ресурсов анимации повреждён.");
  for (const asset of root.assets ?? []) {
    if (
      !isRecord(asset) ||
      typeof asset.id !== "string" ||
      !asset.id ||
      assets.has(asset.id) ||
      asset.u ||
      (asset.p !== undefined &&
        (typeof asset.p !== "string" ||
          !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(asset.p))) ||
      (!Array.isArray(asset.layers) && !asset.p)
    )
      throw new Error("Включите изображения в JSON при экспорте Lottie.");
    assets.set(asset.id, asset);
  }
  const active = new Set<string>();
  let layers = 0;
  function checkLayers(items: unknown[], depth: number) {
    if (depth > 24) throw new Error("Слишком много вложенных композиций.");
    const parents = new Map<number, number>();
    for (const entry of items) {
      if (isRecord(entry) && typeof entry.ind === "number" && typeof entry.parent === "number")
        parents.set(entry.ind, entry.parent);
    }
    for (const id of parents.keys()) {
      const chain = new Set<number>();
      let cursor: number | undefined = id;
      while (cursor !== undefined) {
        if (chain.has(cursor) || chain.size >= 64) throw new Error("Неверная иерархия слоёв Lottie.");
        chain.add(cursor);
        cursor = parents.get(cursor);
      }
    }
    for (const item of items) {
      if (++layers > 3000 || !isRecord(item) || !oneOf(item.ty, [0, 1, 2, 3, 4, 5]))
        throw new Error("Нужна двумерная композиция из векторных слоёв, текста или встроенных изображений.");
      if (item.ty !== 0 && item.ty !== 2) continue;
      const resource = typeof item.refId === "string" ? assets.get(item.refId) : undefined;
      if (!resource || typeof item.refId !== "string" || active.has(item.refId))
        throw new Error("В анимации некорректная ссылка на композицию.");
      if (item.ty === 0) {
        if (!Array.isArray(resource.layers)) throw new Error("Отсутствуют слои вложенной композиции.");
        active.add(item.refId);
        checkLayers(resource.layers, depth + 1);
        active.delete(item.refId);
      } else if (!resource.p) throw new Error("Изображение слоя не встроено в файл.");
    }
  }
  checkLayers(root.layers, 0);
  return root;
}

export function lottieOptions(input: unknown) {
  const p = asRecord(input);
  const number = (key: string, min: number, max: number, fallback: number) => {
    const n = p[key];
    return typeof n === "number" && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };
  const start = number("start", 0, 99, 0);
  return {
    trigger: oneOf(p.trigger, triggers) ? p.trigger : p.autoplay === false ? "click" : "viewport",
    loop: p.loop !== false,
    reverse: p.reverse === true,
    speed: number("speed", 0.1, 5, 1),
    start,
    end: number("end", start + 1, 100, 100),
    threshold: number("threshold", 0, 100, 0),
    hoverOut: oneOf(p.hoverOut, ["pause", "stop", "reverse", "continue"]) ? p.hoverOut : "pause",
    align: oneOf(p.align, ["left", "center", "right"]) ? p.align : "center",
    width: number("width", 1, 100, 100),
    maxWidth: number("maxWidth", 1, 3840, 800),
    lazy: p.lazy !== false,
  };
}
