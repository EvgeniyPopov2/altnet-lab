import { isRecord, oneOf } from "../../core/records";
import type { SitePage, SiteTemplate } from "./types";

export function validTemplate(value: unknown): value is SiteTemplate {
  if (
    !isRecord(value) ||
    !oneOf(value.kind, ["header", "footer", "section", "popup"]) ||
    (value.popup !== undefined && !isRecord(value.popup)) ||
    typeof value.enabled !== "boolean" ||
    typeof value.priority !== "number" ||
    !Number.isInteger(value.priority) ||
    value.priority < 0 ||
    value.priority > 100
  )
    return false;
  return [value.include, value.exclude].every(
    (list) =>
      list === undefined ||
      (Array.isArray(list) &&
        list.length <= 500 &&
        list.every((id) => typeof id === "string" && id.length > 0) &&
        new Set(list).size === list.length)
  );
}

export function assignedTemplate(pages: SitePage[], pageId: string, kind: "header" | "footer"): SitePage | undefined {
  let winner: SitePage | undefined,
    rank = -1;
  for (const page of pages) {
    const rule = page.template;
    if (
      !rule ||
      rule.kind !== kind ||
      !rule.enabled ||
      rule.exclude?.includes(pageId) ||
      (rule.include && !rule.include.includes(pageId))
    )
      continue;
    const score = (rule.include ? 101 : 0) + rule.priority;
    if (score >= rank) {
      winner = page;
      rank = score;
    }
  }
  return winner;
}
