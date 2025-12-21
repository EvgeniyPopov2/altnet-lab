import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useDragControls, useMotionValue } from "framer-motion";

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
  esmText: string;
  rtcText: string;

  /**
   * Для группового звонка/голосового канала — мок списка участников.
   * Для DM — обычно 2 элемента: "Вы" и собеседник.
   */
  participants?: CallParticipant[];
};

type Phase = "connecting" | "connected";

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

  const [phase, setPhase] = useState<Phase>("connecting");
  const [startedAt, setStartedAt] = useState<number>(Date.now());
  const [tick, setTick] = useState<number>(Date.now());

  const [micMuted, setMicMuted] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);

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
    setPhase("connecting");
    setStartedAt(Date.now());
    setTick(Date.now());

    setMicMuted(false);
    setCamOn(call.kind === "video");
    setSpeakerOn(true);

    setQuality({ rttMs: 120, jitterMs: 8, lossPct: 0.6 });
  }, [call]);

  // simulate connect
  useEffect(() => {
    if (!call) return;
    const t = window.setTimeout(() => setPhase("connected"), 900);
    return () => window.clearTimeout(t);
  }, [call]);

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
    if (phase !== "connected") return "Соединение…";
    return durationMmSs(tick - startedAt);
  }, [call, phase, tick, startedAt]);

  function persistPos() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LS_POS_KEY, JSON.stringify({ x: x.get(), y: y.get() }));
    } catch {
      // ignore
    }
  }

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
                <div className="text-xs text-white/60 mt-0.5">{phase === "connected" ? "Подключено" : "Подключение…"}</div>
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
                {/* Политика/шифрование */}
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-emerald-200">
                    🔒 E2E
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/80">
                    {call.esmText}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/70">
                    {call.rtcText}
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


                {/* Участники (мок) */}
                {Array.isArray(call.participants) && call.participants.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white/60">Участники ({call.participants.length})</div>
                      <div className="text-[11px] text-white/40">MVP</div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {call.participants.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5"
                        >
                          <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[11px] text-white/80">
                            {initials(p.name)}
                          </div>

                          <div className="min-w-0">
                            <div className="text-sm leading-tight text-white/90 truncate">{p.name}</div>
                            {p.label && <div className="text-[11px] text-white/50 truncate">{p.label}</div>}
                          </div>

                          <div className="ml-auto text-xs">{p.muted ? "🔇" : "🎙️"}</div>
                        </div>
                      ))}
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

                <details className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <summary className="cursor-pointer text-sm text-white/80">Детали соединения</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-white/60">
                    <li>Сессия: {call.esmText}</li>
                    <li>{call.rtcText}</li>
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
