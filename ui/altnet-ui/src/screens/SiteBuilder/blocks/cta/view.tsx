import type { CtaBlock, CtaEmphasis, CtaVariant, CtaAlign } from "../../types";

function safeHref(h?: string) {
  const s = (h || "").trim().toLowerCase();
  if (!s) return undefined;
  if (s.startsWith("javascript:")) return "#";
  if (/^https?:\/\//.test(s) || s.startsWith("#")) return h!;
  return "#";
}

function clsWrap(em?: CtaEmphasis, align?: CtaAlign) {
  const base = "rounded-2xl border border-[#1f2751] p-5";
  const bg = em === "brand" ? "bg-[#101735]" : em === "panel" ? "bg-[#0b1022]" : "bg-transparent";
  const al = align === "center" ? "text-center" : align === "end" ? "text-right" : "text-left";
  return `${base} ${bg} ${al}`;
}
function clsBtn(v?: CtaVariant) {
  if (v === "secondary") return "px-4 py-2 rounded-lg border border-[#1f2751] bg-[#0f1630] text-[#e6e9f4] hover:bg-[#121b3f]";
  if (v === "outline")   return "px-4 py-2 rounded-lg border border-[#5865F2] text-[#9bb1ff] hover:bg-[#121b3f]";
  if (v === "ghost")     return "px-4 py-2 rounded-lg text-[#e6e9f4] hover:bg-[#121b3f]";
  return "px-4 py-2 rounded-lg bg-[#5865F2] text-white hover:bg-[#4854e6]"; // primary
}

export default function CtaView({ block }: { block: CtaBlock }) {
  const href = safeHref(block.btnHref);
  const variant = block.variant ?? "primary";
  const align = block.align ?? "start";
  const emphasis = block.emphasis ?? "panel";

  return (
    <section className={clsWrap(emphasis, align)}>
      {block.title && <h3 className="text-xl font-extrabold text-[#e6e9f4]">{block.title}</h3>}
      {block.text &&  <p className="mt-2 text-sm text-[#c9d0e9]">{block.text}</p>}
      {block.btnLabel && href && (
        <div className={align === "center" ? "mt-3 grid place-items-center" : align === "end" ? "mt-3 flex justify-end" : "mt-3"}>
          <a href={href} className={clsBtn(variant)} rel="noopener noreferrer nofollow">
            {block.btnLabel}
          </a>
        </div>
      )}
    </section>
  );
}
