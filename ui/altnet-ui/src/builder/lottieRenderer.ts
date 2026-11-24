import { lottieOptions } from "../screens/SiteBuilder/lottie";

export const LOTTIE_HASH = "eB9g4455UOKcq97NgBAbWpt85Ae20xCWZ71PwH294JI=";
let renderer: Promise<string> | undefined;
export function loadLottieRenderer(): Promise<string> {
  renderer ??= import("./lottiePlayerSource")
    .then((module) => module.default)
    .catch((cause) => {
      renderer = undefined;
      throw cause;
    });
  return renderer;
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function animationMarkup(json: string, caption: string, settings: unknown, poster = ""): string {
  const options = lottieOptions(settings);
  return (
    '<figure class="sb-animation" data-alt-animation="' +
    esc(JSON.stringify(options)) +
    '">' +
    (poster ? '<img data-animation-poster src="' + esc(poster) + '" alt="" referrerpolicy="no-referrer">' : "") +
    '<div data-animation-stage role="img" aria-label="' +
    esc(caption || "Анимация") +
    '"></div>' +
    "<template data-animation-json>" +
    esc(json) +
    "</template>" +
    '<button data-animation-command type="button" aria-pressed="false">Воспроизвести</button>' +
    (caption ? "<figcaption>" + esc(caption) + "</figcaption>" : "") +
    "</figure>"
  );
}
export const animationCss =
  ".sb-animation{margin:0}.sb-animation [data-animation-poster]{max-width:100%;height:auto}.sb-animation [data-animation-stage]{min-height:1px}.sb-animation svg{display:block;width:100%;height:auto;max-width:100%}.sb-animation button{font:inherit;cursor:pointer;border:1px solid #7777;border-radius:5px;background:transparent;color:inherit;padding:4px 8px}.sb-animation figcaption{margin:6px 0;white-space:pre-wrap}";
