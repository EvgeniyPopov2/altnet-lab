import type { TestimonialsBlock } from "../../types";

export default function TestimonialsView({ block }: { block: TestimonialsBlock }) {
  return (
    <div className="grid gap-3">
      {block.items.map((t) => (
        <figure key={t.id} className="rounded-2xl border border-[#1f2751] bg-[#0b1022] p-4">
          <blockquote className="text-sm text-[#e6e9f4]">“{t.text}”</blockquote>
          <figcaption className="mt-2 text-xs text-[#9aa3b2]">
            {t.author}{t.role ? ` — ${t.role}` : ""}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
