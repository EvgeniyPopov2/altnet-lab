type IconBoxItem = { id: string; title?: string; label?: string; text?: string; description?: string; icon?: string };
type IconBoxLike = { items?: IconBoxItem[]; columns?: 1|2|3|4 };

export default function IconBoxView({ block }: { block: IconBoxLike }) {
  const cols = block.columns ?? 3;
  const grid = cols === 4 ? "md:grid-cols-4" : cols === 2 ? "md:grid-cols-2" : "md:grid-cols-3";
  const items = block.items || [
    { id: "i1", title: "Функция A", text: "Короткое описание", icon: "★" },
    { id: "i2", title: "Функция B", text: "Короткое описание", icon: "✓" },
    { id: "i3", title: "Функция C", text: "Короткое описание", icon: "⚙" },
  ];
  return (
    <div className={`grid gap-3 ${grid}`}>
      {items.map(it => (
        <div key={it.id} className="rounded-2xl border border-[#1f2751] bg-[#0b1022] p-4">
          <div className="w-10 h-10 rounded-xl grid place-items-center bg-[#101735] text-[#9bb1ff] text-lg mb-2">{it.icon?.slice(0,2) || "•"}</div>
          <div className="text-sm font-semibold text-[#e6e9f4]">{it.title || it.label || "Заголовок"}</div>
          {(it.text || it.description) && <div className="text-xs text-[#c9d0e9] mt-1">{it.text || it.description}</div>}
        </div>
      ))}
    </div>
  );
}
