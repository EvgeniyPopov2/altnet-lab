// src/screens/SiteBuilder/blocks/iconlist/view.tsx
import type { IconListBlock, IconName } from "../../types";

function Icon({ name }: { name: IconName }) {
  // Мини-иконка 16px (reuse простых SVG как в IconView)
  switch (name) {
    case "check":
      return <svg width="16" height="16" viewBox="0 0 24 24"><path d="M5 12l4 4L19 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case "heart":
      return <svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 21s-7-5-7-10a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 5-7 10-7 10z" fill="none" stroke="currentColor" strokeWidth="2"/></svg>;
    case "shield":
      return <svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V6l-8-3-8 3v6c0 6 8 10 8 10z" fill="none" stroke="currentColor" strokeWidth="2"/></svg>;
    case "alert":
      return <svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 3l9 16H3L12 3z" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="17" r="1.5" fill="currentColor"/><path d="M12 9v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
    default:
      return <svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 2l3.1 6.3L22 9.3l-5 4.9 1.2 7-6.2-3.3L5.8 21l1.2-6.8-5-4.9 6.9-1z" fill="currentColor"/></svg>;
  }
}

export default function IconListView({ block }: { block: IconListBlock }) {
  return (
    <ul className="grid gap-1">
      {block.items.map((it) => (
        <li key={it.id} className="flex items-start gap-2 text-[#2b3050]">
          <span className="mt-[2px] text-[#2a3b8f]"><Icon name={it.icon} /></span>
          <span className="text-sm">{it.text}</span>
        </li>
      ))}
    </ul>
  );
}
