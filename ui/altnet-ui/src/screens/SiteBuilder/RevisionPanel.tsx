import { useEffect, useState } from "react";
import type { Doc } from "./types";
import { createRevision, deleteRevision, listRevisions, readRevision, type RevisionMeta } from "./revisions";

type Props = { doc: Doc; canSave: boolean; canRestore: boolean; onRestore: (version: Doc, expected: Doc) => boolean };
const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} Б` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} КиБ` : `${(bytes / 1024 / 1024).toFixed(2)} МиБ`;
export default function RevisionPanel({ doc, canSave, canRestore, onRestore }: Props) {
  const [label, setLabel] = useState("");
  const [entries, setEntries] = useState<RevisionMeta[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true; setLoading(true);
    listRevisions().then(values => { if (active) { setEntries(values); setError(""); } }, cause => { if (active) setError(cause instanceof Error ? cause.message : "Не удалось прочитать версии."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  const perform = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось выполнить операцию."); }
    finally { setBusy(false); }
  };
  return <section className="grid gap-2 rounded-xl border border-[#1f2751] bg-[#0b1022] p-3" aria-label="Сохранённые версии">
    <div className="text-sm font-semibold">Версии документа</div>
    <p className="text-xs text-[#c9d0e9]">Версия включает все проекты и страницы. Она хранится в этом профиле браузера и не заменяет резервный JSON-файл.</p>
    <label className="grid gap-1 text-xs">Название версии (необязательно)<input maxLength={80} className="w-full rounded border border-[#1f2751] bg-[#0c0f1a] px-2 py-1" value={label} onChange={event => setLabel(event.target.value)} /></label>
    <button type="button" disabled={!canSave || busy || loading} className="rounded border border-[#6E59F2] px-2 py-1 text-xs disabled:opacity-40" onClick={() => void perform(async () => { await createRevision(doc, label); setLabel(""); setNotice("Версия сохранена."); setRefresh(value => value + 1); })}>Сохранить версию</button>
    {loading && <p role="status" className="text-xs">Загружаем список версий…</p>}
    {notice && <p role="status" className="text-xs text-emerald-300">{notice}</p>}
    {error && <div role="alert" className="text-xs text-amber-300">{error} <button type="button" className="underline" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Повторить</button></div>}
    {!loading && !error && entries.length === 0 && <p className="text-xs text-[#9aa3b2]">Сохранённых версий пока нет.</p>}
    {entries.map(entry => <div key={entry.id} className="grid gap-1 rounded border border-[#2a2f45] p-2 text-xs" data-revision-id={entry.id}>
      <strong className="break-words">{entry.label || entry.title || "Версия"}</strong>
      <span className="text-[#9aa3b2]">{new Date(entry.createdAt).toLocaleString("ru-RU")} · {formatBytes(entry.bytes)}</span>
      <div className="flex flex-wrap gap-1"><button type="button" disabled={!canRestore || busy} className="rounded border px-2 py-1 disabled:opacity-40" onClick={() => {
        if (!window.confirm("Восстановить все проекты и страницы из этой версии? Текущее состояние можно будет вернуть отменой действия.")) return;
        const expected = doc;
        void perform(async () => { const version = await readRevision(entry.id); if (!onRestore(version, expected)) throw new Error("Страница изменилась во время чтения. Повторите восстановление."); setNotice("Версия восстановлена."); });
      }}>Восстановить</button><button type="button" disabled={busy} className="rounded border px-2 py-1 disabled:opacity-40" onClick={() => {
        if (!window.confirm("Удалить эту сохранённую версию?")) return;
        void perform(async () => { await deleteRevision(entry.id); setNotice("Версия удалена."); setRefresh(value => value + 1); });
      }}>Удалить</button></div>
    </div>)}
  </section>;
}
