export function safeAnchorName(name: unknown): string {
  const result = typeof name === "string" ? name.toLowerCase().replace(/[^a-z0-9-_]/g, "-") : "";
  return result || "anchor";
}
