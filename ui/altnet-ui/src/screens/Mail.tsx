import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import type { PrivacyProfile } from "../core/policy/types";
import type { MailFolder, MailMessage, MailStoreV1 } from "../core/mail/types";
import { loadMailStore, saveMailStore, seedMailStore } from "../core/mail/storage";

function folderTitle(f: MailFolder): string {
  switch (f) {
    case "inbox":
      return "Входящие";
    case "sent":
      return "Отправленные";
    case "drafts":
      return "Черновики";
  }
}

function fmtTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

function previewText(body: string): string {
  const s = String(body ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  return s.length > 90 ? s.slice(0, 90) + "…" : s;
}

function parseRecipients(raw: string): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  return s
    .split(/[,;\n]/g)
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .slice(0, 12);
}

function containsId(list: MailMessage[], id: string | null | undefined): boolean {
  if (!id) return false;
  return list.some((m) => m.id === id);
}

function newId(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

export default function Mail({ profile }: { profile: PrivacyProfile }) {
  const [store, setStore] = useState<MailStoreV1>(() => loadMailStore() ?? seedMailStore());
  const [folder, setFolder] = useState<MailFolder>("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [composeOpen, setComposeOpen] = useState(false);
  const [draftTo, setDraftTo] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");

  // Persist (UI-mok)
  useEffect(() => {
    saveMailStore(store);
  }, [store]);

  const messagesInFolder = useMemo(() => {
    const list = store.messages
      .filter((m) => m.folder === folder)
      .slice()
      .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
    return list;
  }, [store, folder]);

  const unreadInInbox = useMemo(() => {
    return store.messages.filter((m) => m.folder === "inbox" && typeof m.readAt === "undefined").length;
  }, [store]);

  // Поддерживаем валидный selection при смене папки/данных.
  useEffect(() => {
    if (containsId(messagesInFolder, selectedId)) return;
    setSelectedId(messagesInFolder[0]?.id ?? null);
  }, [folder, messagesInFolder, selectedId]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return store.messages.find((m) => m.id === selectedId) ?? null;
  }, [store, selectedId]);

  const markRead = (id: string) => {
    setStore((prev) => {
      const next = prev.messages.map((m) => {
        if (m.id !== id) return m;
        if (typeof m.readAt !== "undefined") return m;
        const now = Date.now();
        return { ...m, readAt: now, updatedAt: now };
      });
      return { ...prev, messages: next };
    });
  };

  const openMessage = (id: string) => {
    setSelectedId(id);
    markRead(id);
  };

  const resetCompose = () => {
    setDraftTo("");
    setDraftSubject("");
    setDraftBody("");
  };

  const saveDraft = () => {
    const now = Date.now();
    const to = parseRecipients(draftTo);
    const msg: MailMessage = {
      id: newId(),
      folder: "drafts",
      createdAt: now,
      updatedAt: now,
      from: "you@local",
      to: to.length ? to : [""],
      subject: draftSubject.trim() ? draftSubject.trim() : "(черновик)",
      body: draftBody,
    };

    setStore((prev) => ({ ...prev, messages: [msg, ...prev.messages] }));
    setComposeOpen(false);
    resetCompose();
    setFolder("drafts");
    setSelectedId(msg.id);
  };

  const FolderBtn = ({ f, badge }: { f: MailFolder; badge?: number }) => (
    <button
      type="button"
      onClick={() => setFolder(f)}
      className={[
        "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-sm transition",
        folder === f
          ? "bg-indigo-600/25 border-indigo-500/30 text-white"
          : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10",
      ].join(" ")}
      title={folderTitle(f)}
    >
      <span className="truncate">
        {f === "inbox" ? "📥" : f === "sent" ? "📤" : "📝"} {folderTitle(f)}
      </span>
      {typeof badge === "number" && badge > 0 && (
        <span className="min-w-[1.5rem] px-2 py-0.5 rounded-full bg-white/10 text-white/90 text-xs text-center">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );

  const MailRow = ({ m }: { m: MailMessage }) => {
    const isActive = m.id === selectedId;
    const unread = m.folder === "inbox" && typeof m.readAt === "undefined";
    const primary = m.folder === "sent" ? (m.to?.filter(Boolean).join(", ") || "(нет адресата)") : m.from;
    const secondary = m.subject || "(без темы)";
    const time = fmtTime(m.updatedAt ?? m.createdAt);

    return (
      <button
        type="button"
        onClick={() => openMessage(m.id)}
        className={[
          "w-full text-left rounded-xl border px-3 py-2 transition",
          isActive ? "bg-white/15 border-white/20" : "bg-white/5 border-white/10 hover:bg-white/10",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {unread && <span className="text-emerald-300">●</span>}
              <div className={unread ? "text-white font-semibold truncate" : "text-white/90 font-medium truncate"}>
                {primary}
              </div>
            </div>
            <div className="mt-0.5 text-sm text-white/80 truncate">{secondary}</div>
            <div className="mt-0.5 text-xs text-white/50 truncate">{previewText(m.body)}</div>
          </div>
          <div className="text-[11px] text-white/45 whitespace-nowrap">{time}</div>
        </div>
      </button>
    );
  };

  return (
    <div className="h-full min-h-0 flex gap-4">
      {/* Левая колонка: папки + список */}
      <div className="w-[380px] max-w-[44vw] min-w-[320px] h-full min-h-0 flex flex-col gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-white/90 font-semibold">Почта</div>
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm"
              title="Написать письмо"
            >
              ✍️ Написать
            </button>
          </div>
          <div className="mt-3 grid gap-2">
            <FolderBtn f="inbox" badge={unreadInInbox} />
            <FolderBtn f="sent" />
            <FolderBtn f="drafts" />
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-white/60">
              {folderTitle(folder)} • {messagesInFolder.length}
            </div>
            <button
              type="button"
              className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-xs"
              onClick={() => setStore(seedMailStore())}
              title="Сбросить мок-данные"
            >
              Сброс
            </button>
          </div>

          <div className="mt-2 flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
            {messagesInFolder.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-white/60 text-sm">Тут пока пусто.</div>
            ) : (
              messagesInFolder.map((m) => <MailRow key={m.id} m={m} />)
            )}
          </div>

          <div className="mt-3 text-[11px] text-white/45">
            Примечание: без E2E‑контекста отправка обязана быть заблокирована (fail‑closed). Сейчас — UI‑мок.
          </div>
        </div>
      </div>

      {/* Правая колонка: просмотр */}
      <div className="flex-1 h-full min-h-0">
        <div className="h-full min-h-0 rounded-2xl border border-white/10 bg-white/5 p-5 overflow-y-auto">
          {!selected ? (
            <div className="text-white/60">Выберите письмо слева.</div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-white/90 text-xl font-semibold">{selected.subject || "(без темы)"}</div>
                <div className="mt-1 text-sm text-white/60 flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    <span className="text-white/50">От:</span> {selected.from}
                  </span>
                  <span>
                    <span className="text-white/50">Кому:</span> {selected.to?.filter(Boolean).join(", ") || "(не задано)"}
                  </span>
                  <span>
                    <span className="text-white/50">Профиль:</span> {profile === "anon" ? "Анонимный" : "Приватный быстрый"}
                  </span>
                </div>
                <div className="mt-1 text-xs text-white/45">{fmtTime(selected.createdAt)}</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 text-sm" disabled>
                  Ответить
                </button>
                <button type="button" className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 text-sm" disabled>
                  Переслать
                </button>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4 whitespace-pre-wrap text-white/85">
                {selected.body || ""}
              </div>

              {selected.attachments && selected.attachments.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm text-white/80 font-semibold">Вложения</div>
                  <ul className="mt-2 space-y-1 text-sm text-white/70">
                    {selected.attachments.map((a) => (
                      <li key={`${a.cid}|${a.name}`} className="flex items-center justify-between gap-2">
                        <span className="truncate">{a.name}</span>
                        <span className="text-xs text-white/45">{a.cid}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Compose modal (MVP) */}
      <AnimatePresence>
        {composeOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-[720px] rounded-2xl border border-white/10 bg-[#0b1020] p-5"
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              transition={{ duration: 0.16 }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-white/90 font-semibold text-lg">Новое письмо (черновик)</div>
                <button
                  type="button"
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80"
                  onClick={() => {
                    setComposeOpen(false);
                    resetCompose();
                  }}
                  title="Закрыть"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                <div>
                  <div className="text-xs text-white/60">Кому</div>
                  <input
                    value={draftTo}
                    onChange={(e) => setDraftTo(e.target.value)}
                    className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-white/90 placeholder-white/40 outline-none focus:border-indigo-500/40"
                    placeholder="alice@local, bob@local"
                  />
                </div>
                <div>
                  <div className="text-xs text-white/60">Тема</div>
                  <input
                    value={draftSubject}
                    onChange={(e) => setDraftSubject(e.target.value)}
                    className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-white/90 placeholder-white/40 outline-none focus:border-indigo-500/40"
                    placeholder="О чём письмо"
                  />
                </div>
                <div>
                  <div className="text-xs text-white/60">Текст</div>
                  <textarea
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    className="mt-1 w-full min-h-[200px] rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-white/90 placeholder-white/40 outline-none focus:border-indigo-500/40"
                    placeholder="Напишите сообщение…"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-white/50">Отправка, E2E и вложения‑CID — на следующем шаге.</div>
                <div className="flex gap-2">
                  <button type="button" onClick={saveDraft} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/90">
                    Сохранить черновик
                  </button>
                  <button
                    type="button"
                    disabled
                    className="px-3 py-2 rounded-xl bg-indigo-600/50 text-white/70 cursor-not-allowed"
                    title="Пока отключено (следующий шаг)"
                  >
                    Отправить
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
