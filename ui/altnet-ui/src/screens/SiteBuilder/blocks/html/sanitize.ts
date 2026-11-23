import DOMPurify from "dompurify";
import { sanitizeHref } from "../../../../builder/cdr";

const escapeText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Допускаем форматированный текст без скриптов, форм, стилей и внешних загрузок. */
export function sanitizeSafeHtml(value: unknown): string {
  const input = typeof value === "string" ? value : "";
  if (typeof document === "undefined" || typeof DOMPurify.sanitize !== "function") return escapeText(input);
  const fragment = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ["p", "br", "hr", "b", "strong", "i", "em", "u", "s", "blockquote", "code", "pre", "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tr", "th", "td"],
    ALLOWED_ATTR: ["href", "title"],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
  for (const link of fragment.querySelectorAll("a[href]")) {
    link.setAttribute("href", sanitizeHref(link.getAttribute("href") || ""));
    link.setAttribute("rel", "noopener noreferrer nofollow");
  }
  const wrapper = document.createElement("div");
  wrapper.appendChild(fragment);
  return wrapper.innerHTML;
}
