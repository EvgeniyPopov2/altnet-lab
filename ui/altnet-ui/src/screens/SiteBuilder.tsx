import { useMemo, useState } from "react";
import SafePreview from "../components/SafePreview";
import {
  Block, BlockKind, PageDoc,
  createBlock, renderDoc, uid,
  validateDoc, templateHero
} from "../builder/registry";

export default function SiteBuilder({ onClose }: { onClose: () => void }) {
  const [doc, setDoc] = useState<PageDoc>({
    title: "Мой .alt сайт",
    blocks: [
      { id: uid(), kind: "h1", text: "Добро пожаловать в AltNet" },
      { id: uid(), kind: "p",  text: "Это конструктор статических сайтов с безопасным предпросмотром." },
    ],
  });

  const [errors, setErrors] = useState<string[]>([]);

  const addBlock = (kind: BlockKind) => {
    setDoc((d) => ({ ...d, blocks: [...d.blocks, createBlock(kind)] }));
  };
  const update = (id: string, patch: Partial<Block>) => {
    setDoc((d) => ({ ...d, blocks: d.blocks.map(b => b.id === id ? { ...b, ...patch } as Block : b) }));
  };
  const remove = (id: string) => {
    setDoc((d) => ({ ...d, blocks: d.blocks.filter(b => b.id !== id) }));
  };
  const move = (id: string, dir: -1 | 1) => {
    setDoc((d) => {
      const i = d.blocks.findIndex(b => b.id === id);
      if (i < 0) return d;
      const j = i + dir; if (j < 0 || j >= d.blocks.length) return d;
      const copy = d.blocks.slice();
      const [x] = copy.splice(i, 1);
      copy.splice(j, 0, x);
      return { ...d, blocks: copy };
    });
  };

  const loadHero = () => setDoc(templateHero());

  const html = useMemo(() => renderDoc(doc), [doc]);

  const runValidate = () => setErrors(validateDoc(doc));

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "altnet-site.json"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Панель */}
      <div className="flex items-center justify-between">
        <div className="text-white/90 text-lg font-semibold">Конструктор сайта</div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20" onClick={onClose}>Закрыть</button>
          <button className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20" onClick={runValidate} title="Проверка документа">Проверить</button>
          <button className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20" onClick={downloadJson} title="Скачать JSON">Экспорт JSON</button>
          <button className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white" title="Экспорт ZIP (скоро)">Экспорт ZIP</button>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <div className="font-semibold mb-1">Найдены проблемы:</div>
          <ul className="list-disc pl-5 space-y-1">{errors.map((e, i)=><li key={i}>{e}</li>)}</ul>
        </div>
      )}

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

          <div className="mt-3 space-y-2">
            <div className="text-white/80 font-medium">Шаблоны</div>
            <button className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white" onClick={loadHero}>Hero секция</button>
          </div>

          <div className="mt-3">
            <div className="text-xs text-white/60 mb-1">Название сайта</div>
            <input
              value={doc.title}
              onChange={(e)=>setDoc({ ...doc, title: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none text-white/90"
            />
          </div>
        </div>

        {/* Холст */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-2">
          <div className="text-white/80 font-medium mb-2">Холст</div>
          {doc.blocks.map((b, i) => (
            <div key={b.id} className="rounded-xl bg-white/5 border border-white/10 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-white/70 text-sm">
                  {b.kind === "h1" ? "Заголовок" : b.kind === "p" ? "Текст" : b.kind === "img" ? "Картинка (CID)" : "Кнопка"}
                  <span className="ml-2 text-white/40">#{i+1}</span>
                </div>
                <div className="flex gap-1">
                  <button className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20" onClick={()=>move(b.id,-1)} title="Выше">↑</button>
                  <button className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20" onClick={()=>move(b.id, 1)} title="Ниже">↓</button>
                  <button className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20" onClick={()=>remove(b.id)} title="Удалить">✕</button>
                </div>
              </div>

              {/* Свойства блока */}
              {b.kind === "h1" && (
                <input value={b.text} onChange={(e)=>update(b.id,{ text: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none text-white/90" />
              )}
              {b.kind === "p" && (
                <textarea value={b.text} onChange={(e)=>update(b.id,{ text: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none text-white/90" />
              )}
              {b.kind === "img" && (
                <div className="grid grid-cols-1 gap-2">
                  <input value={b.cid} onChange={(e)=>update(b.id,{ cid: e.target.value })} placeholder="CID контента" className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none text-white/90" />
                  <input value={b.alt||""} onChange={(e)=>update(b.id,{ alt: e.target.value })} placeholder="Описание (alt)" className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none text-white/90" />
                </div>
              )}
              {b.kind === "btn" && (
                <div className="grid grid-cols-1 gap-2">
                  <input value={b.label} onChange={(e)=>update(b.id,{ label: e.target.value })} placeholder="Текст кнопки" className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none text-white/90" />
                  <input value={b.href} onChange={(e)=>update(b.id,{ href: e.target.value })} placeholder="Ссылка (http/https/altfs://)" className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none text-white/90" />
                </div>
              )}
            </div>
          ))}
          {doc.blocks.length === 0 && <div className="text-white/50 text-sm">Добавьте блоки из палитры слева.</div>}
        </div>

        {/* Предпросмотр */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="text-white/80 font-medium mb-2">Предпросмотр (песочница)</div>
          <SafePreview html={html} />
        </div>
      </div>
    </div>
  );
}
