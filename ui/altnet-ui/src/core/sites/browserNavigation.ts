import { parseBrowserRoot } from "./siteCid";
import { decodeSitePath, encodeSitePath } from "./sitePath";

/** Разбор адресов локального браузера. Эта функция никогда не выполняет сетевой запрос. */
export type BrowserAddress =
  | { kind: "home"; url: "alt://home" }
  | { kind: "site"; url: string; slug: string; path: string; fragment: string }
  | { kind: "ipfs"; url: string; root: string; path: string; fragment: string }
  | { kind: "onion-share"; url: string; onion: string; root: string }
  | { kind: "external"; url: string };

export type BrowserTab = { id: string; title: string; url: string; history: string[]; cursor: number; reloadToken: number };

export function browserTabTitle(url: string): string {
  try {
    const address = parseBrowserAddress(url);
    if (address.kind === "home") return ".alt старт";
    if (address.kind === "site") return address.slug + (address.path === "index.html" ? "" : " · " + address.path);
    if (address.kind === "ipfs") return address.root.slice(0, 12) + "…" + (address.path === "index.html" ? "" : " · " + address.path);
    if (address.kind === "onion-share") return "Сайт через Tor";
    return new URL(address.url).host;
  } catch { return ".alt"; }
}

export function createBrowserTab(url = "alt://home"): BrowserTab {
  const address = parseBrowserAddress(url).url;
  return { id: crypto.randomUUID(), title: browserTabTitle(address), url: address, history: [address], cursor: 0, reloadToken: 0 };
}

export function parseBrowserAddress(raw: string): BrowserAddress {
  const input = String(raw || "").trim();
  if (input.length > 2048 || [...input].some(character => { const code = character.charCodeAt(0); return code < 32 || code === 127; })) throw new Error("Адрес слишком длинный или содержит недопустимые символы.");
  if (!input || input === "alt://home" || input === "alt://home/") return { kind: "home", url: "alt://home" };
  let value = input;
  if (/^[a-z0-9][a-z0-9-]{0,95}$/.test(value)) value = "alt://site/" + value;
  else if (/^site\//.test(value)) value = "alt://" + value;
  const match = /^alt:\/\/site\/([a-z0-9][a-z0-9-]{0,95})(?:\/([a-z0-9][a-z0-9-]{0,63}\.html))?(?:#([a-zA-Z0-9_-]{1,128}))?$/.exec(value);
  if (match) {
    const [, slug, page, fragment = ""] = match;
    const path = page || "index.html";
    return { kind: "site", slug, path, fragment, url: `alt://site/${slug}${page && page !== "index.html" ? "/" + page : ""}${fragment ? "#" + fragment : ""}` };
  }
  const ipfs = /^ipfs:\/\/([a-zA-Z0-9]{1,120})(?:\/([^#?]*))?(?:#([a-zA-Z0-9_-]{1,128}))?$/.exec(value);
  if (ipfs) {
    const root = parseBrowserRoot(ipfs[1]).toString();
    const requested = ipfs[2] || "";
    const decoded = requested ? decodeSitePath(requested.endsWith("/") ? requested.slice(0, -1) : requested) : "";
    if (requested && !decoded) throw new Error("Недопустимый путь страницы IPFS.");
    const path = !decoded ? "index.html" : requested.endsWith("/") ? `${decoded}/index.html` : decoded.split("/").at(-1)?.includes(".") ? decoded : `${decoded}/index.html`;
    const fragment = ipfs[3] || "";
    if (!path || !/\.html?$/i.test(path)) throw new Error("Недопустимый путь страницы IPFS.");
    return { kind: "ipfs", root, path, fragment, url: `ipfs://${root}${path !== "index.html" ? "/" + encodeSitePath(path) : ""}${fragment ? "#" + fragment : ""}` };
  }
  const share = /^alt:\/\/onion\/([a-z2-7]{56}\.onion)\/([a-zA-Z0-9]{1,120})$/.exec(value);
  if (share) {
    const onion = share[1], root = parseBrowserRoot(share[2]).toString();
    return { kind: "onion-share", onion, root, url: `alt://onion/${onion}/${root}` };
  }
  if (/^http:\/\//i.test(value)) {
    throw new Error("Незащищённый HTTP не поддерживается. Используйте адрес HTTPS.");
  }
  if (/^https:\/\//i.test(value)) {
    let url: URL;
    try { url = new URL(value); } catch { throw new Error("Некорректный веб-адрес."); }
    if (!url.hostname || url.username || url.password) throw new Error("Адрес с логином или паролем не поддерживается.");
    return { kind: "external", url: url.href };
  }
  throw new Error("Адрес не поддерживается. Используйте alt://home, alt://site/имя, ссылку раздачи Alt или ipfs://CID.");
}
