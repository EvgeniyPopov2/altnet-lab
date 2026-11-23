/** Карта содержит только явно заданные публичные канонические адреса. */
export function buildSitemap(urls: readonly string[]): string | undefined {
  const unique = [...new Set(urls.filter(Boolean))];
  if (!unique.length) return undefined;
  const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${unique.map(url => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n")}\n</urlset>\n`;
}
