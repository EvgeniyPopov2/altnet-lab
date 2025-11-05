import { useMemo, useState } from "react";
import SafePreview from "../components/SafePreview";

type Block =
  | { id: string; type: "h1"; text: string }
  | { id: string; type: "p"; text: string }
  | { id: string; type: "img"; cid: string; alt?: string }
  | { id: string; type: "btn"; label: string; href: string };

function uid() { return Math.random().toString(36).slice(2, 8); }

export default function SiteBuilder({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("Мой .alt сайт");
  const [blocks, setBlocks] = useState<Block[]>([
    { id: uid(), type: "h1", text: "Добро пожаловать в AltNet" },
    { id: uid(), type: "p", text: "Это конструктор статических сайтов с безопасным предпросмотром." },
  ]);

  const addBlock = (t: Block["type"]) => {
    const b: Block =
      t === "h1" ? { id: uid(), type: "h1", text: "Заголовок" } :
      t === "p"  ? { id: uid(), type: "p", text: "Абзац текста" } :
      t === "img"? { id: uid(), type: "img", cid: "bafy...CID", alt: "Картинка" } :
                   { id: uid(), type: "btn", label: "Кнопка", href: "https://example.org" };
    setBlocks((arr) => [...arr, b]);
  };

  const update = (id: string, patch: Partial<Block>) => {
    setBlocks((arr) => arr.map(b => b.id === id ? { ...b, ...patch } as Block : b));
  };
  const remove = (id: string) => setBlocks((arr) => arr.filter(b => b.id !== id));
  const move = (id: string, dir: -1 | 1) => {
    setBlocks((arr) => {
      const i = arr.findIndex(b => b.id === id);
      if (i < 0) return arr;
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      const copy = arr.slice();
      const [x] = copy.splice(i, 1);
      copy.splice(j, 0, x);
      return copy;
    });
  };

  const html = useMemo(() => {
    const parts: string[] = [];
    parts.push(`<h1>${escapeHtml(title)}</h1>`);
    for (const b of blocks) {
      if (b.type === "h1") parts.push(`<h2>${escapeHtml(b.text)}</h2>`);
      else if (b.type === "p") parts.push(`<p>${escapeHtml(b.text)}</p>`);
      else if (b.type === "img") parts.push(`<img src="altfs://${escapeAttr(b.cid)}" alt="${escapeAttr(b.alt||"")}" />`);
      else if (b.type === "btn") parts.push(`<a class="btn" href="${escapeAttr(b.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(b.label)}</a>`);
    }
    return parts.join("\n");
  }, [title, blocks]);

  return (
    <div className="space-y-4">
      {/* Панель */}
      <div className="flex items-center justify-between">
        <div className="text-white/90 text-lg font-semibold">Конструктор сайта</div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20" onClick={onClose}>Закрыть</button>
          <button className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20" title="Сохранение в будущем">Сохранить</button>
          <button className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white" title="Экспорт статического сайта (скоро)">Экспорт ZIP</button>
        </div>
      </div>

      {/* Рабочая область */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Палитра */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-2">
          <div className="text-white/80 font-medium mb-1">Блоки</div>
          <div className="grid grid-cols-2 gap-2">
            <button className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20" onClick={()=>addBlock("h1")}>Заголовок</button>
            <button className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20" onClick={()=>addBlock("p")}>Текст</button>
            <button className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20" onClick={()=>addBlock("img")}>Картинка (CID)</button>
            <button className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20" onClick={()=>addBlock("btn")}>Кнопка</button>
          </div>
          <div className="mt-3">
            <div className="text-xs text-white/60 mb-1">Название сайта</div>
            <input value={title} onChange={(e)=>setTitle(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none text-white/90" />
          </div>
        </div>

        {/* Холст */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-2">
          <div className="text-white/80 font-medium mb-2">Холст</div>
          {blocks.map((b, i) => (
            <div key={b.id} className="rounded-xl bg-white/5 border border-white/10 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-white/70 text-sm">
                  {b.type === "h1" ? "Заголовок" : b.type === "p" ? "Текст" : b.type === "img" ? "Картинка (CID)" : "Кнопка"}
                  <span className="ml-2 text-white/40">#{i+1}</span>
                </div>
                <div className="flex gap-1">
                  <button className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20" onClick={()=>move(b.id,-1)} title="Выше">↑</button>
                  <button className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20" onClick={()=>move(b.id, 1)} title="Ниже">↓</button>
                  <button className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20" onClick={()=>remove(b.id)} title="Удалить">✕</button>
                </div>
              </div>
              {/* Свойства блока */}
              {b.type === "h1" && (
                <input value={b.text} onChange={(e)=>update(b.id,{ text: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none text-white/90" />
              )}
              {b.type === "p" && (
                <textarea value={b.text} onChange={(e)=>update(b.id,{ text: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none text-white/90" />
              )}
              {b.type === "img" && (
                <div className="grid grid-cols-1 gap-2">
                  <input value={b.cid} onChange={(e)=>update(b.id,{ cid: e.target.value })} placeholder="CID контента" className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none text-white/90" />
                  <input value={b.alt||""} onChange={(e)=>update(b.id,{ alt: e.target.value })} placeholder="Описание (alt)" className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none text-white/90" />
                </div>
              )}
              {b.type === "btn" && (
                <div className="grid grid-cols-1 gap-2">
                  <input value={b.label} onChange={(e)=>update(b.id,{ label: e.target.value })} placeholder="Текст кнопки" className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none text-white/90" />
                  <input value={b.href} onChange={(e)=>update(b.id,{ href: e.target.value })} placeholder="Ссылка (http/https/altfs://)" className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none text-white/90" />
                </div>
              )}
            </div>
          ))}
          {blocks.length === 0 && <div className="text-white/50 text-sm">Добавьте блоки из палитры слева.</div>}
        </div>

        {/* Предпросмотр (SafePreview) */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="text-white/80 font-medium mb-2">Предпросмотр (песочница)</div>
          <SafePreview html={html} />
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[ch] as string));
}
function escapeAttr(s: string) {
  return escapeHtml(s).replace(/\s+/g, " ").trim();
}
