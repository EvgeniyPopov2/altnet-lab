import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ContactCapabilities, PrivacyProfile } from "../core/policy/types";
import { computeEsm } from "../core/policy/esm";
import { checkSendMessage, checkStartCall } from "../core/policy/decisions";
import { computeRtcPolicy } from "../core/policy/rtc";
import { SecurityCoach } from "../core/security/coach";
import { usePanicMode } from "../core/security/usePanicMode";
import { useVoiceVideoSettings } from "../core/settings/voiceVideo";
import type { CallWindowModel } from "../components/rtc/CallWindow";
import { GuardedActionButton } from "../components/policy/GuardedActionButton";

import type { DmAttachment, DmJournalV1, DmMessage } from "../core/dm/types";
import { appendMessage, createEmptyJournal, getOrderedMessages, mergeJournals } from "../core/dm/journal";
import { clearDmJournal, loadDmJournal, saveDmJournal } from "../core/dm/storage";
import { getOrCreateDeviceId, nextDeviceSeq } from "../core/identity/device";
import { fileToCid, shortCid } from "../core/content/cid";
import { getBlob, putFile } from "../core/content/blobStore";
import { cdrSanitizeUpload, CdrError } from "../core/security/cdr";
import { pushSecurityEvent } from "../core/security/bus";

export type DmContact = {
  id: string;
  title: string;
  subtitle?: string;
  caps: ContactCapabilities;
};

type Presence = "online" | "away" | "offline";

const REACTION_EMOJI = ["👍", "❤️", "😂", "🔥", "👀", "😮"] as const;
const MAX_ATTACHMENTS_PER_MESSAGE = 4;

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

function hhmm(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function badgeClass(kind: "ok" | "warn" | "deny") {
  switch (kind) {
    case "ok":
      return "bg-emerald-500/15 border-emerald-500/30 text-emerald-200";
    case "warn":
      return "bg-amber-500/15 border-amber-500/30 text-amber-200";
    case "deny":
    default:
      return "bg-red-500/15 border-red-500/30 text-red-200";
  }
}

function Badge({
  kind,
  children,
  title,
}: {
  kind: "ok" | "warn" | "deny";
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={[
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
        badgeClass(kind),
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function inferPresence(subtitle?: string): Presence {
  const s = (subtitle ?? "").toLowerCase();
  if (s.includes("не в сети") || s.includes("offline")) return "offline";
  if (s.includes("afk") || s.includes("away") || s.includes("отош")) return "away";
  if (s.includes("в сети") || s.includes("online")) return "online";
  // нейтральный дефолт
  return "online";
}

function inferTyping(subtitle?: string): boolean {
  const s = (subtitle ?? "").toLowerCase();
  return s.includes("пишет") || s.includes("печатает") || s.includes("typing");
}

function presenceDot(p: Presence): string {
  switch (p) {
    case "online":
      return "bg-emerald-400";
    case "away":
      return "bg-amber-400";
    case "offline":
    default:
      return "bg-white/30";
  }
}

function presenceLabel(p: Presence): string {
  switch (p) {
    case "online":
      return "онлайн";
    case "away":
      return "AFK";
    case "offline":
    default:
      return "не в сети";
  }
}

function deliveryIcon(d?: DmMessage["delivery"]): string {
  switch (d) {
    case "sent":
      return "✓";
    case "delivered":
      return "✓✓";
    case "read":
      return "✓✓";
    default:
      return "";
  }
}

function deliveryClass(d?: DmMessage["delivery"]): string {
  switch (d) {
    case "read":
      return "text-indigo-300";
    default:
      return "text-white/40";
  }
}

function seedJournal(dm: DmContact): DmJournalV1 {
  const base = createEmptyJournal(dm.id);
  const now = Date.now();

  const m1: DmMessage = {
    id: `seed:${dm.id}:1`,
    createdAt: now - 2 * 60_000,
    updatedAt: now - 2 * 60_000,
    author: "them",
    text: "Привет. Тут будет CRDT-журнал (мок) + реакции/статусы/контекст-меню.",
  };

  const m2: DmMessage = {
    id: `seed:${dm.id}:2`,
    createdAt: now - 90_000,
    updatedAt: now - 90_000,
    author: "me",
    text: "Ок. Дальше — симуляция мержа mergeJournals + UX (fail-closed).",
    delivery: "read",
  };

  return appendMessage(appendMessage(base, m1), m2);
}

type MsgMenuState =
  | { open: false }
  | {
    open: true;
    messageId: string;
    x: number;
    y: number;
  };

export default function Messages({
  profile,
  dm,
  onStartCall,
  onOpenVoiceVideoSettings,
}: {
  profile: PrivacyProfile;
  dm: DmContact;
  onStartCall: (call: CallWindowModel) => void;
  onOpenVoiceVideoSettings?: () => void;
}) {
  const deviceId = useMemo(() => getOrCreateDeviceId(), []);
  const remoteActorId = useMemo(() => `contact:${dm.id}`, [dm.id]);

  const [panic, setPanic] = usePanicMode();

  // Моки “готовности” (в реале придут из TAL/crypto)
  const [e2eReady, setE2eReady] = useState(true);
  const [anonPathReady, setAnonPathReady] = useState(true);
  const [hasTurnAllowList, setHasTurnAllowList] = useState(true);
  const [vv] = useVoiceVideoSettings(profile);

  const esm = useMemo(() => computeEsm(profile, dm.caps), [profile, dm.caps]);

  const voiceCallPreview = useMemo(() => {
    if (panic) {
      return {
        ok: false as const,
        code: "PANIC_MODE",
        title: "Паника включена",
        message: "Сетевые действия временно заблокированы (fail-closed).",
        details: [
          'Отключите "Панику", если вы уверены, что устройство не скомпрометировано.',
          "Если есть риск компрометации — сначала выполните отзыв/ротацию ключей в Security Center.",
        ],
      };
    }

    return checkStartCall({
      kind: "voice",
      localProfile: profile,
      contact: dm.caps,
      e2eReady,
      anonPathReady,
      hasTurnAllowList,
      allowVideoInAnon: vv.allowVideoInAnon,
    });
  }, [panic, profile, dm.caps, e2eReady, anonPathReady, hasTurnAllowList, vv.allowVideoInAnon]);

  const videoCallPreview = useMemo(() => {
    if (panic) {
      return {
        ok: false as const,
        code: "PANIC_MODE",
        title: "Паника включена",
        message: "Сетевые действия временно заблокированы (fail-closed).",
        details: [
          'Отключите "Панику", если вы уверены, что устройство не скомпрометировано.',
          "Если есть риск компрометации — сначала выполните отзыв/ротацию ключей в Security Center.",
        ],
      };
    }

    return checkStartCall({
      kind: "video",
      localProfile: profile,
      contact: dm.caps,
      e2eReady,
      anonPathReady,
      hasTurnAllowList,
      allowVideoInAnon: vv.allowVideoInAnon,
    });
  }, [panic, profile, dm.caps, e2eReady, anonPathReady, hasTurnAllowList, vv.allowVideoInAnon]);

  const [draft, setDraft] = useState("");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<DmAttachment[]>([]);
  const [attachBusy, setAttachBusy] = useState(false);

  const [presence, setPresence] = useState<Presence>(() => inferPresence(dm.subtitle));
  const [remoteTyping, setRemoteTyping] = useState<boolean>(() => inferTyping(dm.subtitle));

  const [mergeHint, setMergeHint] = useState<string | null>(null);

  const [menu, setMenu] = useState<MsgMenuState>({ open: false });

  const [journal, setJournal] = useState<DmJournalV1>(() => {
    const loaded = loadDmJournal(dm.id);
    if (loaded) return loaded;
    const seeded = seedJournal(dm);
    saveDmJournal(dm.id, seeded);
    return seeded;
  });

  const ordered = useMemo(() => getOrderedMessages(journal), [journal]);
  const byId = useMemo(() => new Map(ordered.map((m) => [m.id, m])), [ordered]);

  const endRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // при смене диалога
    const loaded = loadDmJournal(dm.id);
    const next = loaded ?? seedJournal(dm);
    setJournal(next);
    if (!loaded) saveDmJournal(dm.id, next);

    setDraft("");
    setReplyToId(null);
    setPendingAttachments([]);
    setAttachBusy(false);
    setMenu({ open: false });
    setMergeHint(null);
    setPresence(inferPresence(dm.subtitle));
    setRemoteTyping(inferTyping(dm.subtitle));
  }, [dm.id, dm.subtitle]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [ordered.length, dm.id]);

  useEffect(() => {
    if (!menu.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu({ open: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu.open]);

  const e2eBadge = e2eReady ? (
    <Badge kind="ok" title="Сквозное шифрование установлено">
      🔒 E2E
    </Badge>
  ) : (
    <Badge kind="deny" title="Без E2E отправка запрещена (fail-closed)">
      ⛔ E2E
    </Badge>
  );

  const sessionBadge = esm.commonPath ? (
    <Badge kind={esm.family === "anon" ? "warn" : "ok"} title={esm.reason}>
      {esm.family === "anon" ? "🕶️" : "⚡"} Сессия: {esm.family.toUpperCase()}
      {esm.compat ? " (compat)" : ""}
    </Badge>
  ) : (
    <Badge kind="deny" title={esm.reason}>
      ⛔ Нет пути
    </Badge>
  );

  const panicBadge = panic ? (
    <button
      type="button"
      onClick={() => setPanic(false)}
      className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/15 px-2.5 py-1 text-xs text-red-200 hover:bg-red-500/20"
      title="Паника включена: сетевые действия блокируются. Нажмите, чтобы выключить."
    >
      🛑 Паника
    </button>
  ) : null;

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
      denyByUi("Паника включена: действие заблокировано (fail-closed). ");
      return false;
    }

    const decision = checkSendMessage({
      localProfile: profile,
      contact: dm.caps,
      e2eReady,
      anonPathReady,
    });

    if (!decision.ok) {
      SecurityCoach.deniedByPolicy(decision);
      return false;
    }

    return true;
  }

  function commit(next: DmJournalV1) {
    setJournal(next);
    saveDmJournal(dm.id, next);
  }

  function updateMessage(messageId: string, upd: (m: DmMessage) => DmMessage) {
    const exists = journal.entries.some((m) => m.id === messageId);
    if (!exists) return;
    commit({
      ...journal,
      entries: journal.entries.map((m) => (m.id === messageId ? upd(m) : m)),
    });
  }

  function setDelivery(messageId: string, d: NonNullable<DmMessage["delivery"]>) {
    updateMessage(messageId, (m) => {
      const rank = (x?: DmMessage["delivery"]) => (x === "read" ? 3 : x === "delivered" ? 2 : x === "sent" ? 1 : 0);
      if (rank(m.delivery) >= rank(d)) return m;
      return { ...m, delivery: d, updatedAt: Date.now() };
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
      const added: DmAttachment[] = [];

      for (const raw of list) {
        if (pendingAttachments.length + added.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
          pushSecurityEvent({
            severity: "warning",
            code: "ATTACH_LIMIT",
            title: "Слишком много вложений",
            message: `MVP лимит: ${MAX_ATTACHMENTS_PER_MESSAGE} вложения на сообщение.`,
            details: ["Разбейте на несколько сообщений."],
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


  function openMenuAt(messageId: string, x: number, y: number) {
    const padding = 12;
    const w = 248;
    const h = 292; // чуть с запасом (есть опциональный пункт про CID вложений)
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const nx = Math.max(padding, Math.min(x, vw - w - padding));
    const ny = Math.max(padding, Math.min(y, vh - h - padding));
    setMenu({ open: true, messageId, x: nx, y: ny });
  }

  function applyReaction(messageId: string, emoji: string, actorId: string) {
    updateMessage(messageId, (m) => {
      if (m.deletedAt) return m;
      const next = { ...m, reactions: { ...(m.reactions ?? {}) }, updatedAt: Date.now() };
      const current = new Set(next.reactions?.[emoji] ?? []);
      if (current.has(actorId)) current.delete(actorId);
      else current.add(actorId);

      const arr = Array.from(current);
      arr.sort();

      if (arr.length === 0) {
        // Не используем delete (ts(2790)): убираем ключ через rest-оператор.
        const { [emoji]: _removed, ...rest } = next.reactions ?? {};
        next.reactions = rest;
      } else {
        next.reactions = { ...(next.reactions ?? {}), [emoji]: arr };
      }


      return next;
    });
  }

  function toggleMyReaction(messageId: string, emoji: string) {
    if (!canSendOrCoach()) return;
    applyReaction(messageId, emoji, deviceId);
  }

  function deleteMyMessage(messageId: string) {
    if (!canSendOrCoach()) return;

    updateMessage(messageId, (m) => {
      if (m.author !== "me") return m;
      if (m.deletedAt) return m;
      const t = Date.now();
      return { ...m, deletedAt: t, updatedAt: t };
    });
  }

  function onSend() {
    const text = draft.trim();
    if (text.length === 0 && pendingAttachments.length === 0) return;
    if (attachBusy) return;
    if (!canSendOrCoach()) return;

    const now = Date.now();
    const msg: DmMessage = {
      id: `${deviceId}:${nextDeviceSeq()}`,
      createdAt: now,
      updatedAt: now,
      author: "me",
      text,
      delivery: "sent",
      replyTo: replyToId ?? undefined,
      attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
    };

    const next = appendMessage(journal, msg);
    commit(next);
    setDraft("");
    setReplyToId(null);
    setPendingAttachments([]);

    // мок: прогресс доставки
    window.setTimeout(() => setDelivery(msg.id, "delivered"), 700);
    window.setTimeout(() => setDelivery(msg.id, "read"), 1600);
  }


  function onCall(kind: "voice" | "video") {
    if (panic) {
      denyByUi("Паника включена: звонки заблокированы (fail-closed).");
      return;
    }

    const decision = checkStartCall({
      kind,
      localProfile: profile,
      contact: dm.caps,
      e2eReady,
      anonPathReady,
      hasTurnAllowList,
      allowVideoInAnon: vv.allowVideoInAnon,
    });

    if (!decision.ok) {
      SecurityCoach.deniedByPolicy(decision);
      return;
    }

    onStartCall({
      kind,
      title: dm.title,
      policy: {
        esm: decision.esm,
        rtc: decision.rtc ?? computeRtcPolicy(decision.esm),
      },
      participants: [
        { id: "me", name: "Вы", label: "вы" },
        { id: dm.id, name: dm.title, label: "контакт" },
      ],
    });
  }

  function simulateIncoming() {
    const now = Date.now();
    const msg: DmMessage = {
      id: `remote:${dm.id}:${now}`,
      createdAt: now,
      updatedAt: now,
      author: "them",
      text: "(входящее) Проверка: реакции, статус, контекст-меню.",
    };
    commit(appendMessage(journal, msg));
  }

  function simulateMerge() {
    const now = Date.now();

    // «Удалённый» журнал (как будто пришёл из сети)
    let remote: DmJournalV1 = { ...journal, entries: [...journal.entries] };

    // 1) новое входящее сообщение
    remote = appendMessage(remote, {
      id: `remote-merge:${dm.id}:${now}`,
      createdAt: now,
      updatedAt: now,
      author: "them",
      text: "(merge) Входящее из удалённого журнала. mergeJournals должен добавить его.",
    });

    // 2) реакция от контакта на последнее не-удалённое
    const target = [...remote.entries].reverse().find((m) => !m.deletedAt);
    if (target) {
      remote = {
        ...remote,
        entries: remote.entries.map((m) => {
          if (m.id !== target.id) return m;
          const reactions = { ...(m.reactions ?? {}) };
          const set = new Set(reactions["👀"] ?? []);
          set.add(remoteActorId);
          reactions["👀"] = Array.from(set).sort();
          return { ...m, reactions, updatedAt: now };
        }),
      };
    }

    // 3) удаление первого сообщения контакта (tombstone)
    const firstThem = remote.entries.find((m) => m.author === "them" && !m.deletedAt);
    if (firstThem) {
      remote = {
        ...remote,
        entries: remote.entries.map((m) =>
          m.id === firstThem.id ? { ...m, deletedAt: now, updatedAt: now } : m
        ),
      };
    }

    const before = journal;
    const merged = mergeJournals(journal, remote);

    const added = merged.entries.length - before.entries.length;
    const changed = merged.entries.filter((m) => {
      const prev = before.entries.find((x) => x.id === m.id);
      if (!prev) return false;
      const a = JSON.stringify(prev.reactions ?? {});
      const b = JSON.stringify(m.reactions ?? {});
      return a !== b || (prev.deletedAt ?? 0) !== (m.deletedAt ?? 0);
    }).length;

    commit(merged);
    setMergeHint(`mergeJournals: +${added} новых, изменено ${changed} сообщений`);
  }

  function resetChat() {
    clearDmJournal(dm.id);
    const seeded = seedJournal(dm);
    commit(seeded);
    setDraft("");
    setReplyToId(null);
    setMenu({ open: false });
    setMergeHint("Журнал очищен (localStorage)");
  }

  const replyPreview = replyToId ? byId.get(replyToId) : null;

  return (
    <div className="h-full min-h-0 flex flex-col gap-4">
      {/* Заголовок диалога */}
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-white/90 font-semibold flex items-center gap-2">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${presenceDot(presence)}`} />
              <span>{dm.title}</span>
              <span className="text-xs text-white/50">· {presenceLabel(presence)}</span>
              {remoteTyping && <span className="text-xs text-white/50">· печатает…</span>}
            </div>
            {dm.subtitle && <div className="text-xs text-white/60">{dm.subtitle}</div>}
            {mergeHint && <div className="text-[11px] text-white/50 mt-1">{mergeHint}</div>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {panicBadge}
            {e2eBadge}
            {sessionBadge}

            <div className="h-6 w-px bg-white/10 mx-1" />

            <GuardedActionButton icon="📞" title="Голосовой звонок" decision={voiceCallPreview} onAllowed={() => onCall("voice")} />
            <GuardedActionButton icon="🎥" title="Видео-звонок" decision={videoCallPreview} onAllowed={() => onCall("video")} />
            <button
              type="button"
              onClick={() => onOpenVoiceVideoSettings?.()}
              disabled={!onOpenVoiceVideoSettings}
              className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/10 text-white/90 hover:bg-white/20 disabled:opacity-60 disabled:cursor-not-allowed h-9 w-9"
              title="Голос и видео"
            >
              ⚙️
            </button>
          </div>
        </div>
      </div>

      {/* Лента сообщений (CRDT-мок) */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="space-y-3 text-sm">
          {ordered.map((m) => {
            const isMe = m.author === "me";
            const time = hhmm(m.createdAt);
            const who = isMe ? "Вы" : dm.title;
            const reactions = Object.entries(m.reactions ?? {});
            const myReacted = (emoji: string) => (m.reactions?.[emoji] ?? []).includes(deviceId);
            const atts = m.attachments ?? [];
            const quoted = m.replyTo ? byId.get(m.replyTo) : null;

            return (
              <div
                key={m.id}
                className={["flex group", isMe ? "justify-end" : "justify-start"].join(" ")}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMenuAt(m.id, e.clientX, e.clientY);
                }}
              >
                <div
                  className={[
                    "relative max-w-[78%] rounded-2xl px-4 py-2 border",
                    isMe
                      ? "bg-indigo-600/20 border-indigo-400/20 text-white/90"
                      : "bg-white/5 border-white/10 text-white/90",
                  ].join(" ")}
                >
                  {/* кнопка меню */}
                  <button
                    type="button"
                    title="Меню сообщения"
                    onClick={(e) => {
                      const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                      openMenuAt(m.id, r.right, r.bottom);
                    }}
                    className="absolute top-2 right-2 h-7 w-7 rounded-lg border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 transition"
                  >
                    ⋯
                  </button>

                  <div className="text-[11px] text-white/50 mb-1 pr-8">
                    {who} · {time}
                    {isMe && (
                      <span className={["ml-2", deliveryClass(m.delivery)].join(" ")}>{deliveryIcon(m.delivery)}</span>
                    )}
                  </div>

                  {quoted && (
                    <div className="mb-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
                      <div className="text-[11px] text-white/50">Ответ на: {quoted.author === "me" ? "Вы" : dm.title}</div>
                      <div className="mt-1 line-clamp-2 whitespace-pre-wrap">
                        {quoted.deletedAt ? "(сообщение удалено)" : quoted.text}
                      </div>
                    </div>
                  )}

                  <div className="leading-relaxed whitespace-pre-wrap">
                    {m.deletedAt ? <span className="text-white/60 italic">(сообщение удалено)</span> : m.text}
                  </div>
                  {!m.deletedAt && atts.length > 0 && (
                    <div className="mt-2 grid gap-2">
                      {atts.map((att) => {
                        const blob = getBlob(att.cid);
                        const url = blob?.url ?? null;
                        const img = isImageMime(att.mime);

                        if (img && url) {
                          return (
                            <button
                              key={att.cid}
                              type="button"
                              className="block text-left"
                              title={`${att.name} • ${shortCid(att.cid)}`}
                              onClick={() => {
                                try {
                                  window.open(url, "_blank", "noopener,noreferrer");
                                } catch {
                                  // ignore
                                }
                              }}
                            >
                              <img
                                src={url}
                                alt={att.name}
                                className="max-h-[240px] w-auto rounded-xl border border-white/10 bg-black/20"
                              />
                            </button>
                          );
                        }

                        return (
                          <div
                            key={att.cid}
                            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="text-xs text-white/90 truncate">📎 {att.name}</div>
                              <div className="text-[11px] text-white/50 truncate">
                                {shortCid(att.cid)} · {fmtBytes(att.size)}
                                {!url ? " · превью недоступно" : ""}
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
                  )}

                  {!m.deletedAt && reactions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {reactions.map(([emoji, actors]) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => toggleMyReaction(m.id, emoji)}
                          className={[
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition",
                            myReacted(emoji)
                              ? "bg-indigo-500/25 border-indigo-400/30 text-white"
                              : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10",
                          ].join(" ")}
                          title={actors.join(", ")}
                        >
                          <span>{emoji}</span>
                          <span className="text-[11px] text-white/70">{actors.length}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div className="text-xs text-white/50 pt-2">
            Примечание: без E2E контекста отправка обязана быть заблокирована (fail-closed).
          </div>

          <div ref={endRef} />
        </div>
      </div>

      {/* Ввод */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
        {replyPreview && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="min-w-0">
              <div className="text-[11px] text-white/50">Ответ</div>
              <div className="text-xs text-white/80 truncate">
                {replyPreview.deletedAt ? "(сообщение удалено)" : replyPreview.text}
              </div>
            </div>
            <button
              type="button"
              className="h-8 w-8 rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              title="Убрать ответ"
              onClick={() => setReplyToId(null)}
            >
              ✕
            </button>
          </div>
        )}

        {pendingAttachments.length > 0 && (
          <div className="mb-2 grid gap-2">
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


        <div className="flex items-end gap-3">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => addAttachments(e.target.files)}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-[42px] w-[42px] shrink-0 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={attachBusy}
            title={attachBusy ? "Обработка…" : "Прикрепить файл (MVP: только изображения, CDR → PNG)"}
          >
            {attachBusy ? "⏳" : "📎"}
          </button>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Написать сообщение…"
            className="flex-1 min-w-0 resize-none rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/90 outline-none placeholder-white/40"
          />

          <button
            type="button"
            onClick={onSend}
            className="h-[42px] shrink-0 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-60 whitespace-nowrap"
            disabled={(draft.trim().length === 0 && pendingAttachments.length === 0) || attachBusy}
            title="Отправить"
          >
            Отправить
          </button>
        </div>

        {/* Контекст-меню */}
        {menu.open && (() => {
          const m = byId.get(menu.messageId);
          if (!m) return null;
          const isMe = m.author === "me";
          const canDelete = isMe && !m.deletedAt;

          return (
            <div
              className="fixed inset-0 z-50"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setMenu({ open: false });
              }}
            >
              <div
                className="fixed w-[248px] rounded-xl border border-white/10 bg-[#0f1115]/95 backdrop-blur px-2 py-2 text-sm shadow-xl"
                style={{ left: menu.x, top: menu.y }}
              >
                <button
                  type="button"
                  className="w-full text-left rounded-lg px-3 py-2 hover:bg-white/10 text-white/90"
                  onClick={() => {
                    setReplyToId(m.id);
                    setMenu({ open: false });
                  }}
                >
                  Ответить
                </button>

                <button
                  type="button"
                  className="w-full text-left rounded-lg px-3 py-2 hover:bg-white/10 text-white/90"
                  onClick={() => {
                    copyText(m.text);
                    setMenu({ open: false });
                  }}
                >
                  Копировать текст
                </button>
                {(m.attachments?.length ?? 0) > 0 && (
                  <button
                    type="button"
                    className="w-full text-left rounded-lg px-3 py-2 hover:bg-white/10 text-white/90"
                    onClick={() => {
                      const cids = (m.attachments ?? []).map((a) => a.cid).join("\n");
                      copyText(cids);
                      setMenu({ open: false });
                    }}
                  >
                    Копировать CID вложений
                  </button>
                )}

                <div className="my-1 h-px bg-white/10" />

                <div className="px-3 py-2">
                  <div className="text-[11px] text-white/50 mb-1">Реакция</div>
                  <div className="flex flex-wrap gap-1">
                    {REACTION_EMOJI.map((emoji) => {
                      const active = (m.reactions?.[emoji] ?? []).includes(deviceId);
                      return (
                        <button
                          key={emoji}
                          type="button"
                          className={[
                            "h-8 w-8 rounded-lg border text-base",
                            active
                              ? "border-indigo-400/40 bg-indigo-500/25"
                              : "border-white/10 bg-white/5 hover:bg-white/10",
                          ].join(" ")}
                          title={active ? "Убрать" : "Поставить"}
                          onClick={() => {
                            toggleMyReaction(m.id, emoji);
                            setMenu({ open: false });
                          }}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {canDelete && (
                  <>
                    <div className="my-1 h-px bg-white/10" />
                    <button
                      type="button"
                      className="w-full text-left rounded-lg px-3 py-2 hover:bg-red-500/10 text-red-200"
                      onClick={() => {
                        deleteMyMessage(m.id);
                        setMenu({ open: false });
                      }}
                    >
                      Удалить (моё)
                    </button>
                  </>
                )}

                <div className="my-1 h-px bg-white/10" />

                <button
                  type="button"
                  className="w-full text-left rounded-lg px-3 py-2 hover:bg-white/10 text-white/70"
                  onClick={() => setMenu({ open: false })}
                >
                  Закрыть
                </button>
              </div>
            </div>
          );
        })()}

        {/* Моки-переключатели для проверки политики и CRDT */}
        <details className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <summary className="cursor-pointer text-sm text-white/80">Моки (для разработки)</summary>
          <div className="mt-3 grid sm:grid-cols-2 gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={e2eReady} onChange={(e) => setE2eReady(e.target.checked)} />
              <span>E2E готово</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={anonPathReady} onChange={(e) => setAnonPathReady(e.target.checked)} />
              <span>Anon путь готов (Tor/I2P)</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={hasTurnAllowList} onChange={(e) => setHasTurnAllowList(e.target.checked)} />
              <span>Есть allow-list TURN</span>
            </label>

            <div className="sm:col-span-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-sm text-white/80">
                Видео в Anon:{" "}
                <span className="font-semibold text-white">{vv.allowVideoInAnon ? "разрешено" : "выключено"}</span>
              </div>
              <div className="mt-0.5 text-xs text-white/60">Меняется в «Голос и видео» (⚙️).</div>
            </div>

            <div className="sm:col-span-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-xs text-white/60">Статусы (мок)</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="text-sm text-white/80">Статус контакта:</label>
                <select
                  value={presence}
                  onChange={(e) => setPresence(e.target.value as Presence)}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-white/90"
                >
                  <option value="online">онлайн</option>
                  <option value="away">AFK</option>
                  <option value="offline">не в сети</option>
                </select>

                <label className="flex items-center gap-2 ml-2">
                  <input type="checkbox" checked={remoteTyping} onChange={(e) => setRemoteTyping(e.target.checked)} />
                  <span>Печатает…</span>
                </label>
              </div>
            </div>

            <div className="sm:col-span-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10 text-white/80"
                onClick={simulateIncoming}
              >
                + Входящее сообщение
              </button>
              <button
                type="button"
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10 text-white/80"
                onClick={simulateMerge}
              >
                Симулировать mergeJournals
              </button>
              <button
                type="button"
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10 text-white/80"
                onClick={() => {
                  if (!ordered[0]) return;
                  applyReaction(ordered[0].id, "🔥", remoteActorId);
                }}
                title="Добавить реакцию от контакта на первое сообщение"
              >
                Реакция от контакта (🔥)
              </button>
              <button
                type="button"
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 hover:bg-red-500/15 text-red-200"
                onClick={resetChat}
                title="Удалит журнал текущего диалога из localStorage"
              >
                Сбросить журнал
              </button>
            </div>
          </div>
          <div className="mt-3 text-xs text-white/60">
            Эти переключатели имитируют сигналы TAL/crypto и сетевые события. В проде их не будет.
          </div>
          <div className="mt-1 text-[11px] text-white/50">deviceId: {deviceId}</div>
        </details>
      </div>
    </div>
  );
}
