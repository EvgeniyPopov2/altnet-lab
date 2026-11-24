import { adaptFromSiteBuilderDoc, exportSingleHtml, sanitizeCanonicalUrl, unsupportedBlockTypes } from "../../builder/exporter";
import { buildSitemap } from "../../builder/sitemap";
import { pagesForBuild } from "./siteTemplates";
import type { Doc } from "./types";

/** Каждая страница самодостаточна, поэтому относительные ссылки работают после распаковки. */
export async function exportPagesZip(doc: Doc, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const pages = pagesForBuild(doc);
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const manifest: { path: string; title: string }[] = [];
  const indexableUrls: string[] = [];
  onProgress?.(0, pages.length);
  for (const [index, page] of pages.entries()) {
    const model = adaptFromSiteBuilderDoc(page.document);
    const unsupported = unsupportedBlockTypes(model);
    if (unsupported.length) throw new Error(`Страница «${page.document.title}»: неподдерживаемые виджеты ${unsupported.join(", ")}.`);
    const html = await exportSingleHtml(model, { bundleAssets: true });
    zip.file(page.path, await html.arrayBuffer());
    manifest.push({ path: page.path, title: page.document.title });
    if (page.document.seo?.index !== false) indexableUrls.push(sanitizeCanonicalUrl(page.document.seo?.canonical));
    onProgress?.(index + 1, pages.length);
  }
  zip.file("manifest.json", JSON.stringify({ format: "altnet.sitebuilder.pages", version: 1, pages: manifest }, null, 2));
  const sitemap = buildSitemap(indexableUrls);
  if (sitemap) zip.file("sitemap.xml", sitemap);
  return zip.generateAsync({ type: "blob" });
}
