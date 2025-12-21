import { useEffect, useMemo, useRef, useState } from "react";
import type { ContactCapabilities, PrivacyProfile } from "../core/policy/types";
import { computeEsm } from "../core/policy/esm";
import { checkSendMessage, checkStartCall } from "../core/policy/decisions";
import { SecurityCoach } from "../core/security/coach";
import { usePanicMode } from "../core/security/usePanicMode";
import type { CallWindowModel } from "../components/rtc/CallWindow";

export type DmContact = {
  id: string;
  title: string;
  subtitle?: string;
  caps: ContactCapabilities;
};

type ChatMsg = {
  id: string;
  from: "me" | "them";
  who: string;
  time: string;
  text: string;
};

function seedMessages(dm: DmContact): ChatMsg[] {
  return [
    {
      id: "m1",
      from: "them",
      who: dm.title,
      time: "12:04",
      text: "Привет. Тут будет CRDT-журнал (мок) + вложения CID.",
    },
    {
      id: "m2",
      from: "me",
      who: "Вы",
      time: "12:06",
      text: "Ок. Сейчас делаем политику + UX подсказки (Security Coach).",
    },
  ];
}

function nowHHMM(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
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

export default function Messages({
  profile,
  dm,
  onStartCall,
}: {
  profile: PrivacyProfile;
  dm: DmContact;
  onStartCall: (call: CallWindowModel) => void;
}) {
  const [panic, setPanic] = usePanicMode();

  // Моки “готовности” (в реале придут из TAL/crypto)
  const [e2eReady, setE2eReady] = useState(true);
  const [anonPathReady, setAnonPathReady] = useState(true);
  const [hasTurnAllowList, setHasTurnAllowList] = useState(true);
  const [allowVideoInAnon, setAllowVideoInAnon] = useState(false);

  const esm = useMemo(() => computeEsm(profile, dm.caps), [profile, dm.caps]);

  const [draft, setDraft] = useState("");

  // MVP мок-история + автоскролл
  const [messages, setMessages] = useState<ChatMsg[]>(() => seedMessages(dm));
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // При смене чата — сбрасываем мок-историю, чтобы не смешивать контексты
    setMessages(seedMessages(dm));
    setDraft("");
  }, [dm.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

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
    if (text.length === 0) return;

    // MVP мок: добавляем сообщение в локальную ленту
    setMessages((prev) => [
      ...prev,
      {
        id: `m_${Date.now()}`,
        from: "me",
        who: "Вы",
        time: nowHHMM(),
        text,
      },
    ]);
    setDraft("");
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
      allowVideoInAnon,
    });

    if (!decision.ok) {
      SecurityCoach.deniedByPolicy(decision);
      return;
    }

    const esmText = `${decision.esm.family.toUpperCase()}${decision.esm.compat ? " (compat)" : ""}`;
    const rtcText = decision.rtc?.note ?? "RTC: —";

    onStartCall({
      kind,
      title: dm.title,
      esmText,
      rtcText,
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

            <button
              type="button"
              onClick={() => onCall("voice")}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
              title="Голосовой звонок"
            >
              📞
            </button>
            <button
              type="button"
              onClick={() => onCall("video")}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
              title="Видео-звонок"
            >
              🎥
            </button>
          </div>
        </div>
      </div>

      {/* Лента сообщений (мок) */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="space-y-3 text-sm">
          {messages.map((m) => (
            <div key={m.id} className={["flex", m.from === "me" ? "justify-end" : "justify-start"].join(" ")}>
              <div
                className={[
                  "max-w-[78%] rounded-2xl px-4 py-2 border",
                  m.from === "me"
                    ? "bg-indigo-600/20 border-indigo-400/20 text-white/90"
                    : "bg-white/5 border-white/10 text-white/90",
                ].join(" ")}
              >
                <div className="text-[11px] text-white/50 mb-1">
                  {m.who} · {m.time}
                </div>
                <div className="leading-relaxed whitespace-pre-wrap">{m.text}</div>
              </div>
            </div>
          ))}

          <div className="text-xs text-white/50 pt-2">
            Примечание: без E2E контекста отправка обязана быть заблокирована (fail-closed).
          </div>

          <div ref={endRef} />
        </div>
      </div>

      {/* Ввод */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-end gap-2">
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
            className="h-[42px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-60"
            disabled={draft.trim().length === 0}
            title="Отправить"
          >
            Отправить
          </button>
        </div>
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
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={allowVideoInAnon} onChange={(e) => setAllowVideoInAnon(e.target.checked)} />
            <span>Разрешить видео в Anon</span>
          </label>
        </div>
        <div className="mt-3 text-xs text-white/60">Эти переключатели имитируют сигналы TAL/crypto. В проде их не будет.</div>
      </details>
    </div>
  );
}
