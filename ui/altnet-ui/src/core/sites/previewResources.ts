/** Локальные ресурсы iframe: без файлов, сетевых запросов и произвольных скриптов. */
const MAX_STYLE_CHARS = 8_000_000;
const MAX_STYLE_RULES = 20_000;

export function dataResource(mime: "text/css" | "text/javascript", source: string): string {
  const bytes = new TextEncoder().encode(source);
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

/** CSSOM разбирает CSS и отбрасывает @import. Другие опасные и неизвестные at-правила не переносятся. */
export function cleanPreviewCss(source: string): string {
  if (source.length > MAX_STYLE_CHARS) throw new Error("Таблица стилей превышает допустимый размер.");
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(source);
  let count = 0;
  function clean(rules: CSSRuleList, depth: number): string {
    if (depth > 12) throw new Error("Слишком глубокая вложенность стилей.");
    return Array.from(rules).map(rule => {
      if (++count > MAX_STYLE_RULES) throw new Error("Слишком много правил оформления.");
      if (rule.type === CSSRule.STYLE_RULE) return rule.cssText;
      if (rule.type === CSSRule.KEYFRAMES_RULE) {
        count += (rule as CSSKeyframesRule).cssRules.length;
        if (count > MAX_STYLE_RULES) throw new Error("Слишком много правил оформления.");
        return rule.cssText;
      }
      if (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE) {
        const group = rule as CSSMediaRule | CSSSupportsRule;
        const body = clean(group.cssRules, depth + 1);
        return body ? `@${rule.type === CSSRule.MEDIA_RULE ? "media" : "supports"} ${group.conditionText}{${body}}` : "";
      }
      return "";
    }).join("\n");
  }
  return clean(sheet.cssRules, 0);
}
