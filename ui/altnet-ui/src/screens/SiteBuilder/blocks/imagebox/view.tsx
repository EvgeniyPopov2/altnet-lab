type ImageBoxItem = {
  id: string;
  title?: string;
  text?: string;
  alt?: string;
  src?: string;
  cid?: string;
};
type ImageBoxLike = { items?: ImageBoxItem[]; columns?: 1 | 2 | 3 | 4 };

function safeSrc(s?: string) {
  const u = (s || "").trim();
  if (!u) return "";
  if (/^(https?:|data:|ipfs:|altfs:)/i.test(u)) return u;
  return "";
}

export default function ImageBoxView({ block }: { block: any }) {
  const bx = (block as Partial<ImageBoxLike>) || {};

  const cols = bx.columns ?? 3;
  const grid =
    cols === 4 ? "md:grid-cols-4" : cols === 2 ? "md:grid-cols-2" : "md:grid-cols-3";

  const items: ImageBoxItem[] =
    (Array.isArray(bx.items) && (bx.items as ImageBoxItem[])) || [
      { id: "p1", title: "Карта 1", text: "Описание", src: "https://picsum.photos/600/360?1" },
      { id: "p2", title: "Карта 2", text: "Описание", src: "https://picsum.photos/600/360?2" },
      { id: "p3", title: "Карта 3", text: "Описание", src: "https://picsum.photos/600/360?3" },
    ];

  return (
    <div className={`grid gap-3 ${grid}`}>
      {items.map((it: ImageBoxItem) => (
        <article
          key={it.id}
          className="rounded-2xl border border-[#1f2751] bg-[#0b1022] overflow-hidden"
        >
          {safeSrc(it.src || it.cid) && (
            <img
              className="w-full h-auto object-cover"
              src={safeSrc(it.src || it.cid)}
              alt={it.alt || ""}
            />
          )}
          <div className="p-4">
            <h4 className="text-sm font-semibold text-[#e6e9f4]">
              {it.title || "Заголовок"}
            </h4>
            {it.text && <p className="text-xs text-[#c9d0e9] mt-1">{it.text}</p>}
          </div>
        </article>
      ))}
    </div>
  );
}
