/** Строгие относительные пути к файлам внутри проверенного UnixFS. */
export function validSitePath(path: string): boolean {
  if (!path || path.length > 1024) return false;
  const parts = path.split("/");
  return parts.length <= 16 && parts.every(part => {
    if (!part || part === "." || part === ".." || part.includes("\\") || [...part].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return false;
    try { return new TextEncoder().encode(part).length <= 255 && !!encodeURIComponent(part); } catch { return false; }
  });
}

export function encodeSitePath(path: string): string {
  if (!validSitePath(path)) throw new Error("Недопустимый путь сайта.");
  return path.split("/").map(encodeURIComponent).join("/");
}

export function decodeSitePath(path: string): string | null {
  try {
    const parts = path.split("/").map(part => decodeURIComponent(part));
    if (parts.some(part => part === "." || part === ".." || part.includes("/") || part.includes("\\"))) return null;
    const result = parts.join("/");
    return validSitePath(result) ? result : null;
  } catch { return null; }
}

export function resolveSitePath(base: string, reference: string): string | null {
  if (!validSitePath(base) || !reference || reference.length > 2048 || /[\\?#:]/.test(reference) || reference.startsWith("//")) return null;
  const parts = reference.startsWith("/") ? [] : base.split("/").slice(0, -1);
  for (const raw of reference.split("/")) {
    if (!raw || raw === ".") continue;
    if (raw === "..") { if (!parts.length) return null; parts.pop(); continue; }
    let part: string;
    try { part = decodeURIComponent(raw); } catch { return null; }
    if (part === "." || part === ".." || part.includes("/") || part.includes("\\")) return null;
    parts.push(part);
  }
  const result = parts.join("/");
  return validSitePath(result) ? result : null;
}
