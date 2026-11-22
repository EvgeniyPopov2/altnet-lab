export type ParsedHotkey = {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string | null;
};

export function normalizeKey(key: string): string {
  if (!key) return "";
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export function releasesHotkey(parsed: ParsedHotkey, key: string): boolean {
  const normalized = normalizeKey(key);
  return normalized === parsed.key ||
    (parsed.ctrl && normalized === "Control") ||
    (parsed.alt && normalized === "Alt") ||
    (parsed.shift && normalized === "Shift") ||
    (parsed.meta && normalized === "Meta");
}
