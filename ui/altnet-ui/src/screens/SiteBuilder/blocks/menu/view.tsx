import type { MenuBlock, MenuItem } from "../../types";

function safeHref(h: string) {
  const s = (h || "").trim().toLowerCase();
  if (s.startsWith("javascript:")) return "#";
  if (/^https?:\/\//.test(s) || s.startsWith("#") || s.startsWith("/")) return h;
  return "#";
}

function Item({ it, activeHref, depth = 0 }: { it: MenuItem; activeHref?: string; depth?: number }) {
  const href = safeHref(it.href);
  const active = !!activeHref && href === activeHref;
  const indent = depth > 0 ? `pl-${Math.min(depth, 4) * 3}` : "";
  const base = `block rounded-lg border border-[#1f2751] ${indent} ${active ? "bg-[#121b3f] text-[#e6e9f4]" : "bg-[#101735] text-[#e6e9f4] hover:bg-[#121b3f]"}`;
  return (
    <li>
      <a href={href} className={`px-2 py-1 ${base}`} rel="noopener noreferrer nofollow">{it.label}</a>
      {it.children && it.children.length > 0 && (
        <ul className="mt-1 grid gap-1">
          {it.children.map(ch => <Item key={ch.id} it={ch} activeHref={activeHref} depth={(depth || 0) + 1} />)}
        </ul>
      )}
    </li>
  );
}

export default function MenuView({ block }: { block: MenuBlock }) {
  const row = (block.orientation ?? "horizontal") === "horizontal";
  const items = block.items || [];
  const aria = block.ariaLabel || "Меню";
  return (
    <nav aria-label={aria}>
      <ul className={`flex ${row ? "flex-row" : "flex-col"} gap-2`}>
        {items.map(it => <Item key={it.id} it={it} activeHref={block.activeHref} />)}
      </ul>
    </nav>
  );
}
