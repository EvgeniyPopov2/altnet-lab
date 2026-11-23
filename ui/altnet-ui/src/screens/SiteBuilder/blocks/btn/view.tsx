// src/screens/SiteBuilder/blocks/btn/view.tsx
import type { BtnBlock } from "../../types";
import type { CSSProperties } from "react";
import { buttonStyle } from "../../buttonStyle";
import { buttonIconPath } from "../../buttonIcons";

export default function BtnView({ block, device = "desktop", accent = "#5865F2" }: { block: BtnBlock; device?: "desktop" | "tablet" | "mobile"; accent?: string }) {
  const styles = buttonStyle(block.buttonStyleByBp, device);
  const variables: Record<string, string> = { "--sb-btn-accent": /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(accent) ? accent : "#5865F2" };
  const classes: string[] = [];
  for (const [state, rules] of [["normal", styles.normal], ["hover", styles.hover], ["active", styles.active]] as const) {
    for (const [name, value] of Object.entries(rules)) {
      const key = name.replace(/[^a-z-]/g, "");
      variables[`--sb-${state}-${key}`] = value;
      classes.push(`sb-btn-${state}-${key}`);
    }
  }
  if (styles.duration !== undefined) variables["--sb-btn-duration"] = `${styles.duration}ms`;
  if (styles.iconSize !== undefined) variables["--sb-btn-icon-size"] = `${styles.iconSize}px`;
  if (styles.iconGap !== undefined) variables["--sb-btn-icon-gap"] = `${styles.iconGap}px`;
  const path = buttonIconPath(block.icon);
  const icon = path && <svg className="sb-button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  const variant = block.variant === "secondary" ? "secondary" : block.variant === "ghost" ? "ghost" : "primary";
  return (
    <div style={{ textAlign: block.align || "center" }}>
    <a
      href={block.href || "#"}
      aria-label={block.accessibleLabel?.trim() || undefined}
      className={`sb-btn sb-btn-${variant} ${path ? "sb-btn-with-icon" : ""} ${classes.join(" ")}`}
      style={variables as CSSProperties}
      // в предпросмотре ссылка никуда не ведёт
      onClick={(e) => e.preventDefault()}
    >
      {block.iconPosition !== "after" && icon}{block.label || "Кнопка"}{block.iconPosition === "after" && icon}
    </a>
    </div>
  );
}
