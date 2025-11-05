import { useMemo, useState, useCallback } from "react";
import SafePreview from "../components/SafePreview";
import {
  Block, BlockKind, PageDoc,
  ColSpec,
  createBlock, createRow, renderDoc, uid,
  validateDoc, templateHero
} from "../builder/registry";

// DnD корня: перетаскиваем только за «ручку»
function useRootDnd(doc: PageDoc, setDoc: (d: PageDoc) => void) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const onHandleDragStart = (i: number) => (e: React.DragEvent) => {
    setDragIdx(i);
    try {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(i));
    } catch {}
  };
  const onDragEnter = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    setOverIdx(i);
  };
  const onDragOver = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    setOverIdx(i);
  };
  const onDrop = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setOverIdx(null); return; }
    const arr = doc.blocks.slice();
    const [it] = arr.splice(dragIdx, 1);
    const insertAt = i > dragIdx ? i - 1 : i;
    arr.splice(insertAt, 0, it);
    setDoc({ ...doc, blocks: arr });
    setDragIdx(null); setOverIdx(null);
  };
  const onDragEnd = () => { setDragIdx(null); setOverIdx(null); };

  return { overIdx, onHandleDragStart, onDragEnter, onDragOver, onDrop, onDragEnd };
}

export default function SiteBuilder({ onClose }: { onClose: () => void }) {
  const [doc, setDoc] = useState<PageDoc>({
    title: "Мой .alt сайт",
    blocks: [
      { id: uid(), kind: "h1", text: "Добро пожаловать в AltNet" },
      { id: uid(), kind: "p",  text: "Это конструктор статических сайтов с безопасным предпросмотром." },
    ],
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [editing, setEditing] = useState(false); // ← флаг «редактируем текст»
  const html = useMemo(() => renderDoc(doc), [doc]);

  const addBlock = (kind: BlockKind) => setDoc((d) => ({ ...d, blocks: [...d.blocks, createBlock(kind)] }));
  const addRowN  = (n: 1|2|3|4) => setDoc((d) => ({ ...d, blocks: [...d.blocks, createRow(n)] }));
  const updateDocTitle = (v: string) => setDoc((d)=>({ ...d, title: v }));

  // Редактирование строки/колонок
  const setCol = (rowId: string, colId: string, patch: Partial<ColSpec>) => {
    setDoc((d) => ({
      ...d,
      blocks: d.blocks.map(b => {
        if (b.kind !== "row" || b.id !== rowId) return b;
        return { ...b, cols: b.cols.map(c => c.id === colId ? { ...c, ...patch } : c) };
      }),
    }));
  };
  const addCol = (rowId: string) => {
    setDoc((d) => ({
      ...d,
      blocks: d.blocks.map(b => {
        if (b.kind !== "row" || b.id !== rowId) return b;
        if (b.cols.length >= 4) return b;
        return { ...b, cols: [...b.cols, { id: uid(), xs: 12, md: 6, blocks: [] }] };
      }),
    }));
  };
  const delCol = (rowId: string, colId: string) => {
    setDoc((d) => ({
      ...d,
      blocks: d.blocks.map(b => {
        if (b.kind !== "row" || b.id !== rowId) return b;
        if (b.cols.length <= 1) return b;
        return { ...b, cols: b.cols.filter(c => c.id !== colId) };
      }),
    }));
  };

  // Блоки внутри колонок
  const addInner = (rowId: string, colId: string, kind: BlockKind) => {
    setDoc((d) => ({
      ...d,
      blocks: d.blocks.map(b => {
        if (b.kind !== "row" || b.id !== rowId) return b;
        return { ...b, cols: b.cols.map(c => c.id === colId ? { ...c, blocks: [...c.blocks, createBlock(kind)] } : c) };
      }),
    }));
  };
  const updInner = (rowId: string, colId: string, blkId: string, patch: Partial<Block>) => {
    setDoc((d) => ({
      ...d,
      blocks: d.blocks.map(b => {
        if (b.kind !== "row" || b.id !== rowId) return b;
        return {
          ...b,
          cols: b.cols.map(c => c.id !== colId ? c : {
            ...c, blocks: c.blocks.map(x => x.id === blkId ? { ...x, ...patch } as Block : x)
          }),
        };
      }),
    }));
  };
  const delInner = (rowId: string, colId: string, blkId: string) => {
    setDoc((d) => ({
      ...d,
      blocks: d.blocks.map(b => {
        if (b.kind !== "row" || b.id !== rowId) return b;
        return { ...b, cols: b.cols.map(c => c.id !== colId ? c : { ...c, blocks: c.blocks.filter(x => x.id !== blkId) }) };
      }),
    }));
  };
  const moveInner = (rowId: string, colId: string, blkId: string, dir: -1|1) => {
    setDoc((d) => ({
      ...d,
      blocks: d.blocks.map(b => {
        if (b.kind !== "row" || b.id !== rowId) return b;
        return {
          ...b,
          cols: b.cols.map(c => {
            if (c.id !== colId) return c;
            const i = c.blocks.findIndex(x => x.id === blkId);
            if (i < 0) return c;
            const j = i + dir;
            if (j < 0 || j >= c.blocks.length) return c;
            const arr = c.blocks.slice();
            const [x] = arr.splice(i, 1);
            arr.splice(j, 0, x);
            return { ...c, blocks: arr };
          }),
        };
      }),
    }));
  };

  const loadHero = () => setDoc(templateHero());
  const runValidate = () => setErrors(validateDoc(doc));
  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "altnet-site.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const dnd = useRootDnd(doc, setDoc);

  // Универсальные props, которыми помечаем ВСЕ инпуты/текстарии, чтобы «замораживать» DnD
  const focusProps = {
    onFocus: () => setEditing(true),
    onBlur:  () => setEditing(false),
  };

  const SpanPicker = ({ rowId, col }: { rowId: string; col: ColSpec }) => {
    const makeSel = (label: string, key: keyof ColSpec) => (
      <label className="text-xs text-white/70">
        <span className="mr-1">{label}</span>
        <select
          {...focusProps}
          value={(col[key] as number|undefined) ?? ""}
          onChange={(e)=>setCol(rowId, col.id, { [key]: e.target.value ? Number(e.target.value) : undefined } as Partial<ColSpec>)}
          className="bg-white/10 border border-white/10 rounded-md px-1 py-0.5 text-white/90"
        >
          <option value="">—</option>
          {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}
        </select>
      </label>
    );
    return (
      <div className="flex flex-wrap items-center gap-2">
        {makeSel("xs", "xs")}
        {makeSel("sm", "sm")}
        {makeSel("md", "md")}
        {makeSel("lg", "lg")}
        {makeSel("xl", "xl")}
      </div>
    );
  };

  // Редакторы простых блоков
  const SimpleEditor = ({ b, update }: { b: Extract<Block, {kind:"h1"|"p"|"img"|"btn"}>; update: (patch: Partial<Block>)=>void }) => {
    if (b.kind === "h1") return <input {...focusProps} value={b.text} onChange={(e)=>update({ text: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none text-white/90" />;
    if (b.kind === "p")  return <textarea {...focusProps} value={b.text} onChange={(e)=>update({ text: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none text-white/90" />;
    if (b.kind === "img") return (
      <div className="grid gap-2">
        <input {...focusProps} value={b.cid} onChange={(e)=>update({ cid: (e.target as HTMLInputElement).value })} placeholder="CID контента" className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none text-white/90" />
        <input {...focusProps} value={b.alt||""} onChange={(e)=>update({ alt: (e.target as HTMLInputElement).value })} placeholder="Описание (alt)" className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none text-white/90" />
      </div>
    );
    // btn
    return (
      <div className="grid gap-2">
        <input {...focusProps} value={b.label} onChange={(e)=>update({ label: (e.target as HTMLInputElement).value })} placeholder="Текст кнопки" className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none text-white/90" />
        <input {...focusProps} value={b.href}  onChange={(e)=>update({ href: (e.target as HTMLInputElement).value })} placeholder="Ссылка (http/https/altfs://)" className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none text-white/90" />
      </div>
    );
  };

  // Когда редактируем — полностью убираем drop/over/enter-хэндлеры у карточек
  const makeDropHandlers = useCallback((i: number) => {
    if (editing) return {};
    return {
      onDragEnter: dnd.onDragEnter(i),
      onDragOver:  dnd.onDragOver(i),
      onDrop:      dnd.onDrop(i),
      onDragEnd:   dnd.onDragEnd,
    } as React.HTMLAttributes<HTMLDivElement>;
  }, [editing, dnd]);

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
            <div className="text-white/80 font-medium">Строки (сетка)</div>
            <div className="grid grid-cols-3 gap-2">
              <button className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20" onClick={()=>addRowN(1)}>1×12</button>
              <button className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20" onClick={()=>addRowN(2)}>2×6</button>
              <button className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20" onClick={()=>addRowN(3)}>3×4</button>
              <button className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20" onClick={()=>addRowN(4)}>4×3</button>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <div className="text-white/80 font-medium">Шаблоны</div>
            <button className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white" onClick={loadHero}>Hero секция</button>
          </div>

          <div className="mt-3">
            <div className="text-xs text-white/60 mb-1">Название сайта</div>
            <input
              {...focusProps}
              value={doc.title}
              onChange={(e)=>updateDocTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none text-white/90"
            />
          </div>
        </div>

        {/* Холст — карточки не draggable; drop-обработчики включаются ТОЛЬКО если не редактируем */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-2">
          <div className="text-white/80 font-medium mb-2">Холст</div>
          {doc.blocks.map((b, i) => {
            const dropHandlers = makeDropHandlers(i);
            return (
              <div
                key={b.id}
                {...dropHandlers}
                className={`rounded-xl border p-3 ${!editing && (dropHandlers ? "": "")} ${(!editing) ? "" : ""} ${"border-white/10 bg-white/5"}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-white/70 text-sm">
                    {b.kind === "row" ? "Строка (сетка)" :
                     b.kind === "h1" ? "Заголовок" :
                     b.kind === "p"  ? "Текст" :
                     b.kind === "img" ? "Картинка (CID)" : "Кнопка"}
                    <span className="ml-2 text-white/40">#{i+1}</span>
                    {!editing && <span className="ml-2 text-white/40">перетаскивайте за ⋮⋮</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Ручка перетаскивания */}
                    <span
                      className={`px-2 py-1 rounded-md ${editing ? "bg-white/10 opacity-50 cursor-not-allowed" : "bg-white/10 hover:bg-white/20 cursor-grab"} select-none`}
                      draggable={!editing}
                      onDragStart={!editing ? dnd.onHandleDragStart(i) : undefined}
                      title={editing ? "Перетаскивание отключено во время ввода" : "Перетащите для перестановки"}
                    >⋮⋮</span>
                    <button
                      className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20"
                      onClick={()=>{
                        setDoc((d)=>({ ...d, blocks: d.blocks.filter(x=>x.id!==b.id) }));
                      }}
                      title="Удалить"
                    >✕</button>
                  </div>
                </div>

                {b.kind !== "row" ? (
                  <SimpleEditor
                    b={b as any}
                    update={(patch)=>setDoc((d)=>({ ...d, blocks: d.blocks.map(x=>x.id===b.id ? { ...x, ...patch } as Block : x) }))}
                  />
                ) : (
                  <div className="space-y-3">
                    <div className="text-xs text-white/60">Колонки (1..4). Ширины по брейкпоинтам, перенос строк — автоматически.</div>
                    <div className="grid md:grid-cols-2 gap-3">
                      {b.cols.map((c) => (
                        <div key={c.id} className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-white/70 text-sm">Колонка {c.id.slice(0,4)}</div>
                            <div className="flex items-center gap-2">
                              <button className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20" onClick={()=>delCol(b.id, c.id)} title="Удалить колонку">✕</button>
                            </div>
                          </div>
                          <SpanPicker rowId={b.id} col={c} />
                          <div className="text-xs text-white/60">Блоки в колонке</div>
                          {c.blocks.map((cb, idx) => (
                            <div key={cb.id} className="rounded-md border border-white/10 bg-white/5 p-2">
                              <div className="flex items-center justify-between mb-1">
                                <div className="text-white/70 text-xs">
                                  {cb.kind === "h1" ? "Заголовок" : cb.kind === "p" ? "Текст" : cb.kind === "img" ? "Картинка" : cb.kind === "btn" ? "Кнопка" : cb.kind}
                                  <span className="ml-2 text-white/40">#{idx+1}</span>
                                </div>
                                <div className="flex gap-1">
                                  <button className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20" onClick={()=>moveInner(b.id, c.id, cb.id, -1)} title="Выше">↑</button>
                                  <button className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20" onClick={()=>moveInner(b.id, c.id, cb.id,  1)} title="Ниже">↓</button>
                                  <button className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20" onClick={()=>delInner(b.id, c.id, cb.id)} title="Удалить">✕</button>
                                </div>
                              </div>
                              <SimpleEditor b={cb as any} update={(patch)=>updInner(b.id, c.id, cb.id, patch)} />
                            </div>
                          ))}
                          <div className="grid grid-cols-4 gap-2">
                            <button className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs" onClick={()=>addInner(b.id, c.id, "h1")}>H1</button>
                            <button className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs" onClick={()=>addInner(b.id, c.id, "p")}>Текст</button>
                            <button className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs" onClick={()=>addInner(b.id, c.id, "img")}>Картинка</button>
                            <button className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs" onClick={()=>addInner(b.id, c.id, "btn")}>Кнопка</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div>
                      <button className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20" onClick={()=>addCol(b.id)}>+ колонка</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {doc.blocks.length === 0 && <div className="text-white/50 text-sm">Добавьте блоки/строки.</div>}
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
