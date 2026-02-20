import React from "react";
import type { ContentNavBlock } from "../../types";

function safeHref(h: string) {
  const s = (h || "").trim().toLowerCase();
  if (!s.startsWith("#")) return "#";
  return h;
}

export default function ContentNavView({ block }: { block: ContentNavBlock }) {
  const row = (block.orientation ?? "horizontal") === "horizontal";
  const items = block.items || [];
  const [active, setActive] = React.useState(block.activeHref || (items[0]?.href ?? ""));
  const offset = Math.max(0, Math.floor(block.spyOffset ?? 120));
  const aria = block.ariaLabel || "Навигация по контенту";

  // ScrollSpy по якорям
  React.useEffect(() => {
    if (!block.spy) return;
    const obs = new IntersectionObserver(
      (ents) => {
        // выбираем ближайшую к верху видимую секцию
        const visible = ents
          .filter(e => e.isIntersecting)
          .sort((a, b) => (a.boundingClientRect.top - b.boundingClientRect.top));
        const top = visible[0];
        if (top?.target?.id) setActive(`#${top.target.id}`);
      },
      {
        root: null,
        rootMargin: `-${offset}px 0px -70% 0px`,
        threshold: [0, 0.25, 0.5, 1],
      }
    );
    const targets: Element[] = [];
    for (const it of items) {
      const id = (it.href || "").replace(/^#/, "");
      const el = id ? document.getElementById(id) : null;
      if (el) { obs.observe(el); targets.push(el); }
    }
    return () => { targets.forEach(t => obs.unobserve(t)); obs.disconnect(); };
  }, [block.spy, offset, items]);

  return (
    <nav aria-label={aria}>
      <ul className={`flex ${row ? "flex-row" : "flex-col"} gap-2`}>
        {items.map((it) => {
          const href = safeHref(it.href);
          const isActive = href === active;
          return (
            <li key={it.id}>
              <a
                href={href}
                className={`px-2 py-1 rounded-lg border ${isActive ? "border-[#5865F2] bg-[#121b3f] text-white" : "border-[#1f2751] bg-[#101735] text-[#e6e9f4] hover:bg-[#121b3f]"}`}
              >
                {it.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
