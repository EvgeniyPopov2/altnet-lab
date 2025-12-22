import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useDragControls, useMotionValue } from "framer-motion";
import { usePrivacyProfile } from "../../core/settings/profile";
import { presetTitle, useRtcAudioConfig } from "../../core/rtc/audio";
import { AudioTuning } from "./AudioTuning";
import type { EffectiveSessionMode, RtcPolicy } from "../../core/policy/types";

export type CallParticipant = {
  id: string;
  name: string;
  /**
   * Короткий лейбл для UI (например: роль/заметка). Не используется в политике.
   */
  label?: string;
  muted?: boolean;
};

export type CallWindowModel = {
  kind: "voice" | "video";
  title: string;

  /**
   * Политика сессии (что именно было разрешено policy-движком на момент старта).
   * Это НЕ “живая” политика: если пользователь потом переключит профиль —
   * в MVP мы не пересчитываем её и не “дропаем” звонок автоматически.
   * (Сделаем на следующих шагах.)
   */
  policy: {
    esm: EffectiveSessionMode;
    rtc: RtcPolicy;
  };

  /**
   * Для группового звонка/голосового канала — мок списка участников.
   * Для DM — обычно 2 элемента: "Вы" и собеседник.
   */
  participants?: CallParticipant[];
};

type Phase = "lobby" | "connecting" | "connected";

type Quality = {
  rttMs: number;
  jitterMs: number;
  lossPct: number;
};

const LS_POS_KEY = "altnet.callWindow.pos.v1";
const LS_MIN_KEY = "altnet.callWindow.minimized.v1";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function durationMmSs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = pad2(Math.floor(s / 60));
  const ss = pad2(s % 60);
  return `${mm}:${ss}`;
}

function initials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/g)
    .filter(Boolean);

  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (a + b).toUpperCase();
}


export default function CallWindow({ call, onEnd }: { call: CallWindowModel | null; onEnd: () => void }) {
  const constraintsRef = useRef<HTMLDivElement | null>(null);
  const controls = useDragControls();

  // drag offsets (смещение относительно стартовой позиции bottom-left)
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const [minimized, setMinimized] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(LS_MIN_KEY) === "1";
  });
    // Групповой звонок/голосовой канал: >2 участников.
  // Для DM обычно 2 ("Вы" + собеседник).
  const isGroupCall = useMemo(() => {
    const n = call?.participants?.length ?? 0;
    return n > 2;
  }, [call]);

  const self = useMemo(() => {
    return call?.participants?.find((p) => p.id === "me") ?? null;
  }, [call]);

  // Мок "кто говорит" (для группового звонка)
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [recentSpeakerIds, setRecentSpeakerIds] = useState<string[]>([]);

  const [phase, setPhase] = useState<Phase>("connecting");
  const [startedAt, setStartedAt] = useState<number>(Date.now());
  const [tick, setTick] = useState<number>(Date.now());

  const [micMuted, setMicMuted] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [profile] = usePrivacyProfile();
  const [audio, patchAudio, resetAudio] = useRtcAudioConfig(profile);

  const [quality, setQuality] = useState<Quality>({
    rttMs: 120,
    jitterMs: 8,
    lossPct: 0.6,
  });

  // загрузка сохранённой позиции окна (один раз)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LS_POS_KEY);
      if (!raw) return;
      const v = JSON.parse(raw) as { x?: unknown; y?: unknown };
      if (typeof v.x === "number") x.set(v.x);
      if (typeof v.y === "number") y.set(v.y);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist minimized
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LS_MIN_KEY, minimized ? "1" : "0");
    } catch {
      // ignore
    }
  }, [minimized]);

    // reset UI when new call appears
  useEffect(() => {
    if (!call) return;
    const now = Date.now();
    const group = (call.participants?.length ?? 0) > 2;

    // Для группового звонка показываем "лобби" (перед подключением).
    // Для DM оставляем прежний UX: сразу подключаемся.
    setPhase(group ? "lobby" : "connecting");
    if (!group) setStartedAt(now);
    setTick(now);

    setActiveSpeakerId(null);
    setRecentSpeakerIds([]);

    setMicMuted(false);
    setCamOn(call.kind === "video");
    setSpeakerOn(true);

    setQuality({ rttMs: 120, jitterMs: 8, lossPct: 0.6 });
  }, [call]);


  // simulate connect
  useEffect(() => {
    if (!call || phase !== "connecting") return;
    const t = window.setTimeout(() => setPhase("connected"), 900);
    return () => window.clearTimeout(t);
  }, [call, phase]);

    // мок активного говорящего (только для группового звонка)
  useEffect(() => {
    if (!call || phase !== "connected" || !isGroupCall) return;

    const i = window.setInterval(() => {
      const participants = call.participants ?? [];

      const eligible = participants.filter((p) => {
        // "mute" в модели участника — это его локальный статус в моках.
        if (p.muted) return false;
        // если у нас выключен микрофон — не считаем себя кандидатом
        if (p.id === "me" && micMuted) return false;
        return true;
      });

      if (eligible.length === 0) {
        setActiveSpeakerId(null);
        return;
      }

      const pick = eligible[Math.floor(Math.random() * eligible.length)]!;
      setActiveSpeakerId(pick.id);
      setRecentSpeakerIds((prev) => {
        const next = [pick.id, ...prev.filter((id) => id !== pick.id)];
        return next.slice(0, 3);
      });
    }, 1300);

    return () => window.clearTimeout(i as unknown as number);
  }, [call, phase, isGroupCall, micMuted]);


  // timer tick
  useEffect(() => {
    if (!call || phase !== "connected") return;
    const i = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(i);
  }, [call, phase]);

  // quality mock drift
  useEffect(() => {
    if (!call || phase !== "connected") return;
    const i = window.setInterval(() => {
      setQuality((prev) => {
        const drift = (v: number, maxStep: number, min: number, max: number) =>
          clamp(v + (Math.random() * 2 - 1) * maxStep, min, max);

        return {
          rttMs: drift(prev.rttMs, 18, 60, 600),
          jitterMs: drift(prev.jitterMs, 3, 1, 80),
          lossPct: drift(prev.lossPct, 0.3, 0, 8),
        };
      });
    }, 1500);
    return () => window.clearInterval(i);
  }, [call, phase]);

  // esc => end
  useEffect(() => {
    if (!call) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEnd();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [call, onEnd]);

  const durationText = useMemo(() => {
    if (!call) return "";
    if (phase === "lobby") return "Лобби";
    if (phase !== "connected") return "Соединение…";
    return durationMmSs(tick - startedAt);
  }, [call, phase, tick, startedAt]);

  const esmText = useMemo(() => {
    if (!call) return "";
    const esm = call.policy.esm;
    return `${esm.family.toUpperCase()}${esm.compat ? " (compat)" : ""}`;
  }, [call]);

  const rtcText = useMemo(() => {
    if (!call) return "";
    return call.policy.rtc.note;
  }, [call]);

  function persistPos() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LS_POS_KEY, JSON.stringify({ x: x.get(), y: y.get() }));
    } catch {
      // ignore
    }
    }
    function startConnect() {
        const now = Date.now();
        setStartedAt(now);
        setTick(now);
        setPhase("connecting");
    }

    function joinLobby() {
        // В DM мы в лобби не попадаем. Этот хендлер нужен только для группового звонка.
        startConnect();
    }

    function joinLobbyMuted() {
        setMicMuted(true);
        startConnect();
    }

    const activeSpeaker = useMemo(() => {
        if (!call || !activeSpeakerId) return null;
        return call.participants?.find((p) => p.id === activeSpeakerId) ?? null;
    }, [call, activeSpeakerId]);

    const recentSpeakers = useMemo(() => {
        if (!call) return [] as CallParticipant[];
        const map = new Map((call.participants ?? []).map((p) => [p.id, p] as const));
        return recentSpeakerIds.map((id) => map.get(id)).filter(Boolean) as CallParticipant[];
    }, [call, recentSpeakerIds]);

    return (
        <AnimatePresence>
      {call && (
        <div ref={constraintsRef} className="fixed inset-0 z-50 pointer-events-none">
          <motion.div
            className={[
              "pointer-events-auto absolute left-4 bottom-4",
              "rounded-2xl border border-white/10 bg-neutral-900/95 text-white shadow-xl backdrop-blur",
              minimized ? "w-[340px]" : "w-[420px]",
            ].join(" ")}
            style={{ x, y }}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            drag
            dragListener={false}
            dragControls={controls}
            dragConstraints={constraintsRef}
            dragMomentum={false}
            onDragEnd={persistPos}
          >
            {/* Drag handle (шапка) */}
            <div
              className="flex items-center justify-between gap-2 px-4 py-3 cursor-grab select-none"
              onPointerDown={(e) => controls.start(e)}
              title="Перетащите окно"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg">{call.kind === "video" ? "🎥" : "📞"}</span>
                  <div className="truncate font-semibold text-sm">{call.title}</div>
                  <span className="text-xs text-white/60">{durationText}</span>
                              </div>
                              <div className="text-xs text-white/60 mt-0.5">{phase === "connected" ? "Подключено" : phase === "connecting" ? "Подключение…" : "Лобби"}</div>
                              <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/70">
                                      NS: {presetTitle(audio.preset)}
                                  </span>
                                  {audio.aec && (
                                      <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/70">
                                          AEC
                                      </span>
                                  )}
                                  {audio.agc && (
                                      <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/70">
                                          AGC
                                      </span>
                                  )}
                                  {audio.dtx && (
                                      <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/70">
                                          DTX
                                      </span>
                                  )}
                              </div>

              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 bg-white/10 hover:bg-white/20"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setMinimized((v) => !v)}
                  title={minimized ? "Развернуть" : "Свернуть"}
                >
                  {minimized ? "▢" : "—"}
                </button>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 bg-white/10 hover:bg-white/20"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={onEnd}
                  title="Завершить звонок"
                >
                  ✕
                </button>
                            </div>
                        </div>

                        {!minimized && (
                            <div className="px-4 pb-4 space-y-3">
                                {/* Лобби (только для группового звонка) */}
                                {phase === "lobby" && isGroupCall && (
                                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <div className="text-sm font-semibold text-white/90">Лобби перед входом</div>
                                                <div className="text-xs text-white/60 mt-0.5">
                                                    Вы войдёте как: {self?.label ?? "участник"}. Настройте микрофон/камеру и нажмите «Войти».
                                                </div>
                                            </div>
                                            <div className="text-[11px] text-white/40">MVP</div>
                                        </div>

                                        <div className="mt-3 grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                className="rounded-xl border border-white/10 bg-white/10 hover:bg-white/15 px-3 py-2 text-sm text-white font-semibold"
                                                onClick={joinLobby}
                                                title="Подключиться к каналу"
                                            >
                                                Войти
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-sm text-white/90"
                                                onClick={joinLobbyMuted}
                                                title="Подключиться без микрофона"
                                            >
                                                Войти без микрофона
                                            </button>
                                        </div>

                                        <div className="mt-2 text-[11px] text-white/50">Это мок. Реальные роли/лобби/потоки WebRTC подключим позже.</div>
                                    </div>
                                )}

                {/* Политика/шифрование */}
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-emerald-200">
                    🔒 E2E
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/80">
                    {esmText}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/70">
                    {rtcText}
                  </span>
                </div>

                {/* Моки качества */}
                <div className="flex flex-wrap gap-2 text-xs">
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/80"
                    title="Round-trip time"
                  >
                    🕒 RTT {Math.round(quality.rttMs)}ms
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/80" title="Jitter">
                    📈 J {Math.round(quality.jitterMs)}ms
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/80" title="Packet loss">
                                        📉 Loss {quality.lossPct.toFixed(1)}%
                                    </span>
                                </div>

                                {/* Список говорящих (мок, только для группового звонка) */}
                                {phase === "connected" && isGroupCall && (
                                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                        <div className="flex items-center justify-between">
                                            <div className="text-xs text-white/60">Сейчас говорят</div>
                                            <div className="text-[11px] text-white/40">мок</div>
                                        </div>

                                        <div className="mt-2">
                                            <AnimatePresence mode="popLayout">
                                                {activeSpeaker ? (
                                                    <motion.div
                                                        key={activeSpeaker.id}
                                                        initial={{ opacity: 0, y: 4 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -4 }}
                                                        transition={{ duration: 0.15 }}
                                                        className="flex items-center gap-2"
                                                    >
                                                        <div className="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-[11px] text-emerald-200">
                                                            {initials(activeSpeaker.name)}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="text-sm text-white/90 truncate">{activeSpeaker.name}</div>
                                                            {activeSpeaker.label && <div className="text-[11px] text-white/50 truncate">{activeSpeaker.label}</div>}
                                                        </div>
                                                        <div className="ml-auto text-xs text-emerald-200">●</div>
                                                    </motion.div>
                                                ) : (
                                                    <motion.div
                                                        key="none"
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        transition={{ duration: 0.15 }}
                                                        className="text-xs text-white/50"
                                                    >
                                                        Никто не говорит (все выключили микрофон).
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>

                                        {recentSpeakers.length > 1 && (
                                            <div className="mt-2 text-[11px] text-white/50">Недавно говорили: {recentSpeakers.map((p) => p.name).join(", ")}</div>
                                        )}
                                    </div>
                                )}


                {/* Участники (мок) */}
                {Array.isArray(call.participants) && call.participants.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white/60">Участники ({call.participants.length})</div>
                      <div className="text-[11px] text-white/40">MVP</div>
                    </div>

                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            {call.participants.map((p) => {
                                                const muted = p.id === "me" ? micMuted : !!p.muted;
                                                const active = phase === "connected" && isGroupCall && activeSpeakerId === p.id;

                                                return (
                                                    <div
                                                        key={p.id}
                                                        className={[
                                                            "flex items-center gap-2 rounded-lg border bg-white/5 px-2 py-1.5 transition",
                                                            active ? "border-emerald-500/30 bg-emerald-500/10" : "border-white/10",
                                                        ].join(" ")}
                                                    >
                                                        <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[11px] text-white/80">
                                                            {initials(p.name)}
                                                        </div>

                                                        <div className="min-w-0">
                                                            <div className="text-sm leading-tight text-white/90 truncate">{p.name}</div>
                                                            {p.label && <div className="text-[11px] text-white/50 truncate">{p.label}</div>}
                                                        </div>

                                                        <div className="ml-auto text-xs">{active ? "🟢" : muted ? "🔇" : "🎙️"}</div>
                                                    </div>
                                                );
                                            })}
                    </div>
                  </div>
                )}


                {/* Кнопки управления */}
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    className={[
                      "rounded-xl px-3 py-2 text-sm border transition",
                      micMuted
                        ? "border-red-500/30 bg-red-500/15 text-red-200"
                        : "border-white/10 bg-white/5 text-white/90 hover:bg-white/10",
                    ].join(" ")}
                    onClick={() => setMicMuted((v) => !v)}
                    title={micMuted ? "Включить микрофон" : "Выключить микрофон"}
                  >
                    {micMuted ? "🔇" : "🎙️"}
                  </button>

                  <button
                    type="button"
                    disabled={call.kind !== "video"}
                    className={[
                      "rounded-xl px-3 py-2 text-sm border transition",
                      call.kind !== "video"
                        ? "border-white/10 bg-white/5 text-white/30 cursor-not-allowed"
                        : camOn
                        ? "border-white/10 bg-white/10 text-white"
                        : "border-white/10 bg-white/5 text-white/90 hover:bg-white/10",
                    ].join(" ")}
                    onClick={() => setCamOn((v) => !v)}
                    title={
                      call.kind !== "video"
                        ? "Камера доступна только в видео-звонке"
                        : camOn
                        ? "Выключить камеру"
                        : "Включить камеру"
                    }
                  >
                    {camOn ? "📷" : "🚫📷"}
                  </button>

                  <button
                    type="button"
                    className={[
                      "rounded-xl px-3 py-2 text-sm border transition",
                      speakerOn
                        ? "border-white/10 bg-white/5 text-white/90 hover:bg-white/10"
                        : "border-amber-500/30 bg-amber-500/15 text-amber-200",
                    ].join(" ")}
                    onClick={() => setSpeakerOn((v) => !v)}
                    title={speakerOn ? "Отключить вывод" : "Включить вывод"}
                  >
                    {speakerOn ? "🔊" : "🔈"}
                  </button>

                  <button
                    type="button"
                    className="rounded-xl px-3 py-2 text-sm border border-red-500/30 bg-red-600 hover:bg-red-500 text-white font-semibold transition"
                    onClick={onEnd}
                    title="Завершить"
                  >
                    ⛔
                                  </button>
                              </div>
                              {/* Звук/шумоподавление (мок) */}
                              <AudioTuning profile={profile} cfg={audio} patch={patchAudio} reset={resetAudio} />
                              <details className="rounded-xl border border-white/10 bg-white/5 p-3">
                                  <summary className="cursor-pointer text-sm text-white/80">Детали соединения</summary>
                                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-white/60">
                    <li>Сессия: {esmText}</li>
                    <li>{rtcText}</li>
                    <li>
                      ICE: {call.policy.rtc.iceTransportPolicy === "relay" ? "relay-only" : "all"}
                      {call.policy.rtc.requireTurnAllowList ? " (TURN allow-list required)" : ""}
                    </li>
                    <li>STUN: {call.policy.rtc.allowStun ? "allowed" : "blocked"}</li>
                    <li>MVP: реальные WebRTC/WebTransport пайплайны подключим позже.</li>
                  </ul>
                </details>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
