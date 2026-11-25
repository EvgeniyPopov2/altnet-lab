/** Строгие относительные пути к файлам внутри проверенного UnixFS. */
export function validSitePath(path: string): boolean {
  if (!path || path.length > 1024) return false;
  const parts = path.split("/");
  return parts.length <= 16 && parts.every(part => part !== "." && part !== ".." && /^[a-zA-Z0-9._-]{1,128}$/.test(part));
}

export function resolveSitePath(base: string, reference: string): string | null {
  if (!validSitePath(base) || !reference || reference.length > 1024 || /[\\%?#:]/.test(reference) || reference.startsWith("//")) return null;
  const parts = reference.startsWith("/") ? [] : base.split("/").slice(0, -1);
  for (const part of reference.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!parts.length) return null; parts.pop(); }
    else parts.push(part);
  }
  const result = parts.join("/");
  return validSitePath(result) ? result : null;
}
