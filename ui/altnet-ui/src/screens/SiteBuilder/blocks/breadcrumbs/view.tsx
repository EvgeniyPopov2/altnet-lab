import type { BreadcrumbsBlock } from "../../types";

function safeHref(h?: string) {
  if (!h) return undefined;
  const s = h.trim().toLowerCase();
  if (s.startsWith("javascript:")) return "#";
  if (/^https?:\/\//.test(s) || s.startsWith("#")) return h;
  return "#";
}

export default function BreadcrumbsView({ block }: { block: BreadcrumbsBlock }) {
  return (
    <nav aria-label="Хлебные крошки">
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {block.items.map((c, i) => (
          <li key={c.id} className="inline-flex items-center gap-2">
            {i > 0 && <span className="opacity-50">›</span>}
            {c.href ? (
              <a href={safeHref(c.href)} className="text-[#9bb1ff]" rel="noopener noreferrer nofollow">{c.label}</a>
            ) : (
              <span className="text-[#e6e9f4]">{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
