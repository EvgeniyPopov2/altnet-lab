type IconBoxItem = {
  id: string;
  title?: string;
  label?: string;
  text?: string;
  description?: string;
  icon?: string;
};
type IconBoxLike = { items?: IconBoxItem[]; columns?: 1 | 2 | 3 | 4 };

export default function IconBoxView({ block }: { block: any }) {
  // используем тип, чтобы не было "не используется"
  const bx = (block as Partial<IconBoxLike>) || {};

  const cols = bx.columns ?? (Array.isArray(bx.items) ? 3 : 1);
  const grid =
    cols === 4 ? "md:grid-cols-4" : cols === 2 ? "md:grid-cols-2" : cols === 1 ? "grid-cols-1" : "md:grid-cols-3";

  const items: IconBoxItem[] = Array.isArray(bx.items) ? bx.items : [{ id: block.id, title: block.title, text: block.text, icon: block.icon }];

  return (
    <div className={`grid gap-3 ${grid}`}>
      {items.map((it: IconBoxItem) => (
        <div
          key={it.id}
          className="rounded-2xl border border-[#1f2751] bg-[#0b1022] p-4"
        >
          <div className="w-10 h-10 rounded-xl grid place-items-center bg-[#101735] text-[#9bb1ff] text-lg mb-2">
            {({ star: "★", check: "✓", heart: "♥", shield: "⬡", alert: "!" } as Record<string, string>)[it.icon || ""] || it.icon?.slice(0, 2) || "•"}
          </div>
          <div className="text-sm font-semibold text-[#e6e9f4]">
            {it.title || it.label || "Заголовок"}
          </div>
          {(it.text || it.description) && (
            <div className="text-xs text-[#c9d0e9] mt-1">
              {it.text || it.description}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
