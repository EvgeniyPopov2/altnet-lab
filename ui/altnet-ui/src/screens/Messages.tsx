import { useEffect, useMemo, useRef, useState } from "react";
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
import { appendMessage, createEmptyJournal, getOrderedMessages } from "../core/dm/journal";
import { clearDmJournal, loadDmJournal, saveDmJournal } from "../core/dm/storage";
import { fileToCid, shortCid } from "../core/content/cid";
import { getUrl, putFile } from "../core/content/blobStore";
import { getOrCreateDeviceId, nextDeviceSeq } from "../core/identity/device";

export type DmContact = {
  id: string;
  title: string;
  subtitle?: string;
  caps: ContactCapabilities;
};

function nowHHMM(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function fmtTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return nowHHMM();
  }
}

function fmtBytes(n: number): string {
  const v0 = Number(n);
  if (!Number.isFinite(v0) || v0 < 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = v0;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = i <= 1 ? 0 : 1;
  return `${v.toFixed(digits)} ${units[i]}`;
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

function seedJournal(dm: DmContact): DmJournalV1 {
  const base = createEmptyJournal(dm.id);
  const t0 = Date.now() - 1000 * 60 * 12;
  let j = base;
  j = appendMessage(j, {
    id: `seed:${dm.id}:1`,
    createdAt: t0,
    author: "them",
    text: "Привет. Тут будет CRDT-журнал (мок) + вложения CID (локально).",
  });
  j = appendMessage(j, {
    id: `seed:${dm.id}:2`,
    createdAt: t0 + 1000 * 60 * 2,
    author: "me",
    text: "Ок. Сейчас подключим локальный журнал (localStorage) и CID-вложения с превью (in-memory blob).",
  });
  return j;
}

function AttachmentRow({
  a,
  onRemove,
}: {
  a: DmAttachment;
  onRemove?: () => void;
}) {
  const url = getUrl(a.cid);
  const isImage = (a.mime || "").toLowerCase().startsWith("image/");

  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2">
      {isImage && url ? (
        <img
          src={url}
          alt={a.name}
          className="h-11 w-11 rounded-md object-cover border border-white/10"
        />
      ) : (
        <div className="h-11 w-11 rounded-md bg-white/10 border border-white/10 flex items-center justify-center text-base">
          📎
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="text-xs text-white/90 truncate" title={a.name}>
          {a.name}
        </div>
        <div className="text-[11px] text-white/60 flex flex-wrap gap-x-2">
          <span title={a.cid}>{shortCid(a.cid)}</span>
          <span>· {fmtBytes(a.size)}</span>
          {!url && <span className="text-amber-200/80">нет локального blob</span>}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {url ? (
          <a
            href={url}
            download={a.name}
            className="text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white/90"
            title="Скачать (локальный blob)"
          >
            Скачать
          </a>
        ) : (
          <button
            type="button"
            className="text-xs px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white/50 cursor-not-allowed"
            title="Blob не найден локально (в проде загрузим по CID)"
            disabled
          >
            CID
          </button>
        )}

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white/90"
            title="Убрать"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

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
  const [panic, setPanic] = usePanicMode();

  // Моки “готовности” (в реале придут из TAL/crypto)
  const [e2eReady, setE2eReady] = useState(true);
  const [anonPathReady, setAnonPathReady] = useState(true);
  const [hasTurnAllowList, setHasTurnAllowList] = useState(true);
  const [vv] = useVoiceVideoSettings(profile);

  const esm = useMemo(() => computeEsm(profile, dm.caps), [profile, dm.caps]);

  // Device identity (для id сообщений)
  const deviceId = useMemo(() => getOrCreateDeviceId(), []);

  const [journal, setJournal] = useState<DmJournalV1>(() => loadDmJournal(dm.id) ?? seedJournal(dm));

  // draft
  const [draft, setDraft] = useState("");
  const [draftAtts, setDraftAtts] = useState<DmAttachment[]>([]);
  const [addingFiles, setAddingFiles] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // MVP: при смене контакта — загружаем/инициализируем другой журнал
  useEffect(() => {
    const loaded = loadDmJournal(dm.id);
    const next = loaded ?? seedJournal(dm);
    setJournal(next);
    setDraft("");
    setDraftAtts([]);
  }, [dm.id]);

  // Persist текущего журнала (важно: используем journal.dmId)
  useEffect(() => {
    saveDmJournal(journal.dmId, journal);
  }, [journal]);

  const messages = useMemo(() => getOrderedMessages(journal), [journal]);

  // автоскролл
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  // Превью-проверка звонков (для UI состояния кнопок + popover "почему заблокировано")
  const voiceCallPreview = useMemo(() => {
    if (panic) {
      return {
        ok: false as const,
        code: "PANIC_MODE",
        title: "Паника включена",
        message: "Сетевые действия временно заблокированы (fail-closed).",
        details: [
          "Отключите \"Панику\", если вы уверены, что устройство не скомпрометировано.",
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
          "Отключите \"Панику\", если вы уверены, что устройство не скомпрометировано.",
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

  const canSend = draft.trim().length > 0 || draftAtts.length > 0;

  async function onPickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (panic) {
      denyByUi("Паника включена: добавление вложений заблокировано (fail-closed).");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setAddingFiles(true);
    try {
      const list = Array.from(files);
      const next: DmAttachment[] = [];

      for (const f of list) {
        const cid = await fileToCid(f);
        putFile(cid, f);
        next.push({
          cid,
          name: f.name,
          mime: f.type || "application/octet-stream",
          size: f.size,
        });
      }

      // dedupe по cid
      setDraftAtts((prev) => {
        const map = new Map<string, DmAttachment>();
        for (const a of prev) map.set(a.cid, a);
        for (const a of next) map.set(a.cid, a);
        return Array.from(map.values());
      });
    } finally {
      setAddingFiles(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onSend() {
    if (panic) {
      denyByUi("Паника включена: отправка заблокирована (fail-closed).");
      return;
    }

    const decision = checkSendMessage({
      localProfile: profile,
      contact: dm.caps,
      e2eReady,
      anonPathReady,
    });

    if (!decision.ok) {
      SecurityCoach.deniedByPolicy(decision);
      return;
    }

    const text = draft.trim();
    if (text.length === 0 && draftAtts.length === 0) return;

    const msg: DmMessage = {
      id: `${deviceId}:${nextDeviceSeq()}`,
      createdAt: Date.now(),
      author: "me",
      text,
      attachments: draftAtts.length ? draftAtts : undefined,
    };

    setJournal((prev) => appendMessage(prev, msg));
    setDraft("");
    setDraftAtts([]);
  }

  function onMockIncoming() {
    const msg: DmMessage = {
      id: `remote:${Date.now()}`,
      createdAt: Date.now(),
      author: "them",
      text: "(мок) Входящее сообщение. В проде сюда придёт CRDT-мерж + подпись.",
    };

    setJournal((prev) => appendMessage(prev, msg));
  }

  function onResetDialog() {
    clearDmJournal(dm.id);
    setJournal(seedJournal(dm));
    setDraft("");
    setDraftAtts([]);
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

  return (
    <div className="h-full min-h-0 flex flex-col gap-4">
      {/* Заголовок диалога */}
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-white/90 font-semibold">{dm.title}</div>
            {dm.subtitle && <div className="text-xs text-white/60">{dm.subtitle}</div>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {panicBadge}
            {e2eBadge}
            {sessionBadge}

            <div className="h-6 w-px bg-white/10 mx-1" />

            <GuardedActionButton
              icon="📞"
              title="Голосовой звонок"
              decision={voiceCallPreview}
              onAllowed={() => onCall("voice")}
            />
            <GuardedActionButton
              icon="🎥"
              title="Видео-звонок"
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
        </div>
      </div>

      {/* Лента сообщений (журнал) */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="space-y-3 text-sm">
          {messages.map((m) => {
            const isMe = m.author === "me";
            const who = isMe ? "Вы" : dm.title;
            const when = fmtTime(m.createdAt);
            return (
              <div key={m.id} className={["flex", isMe ? "justify-end" : "justify-start"].join(" ")}>
                <div
                  className={[
                    "max-w-[78%] rounded-2xl px-4 py-2 border",
                    isMe
                      ? "bg-indigo-600/20 border-indigo-400/20 text-white/90"
                      : "bg-white/5 border-white/10 text-white/90",
                  ].join(" ")}
                  title={m.id}
                >
                  <div className="text-[11px] text-white/50 mb-1">
                    {who} · {when}
                  </div>

                  {m.text && <div className="leading-relaxed whitespace-pre-wrap">{m.text}</div>}

                  {!!m.attachments?.length && (
                    <div className="mt-2 space-y-2">
                      {m.attachments.map((a) => (
                        <AttachmentRow key={`${a.cid}:${a.name}`} a={a} />
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
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={panic || addingFiles}
            className="h-[42px] w-[42px] rounded-xl bg-white/10 hover:bg-white/20 text-white/90 disabled:opacity-60 disabled:cursor-not-allowed"
            title="Прикрепить файл (CID)"
          >
            📎
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => void onPickFiles(e.target.files)}
          />

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Написать сообщение…"
            className="flex-1 resize-none rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/90 outline-none placeholder-white/40"
          />
          <button
            type="button"
            onClick={onSend}
            className="h-[42px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={!canSend || addingFiles}
            title={
              addingFiles
                ? "Файлы обрабатываются…"
                : !canSend
                  ? "Добавьте текст или вложения"
                  : "Отправить"
            }
          >
            {addingFiles ? "…" : "Отправить"}
          </button>
        </div>

        {draftAtts.length > 0 && (
          <div className="mt-2 space-y-2">
            {draftAtts.map((a) => (
              <AttachmentRow
                key={`${a.cid}:${a.name}`}
                a={a}
                onRemove={() => setDraftAtts((prev) => prev.filter((x) => x.cid !== a.cid))}
              />
            ))}
            <div className="text-xs text-white/50">
              Вложения в MVP — это <span className="text-white/70">(file → CID)</span>. Blob держим только в памяти для превью.
            </div>
          </div>
        )}
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
          <div className="sm:col-span-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-sm text-white/80">
              Видео в Anon:{" "}
              <span className="font-semibold text-white">{vv.allowVideoInAnon ? "разрешено" : "выключено"}</span>
            </div>
            <div className="mt-0.5 text-xs text-white/60">Меняется в «Голос и видео» (⚙️).</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onMockIncoming}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 text-sm"
          >
            Сымитировать входящее
          </button>
          <button
            type="button"
            onClick={onResetDialog}
            className="px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-sm"
          >
            Сбросить диалог (localStorage)
          </button>
          <div className="text-xs text-white/60 self-center">Сообщений: {messages.length} • deviceId: {deviceId}</div>
        </div>

        <div className="mt-3 text-xs text-white/60">
          Эти переключатели имитируют сигналы TAL/crypto. В проде их не будет.
        </div>
      </details>
    </div>
  );
}
