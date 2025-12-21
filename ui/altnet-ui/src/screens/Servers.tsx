import { useEffect, useMemo, useRef, useState } from "react";
import type { ContactCapabilities, PrivacyProfile } from "../core/policy/types";
import { computeEsm } from "../core/policy/esm";
import { checkSendMessage, checkStartCall } from "../core/policy/decisions";
import { SecurityCoach } from "../core/security/coach";
import { usePanicMode } from "../core/security/usePanicMode";

export type ServerItem = {
  id: string;
  title: string;
  subtitle?: string;
};

type ChannelKind = "text" | "voice" | "stage";

type Channel = {
  id: string;
  kind: ChannelKind;
  title: string;
  hint?: string;
};

type CallOverlay = {
  kind: "voice" | "video";
  serverTitle: string;
  channelTitle: string;
  esmText: string;
  rtcText: string;
};

type ChatMsg = {
  id: string;
  from: "me" | "them";
  who: string;
  time: string;
  text: string;
};

function nowHHMM(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function seedChannelMessages(server: ServerItem, ch: Channel): ChatMsg[] {
  if (ch.kind !== "text") return [];

  const sys = (text: string): ChatMsg => ({
    id: `sys_${server.id}_${ch.id}_${text}`,
    from: "them",
    who: "Система",
    time: "—",
    text,
  });

  return [
    sys(`Добро пожаловать в ${server.title} → #${ch.title}.`),
    {
      id: `m_${server.id}_${ch.id}_1`,
      from: "them",
      who: "Модератор",
      time: "11:57",
      text: "Тут будет CRDT-журнал каналов + роли/права (моки).",
    },
    {
      id: `m_${server.id}_${ch.id}_2`,
      from: "me",
      who: "Вы",
      time: "11:59",
      text: "Ок. Сейчас делаем каналы + политику для групповых звонков (fail-closed).",
    },
  ];
}

function channelGroups(server: ServerItem): {
  text: Channel[];
  voice: Channel[];
  stage: Channel[];
} {
  // MVP мок: набор каналов зависит от сервера, но пока статический.
  // Позже придёт из CRDT-метаданных сервера.
  const text: Channel[] = [
    { id: "t_general", kind: "text", title: "общий", hint: "объявления и чат" },
    { id: "t_dev", kind: "text", title: "разработка", hint: "вопросы/идеи" },
    { id: "t_wiki", kind: "text", title: "вики", hint: "страницы/правки" },
  ];

  const voice: Channel[] = [
    { id: "v_lobby", kind: "voice", title: "Лобби", hint: "голос" },
    { id: "v_raid", kind: "voice", title: "Рейд", hint: "голос" },
  ];

  const stage: Channel[] = [{ id: "s_stage", kind: "stage", title: "Сцена", hint: "видео/стрим" }];

  // Можно слегка варьировать подсказки по server.id
  if (server.id === "mid") {
    stage[0] = { ...stage[0], title: "Showcase", hint: "видео/демо" };
  }

  return { text, voice, stage };
}

function serverCaps(server: ServerItem): ContactCapabilities {
  // MVP мок: у разных серверов разная “доступность путей”.
  // В будущем это будет: (onion addr?, i2p?, ygg?, wg?)
  switch (server.id) {
    case "wt":
      return { contactId: `server:${server.id}`, supportsAnon: false, supportsFast: true };
    case "cheb":
      return { contactId: `server:${server.id}`, supportsAnon: true, supportsFast: true };
    case "altdev":
      return { contactId: `server:${server.id}`, supportsAnon: true, supportsFast: true };
    case "mid":
      return { contactId: `server:${server.id}`, supportsAnon: false, supportsFast: true };
    default:
      return { contactId: `server:${server.id}`, supportsAnon: true, supportsFast: true };
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
      className={["inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs", badgeClass(kind)].join(" ")}
    >
      {children}
    </span>
  );
}

export default function Servers({ profile, server }: { profile: PrivacyProfile; server: ServerItem }) {
  const [panic, setPanic] = usePanicMode();

  // Моки “готовности” (в реале придут из TAL/crypto)
  const [e2eReady, setE2eReady] = useState(true);
  const [anonPathReady, setAnonPathReady] = useState(true);
  const [hasTurnAllowList, setHasTurnAllowList] = useState(true);
  const [allowVideoInAnon, setAllowVideoInAnon] = useState(false);

  const caps = useMemo(() => serverCaps(server), [server.id]);
  const esm = useMemo(() => computeEsm(profile, caps), [profile, caps]);

  const groups = useMemo(() => channelGroups(server), [server.id]);
  const allChannels = useMemo(() => [...groups.text, ...groups.voice, ...groups.stage], [groups]);

  const [selectedChannelId, setSelectedChannelId] = useState<string>(() => groups.text[0]?.id ?? "");
  const selectedChannel = useMemo(
    () => allChannels.find((c) => c.id === selectedChannelId) ?? allChannels[0],
    [allChannels, selectedChannelId]
  );

  // Сообщения по текст-каналам
  const [messagesByChannel, setMessagesByChannel] = useState<Record<string, ChatMsg[]>>(() => {
    const init: Record<string, ChatMsg[]> = {};
    for (const ch of groups.text) init[ch.id] = seedChannelMessages(server, ch);
    return init;
  });
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  const [overlay, setOverlay] = useState<CallOverlay | null>(null);

  // При смене сервера — сбрасываем каналы/историю (пока мок)
  useEffect(() => {
    const init: Record<string, ChatMsg[]> = {};
    const newGroups = channelGroups(server);
    for (const ch of newGroups.text) init[ch.id] = seedChannelMessages(server, ch);
    setMessagesByChannel(init);
    setSelectedChannelId(newGroups.text[0]?.id ?? newGroups.voice[0]?.id ?? "");
    setDraft("");
    setOverlay(null);
  }, [server.id]);

  const selectedMsgs = selectedChannel?.kind === "text" ? messagesByChannel[selectedChannel.id] ?? [] : [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [selectedChannelId, selectedMsgs.length]);

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
    if (!selectedChannel || selectedChannel.kind !== "text") return;

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
    if (text.length === 0) return;

    setMessagesByChannel((prev) => ({
      ...prev,
      [selectedChannel.id]: [
        ...(prev[selectedChannel.id] ?? []),
        { id: `m_${Date.now()}`, from: "me", who: "Вы", time: nowHHMM(), text },
      ],
    }));
    setDraft("");
  }

  function onJoin(kind: "voice" | "video") {
    if (!selectedChannel) return;

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
      allowVideoInAnon,
    });

    if (!decision.ok) {
      SecurityCoach.deniedByPolicy(decision);
      return;
    }

    const esmText = `${decision.esm.family.toUpperCase()}${decision.esm.compat ? " (compat)" : ""}`;
    const rtcText = decision.rtc?.note ?? "RTC: —";

    setOverlay({
      kind,
      serverTitle: server.title,
      channelTitle: selectedChannel.title,
      esmText,
      rtcText,
    });
  }

  const ChannelBtn = ({ ch }: { ch: Channel }) => {
    const active = ch.id === selectedChannelId;
    const icon = ch.kind === "text" ? "#" : ch.kind === "voice" ? "🔊" : "🎥";

    return (
      <button
        type="button"
        onClick={() => setSelectedChannelId(ch.id)}
        className={["w-full text-left rounded-xl px-3 py-2 transition", active ? "bg-white/15" : "bg-white/5 hover:bg-white/10"].join(" ")}
        title={ch.hint}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm text-white/90 truncate">
              <span className="text-white/60 mr-1">{icon}</span>
              {ch.title}
            </div>
            {ch.hint && <div className="text-xs text-white/50 truncate">{ch.hint}</div>}
          </div>
          {active && <div className="text-xs text-white/50">●</div>}
        </div>
      </button>
    );
  };

  return (
    <div className="h-full min-h-0 flex gap-4">
      {/* Каналы */}
      <aside className="w-[280px] shrink-0 rounded-2xl border border-white/10 bg-white/5 p-3 overflow-y-auto">
        <div className="text-xs text-white/60 px-2">{server.title}</div>
        <div className="mt-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-white/40 px-2">Текст</div>
          <div className="space-y-1">
            {groups.text.map((ch) => (
              <ChannelBtn key={ch.id} ch={ch} />
            ))}
          </div>

          <div className="text-[11px] uppercase tracking-wide text-white/40 px-2 pt-2">Голос</div>
          <div className="space-y-1">
            {groups.voice.map((ch) => (
              <ChannelBtn key={ch.id} ch={ch} />
            ))}
          </div>

          <div className="text-[11px] uppercase tracking-wide text-white/40 px-2 pt-2">Сцена</div>
          <div className="space-y-1">
            {groups.stage.map((ch) => (
              <ChannelBtn key={ch.id} ch={ch} />
            ))}
          </div>
        </div>
      </aside>

      {/* Контент канала */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-4">
        {/* Заголовок сервера/сессии */}
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-white/90 font-semibold truncate">{server.title}</div>
              {server.subtitle && <div className="text-xs text-white/60 truncate">{server.subtitle}</div>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {panicBadge}
              {e2eBadge}
              {sessionBadge}
            </div>
          </div>
        </div>

        {/* Заголовок канала */}
        {selectedChannel && (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-white/90 font-semibold truncate">
                  {selectedChannel.kind === "text" ? "#" : selectedChannel.kind === "voice" ? "🔊" : "🎥"} {selectedChannel.title}
                </div>
                {selectedChannel.hint && <div className="text-xs text-white/60 truncate">{selectedChannel.hint}</div>}
              </div>

              {selectedChannel.kind !== "text" && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onJoin("voice")}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
                    title="Подключиться к голосу"
                  >
                    📞 Войти
                  </button>
                  <button
                    type="button"
                    onClick={() => onJoin("video")}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
                    title="Подключиться к видео/сцене"
                  >
                    🎥 Видео
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Текстовый канал: лента + ввод */}
        {selectedChannel?.kind === "text" && (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="space-y-3 text-sm">
                {selectedMsgs.map((m) => (
                  <div key={m.id} className={["flex", m.from === "me" ? "justify-end" : "justify-start"].join(" ")}>
                    <div
                      className={[
                        "max-w-[78%] rounded-2xl px-4 py-2 border",
                        m.from === "me" ? "bg-indigo-600/20 border-indigo-400/20 text-white/90" : "bg-white/5 border-white/10 text-white/90",
                      ].join(" ")}
                    >
                      <div className="text-[11px] text-white/50 mb-1">
                        {m.who} · {m.time}
                      </div>
                      <div className="leading-relaxed whitespace-pre-wrap">{m.text}</div>
                    </div>
                  </div>
                ))}

                <div className="text-xs text-white/50 pt-2">Примечание: без E2E отправка обязана быть заблокирована (fail-closed).</div>

                <div ref={endRef} />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  placeholder={`Написать в #${selectedChannel.title}…`}
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
          </>
        )}

        {/* Голос/сцена канал: заглушка */}
        {selectedChannel && selectedChannel.kind !== "text" && (
          <div className="flex-1 min-h-0 rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80">
            <div className="text-sm text-white/70">Тут будет список участников и кнопки управления (mute/deafen/screen).</div>
            <div className="mt-3 text-xs text-white/60">
              Политика звонков применена так же, как в DM: без E2E/без безопасного пути/без TURN в Anon — запрещаем (fail‑closed).
            </div>
          </div>
        )}

        {/* Моки-переключатели */}
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

      {/* Оверлей звонка (мок) */}
      {overlay && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-[640px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-neutral-900 p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-white/90 font-semibold text-lg">
                  {overlay.kind === "voice" ? "Голос" : "Видео"} · {overlay.serverTitle} / {overlay.channelTitle}
                </div>
                <div className="mt-1 text-sm text-white/70">Сессия: {overlay.esmText}</div>
                <div className="text-sm text-white/70">{overlay.rtcText}</div>
              </div>
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 bg-white/10 hover:bg-white/20 text-sm"
                onClick={() => setOverlay(null)}
                title="Закрыть"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid sm:grid-cols-3 gap-2">
              <button type="button" className="rounded-xl px-4 py-2 bg-white/10 hover:bg-white/20 text-white/90">
                🎙️ Mute
              </button>
              <button type="button" className="rounded-xl px-4 py-2 bg-white/10 hover:bg-white/20 text-white/90">
                🔇 Deafen
              </button>
              <button type="button" className="rounded-xl px-4 py-2 bg-white/10 hover:bg-white/20 text-white/90">
                🖥️ Screen
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">
              Здесь будет групповой звонок: WebRTC/SFU (заглушка), индикаторы качества и список участников.
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button type="button" className="rounded-xl px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold" onClick={() => setOverlay(null)}>
                Выйти
              </button>
              <div className="text-xs text-white/50">MVP: UI-заглушка</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
