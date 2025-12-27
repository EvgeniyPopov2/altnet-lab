import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import type { ContactCapabilities, PrivacyProfile } from "../core/policy/types";
import { checkSendMessage } from "../core/policy/decisions";
import { SecurityCoach } from "../core/security/coach";
import { usePanicMode } from "../core/security/usePanicMode";
import { fileToCid, shortCid } from "../core/content/cid";
import { getBlob, putFile } from "../core/content/blobStore";
import { pushSecurityEvent } from "../core/security/bus";
import { cdrSanitizeUpload, CdrError } from "../core/security/cdr";
import type { MailAttachment, MailFolder, MailMessage, MailStoreV1 } from "../core/mail/types";
import { gcMailStoreByTTL, loadMailStore, saveMailStore, seedMailStore } from "../core/mail/storage";


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

function ttlTone(expiresAt: number, now: number): string {
  const ms = expiresAt - now;
  if (!Number.isFinite(ms)) return "text-white/50";
  if (ms <= 0) return "text-rose-300";
  if (ms <= 60 * 60 * 1000) return "text-rose-300";
  if (ms <= 24 * 60 * 60 * 1000) return "text-amber-300";
  return "text-white/55";
}

function fmtTtlLeft(expiresAt: number, now: number): string {
  const ms = expiresAt - now;
  if (!Number.isFinite(ms)) return "";
  if (ms <= 0) return "истекло";

  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return "<1м";

  const totalHours = Math.floor(totalMin / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const mins = totalMin % 60;

  if (days > 0) return `${days}д ${hours}ч`;
  if (totalHours > 0) return `${totalHours}ч ${mins}м`;
  return `${totalMin}м`;
}


function deliveryText(d?: MailMessage["delivery"]): string {
  switch (d) {
    case "queued":
      return "⏳ в очереди";
    case "sent":
      return "✓ отправлено";
    case "delivered":
      return "✓✓ доставлено";
    case "failed":
      return "⚠️ ошибка";
    default:
      return "";
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

const MAX_ATTACHMENTS_PER_MAIL = 6;

function fmtBytes(n: number): string {
  const v = Math.max(0, n || 0);
  if (v < 1024) return `${v} B`;
  const kb = v / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

function isImageMime(mime: string): boolean {
  const m = (mime || "").toLowerCase();
  return m.startsWith("image/") && m !== "image/svg+xml";
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
  const [now, setNow] = useState(() => Date.now());
    // Поиск/фильтры списка (Шаг 4)
  const [listQuery, setListQuery] = useState("");
  const [filterUnread, setFilterUnread] = useState(false);
  const [filterHasAttachments, setFilterHasAttachments] = useState(false);
  const [filterExpiringSoon, setFilterExpiringSoon] = useState(false);

  const filtersActive = useMemo(() => {
    return listQuery.trim().length > 0 || filterUnread || filterHasAttachments || filterExpiringSoon;
  }, [listQuery, filterUnread, filterHasAttachments, filterExpiringSoon]);

  const clearListFilters = () => {
    setListQuery("");
    setFilterUnread(false);
    setFilterHasAttachments(false);
    setFilterExpiringSoon(false);
  };

  const [composeOpen, setComposeOpen] = useState(false);
  const [draftTo, setDraftTo] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");

  const [pendingAttachments, setPendingAttachments] = useState<MailAttachment[]>([]);
  const [attachBusy, setAttachBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [panic] = usePanicMode();

  // Моки “готовности” (в реале придут из TAL/crypto)
  const [e2eReady, setE2eReady] = useState(true);
  const [anonPathReady, setAnonPathReady] = useState(true);

  // Почтовый “контакт” (MVP): считаем, что почтовый транспорт доступен и в Anon, и в Fast.
  const mailCaps: ContactCapabilities = useMemo(
    () => ({ contactId: "mail-relay", supportsAnon: true, supportsFast: true }),
    []
  );

  // Persist (UI-mok)
  useEffect(() => {
    saveMailStore(store);
  }, [store]);

  // TTL: обновляем "текущее время" и чистим истёкшие письма раз в минуту.
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      setStore((prev) => gcMailStoreByTTL(prev, t));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Если выбранное письмо исчезло из стора (TTL GC / удаление / перемещение) — сбрасываем выбор.
  useEffect(() => {
    if (!selectedId) return;
    const exists = store.messages.some((m) => m.id === selectedId);
    if (!exists) setSelectedId(null);
  }, [selectedId, store.messages]);


    const totalInFolder = useMemo(() => {
    return store.messages.filter((m) => m.folder === folder).length;
  }, [store, folder]);

  const messagesInFolder = useMemo(() => {
    const raw = listQuery.trim().toLowerCase();
    const tokens = raw ? raw.split(/\s+/g).filter(Boolean) : [];
    const soonMs = 24 * 60 * 60 * 1000; // "истекают скоро" = TTL <= 24ч

    const list = store.messages
      .filter((m) => m.folder === folder)
      .filter((m) => {
        // 1) Непрочитанные (имеет смысл только во Входящих)
        if (filterUnread && folder === "inbox" && typeof m.readAt !== "undefined") return false;

        // 2) С вложениями
        if (filterHasAttachments && !(Array.isArray(m.attachments) && m.attachments.length > 0)) return false;

        // 3) Истекают скоро (TTL <= 24ч)
        if (filterExpiringSoon) {
          const exp = (m as MailMessage).expiresAt;
          if (typeof exp !== "number" || !Number.isFinite(exp)) return false;
          const msLeft = exp - now;
          if (!(msLeft > 0 && msLeft <= soonMs)) return false;
        }

        // 4) Поиск: subject/from/to/body/+имена вложений
        if (tokens.length > 0) {
          const parts: string[] = [];
          parts.push(String(m.subject ?? ""));
          parts.push(String(m.from ?? ""));
          if (Array.isArray(m.to)) parts.push(m.to.join(" "));
          parts.push(String(m.body ?? ""));
          if (Array.isArray(m.attachments) && m.attachments.length > 0) {
            parts.push(m.attachments.map((a) => `${a.name} ${a.cid}`).join(" "));
          }

          const hay = parts.join(" ").toLowerCase();
          if (!tokens.every((t) => hay.includes(t))) return false;
        }

        return true;
      })
      .slice()
      .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));

    return list;
  }, [store, folder, listQuery, filterUnread, filterHasAttachments, filterExpiringSoon, now]);


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
    setPendingAttachments([]);
    setAttachBusy(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
      attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
    };

    setStore((prev) => ({ ...prev, messages: [msg, ...prev.messages] }));
    setComposeOpen(false);
    resetCompose();
    setFolder("drafts");
    setSelectedId(msg.id);
  };

  function denyByUi(reason: string) {
    SecurityCoach.deniedByPolicy({
      ok: false,
      code: "PANIC_MODE",
      title: "Действие заблокировано",
      message: reason,
      details: ["Выключите «Панику», чтобы продолжить."],
    });
  }

  function canSendOrCoach(): boolean {
    if (panic) {
      denyByUi("Паника включена: отправка заблокирована (fail-closed).");
      return false;
    }

    const decision = checkSendMessage({
      localProfile: profile,
      contact: mailCaps,
      e2eReady,
      anonPathReady,
    });

    if (!decision.ok) {
      SecurityCoach.deniedByPolicy(decision);
      return false;
    }

    return true;
  }

  function setDelivery(messageId: string, d: NonNullable<MailMessage["delivery"]>) {
    setStore((prev) => {
      const rank = (x?: MailMessage["delivery"]) =>
        x === "delivered" ? 4 : x === "failed" ? 3 : x === "sent" ? 2 : x === "queued" ? 1 : 0;
      const next = prev.messages.map((m) => {
        if (m.id !== messageId) return m;
        if (rank(m.delivery) >= rank(d)) return m;
        const now = Date.now();
        return { ...m, delivery: d, updatedAt: now };
      });
      return { ...prev, messages: next };
    });
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback: старая среда
      window.prompt("Скопируйте текст:", text);
    }
  }

  function notifyAttachmentBlocked(fileName: string, err: unknown) {
    const title = "Вложение заблокировано";

    if (err instanceof CdrError) {
      const details = [
        `Файл: ${fileName}`,
        err.details ? `Детали: ${err.details}` : undefined,
        "MVP: CDR поддерживает только изображения (PNG/JPEG/WEBP/GIF) и перекодирует их в PNG.",
        "По доктрине безопасности неподдерживаемые форматы должны блокироваться (fail-closed).",
      ].filter(Boolean) as string[];

      pushSecurityEvent({
        severity: "warning",
        code: `CDR_${err.code}`,
        title,
        message: err.message,
        details,
        ttlMs: 12000,
      });
      return;
    }

    const msg = err instanceof Error ? err.message : String(err);
    pushSecurityEvent({
      severity: "warning",
      code: "CDR_UNKNOWN",
      title,
      message: "Не удалось обработать файл для безопасного вложения.",
      details: [`Файл: ${fileName}`, msg],
      ttlMs: 12000,
    });
  }

  async function addAttachments(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;

    // Сбрасываем значение input, чтобы повторный выбор того же файла снова триггерил onChange.
    if (fileInputRef.current) fileInputRef.current.value = "";

    setAttachBusy(true);
    try {
      const existing = new Set(pendingAttachments.map((a) => a.cid));
      const added: MailAttachment[] = [];

      for (const raw of list) {
        if (pendingAttachments.length + added.length >= MAX_ATTACHMENTS_PER_MAIL) {
          pushSecurityEvent({
            severity: "warning",
            code: "MAIL_ATTACH_LIMIT",
            title: "Слишком много вложений",
            message: `MVP лимит: ${MAX_ATTACHMENTS_PER_MAIL} вложений на письмо.`,
            details: ["Разбейте на несколько писем."],
            ttlMs: 10000,
          });
          break;
        }

        try {
          // 1) CDR/очистка
          const cleaned = await cdrSanitizeUpload(raw);

          // 2) CID считаем от очищенного результата
          const cid = await fileToCid(cleaned.file);

          if (existing.has(cid) || added.some((a) => a.cid === cid)) continue;
          existing.add(cid);

          // 3) кладём в локальный blob store для предпросмотра
          putFile(cid, cleaned.file);

          added.push({
            cid,
            name: cleaned.file.name,
            mime: cleaned.file.type || "application/octet-stream",
            size: cleaned.file.size,
          });
        } catch (e) {
          notifyAttachmentBlocked(raw.name || "(без имени)", e);
        }
      }

      if (added.length > 0) {
        setPendingAttachments((prev) => [...prev, ...added]);
      }
    } finally {
      setAttachBusy(false);
    }
  }

  function sendNow() {
    const to = parseRecipients(draftTo);
    if (to.length === 0) {
      SecurityCoach.deniedByPolicy({
        ok: false,
        code: "MAIL_TO_REQUIRED",
        title: "Адресат не указан",
        message: "Укажите хотя бы одного адресата, чтобы отправить письмо.",
        details: ["Можно перечислять несколько адресов через запятую или перенос строки."],
      });
      return;
    }

    if (!canSendOrCoach()) return;

    const now = Date.now();
    const msg: MailMessage = {
      id: newId(),
      folder: "sent",
      createdAt: now,
      updatedAt: now,
      from: "you@local",
      to,
      subject: draftSubject.trim() ? draftSubject.trim() : "(без темы)",
      body: draftBody,
      attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
      readAt: now,
      delivery: "queued",
    };

    setStore((prev) => ({ ...prev, messages: [msg, ...prev.messages] }));
    setComposeOpen(false);
    resetCompose();
    setFolder("sent");
    setSelectedId(msg.id);

    // мок: прогресс доставки
    window.setTimeout(() => setDelivery(msg.id, "sent"), 250);
    window.setTimeout(() => setDelivery(msg.id, "delivered"), 1100);
  }

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
    const attCount = m.attachments?.length ?? 0;

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
            <div className="mt-0.5 text-xs text-white/50 truncate">
              {attCount > 0 ? `📎 ${attCount} • ` : ""}
              {previewText(m.body)}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[11px] text-white/45 whitespace-nowrap">{time}</div>
            {typeof m.expiresAt === "number" && Number.isFinite(m.expiresAt) && (
              <div
                className={["mt-1 text-[11px] whitespace-nowrap", ttlTone(m.expiresAt, now)].join(" ")}
                title={`TTL до: ${fmtTime(m.expiresAt)}`}
              >
                ⏳ {fmtTtlLeft(m.expiresAt, now)}
              </div>
            )}

            {m.folder === "sent" && (
              <div className="mt-1 text-[11px] text-white/45 whitespace-nowrap" title={m.delivery ?? ""}>
                {deliveryText(m.delivery ?? "queued")}
              </div>
            )}
          </div>
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
              {filtersActive ? ` из ${totalInFolder}` : ""}
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

          <div className="mt-3 flex items-center gap-2">
            <input
              type="search"
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  // Esc очищает только строку поиска (фильтры остаются)
                  setListQuery("");
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
              spellCheck={false}
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-white/90 placeholder-white/40 outline-none focus:border-indigo-500/40 text-sm"
              placeholder="Поиск по теме, адресам, тексту…"
              aria-label="Поиск по письмам"
            />
            <button
              type="button"
              onClick={clearListFilters}
              disabled={!filtersActive}
              className={[
                "shrink-0 px-3 py-2 rounded-xl text-sm border transition",
                filtersActive
                  ? "bg-white/10 hover:bg-white/20 border-white/10 text-white/90"
                  : "bg-white/5 border-white/5 text-white/30 cursor-not-allowed",
              ].join(" ")}
              title="Очистить поиск и фильтры"
            >
              Очистить
            </button>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={folder !== "inbox"}
              onClick={() => setFilterUnread((v) => !v)}
              className={[
                "px-2 py-1 rounded-lg text-xs border transition",
                folder !== "inbox"
                  ? "bg-white/5 border-white/5 text-white/30 cursor-not-allowed"
                  : filterUnread
                    ? "bg-indigo-600/25 border-indigo-500/30 text-white"
                    : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10",
              ].join(" ")}
              title={folder !== "inbox" ? "Фильтр доступен только во «Входящих»" : "Показать только непрочитанные"}
            >
              Непрочитанные
            </button>

            <button
              type="button"
              onClick={() => setFilterHasAttachments((v) => !v)}
              className={[
                "px-2 py-1 rounded-lg text-xs border transition",
                filterHasAttachments
                  ? "bg-indigo-600/25 border-indigo-500/30 text-white"
                  : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10",
              ].join(" ")}
              title="Показать письма с вложениями"
            >
              С вложениями
            </button>

            <button
              type="button"
              onClick={() => setFilterExpiringSoon((v) => !v)}
              className={[
                "px-2 py-1 rounded-lg text-xs border transition",
                filterExpiringSoon
                  ? "bg-indigo-600/25 border-indigo-500/30 text-white"
                  : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10",
              ].join(" ")}
              title="Показать письма, у которых TTL истекает в ближайшие 24 часа"
            >
              Истекают скоро
            </button>
          </div>


          <div className="mt-2 flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
            {totalInFolder === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-white/60 text-sm">Тут пока пусто.</div>
            ) : messagesInFolder.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-white/70 text-sm">Ничего не найдено.</div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={clearListFilters}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 text-sm"
                  >
                    Очистить фильтры
                  </button>
                </div>
              </div>
            ) : (
              messagesInFolder.map((m) => <MailRow key={m.id} m={m} />)
            )}

          </div>

          <div className="mt-3 text-[11px] text-white/45">
            Примечание: отправка — мок (письмо попадает в «Отправленные», статусы имитируются). Без E2E отправка блокируется (fail‑closed).
          </div>

          {/* Моки-переключатели для проверки политики */}
          <details className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <summary className="cursor-pointer text-xs text-white/70">Моки (для разработки)</summary>
            <div className="mt-3 grid gap-2 text-xs text-white/80">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={e2eReady} onChange={(e) => setE2eReady(e.target.checked)} />
                <span>E2E готово</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={anonPathReady} onChange={(e) => setAnonPathReady(e.target.checked)} />
                <span>Anon путь готов (Tor/I2P)</span>
              </label>
            </div>
          </details>
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
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-white/85"
                    onClick={() => {
                      const t = Date.now();
                      setStore((prev) => ({
                        ...prev,
                        messages: prev.messages.map((m) => {
                          if (m.id !== selected.id) return m;
                          return { ...m, readAt: m.readAt ? undefined : t, updatedAt: t };
                        }),
                      }));
                    }}
                    title={selected.readAt ? "Пометить как непрочитанное" : "Пометить как прочитанное"}
                  >
                    {selected.readAt ? "Непрочит." : "Прочит."}
                  </button>

                  <button
                    type="button"
                    className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-white/85"
                    onClick={() => {
                      const dest = window.prompt("Переместить в папку: inbox | sent | drafts", folder);
                      if (!dest) return;
                      if (dest !== "inbox" && dest !== "sent" && dest !== "drafts") {
                        window.alert("Неизвестная папка. Допустимо: inbox | sent | drafts");
                        return;
                      }
                      const t = Date.now();
                      const nextFolder = dest as MailFolder;

                      setStore((prev) => ({
                        ...prev,
                        messages: prev.messages.map((m) => {
                          if (m.id !== selected.id) return m;
                          return { ...m, folder: nextFolder, updatedAt: t };
                        }),
                      }));

                      // MVP-логика: сразу переключаемся в папку назначения
                      setFolder(nextFolder);
                    }}
                    title="Переместить письмо"
                  >
                    Переместить
                  </button>

                  <button
                    type="button"
                    className="px-2 py-1 rounded-md text-xs bg-rose-600/25 hover:bg-rose-600/35 text-rose-200"
                    onClick={() => {
                      const ok = window.confirm("Удалить письмо без возможности восстановления?");
                      if (!ok) return;
                      setStore((prev) => ({
                        ...prev,
                        messages: prev.messages.filter((m) => m.id !== selected.id),
                      }));
                      setSelectedId(null);
                    }}
                    title="Удалить письмо"
                  >
                    Удалить
                  </button>
                </div>

                <div className="mt-1 text-sm text-white/60 flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                      <span className="text-white/50">От:</span> {selected.from}
                    </span>
                    <span>
                      <span className="text-white/50">Кому:</span> {selected.to?.filter(Boolean).join(", ") || "(не задано)"}
                    </span>
                    {selected.folder === "sent" && (
                      <span>
                        <span className="text-white/50">Доставка:</span> {deliveryText(selected.delivery ?? "queued")}
                      </span>
                    )}
                    <span>
                      <span className="text-white/50">Профиль:</span> {profile === "anon" ? "Анонимный" : "Приватный быстрый"}
                      {typeof selected.expiresAt === "number" && Number.isFinite(selected.expiresAt) && (
                        <span title={`TTL до: ${fmtTime(selected.expiresAt)}`}>
                          <span className="text-white/50">TTL:</span> ⏳ {fmtTtlLeft(selected.expiresAt, now)}
                        </span>
                      )}

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

              {(selected.attachments?.length ?? 0) > 0 && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm text-white/80 font-semibold">Вложения</div>
                  <div className="mt-2 grid gap-2">
                    {(selected.attachments ?? []).map((att) => {
                      const blob = getBlob(att.cid);
                      const url = blob?.url ?? null;
                      const img = isImageMime(att.mime);

                      return (
                        <div
                          key={att.cid}
                          className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                        >
                          <div className="min-w-0 flex items-center gap-3">
                            {img && url ? (
                              <button
                                type="button"
                                className="h-12 w-12 rounded-lg overflow-hidden border border-white/10 bg-black/20"
                                title="Открыть"
                                onClick={() => {
                                  try {
                                    window.open(url, "_blank", "noopener,noreferrer");
                                  } catch {
                                    // ignore
                                  }
                                }}
                              >
                                <img src={url} alt={att.name} className="h-full w-full object-cover" />
                              </button>
                            ) : (
                              <div className="h-12 w-12 rounded-lg border border-white/10 bg-black/20 flex items-center justify-center text-white/60">
                                📎
                              </div>
                            )}

                            <div className="min-w-0">
                              <div className="text-xs text-white/90 truncate">{att.name}</div>
                              <div className="text-[11px] text-white/50 truncate">
                                {shortCid(att.cid)} · {fmtBytes(att.size)}
                                {!url ? " · превью недоступно" : ""}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="h-8 px-2 rounded-lg border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                              title="Скопировать CID"
                              onClick={() => copyText(att.cid)}
                            >
                              CID
                            </button>
                            {url && (
                              <a
                                href={url}
                                download={att.name}
                                className="h-8 px-2 inline-flex items-center rounded-lg border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                                title="Скачать"
                              >
                                ⬇
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
                <div className="text-white/90 font-semibold text-lg">Новое письмо</div>
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

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => addAttachments(e.target.files)}
              />

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

              {pendingAttachments.length > 0 && (
                <div className="mt-3 grid gap-2">
                  {pendingAttachments.map((att) => {
                    const blob = getBlob(att.cid);
                    const url = blob?.url ?? null;
                    const img = isImageMime(att.mime);

                    return (
                      <div
                        key={att.cid}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                      >
                        <div className="min-w-0 flex items-center gap-3">
                          {img && url ? (
                            <img
                              src={url}
                              alt={att.name}
                              className="h-12 w-12 rounded-lg object-cover border border-white/10 bg-black/20"
                            />
                          ) : (
                            <div className="h-12 w-12 rounded-lg border border-white/10 bg-black/20 flex items-center justify-center text-white/60">
                              📎
                            </div>
                          )}

                          <div className="min-w-0">
                            <div className="text-xs text-white/90 truncate">{att.name}</div>
                            <div className="text-[11px] text-white/50 truncate">
                              {shortCid(att.cid)} · {fmtBytes(att.size)}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="h-8 w-8 rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                          title="Убрать вложение"
                          onClick={() => setPendingAttachments((prev) => prev.filter((x) => x.cid !== att.cid))}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={attachBusy}
                    title={attachBusy ? "Обработка…" : "Прикрепить файл (MVP: только изображения, CDR → PNG)"}
                  >
                    {attachBusy ? "⏳ Обработка" : "📎 Вложение"}
                  </button>
                  <div className="text-xs text-white/50">
                    Отправка — мок: письмо появится в «Отправленных» и получит статус. Без E2E отправка блокируется (fail-closed). Вложения: CDR→PNG, CID считается от очищенного результата.
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveDraft}
                    disabled={attachBusy}
                    className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Сохранить черновик
                  </button>
                  <button
                    type="button"
                    onClick={sendNow}
                    disabled={attachBusy}
                    className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                    title="Отправить (мок)"
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
