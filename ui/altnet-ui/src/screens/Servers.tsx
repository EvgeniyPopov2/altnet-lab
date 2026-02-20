import { useEffect, useMemo, useRef, useState } from "react";
import type { ContactCapabilities, PrivacyProfile } from "../core/policy/types";
import { computeEsm } from "../core/policy/esm";
import { checkSendMessage, checkStartCall } from "../core/policy/decisions";
import { computeRtcPolicy } from "../core/policy/rtc";
import { SecurityCoach } from "../core/security/coach";
import { usePanicMode } from "../core/security/usePanicMode";
import { useVoiceVideoSettings } from "../core/settings/voiceVideo";
import { GuardedActionButton } from "../components/policy/GuardedActionButton";
import type { CallWindowModel } from "../components/rtc/CallWindow";
import { fileToCid, shortCid } from "../core/content/cid";
import { getBlob, putFile } from "../core/content/blobStore";
import { cdrSanitizeUpload, CdrError } from "../core/security/cdr";
import { pushSecurityEvent } from "../core/security/bus";


export type ServerItem = {
  id: string;
  title: string;
  subtitle?: string;
};

type ChannelKind = "text" | "wiki" | "files" | "voice";

type Role = "guest" | "member" | "mod" | "admin" | "owner";

type Channel = {
  id: string;
  kind: ChannelKind;
  title: string;
  desc?: string;
  minRole?: Role;
};

type ServerAttachment = {
  cid: string;
  name: string;
  mime: string;
  size: number;
};

type ChatMsg = {
  id: string;
  from: "me" | "them" | "sys";
  who: string;
  time: string;
  text: string;
  attachments?: ServerAttachment[];
};

const ACCEPT_IMAGES = "image/png,image/jpeg,image/webp,image/gif";
const MAX_ATTACHMENTS_PER_MESSAGE = 4;
const MAX_SHELF_ITEMS = 200;




function nowHHMM(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function fmtBytes(n: number): string {
  if (!Number.isFinite(n)) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function isImageMime(mime: string): boolean {
  return /^image\//i.test(mime || "");
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // fail-silent
  }
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
  children: React.ReactNode;
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

const ROLE_LEVEL: Record<Role, number> = {
  guest: 0,
  member: 1,
  mod: 2,
  admin: 3,
  owner: 4,
};

function roleLabel(r: Role): string {
  switch (r) {
    case "guest":
      return "Гость";
    case "member":
      return "Участник";
    case "mod":
      return "Модератор";
    case "admin":
      return "Админ";
    case "owner":
      return "Владелец";
    default:
      return r;
  }
}

function kindIcon(k: ChannelKind): string {
  switch (k) {
    case "text":
      return "#";
    case "wiki":
      return "📚";
    case "files":
      return "🗂️";
    case "voice":
      return "🔊";
    default:
      return "•";
  }
}

function seedChannels(server: ServerItem): Channel[] {
  // MVP: фиксированные каналы, роли — моки
  if (server.id === "mid") {
    return [
      { id: "ann", kind: "text", title: "announcements", desc: "Новости и правила", minRole: "guest" },
      { id: "gen", kind: "text", title: "general", desc: "Общий чат", minRole: "member" },
      { id: "voice", kind: "voice", title: "voice", desc: "Голосовой (мок)", minRole: "member" },
    ];
  }

  return [
    { id: "ann", kind: "text", title: "announcements", desc: "Правила, новости", minRole: "guest" },
    { id: "gen", kind: "text", title: "general", desc: "Общий чат", minRole: "member" },
    { id: "ops", kind: "text", title: "ops", desc: "Только модераторы", minRole: "mod" },
    { id: "wiki", kind: "wiki", title: "wiki", desc: "CRDT-вики (позже)", minRole: "member" },
    { id: "files", kind: "files", title: "files", desc: "CID-полка (позже)", minRole: "member" },
    { id: "voice", kind: "voice", title: "voice", desc: "Голосовой (мок)", minRole: "member" },
  ];
}

function seedMessages(server: ServerItem, channels: Channel[]): Record<string, ChatMsg[]> {
  const base: Record<string, ChatMsg[]> = {};
  for (const ch of channels) {
    if (ch.kind !== "text") continue;

    base[ch.id] = [
      {
        id: `s_${server.id}_${ch.id}_1`,
        from: "sys",
        who: "Система",
        time: "12:00",
        text: `Добро пожаловать в ${server.title} → #${ch.title}. (MVP: моки)`,
      },
      {
        id: `s_${server.id}_${ch.id}_2`,
        from: "them",
        who: "Alice",
        time: "12:03",
        text: "Тут будут каналы/права/CRDT журналы. Сейчас — UI + политика (fail-closed).",
      },
      {
        id: `s_${server.id}_${ch.id}_3`,
        from: "me",
        who: "Вы",
        time: "12:06",
        text: "Ок. Дальше делаем серверные каналы и голос (моки).",
      },
    ];
  }
  return base;
}

function canAccess(role: Role, ch: Channel): boolean {
  const min = ch.minRole ?? "guest";
  return ROLE_LEVEL[role] >= ROLE_LEVEL[min];
}

type FileShelfItem = ServerAttachment & {
  pinned?: boolean;
  addedAt: number;
};

function shelfKey(serverId: string): string {
  return `altnet.server.shelf.v1:${serverId}`;
}

function loadShelf(serverId: string): FileShelfItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(shelfKey(serverId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .slice(0, MAX_SHELF_ITEMS)
      .map((x: any) => {
        const cid = typeof x?.cid === "string" ? x.cid : "";
        if (!cid) return null;
        return {
          cid,
          name: typeof x?.name === "string" ? x.name : "file",
          mime: typeof x?.mime === "string" ? x.mime : "application/octet-stream",
          size: typeof x?.size === "number" ? x.size : 0,
          pinned: !!x?.pinned,
          addedAt: typeof x?.addedAt === "number" ? x.addedAt : Date.now(),
        } as FileShelfItem;
      })
      .filter(Boolean) as FileShelfItem[];
  } catch {
    return [];
  }
}

function saveShelf(serverId: string, items: FileShelfItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(shelfKey(serverId), JSON.stringify(items));
  } catch {
    // ignore
  }
}

export default function Servers({
  profile,
  server,
  onStartCall,
  onOpenVoiceVideoSettings,
}: {
  profile: PrivacyProfile;
  server: ServerItem;
  onStartCall: (call: CallWindowModel) => void;
  onOpenVoiceVideoSettings?: () => void;
}) {
  const [panic, setPanic] = usePanicMode();

  // Моки “готовности” (в реале придут из TAL/crypto)
  const [e2eReady, setE2eReady] = useState(true);
  const [anonPathReady, setAnonPathReady] = useState(true);
  const [hasTurnAllowList, setHasTurnAllowList] = useState(true);
  const [vv] = useVoiceVideoSettings(profile);
  // Вложения в текстовый канал (CID, через CDR)
  const [pendingAttachments, setPendingAttachments] = useState<ServerAttachment[]>([]);
  const [attachBusy, setAttachBusy] = useState(false);
  const attachInputRef = useRef<HTMLInputElement | null>(null);

  // Файловая полка (CID) — сохраняем метаданные в localStorage (без blob).
  const [shelfItems, setShelfItems] = useState<FileShelfItem[]>(() => loadShelf(server.id));
  const [shelfBusy, setShelfBusy] = useState(false);
  const shelfInputRef = useRef<HTMLInputElement | null>(null);

  // Роль пользователя в этом сервере (мок)
  const [myRole, setMyRole] = useState<Role>("member");
  const [showLocked, setShowLocked] = useState(true);

  // Капабилити сервера (пока мок: в будущем это будет из профиля/ТАЛ/объявления сервера)
  const caps: ContactCapabilities = useMemo(() => {
    switch (server.id) {
      case "cheb":
        return { contactId: `sv:${server.id}`, supportsAnon: true, supportsFast: false };
      case "mid":
        return { contactId: `sv:${server.id}`, supportsAnon: false, supportsFast: true };
      default:
        return { contactId: `sv:${server.id}`, supportsAnon: true, supportsFast: true };
    }
  }, [server.id]);

  const esm = useMemo(() => computeEsm(profile, caps), [profile, caps]);

  const channels = useMemo(() => seedChannels(server), [server.id]);
  const [channelId, setChannelId] = useState<string>(() => channels[0]?.id ?? "gen");

  const selectedChannel = useMemo(() => {
    return channels.find((c) => c.id === channelId) ?? channels[0];
  }, [channels, channelId]);

  const [draft, setDraft] = useState("");

  const [messagesByCh, setMessagesByCh] = useState<Record<string, ChatMsg[]>>(() => seedMessages(server, channels));
  const endRef = useRef<HTMLDivElement | null>(null);

  // При смене сервера — сбросить состояние
  useEffect(() => {
    const chs = seedChannels(server);
    setChannelId(chs[0]?.id ?? "gen");
    setMessagesByCh(seedMessages(server, chs));
    setDraft("");
    setPendingAttachments([]);
    setAttachBusy(false);
    setShelfItems(loadShelf(server.id));
    setShelfBusy(false);
  }, [server.id]);


  // Автоскролл для текста
  useEffect(() => {
    if (!selectedChannel || selectedChannel.kind !== "text") return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [selectedChannel?.id, messagesByCh[selectedChannel?.id ?? ""]?.length]);

  // При смене канала — не таскать вложения между каналами
  useEffect(() => {
    setPendingAttachments([]);
    setAttachBusy(false);
    if (attachInputRef.current) attachInputRef.current.value = "";
  }, [selectedChannel?.id]);

  const e2eBadge = e2eReady ? (
    <Badge kind="ok" title="Сквозное шифрование установлено">
      🔒 E2E
    </Badge>
  ) : (
    <Badge kind="deny" title="Без E2E отправка/звонки запрещены (fail-closed)">
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

  const roleBadge = (
    <Badge kind="ok" title="Роль влияет на видимость каналов (мок)">
      👤 {roleLabel(myRole)}
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

  // Превью-проверка звонков в голосовом канале
  // (нужно для disabled-state кнопок + popover "почему заблокировано")
  const voiceCallPreview = useMemo(() => {
    const ch = selectedChannel;
    if (!ch || ch.kind !== "voice") {
      return {
        ok: false as const,
        code: "NO_CHANNEL",
        title: "Канал не выбран",
        message: "Выберите голосовой канал, чтобы начать звонок.",
      };
    }
    if (!canAccess(myRole, ch)) {
      return {
        ok: false as const,
        code: "NO_PERMISSION",
        title: "Нет доступа к каналу",
        message: `Нужна роль: ${roleLabel(ch.minRole ?? "guest")} (текущая: ${roleLabel(myRole)}).`,
        details: [
          "Попросите администратора повысить роль (мок).",
          "Либо выберите другой канал.",
        ],
      };
    }
    if (panic) {
      return {
        ok: false as const,
        code: "PANIC_MODE",
        title: "Действие заблокировано",
        message: "Паника включена: звонок заблокирован (fail-closed).",
        details: ["Выключите «Панику», чтобы продолжить."],
      };
    }
    return checkStartCall({
      kind: "voice",
      localProfile: profile,
      contact: caps,
      e2eReady,
      anonPathReady,
      hasTurnAllowList,
      allowVideoInAnon: vv.allowVideoInAnon,
    });
  }, [
    selectedChannel,
    myRole,
    panic,
    profile,
    caps,
    e2eReady,
    anonPathReady,
    hasTurnAllowList,
    vv.allowVideoInAnon,
  ]);

  const videoCallPreview = useMemo(() => {
    const ch = selectedChannel;
    if (!ch || ch.kind !== "voice") {
      return {
        ok: false as const,
        code: "NO_CHANNEL",
        title: "Канал не выбран",
        message: "Выберите голосовой канал, чтобы начать звонок.",
      };
    }
    if (!canAccess(myRole, ch)) {
      return {
        ok: false as const,
        code: "NO_PERMISSION",
        title: "Нет доступа к каналу",
        message: `Нужна роль: ${roleLabel(ch.minRole ?? "guest")} (текущая: ${roleLabel(myRole)}).`,

        details: [
          "Попросите администратора повысить роль (мок).",
          "Либо выберите другой канал.",
        ],
      };
    }
    if (panic) {
      return {
        ok: false as const,
        code: "PANIC_MODE",
        title: "Действие заблокировано",
        message: "Паника включена: звонок заблокирован (fail-closed).",
        details: ["Выключите «Панику», чтобы продолжить."],
      };
    }
    return checkStartCall({
      kind: "video",
      localProfile: profile,
      contact: caps,
      e2eReady,
      anonPathReady,
      hasTurnAllowList,
      allowVideoInAnon: vv.allowVideoInAnon,
    });
  }, [
    selectedChannel,
    myRole,
    panic,
    profile,
    caps,
    e2eReady,
    anonPathReady,
    hasTurnAllowList,
    vv.allowVideoInAnon,
  ]);

  function denyByUi(reason: string) {
    SecurityCoach.deniedByPolicy({
      ok: false,
      code: "PANIC_MODE",
      title: "Действие заблокировано",
      message: reason,
      details: ["Выключите «Панику», чтобы продолжить."],
    });
  }

  function denyNoAccess(ch: Channel) {
    const min = ch.minRole ?? "guest";
    SecurityCoach.deniedByPolicy({
      ok: false,
      code: "NO_PERMISSION",
      title: "Нет доступа к каналу",
      message: `Канал «${ch.title}» доступен только для роли: ${roleLabel(min)} (и выше).`,
      details: ["В MVP роли — моки. Позже тут будут реальные права сервера."],
    });
  }

  function onSelectChannel(ch: Channel) {
    if (!canAccess(myRole, ch)) {
      denyNoAccess(ch);
      return;
    }
    setChannelId(ch.id);
  }

  function commitShelf(next: FileShelfItem[]) {
    setShelfItems(next);
    saveShelf(server.id, next);
  }

  async function addMessageAttachments(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!selectedChannel || selectedChannel.kind !== "text") return;

    if (!canAccess(myRole, selectedChannel)) {
      denyNoAccess(selectedChannel);
      return;
    }

    if (panic) {
      denyByUi("Паника включена: прикрепление файлов заблокировано (fail-closed).");
      return;
    }

    const decision = checkSendMessage({
      localProfile: profile,
      contact: caps,
      e2eReady,
      anonPathReady,
    });

    if (!decision.ok) {
      SecurityCoach.deniedByPolicy(decision);
      return;
    }

    const existing = pendingAttachments.length;
    if (existing >= MAX_ATTACHMENTS_PER_MESSAGE) {
      pushSecurityEvent({
        severity: "warning",
        code: "ATTACH_LIMIT",
        title: "Лимит вложений",
        message: `В одном сообщении можно прикрепить до ${MAX_ATTACHMENTS_PER_MESSAGE} файлов.`,
        ttlMs: 8000,
      });
      return;
    }

    setAttachBusy(true);
    try {
      const next: ServerAttachment[] = [];
      for (const file of Array.from(files)) {
        if (existing + next.length >= MAX_ATTACHMENTS_PER_MESSAGE) break;

        try {
          const res = await cdrSanitizeUpload(file);
          const cleaned = res.file;
          const cid = await fileToCid(cleaned);
          putFile(cid, cleaned);

          next.push({
            cid,
            name: cleaned.name,
            mime: cleaned.type || file.type || "application/octet-stream",
            size: cleaned.size,
          });
        } catch (e) {
          const reason =
            e instanceof CdrError ? e.message : "Файл заблокирован политикой безопасности.";
          pushSecurityEvent({
            severity: "warning",
            code: "CDR_BLOCKED",
            title: "Вложение заблокировано",
            message: `${file.name}: ${reason}`,
            details: [
              "MVP: разрешаем только изображения (PNG/JPEG/WEBP/GIF) и пересохраняем их (CDR).",
              "Остальные типы блокируются (fail-closed).",
            ],
            ttlMs: 12000,
          });
        }
      }

      if (next.length > 0) {
        setPendingAttachments((prev) => {
          const merged = [...prev];
          for (const a of next) {
            if (!merged.some((x) => x.cid === a.cid)) merged.push(a);
          }
          return merged.slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
        });
      }
    } finally {
      setAttachBusy(false);
      if (attachInputRef.current) attachInputRef.current.value = "";
    }
  }

  async function addShelfFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!selectedChannel || selectedChannel.kind !== "files") return;

    if (!canAccess(myRole, selectedChannel)) {
      denyNoAccess(selectedChannel);
      return;
    }

    if (panic) {
      denyByUi("Паника включена: загрузка файлов заблокирована (fail-closed).");
      return;
    }

    const decision = checkSendMessage({
      localProfile: profile,
      contact: caps,
      e2eReady,
      anonPathReady,
    });

    if (!decision.ok) {
      SecurityCoach.deniedByPolicy(decision);
      return;
    }

    if (shelfItems.length >= MAX_SHELF_ITEMS) {
      pushSecurityEvent({
        severity: "warning",
        code: "SHELF_LIMIT",
        title: "Лимит файловой полки",
        message: `Лимит: до ${MAX_SHELF_ITEMS} файлов в полке (MVP).`,
        ttlMs: 9000,
      });
      return;
    }

    setShelfBusy(true);
    try {
      const added: FileShelfItem[] = [];
      for (const file of Array.from(files)) {
        if (shelfItems.length + added.length >= MAX_SHELF_ITEMS) break;

        try {
          const res = await cdrSanitizeUpload(file);
          const cleaned = res.file;
          const cid = await fileToCid(cleaned);
          putFile(cid, cleaned);

          added.push({
            cid,
            name: cleaned.name,
            mime: cleaned.type || file.type || "application/octet-stream",
            size: cleaned.size,
            pinned: false,
            addedAt: Date.now(),
          });
        } catch (e) {
          const reason =
            e instanceof CdrError ? e.message : "Файл заблокирован политикой безопасности.";
          pushSecurityEvent({
            severity: "warning",
            code: "CDR_BLOCKED",
            title: "Файл заблокирован",
            message: `${file.name}: ${reason}`,
            details: [
              "MVP: разрешаем только изображения (PNG/JPEG/WEBP/GIF) и пересохраняем их (CDR).",
              "Остальные типы блокируются (fail-closed).",
            ],
            ttlMs: 12000,
          });
        }
      }

      if (added.length > 0) {
        commitShelf(
          [...shelfItems, ...added]
            .reduce((acc: FileShelfItem[], item) => {
              if (!acc.some((x) => x.cid === item.cid)) acc.push(item);
              return acc;
            }, [])
            .slice(0, MAX_SHELF_ITEMS)
        );
      }
    } finally {
      setShelfBusy(false);
      if (shelfInputRef.current) shelfInputRef.current.value = "";
    }
  }

  function togglePin(cid: string) {
    commitShelf(shelfItems.map((i) => (i.cid === cid ? { ...i, pinned: !i.pinned } : i)));
  }

  function removeFromShelf(cid: string) {
    const it = shelfItems.find((x) => x.cid === cid);
    if (it?.pinned) {
      pushSecurityEvent({
        severity: "warning",
        code: "PINNED_IMMUTABLE",
        title: "Пин защищает файл",
        message: "Снимите «пин», чтобы удалить файл из полки.",
        ttlMs: 9000,
      });
      return;
    }
    commitShelf(shelfItems.filter((x) => x.cid !== cid));
  }

  function clearShelf() {
    const pinned = shelfItems.filter((x) => x.pinned);
    if (pinned.length > 0) {
      pushSecurityEvent({
        severity: "warning",
        code: "PINNED_IMMUTABLE",
        title: "Нельзя очистить полку",
        message: "В полке есть закреплённые (pinned) файлы. Снимите пины и повторите.",
        ttlMs: 10000,
      });
      return;
    }
    commitShelf([]);
  }


  function onSend() {
    if (!selectedChannel || selectedChannel.kind !== "text") return;

    if (!canAccess(myRole, selectedChannel)) {
      denyNoAccess(selectedChannel);
      return;
    }

    if (panic) {
      denyByUi("Паника включена: отправка заблокирована (fail-closed).");
      return;
    }

    const decision = checkSendMessage({
      localProfile: profile,
      contact: caps,
      e2eReady,
      anonPathReady,
    });

    if (!decision.ok) {
      SecurityCoach.deniedByPolicy(decision);
      return;
    }

    const text = draft.trim();
    if (text.length === 0 && pendingAttachments.length === 0) return;

    setMessagesByCh((prev) => {
      const curr = prev[selectedChannel.id] ?? [];
      const msg: ChatMsg = {
        id: `m-${Date.now()}`,
        from: "me",
        who: "Вы",
        time: nowHHMM(),
        text,
        attachments: pendingAttachments.length ? pendingAttachments : undefined,
      };
      return { ...prev, [selectedChannel.id]: [...curr, msg] };
    });

    setDraft("");
    setPendingAttachments([]);
  }


  function onCall(kind: "voice" | "video") {
    if (!selectedChannel || selectedChannel.kind !== "voice") return;

    if (!canAccess(myRole, selectedChannel)) {
      denyNoAccess(selectedChannel);
      return;
    }

    if (panic) {
      denyByUi("Паника включена: звонки заблокированы (fail-closed).");
      return;
    }

    const decision = checkStartCall({
      kind,
      localProfile: profile,
      contact: caps,
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
      title: `${server.title} · ${selectedChannel.title}`,
      policy: {
        esm: decision.esm,
        rtc: decision.rtc ?? computeRtcPolicy(decision.esm),
      },
      participants: [
        { id: "me", name: "Вы", label: roleLabel(myRole), muted: false },
        { id: `sv:${server.id}:alice`, name: "Алиса", label: "участник", muted: false },
        { id: `sv:${server.id}:boris`, name: "Борис", label: "участник", muted: true },
        { id: `sv:${server.id}:mod`, name: "Модератор", label: "модератор", muted: false },
      ],
    });
  }

  const visibleChannels = useMemo(() => {
    return showLocked ? channels : channels.filter((c) => canAccess(myRole, c));
  }, [channels, showLocked, myRole]);

  const textMsgs = selectedChannel?.kind === "text" ? messagesByCh[selectedChannel.id] ?? [] : [];

  return (
    <div className="h-full min-h-0 flex flex-col gap-4">
      {/* Заголовок сервера */}
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-white/90 font-semibold">{server.title}</div>
            {server.subtitle && <div className="text-xs text-white/60">{server.subtitle}</div>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {panicBadge}
            {e2eBadge}
            {sessionBadge}
            {roleBadge}
          </div>
        </div>
      </div>

      {/* Две колонки: каналы / контент */}
      <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">
        <aside className="w-[260px] shrink-0 rounded-2xl border border-white/10 bg-white/5 flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-white/10">
            <div className="text-sm font-semibold text-white/90">Каналы</div>
            <div className="text-xs text-white/60 mt-0.5">Видимость зависит от роли (мок)</div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
            {visibleChannels.map((ch) => {
              const allowed = canAccess(myRole, ch);
              const active = selectedChannel?.id === ch.id;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => onSelectChannel(ch)}
                  className={[
                    "w-full text-left rounded-xl px-3 py-2 border transition",
                    active ? "bg-indigo-600/20 border-indigo-400/20" : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/10",
                    allowed ? "text-white/90" : "text-white/40 opacity-70",
                  ].join(" ")}
                  title={allowed ? ch.desc : `Нет доступа (нужна роль: ${roleLabel(ch.minRole ?? "guest")})`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">
                        <span className="text-white/60 mr-2">{kindIcon(ch.kind)}</span>
                        {ch.title}
                      </div>
                      {ch.desc && <div className="text-xs text-white/50 truncate mt-0.5">{ch.desc}</div>}
                    </div>
                    {!allowed && <div className="text-xs">🔒</div>}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="px-4 py-3 border-t border-white/10">
            <div className="text-xs text-white/60">Вы: {roleLabel(myRole)}</div>
          </div>
        </aside>

        <section className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
          {/* Заголовок канала */}
          {selectedChannel && (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-white/90 font-semibold truncate">
                    {kindIcon(selectedChannel.kind)} {selectedChannel.kind === "text" ? "#" : ""}{selectedChannel.title}
                  </div>
                  {selectedChannel.desc && <div className="text-xs text-white/60 truncate">{selectedChannel.desc}</div>}
                </div>

                {selectedChannel.kind === "voice" && (
                  <div className="flex items-center gap-2">
                    <GuardedActionButton
                      icon="📞"
                      title="Голосовой звонок (групповой)"
                      decision={voiceCallPreview}
                      onAllowed={() => onCall("voice")}

                    />
                    <GuardedActionButton
                      icon="🎥"
                      title="Видео (групповой)"
                      decision={videoCallPreview}
                      onAllowed={() => onCall("video")}

                    />
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
                )}
              </div>
            </div>
          )}

          {/* Контент */}
          {selectedChannel?.kind === "text" && (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="space-y-3 text-sm">
                  {textMsgs.map((m) => {
                    const align = m.from === "me" ? "justify-end" : "justify-start";
                    const bubbleClass =
                      m.from === "me"
                        ? "bg-indigo-600/20 border-indigo-400/20 text-white/90"
                        : m.from === "sys"
                          ? "bg-white/10 border-white/10 text-white/80"
                          : "bg-white/5 border-white/10 text-white/90";

                    return (
                      <div key={m.id} className={["flex", align].join(" ")}>
                        <div className={["max-w-[78%] rounded-2xl px-4 py-2 border", bubbleClass].join(" ")}>
                          <div className="text-[11px] text-white/50 mb-1">
                            {m.who} · {m.time}
                          </div>
                          {m.text?.trim().length > 0 && (
                            <div className="leading-relaxed whitespace-pre-wrap">{m.text}</div>
                          )}

                          {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                            <div className="mt-2 grid gap-2">
                              {m.attachments.map((a) => {
                                const blob = getBlob(a.cid);
                                const img = isImageMime(a.mime);

                                return (
                                  <div key={a.cid} className="rounded-xl border border-white/10 bg-white/5 p-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="text-xs text-white/80 truncate">{a.name}</div>
                                        <div className="text-[11px] text-white/50 truncate">
                                          {shortCid(a.cid)} · {fmtBytes(a.size)}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => void copyText(a.cid)}
                                          className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] text-white/80"
                                          title="Скопировать CID"
                                        >
                                          CID
                                        </button>

                                        {blob?.url && (
                                          <a
                                            href={blob.url}
                                            download={a.name}
                                            className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] text-white/80"
                                            title="Скачать"
                                          >
                                            ⬇
                                          </a>
                                        )}
                                      </div>
                                    </div>

                                    {img && blob?.url && (
                                      <a
                                        href={blob.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block mt-2 overflow-hidden rounded-lg border border-white/10"
                                      >
                                        <img src={blob.url} alt={a.name} className="max-h-56 w-auto" />
                                      </a>
                                    )}

                                    {img && !blob?.url && (
                                      <div className="mt-2 text-[11px] text-white/50">
                                        Превью недоступно (blob в памяти отсутствует). Переприкрепите файл.
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
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

              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <input
                  ref={attachInputRef}
                  type="file"
                  multiple
                  accept={ACCEPT_IMAGES}
                  className="hidden"
                  onChange={(e) => void addMessageAttachments(e.target.files)}
                />

                {pendingAttachments.length > 0 && (
                  <div className="mb-2 grid gap-2">
                    {pendingAttachments.map((a) => (
                      <div
                        key={a.cid}
                        className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs text-white/80 truncate">{a.name}</div>
                          <div className="text-[11px] text-white/50 truncate">
                            {shortCid(a.cid)} · {fmtBytes(a.size)}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => void copyText(a.cid)}
                            className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] text-white/80"
                            title="Скопировать CID"
                          >
                            CID
                          </button>

                          <button
                            type="button"
                            onClick={() => setPendingAttachments((prev) => prev.filter((x) => x.cid !== a.cid))}
                            className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] text-white/80"
                            title="Убрать вложение"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => attachInputRef.current?.click()}
                    className="h-[42px] w-[42px] shrink-0 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white/80 hover:bg-white/20 disabled:opacity-60"
                    disabled={attachBusy}
                    title="Прикрепить изображение (CDR, метаданные удаляются)"
                  >
                    📎
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
                    className="h-[42px] shrink-0 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-60"
                    disabled={(draft.trim().length === 0 && pendingAttachments.length === 0) || attachBusy}
                    title="Отправить"
                  >
                    Отправить
                  </button>
                </div>
              </div>

            </>
          )}

          {selectedChannel?.kind === "voice" && (
            <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80">
              <div className="text-sm">
                Это голосовой канал. В MVP мы показываем UI-заглушку и проверяем политику (fail-closed).
              </div>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                <div className="font-semibold text-white/80">Текущая сессия</div>
                <div className="mt-1">{esm.reason}</div>
                <div className="mt-2 text-xs text-white/60">
                  Кнопки 📞/🎥 сверху откроют оверлей звонка (мок) или покажут подсказку безопасности.
                </div>
              </div>
            </div>
          )}

          {selectedChannel?.kind === "wiki" && (
            <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80">
              <div className="text-sm font-semibold text-white/90">Вики (CRDT) — позже</div>
              <div className="mt-2 text-sm text-white/70">
                Здесь будет совместное редактирование (CRDT), права на страницы и история изменений.
              </div>
            </div>
          )}

          {selectedChannel?.kind === "files" && (
            <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80">
              <input
                ref={shelfInputRef}
                type="file"
                multiple
                accept={ACCEPT_IMAGES}
                className="hidden"
                onChange={(e) => void addShelfFiles(e.target.files)}
              />

              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white/90">Файловая полка (CID) — MVP</div>
                  <div className="mt-2 text-sm text-white/70">
                    Загрузка → CDR (удаляем метаданные) → CID от очищенного файла. Неподдерживаемые форматы блокируются
                    (fail-closed).
                  </div>
                  <div className="mt-2 text-xs text-white/60">
                    Превью держим только в памяти (blob store). После перезагрузки страницы останутся CID и метаданные.
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => shelfInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-60"
                    disabled={shelfBusy}
                    title="Загрузить изображения"
                  >
                    + Загрузить
                  </button>
                  <button
                    type="button"
                    onClick={clearShelf}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 text-sm disabled:opacity-60"
                    disabled={shelfItems.length === 0}
                    title="Очистить полку (кроме pinned)"
                  >
                    Очистить
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {shelfItems.length === 0 ? (
                  <div className="text-sm text-white/60">Пока пусто. Нажмите «Загрузить».</div>
                ) : (
                  shelfItems
                    .slice()
                    .sort((a, b) => b.addedAt - a.addedAt)
                    .map((it) => {
                      const blob = getBlob(it.cid);
                      const img = isImageMime(it.mime);

                      return (
                        <div
                          key={it.cid}
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 flex items-start justify-between gap-3"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            {img && blob?.url ? (
                              <img
                                src={blob.url}
                                alt={it.name}
                                className="h-12 w-12 object-cover rounded-lg border border-white/10"
                              />
                            ) : (
                              <div className="h-12 w-12 rounded-lg border border-white/10 bg-white/10 flex items-center justify-center text-white/70">
                                📎
                              </div>
                            )}

                            <div className="min-w-0">
                              <div className="text-sm text-white/90 truncate">{it.name}</div>
                              <div className="text-xs text-white/60 truncate">
                                {shortCid(it.cid)} · {fmtBytes(it.size)}{it.pinned ? " · 📌 pinned" : ""}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => void copyText(it.cid)}
                              className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white/80"
                              title="Скопировать CID"
                            >
                              CID
                            </button>

                            {blob?.url && (
                              <a
                                href={blob.url}
                                download={it.name}
                                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white/80"
                                title="Скачать"
                              >
                                ⬇
                              </a>
                            )}

                            <button
                              type="button"
                              onClick={() => togglePin(it.cid)}
                              className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white/80"
                              title={it.pinned ? "Снять пин" : "Закрепить (pin)"}
                            >
                              {it.pinned ? "📌" : "📍"}
                            </button>

                            <button
                              type="button"
                              onClick={() => removeFromShelf(it.cid)}
                              className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white/80"
                              title={it.pinned ? "Pinned: сначала снимите пин" : "Удалить"}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          )}

        </section>
      </div>

      {/* Моки-переключатели для проверки политики */}
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
          <div className="sm:col-span-2 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-sm text-white/80">
              Видео в Anon: <span className="font-semibold text-white">{vv.allowVideoInAnon ? "разрешено" : "выключено"}</span>
            </div>
            <button
              type="button"
              onClick={() => onOpenVoiceVideoSettings?.()}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 text-sm"
              disabled={!onOpenVoiceVideoSettings}
              title="Открыть настройки микрофона/видео"
            >
              ⚙️ Голос и видео
            </button>
          </div>

          <label className="flex items-center gap-2">
            <span className="text-white/70">Моя роль:</span>
            <select
              value={myRole}
              onChange={(e) => setMyRole(e.target.value as Role)}
              className="rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-sm"
            >
              <option value="guest">Гость</option>
              <option value="member">Участник</option>
              <option value="mod">Модератор</option>
              <option value="admin">Админ</option>
              <option value="owner">Владелец</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showLocked} onChange={(e) => setShowLocked(e.target.checked)} />
            <span>Показывать закрытые каналы</span>
          </label>
        </div>
        <div className="mt-3 text-xs text-white/60">
          Эти переключатели имитируют сигналы TAL/crypto и права. В проде их не будет.
        </div>
      </details>
    </div>
  );
}
