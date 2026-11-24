import { LOTTIE_HASH, loadLottieRenderer } from "../../builder/lottieRenderer";
import { readAnimation, lottieOptions } from "../../screens/SiteBuilder/lottie";
import { SITE_RUNTIME, SITE_RUNTIME_HASH, SITE_RUNTIME_LEGACY } from "../../builder/siteRuntime";

const localMedia = /^data:(?:image\/(?:png|jpeg|webp|gif)|video\/(?:mp4|webm)|audio\/(?:mpeg|ogg|wav));base64,/i;
export const LOCAL_NAV_RUNTIME = "(()=>{const m=document.querySelector('meta[name=altnet-local-fragment]');if(m){const t=document.getElementById(m.content);if(t)t.scrollIntoView()}document.addEventListener('click',e=>{const a=e.target instanceof Element?e.target.closest('a[data-alt-local-page]'):null;if(!a)return;e.preventDefault();parent.postMessage({type:'altnet.local-page',path:a.dataset.altLocalPage,fragment:a.dataset.altLocalFragment||''},'*')})})();";
export const LOCAL_NAV_HASH = "jYKam0UsSqvIFwju2RpDaig8K56CBNVT28/sdIkyrtU=";
const policy = `default-src 'none'; script-src 'sha256-${SITE_RUNTIME_HASH}' 'sha256-${LOCAL_NAV_HASH}' 'sha256-${LOTTIE_HASH}'; style-src 'unsafe-inline'; img-src data:; media-src data:; font-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`;
const escapeText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Изолирует локально опубликованную страницу до появления профильного транспорта. */
export async function prepareLocalSite(html: string, pagePaths: readonly string[] = [], fragment = "") {
  const engine = html.includes("data-alt-animation") ? await loadLottieRenderer() : "";
  return prepareLocalPreviewHtml(html, pagePaths, fragment, engine);
}

export function prepareLocalPreviewHtml(html: string, pagePaths: readonly string[] = [], fragment = "", animationEngine = ""): string {
  const guard = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  const localPages = new Set(pagePaths.filter(path => /^[a-z0-9][a-z0-9-]{0,63}\.html$/.test(path)));
  if (typeof document === "undefined") return `<!doctype html>${guard}<pre>${escapeText(html)}</pre>`;
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script").forEach(script => {
    if (script.hasAttribute("src")) script.remove();
    else if (script.textContent === SITE_RUNTIME || SITE_RUNTIME_LEGACY.includes(script.textContent || "")) script.textContent = SITE_RUNTIME;
    else script.remove();
  });
  template.content.querySelectorAll(".lottie,.bodymovin").forEach(node => node.classList.remove("lottie","bodymovin"));
  let validAnimations = 0;
  template.content.querySelectorAll("[data-alt-animation]").forEach(node => {
    const data = node.querySelector("template[data-animation-json]");
    try {
      if (!(data instanceof HTMLTemplateElement)) throw new Error();
      readAnimation(data.content.textContent ?? "");
      node.setAttribute("data-alt-animation", JSON.stringify(lottieOptions(JSON.parse(node.getAttribute("data-alt-animation") ?? "{}"))));
      validAnimations++;
    } catch { node.removeAttribute("data-alt-animation"); }
  });
  template.content.querySelectorAll("meta[http-equiv],meta[name=altnet-local-fragment],base,link,iframe,object,embed,portal").forEach(element => element.remove());
  template.content.querySelectorAll("*").forEach(element => {
    if (element.hasAttribute("data-soundcloud-player")) {
      element.removeAttribute("data-soundcloud-player");element.setAttribute("disabled","");
      element.textContent="Плеер SoundCloud доступен в публичной версии";
    }
    if (element.hasAttribute("data-map-open")) {
      element.removeAttribute("data-map-open"); element.setAttribute("disabled", "");
      element.setAttribute("title", "Подробная карта доступна в экспортированном сайте");
    }
    element.removeAttribute("data-alt-local-page");
    element.removeAttribute("data-alt-local-fragment");
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith("on") || ["srcset", "ping", "formaction", "action"].includes(name)) element.removeAttribute(attribute.name);
      else if (["src", "poster"].includes(name) && value && !localMedia.test(value)) element.removeAttribute(attribute.name);
      else if ((name === "href" || name === "xlink:href") && value && !value.startsWith("#")) {
        element.removeAttribute(attribute.name);
        if (element.tagName.toLowerCase() === "a") {
          const match = /^\.\/([a-z0-9][a-z0-9-]{0,63}\.html)(?:#([a-zA-Z0-9_-]{1,128}))?$/.exec(value);
          if (name === "href" && match && localPages.has(match[1])) {
            element.setAttribute("href", "#"); element.setAttribute("data-alt-local-page", match[1]);
            if (match[2]) element.setAttribute("data-alt-local-fragment", match[2]);
          } else {
            element.setAttribute("aria-disabled", "true"); element.setAttribute("title", "Ссылка недоступна в локальном просмотре");
          }
        }
      }
    }
    if (element.tagName.toLowerCase() === "a" && element.hasAttribute("data-share-action")) {
      element.removeAttribute("data-share-action");
      element.removeAttribute("href");
      element.setAttribute("aria-disabled", "true");
      element.setAttribute("title", "Внешние ссылки недоступны до подключения защищённого маршрута");
    }
  });
  if (validAnimations && animationEngine) {
    const engine = document.createElement("script"); engine.textContent = animationEngine;
    template.content.appendChild(engine);
  }
  if (localPages.size) {
    if (/^[a-zA-Z0-9_-]{1,128}$/.test(fragment)) {
      const marker = document.createElement("meta"); marker.name = "altnet-local-fragment"; marker.content = fragment;
      template.content.appendChild(marker);
    }
    const script = document.createElement("script"); script.textContent = LOCAL_NAV_RUNTIME;
    template.content.appendChild(script);
  }
  return `<!doctype html>${guard}${template.innerHTML}`;
}
