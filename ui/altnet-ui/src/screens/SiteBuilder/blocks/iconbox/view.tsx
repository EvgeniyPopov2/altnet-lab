import type { IconBoxBlock, IconName } from "../../types";

function pathFor(name: IconName) {
  switch (name) {
    case "check":
      return <path d="M5 12l4 4L19 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>;
    case "heart":
      return <path d="M12 21s-7-5-7-10a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 5-7 10-7 10z" fill="none" stroke="currentColor" strokeWidth="2"/>;
    case "shield":
      return <path d="M12 22s8-4 8-10V6l-8-3-8 3v6c0 6 8 10 8 10z" fill="none" stroke="currentColor" strokeWidth="2"/>;
    case "alert":
      return (<><path d="M12 3l9 16H3L12 3z" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="17" r="1.5" fill="currentColor"/><path d="M12 9v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></>);
    default:
      return <path d="M12 2l3.1 6.3L22 9.3l-5 4.9 1.2 7-6.2-3.3L5.8 21l1.2-6.8-5-4.9 6.9-1z" fill="currentColor"/>;
  }
}

export default function IconBoxView({ block }: { block: IconBoxBlock }) {
  return (
    <div className="grid gap-2 rounded-2xl border border-[#1f2751] bg-[#0b1022] p-4">
      <div className="text-[#5865F2]">
        <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true">{pathFor(block.icon)}</svg>
      </div>
      <div className="text-base font-semibold text-[#e6e9f4]">{block.title}</div>
      {block.text && <div className="text-sm text-[#c9d0e9]">{block.text}</div>}
    </div>
  );
}
