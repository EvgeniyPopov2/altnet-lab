import type { BreadcrumbsBlock, CrumbItem, BreadcrumbsSeparator } from "../../types";

function safeHref(h?: string) {
  const s = (h || "").trim().toLowerCase();
  if (!s) return undefined;
  if (s.startsWith("javascript:")) return "#";
  if (/^https?:\/\//.test(s) || s.startsWith("#") || s.startsWith("/")) return h!;
  return "#";
}
function sepChar(s?: BreadcrumbsSeparator) {
  return s === "»" ? "»" : s === "›" ? "›" : "/";
}
function sizeCls(sz?: "sm" | "md" | "lg") {
  return sz === "lg" ? "text-sm" : sz === "md" ? "text-[13px]" : "text-xs";
}

export default function BreadcrumbsView({ block }: { block: BreadcrumbsBlock }) {
  const items = block.items || [];
  const sep = sepChar(block.separator);
  const size = sizeCls(block.size);
  return (
    <nav aria-label={block.ariaLabel || "Навигация-хлебные крошки"}>
      <ol className={`flex flex-wrap items-center gap-1 ${size}`}>
        {items.map((it: CrumbItem, idx) => {
          const last = idx === items.length - 1;
          const href = safeHref(it.href);
          return (
            <li key={it.id} className="flex items-center gap-1 text-[#9aa3b2]">
              {href && !last ? (
                <a href={href} className="hover:underline text-[#9bb1ff]" rel="noopener noreferrer nofollow">{it.label}</a>
              ) : (
                <span aria-current="page" className="text-[#e6e9f4]">{it.label}</span>
              )}
              {!last && <span aria-hidden className="px-1 opacity-60">{sep}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
