import { LOTTIE_HASH, loadLottieRenderer } from "../../builder/lottieRenderer";
import { readAnimation, lottieOptions } from "../../screens/SiteBuilder/lottie";
import { SITE_RUNTIME, SITE_RUNTIME_HASH, SITE_RUNTIME_LEGACY } from "../../builder/siteRuntime";
import { cleanPreviewCss, dataResource } from "./previewResources";
import { popupSettings } from "../../screens/SiteBuilder/popup";

const localMedia = /^data:(?:image\/(?:png|jpeg|webp|gif)|video\/(?:mp4|webm)|audio\/(?:mpeg|ogg|wav));base64,/i;
export const LOCAL_NAV_RUNTIME = "(()=>{const m=document.querySelector('meta[name=altnet-local-fragment]');if(m){const t=document.getElementById(m.content);if(t)t.scrollIntoView()}document.addEventListener('click',e=>{const a=e.target instanceof Element?e.target.closest('a[data-alt-local-page]'):null;if(!a)return;e.preventDefault();parent.postMessage({type:'altnet.local-page',path:a.dataset.altLocalPage,fragment:a.dataset.altLocalFragment||''},'*')})})();";
export const LOCAL_NAV_HASH = "jYKam0UsSqvIFwju2RpDaig8K56CBNVT28/sdIkyrtU=";
const policy = `default-src 'none'; script-src 'sha256-${SITE_RUNTIME_HASH}' 'sha256-${LOCAL_NAV_HASH}' 'sha256-${LOTTIE_HASH}'; script-src-attr 'none'; style-src data:; style-src-attr 'none'; img-src data:; media-src data:; font-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`;
const escapeText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Изолирует локально опубликованную страницу до появления профильного транспорта. */
export async function prepareLocalSite(html: string, pagePaths: readonly string[] = [], fragment = "") {
  const engine = html.includes("data-alt-animation") ? await loadLottieRenderer() : "";
  return prepareLocalPreviewHtml(html, pagePaths, fragment, engine);
}

export function prepareLocalPreviewHtml(html: string, pagePaths: readonly string[] = [], fragment = "", animationEngine = ""): string {
  const guard = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  const localPages = new Set(pagePaths.filter(path => /^[a-z0-9][a-z0-9-]{0,63}\.html$/.test(path)));
  if (html.length > 64_000_000) throw new Error("Страница превышает допустимый размер.");
  if (typeof document === "undefined") return `<!doctype html>${guard}<pre>${escapeText(html)}</pre>`;
  const template = document.createElement("template");
  template.innerHTML = html;
  const trustedScript = (source: string, hash: string) => {
    const script = document.createElement("script");
    script.src = dataResource("text/javascript", source);
    script.integrity = `sha256-${hash}`;
    script.crossOrigin = "anonymous";
    return script;
  };
  let hasRuntime = false;
  template.content.querySelectorAll("script").forEach(script => {
    if (!script.hasAttribute("src") && (script.textContent === SITE_RUNTIME || SITE_RUNTIME_LEGACY.includes(script.textContent || ""))) {
      hasRuntime = true;
    }
    script.remove();
  });
  const styleTexts: string[] = [];
  const inlineStyles: string[] = [];
  const importantInlineStyles: string[] = [];
  let styleLength = 0;
  function addStyle(value: string) {
    styleLength += value.length;
    if (styleLength > 8_000_000) throw new Error("Таблица стилей превышает допустимый размер.");
    styleTexts.push(value);
  }
  template.content.querySelectorAll("style").forEach(style => {
    addStyle(style.textContent || "");
    style.remove();
  });
  const elements = Array.from(template.content.querySelectorAll("*"));
  if (elements.length > 50_000) throw new Error("Слишком много элементов страницы.");
  let styleIndex = 0;
  for (const element of elements) {
    element.removeAttribute("data-altnet-style-id");
    if (!element.hasAttribute("style")) continue;
    const raw = element.getAttribute("style") || "";
    if (raw.length > 65_536) throw new Error("Слишком большой стиль элемента.");
    const node = document.createElement("div");
    node.setAttribute("style", raw);
    element.removeAttribute("style");
    if (node.style.length) {
      const id = String(styleIndex++);
      element.setAttribute("data-altnet-style-id", id);
      const normal: string[] = [], important: string[] = [];
      for (let i = 0; i < node.style.length; i++) {
        const property = node.style.item(i);
        const value = node.style.getPropertyValue(property);
        const priority = node.style.getPropertyPriority(property);
        (priority === "important" ? important : normal).push(`${property}:${value}${priority ? " !important" : ""};`);
      }
      const selector = `[data-altnet-style-id="${id}"]`;
      if (normal.length) inlineStyles.push(`${selector}{${normal.join("")}}`);
      if (important.length) importantInlineStyles.push(`${selector}{${important.join("")}}`);
      styleLength += normal.join("").length + important.join("").length;
      if (styleLength > 8_000_000) throw new Error("Таблица стилей превышает допустимый размер.");
    }
  }
  const authorCss = cleanPreviewCss(styleTexts.join("\n"));
  const normalCss = cleanPreviewCss(inlineStyles.join("\n"));
  const importantCss = cleanPreviewCss(importantInlineStyles.join("\n"));
  // Каскадные слои сохраняют приоритеты исходного style: обычное встроенное
  // значение выше обычного авторского, но ниже авторского !important.
  const css = `@layer altnet-inline-important, altnet-author;${importantCss ? `@layer altnet-inline-important{${importantCss}}` : ""}${authorCss ? `@layer altnet-author{${authorCss}}` : ""}${normalCss}`;
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
  const popups = template.content.querySelectorAll("dialog[data-popup-options]");
  if (popups.length > 256) throw new Error("Слишком много всплывающих окон страницы.");
  popups.forEach(node => {
    const raw = node.getAttribute("data-popup-options") || "";
    try {
      if (raw.length > 8192) throw new Error();
      node.setAttribute("data-popup-options", JSON.stringify(popupSettings(JSON.parse(raw))));
    } catch { node.removeAttribute("data-popup-options"); }
  });
  // SVG SMIL может изменить href уже после проверки и обойти запрет внешней навигации.
  template.content.querySelectorAll("meta[http-equiv],meta[name=altnet-local-fragment],base,link,iframe,object,embed,portal,animate,set,animateMotion,animateTransform,mpath,discard").forEach(element => element.remove());
  template.content.querySelectorAll("form").forEach(form => {
    form.querySelectorAll("button,input,select,textarea").forEach(control => control.setAttribute("disabled", ""));
    const notice = document.createElement("p");
    notice.setAttribute("role", "status");
    notice.textContent = form.matches(".site-search")
      ? "Поиск пока недоступен в локальном пространстве Alt."
      : "Отправка формы пока недоступна в локальном пространстве Alt.";
    form.appendChild(notice);
  });
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
    if (element.hasAttribute("data-share-action")) {
      element.removeAttribute("data-share-action");
      element.removeAttribute("href");
      element.setAttribute("aria-disabled", "true");
      if (element.tagName.toLowerCase() === "button") element.setAttribute("disabled", "");
      element.setAttribute("title", "Публикация и передача ссылки другим участникам пока недоступны");
    }
  });
  if (hasRuntime) template.content.appendChild(trustedScript(SITE_RUNTIME, SITE_RUNTIME_HASH));
  if (validAnimations && animationEngine) {
    template.content.appendChild(trustedScript(animationEngine, LOTTIE_HASH));
  }
  if (localPages.size) {
    if (/^[a-zA-Z0-9_-]{1,128}$/.test(fragment)) {
      const marker = document.createElement("meta"); marker.name = "altnet-local-fragment"; marker.content = fragment;
      template.content.appendChild(marker);
    }
    template.content.appendChild(trustedScript(LOCAL_NAV_RUNTIME, LOCAL_NAV_HASH));
  }
  if (css) {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = dataResource("text/css", css);
    template.content.prepend(stylesheet);
  }
  return `<!doctype html>${guard}${template.innerHTML}`;
}
