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

  const cols = bx.columns ?? (Array.isArray(bx.items) ? 3 : 1);
  const grid =
    cols === 4 ? "md:grid-cols-4" : cols === 2 ? "md:grid-cols-2" : cols === 1 ? "grid-cols-1" : "md:grid-cols-3";

  const items: ImageBoxItem[] = Array.isArray(bx.items) ? bx.items : [{ id: block.id, title: block.title, text: block.text, src: block.src, alt: block.alt }];

  return (
    <div className={`grid gap-3 ${grid}`}>
      {items.map((it: ImageBoxItem) => (
        <article
          key={it.id}
          className="rounded-2xl border border-[#1f2751] bg-[#0b1022] overflow-hidden"
        >
          {safeSrc(it.src ?? it.cid) && (
            <img
              className="w-full h-auto object-cover"
              src={safeSrc(it.src ?? it.cid)}
              alt={it.alt || ""}
              referrerPolicy="no-referrer"
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
