type Item = { id: string; label: string };
type Props = {
  items: Item[];
  value: string;
  onChange: (id: string) => void;
};

export default function Segmented({ items, value, onChange }: Props) {
  return (
    <div className="inline-flex rounded-lg border border-[#1f2751] overflow-hidden">
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            className={`px-3 py-1 text-xs ${active ? "bg-[#182047]" : "bg-[#101735]"} hover:bg-[#182047] border-r last:border-r-0 border-[#1f2751]`}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
