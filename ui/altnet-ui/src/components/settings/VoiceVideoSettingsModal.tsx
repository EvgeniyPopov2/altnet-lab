import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, Mic, Video, Wrench, Music2, X } from "lucide-react";
import { clearDismissedKeys } from "../../core/security/storage";
import type { PrivacyProfile } from "../../core/policy/types";
import { useVoiceVideoSettings, type DuckingMode, type InputProcessingProfile, type VoiceInputMode } from "../../core/settings/voiceVideo";
import { useRtcAudioConfig } from "../../core/rtc/audio";
import { useMediaDevices } from "../../core/media/useMediaDevices";
import { useMicTest } from "../../core/media/useMicTest";
import { useCameraPreview } from "../../core/media/useCameraPreview";
type TabKey = "voice" | "video" | "soundboard" | "debug";

type Props = {
  open: boolean;
  profile: PrivacyProfile;
  onClose: () => void;
};

function profileTitle(p: PrivacyProfile): string {
  return p === "anon" ? "Анонимный" : "Приватный быстрый";
}

function tabTitle(t: TabKey): string {
  switch (t) {
    case "voice":
      return "Голос";
    case "video":
      return "Видео";
    case "soundboard":
      return "Звуковая панель";
    case "debug":
      return "Отладка";
  }
}

function duckingTitle(m: DuckingMode): string {
  switch (m) {
    case "off":
      return "Выкл";
    case "when_i_speak":
      return "Когда я говорю";
    case "when_others_speak":
      return "Когда другие говорят";
  }
}

function modeTitle(m: VoiceInputMode): string {
  return m === "vad" ? "Активация по голосу" : "Режим рации";
}

function procTitle(p: InputProcessingProfile): string {
  switch (p) {
    case "isolation":
      return "Изоляция голоса";
    case "studio":
      return "Студия";
    case "custom":
      return "Пользовательский";
  }
}

function rangeFill(value: number): string {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return `linear-gradient(to right, rgba(99,102,241,0.9) 0%, rgba(99,102,241,0.9) ${v}%, rgba(255,255,255,0.14) ${v}%, rgba(255,255,255,0.14) 100%)`;
}

function hotkeyFromEvent(e: KeyboardEvent): string {
  // Простейший нормализатор. Для MVP — достаточно.
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");

  const k = e.key;
  if (!k) return parts.join("+") || "Не назначено";

  // игнорируем “модификаторы без клавиши”
  if (k === "Control" || k === "Shift" || k === "Alt" || k === "Meta") {
    return parts.join("+") || "Не назначено";
  }

  const pretty = k.length === 1 ? k.toUpperCase() : k;
  parts.push(pretty);
  return parts.join("+");
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-wide text-white/60">{children}</div>;
}

function Switch({
  checked,
  disabled,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className={disabled ? "text-sm text-white/50" : "text-sm text-white/85"}>{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-white/45">{hint}</div>}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={[
          "relative h-7 w-12 rounded-full border transition",
          disabled ? "cursor-not-allowed border-white/10 bg-white/5 opacity-70" : checked ? "border-indigo-500/40 bg-indigo-500/60" : "border-white/10 bg-white/10 hover:bg-white/15",
        ].join(" ")}
        title={disabled ? "Недоступно" : checked ? "Выключить" : "Включить"}
      >
        <span
          className={[
            "absolute top-1 left-1 h-5 w-5 rounded-full bg-white transition",
            checked ? "translate-x-5" : "translate-x-0",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

function PolicyLockHint({ title, message }: { title: string; message: string }) {
  return (
    <div className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2">
      <div className="flex items-start gap-2">
        <Lock className="mt-0.5 h-4 w-4 text-amber-300" />
        <div className="min-w-0">
          <div className="text-xs font-semibold text-amber-200">{title}</div>
          <div className="mt-0.5 text-[11px] text-amber-100/80">{message}</div>
        </div>
      </div>
    </div>
  );
}

function RadioCard({
  active,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full text-left rounded-xl border px-4 py-3 transition",
        active ? "border-indigo-500/40 bg-indigo-500/10" : "border-white/10 bg-white/5 hover:bg-white/10",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <div
          className={[
            "h-4 w-4 rounded-full border",
            active ? "border-indigo-300 bg-indigo-400" : "border-white/20 bg-transparent",
          ].join(" ")}
        />
        <div className="min-w-0">
          <div className={active ? "text-sm font-semibold text-white" : "text-sm font-semibold text-white/85"}>{title}</div>
          <div className="mt-0.5 text-[11px] text-white/50">{subtitle}</div>
        </div>
      </div>
    </button>
  );
}

export default function VoiceVideoSettingsModal({ open, profile, onClose }: Props) {
  const [tab, setTab] = useState<TabKey>("voice");
  const [vv, patchVv, resetVv] = useVoiceVideoSettings(profile);
  const [audio, patchAudio, resetAudio] = useRtcAudioConfig(profile);
  // Реальный тест микрофона (WebAudio + getUserMedia).
  const [testing, setTesting] = useState(false);
  const monitorAudioRef = useRef<HTMLAudioElement | null>(null);
  const media = useMediaDevices(open);
  const micTest = useMicTest({
    active: open && tab === "voice" && testing,
    inputDeviceId: vv.inputDeviceId,
    outputDeviceId: vv.outputDeviceId,
    micVolumePct: vv.micVolume,
    outputVolumePct: vv.outputVolume,
    inputMode: vv.inputMode,
    vadThresholdPct: vv.vadThreshold,
    pttHotkey: vv.pttHotkey,
    monitor: true,
    audioElRef: monitorAudioRef,
    constraints: {
      echoCancellation: audio.aec,
      autoGainControl: audio.agc,
      noiseSuppression: audio.preset !== "off",
    },
  });
  // Реальный тест камеры (getUserMedia, локально, без сети).
  const [videoTesting, setVideoTesting] = useState(false);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

  const camPreview = useCameraPreview({
    active: open && tab === "video" && videoTesting && (profile !== "anon" || vv.allowVideoInAnon),
    deviceId: vv.cameraDeviceId,
    videoElRef: videoPreviewRef,
  });
  void camPreview;
  // После выдачи разрешения на микрофон браузер начинает раскрывать реальные label устройств.
  // Освежаем список, чтобы селекты не оставались "Микрофон 1/2".
  useEffect(() => {
    if (!open) return;
    if (!testing) return;
    const t = window.setTimeout(() => {
      void media.refresh();
    }, 650);
    return () => window.clearTimeout(t);
  }, [open, testing, media.refresh]);

  // После разрешения на камеру — обновим список устройств (label становятся реальными).
  useEffect(() => {
    if (!open) return;
    if (!videoTesting) return;
    const t = window.setTimeout(() => {
      void media.refresh();
    }, 650);
    return () => window.clearTimeout(t);
  }, [open, videoTesting, media.refresh]);

  // Если policy запретила видео (ANON без allowVideoInAnon) — принудительно выключаем тест.
  useEffect(() => {
    if (!open) return;
    if (profile !== "anon") return;
    if (vv.allowVideoInAnon) return;
    if (videoTesting) setVideoTesting(false);
  }, [open, profile, vv.allowVideoInAnon, videoTesting]);


  // Захват hotkey (мок)
  const [capturingHotkey, setCapturingHotkey] = useState(false);
  useEffect(() => {
    if (!capturingHotkey) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const hk = hotkeyFromEvent(e);
      patchVv({ pttHotkey: hk });
      setCapturingHotkey(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturingHotkey]);

  // ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // При закрытии — сбрасываем transient состояния
  useEffect(() => {
    if (open) return;
    setTesting(false);
    setCapturingHotkey(false);
    setVideoTesting(false);
  }, [open]);

  const canShowVideoControls = profile !== "anon" || vv.allowVideoInAnon;

  const inputDevices = media.audioInputs;
  const outputDevices = media.audioOutputs;
  const cameraDevices = media.videoInputs;

  const applyProcProfile = (p: InputProcessingProfile) => {
    patchVv({ inputProcessingProfile: p });
    // Маппинг на текущий аудио-конфиг. В проде это будет связка с AudioWorklet/WASM.
    if (p === "isolation") {
      patchAudio({ preset: "balanced", aec: true, agc: true });
    }
    if (p === "studio") {
      patchAudio({ preset: "off", aec: false, agc: false });
    }
  };

  const body = (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[10000]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/55"
            onClick={onClose}
            aria-hidden
          />

          {/* Dialog */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Голос и видео"
            className="absolute left-1/2 top-1/2 w-[960px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2"
            initial={{ opacity: 0, y: 10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.985 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="rounded-2xl border border-white/10 bg-slate-950/90 shadow-2xl backdrop-blur">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 px-5 pt-5">
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-white/90">Голос и видео</div>
                  <div className="mt-1 text-sm text-white/60">
                    Профиль: <span className="text-white/80">{profileTitle(profile)}</span> · Настройки применяются локально.
                  </div>
                </div>

                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 hover:bg-white/10 hover:text-white"
                  onClick={onClose}
                  aria-label="Закрыть"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Tabs */}
              <div className="mt-4 border-b border-white/10 px-5">
                <div className="flex flex-wrap gap-2">
                  {["voice", "video", "soundboard", "debug"].map((k) => {
                    const kk = k as TabKey;
                    const active = tab === kk;
                    const Icon = kk === "voice" ? Mic : kk === "video" ? Video : kk === "soundboard" ? Music2 : Wrench;
                    return (
                      <button
                        key={kk}
                        type="button"
                        onClick={() => setTab(kk)}
                        className={[
                          "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                          active ? "border-indigo-500/40 bg-indigo-500/10 text-white" : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white",
                        ].join(" ")}
                      >
                        <Icon className="h-4 w-4" />
                        {tabTitle(kk)}
                      </button>
                    );
                  })}
                </div>
                <div className="h-4" />
              </div>

              {/* Content */}
              <div className="max-h-[70vh] overflow-auto px-5 pb-5 pt-4">
                {tab === "voice" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-4">
                        <SectionTitle>Устройство ввода</SectionTitle>
                        <select
                          value={vv.inputDeviceId}
                          onChange={(e) => patchVv({ inputDeviceId: e.target.value })}
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 outline-none focus:border-white/20"
                        >
                          {inputDevices.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-4">
                        <SectionTitle>Устройство вывода</SectionTitle>
                        <select
                          value={vv.outputDeviceId}
                          onChange={(e) => patchVv({ outputDeviceId: e.target.value })}
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 outline-none focus:border-white/20"
                        >
                          {outputDevices.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <SectionTitle>Громкость микрофона</SectionTitle>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={vv.micVolume}
                            onChange={(e) => patchVv({ micVolume: Number(e.target.value) })}
                            className="altnet-range w-full"
                            style={{ background: rangeFill(vv.micVolume) }}
                          />
                          <div className="w-12 text-right text-sm text-white/70 tabular-nums">{vv.micVolume}%</div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <SectionTitle>Громкость звука</SectionTitle>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={vv.outputVolume}
                            onChange={(e) => patchVv({ outputVolume: Number(e.target.value) })}
                            className="altnet-range w-full"
                            style={{ background: rangeFill(vv.outputVolume) }}
                          />
                          <div className="w-12 text-right text-sm text-white/70 tabular-nums">{vv.outputVolume}%</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white/85">Проверка микрофона</div>
                          <div className="mt-0.5 text-[11px] text-white/50">
                            Реальный уровень через getUserMedia + WebAudio (локально, без сети).
                            {!media.hasRealLabels && " Названия устройств появятся после разрешения на микрофон."}
                          </div>

                          {media.error && <div className="mt-1 text-[11px] text-amber-200">Устройства: {media.error}</div>}
                          {micTest.error && <div className="mt-1 text-[11px] text-red-200">Микрофон: {micTest.error}</div>}
                        </div>

                        <button
                          type="button"
                          disabled={!media.supported}
                          className={[
                            "rounded-lg px-3 py-2 text-sm font-semibold text-white",
                            !media.supported ? "cursor-not-allowed bg-white/10 text-white/40" : "bg-indigo-600 hover:bg-indigo-500",
                          ].join(" ")}
                          onClick={() => setTesting((v) => !v)}
                          title={!media.supported ? "getUserMedia/enumerateDevices недоступны" : testing ? "Остановить" : "Начать"}
                        >
                          {testing ? "Остановить" : "Давайте проверим"}
                        </button>
                      </div>

                      <div className="mt-3 relative h-2 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-2 bg-emerald-400/50" style={{ width: `${Math.round(micTest.level * 100)}%` }} />
                        {/* маркер порога VAD */}
                        <div
                          className="absolute top-0 bottom-0 w-[2px] bg-white/40"
                          style={{ left: `${Math.round(Math.min(1, micTest.thresholdRms * 3.2) * 100)}%` }}
                        />
                      </div>

                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/50">
                        <div className="flex items-center gap-2">
                          <span className={micTest.speaking ? "text-emerald-200" : "text-white/50"}>
                            {micTest.speaking ? "● Говорю" : "○ Тишина"}
                          </span>
                          {micTest.clipped && <span className="text-amber-200">Клиппинг</span>}
                        </div>

                        {vv.inputMode === "ptt" && (
                          <span className={micTest.pttDown ? "text-emerald-200" : "text-white/50"}>
                            PTT:{" "}
                            {micTest.pttDown
                              ? "удерживаю"
                              : vv.pttHotkey && vv.pttHotkey !== "Не назначено"
                                ? `удерживайте ${vv.pttHotkey}`
                                : "не назначено"}
                          </span>
                        )}
                      </div>

                      {/* скрытый audio-элемент для вывода мониторинга (нужен для setSinkId) */}
                      <audio ref={monitorAudioRef} className="hidden" />
                    </div>


                    <div className="space-y-3">
                      <SectionTitle>Профиль ввода</SectionTitle>

                      <div className="space-y-2">
                        <RadioCard
                          active={vv.inputProcessingProfile === "isolation"}
                          title="Изоляция голоса"
                          subtitle="Только ваш голос: AltNet приглушит лишний шум (мок)"
                          onClick={() => applyProcProfile("isolation")}
                        />
                        <RadioCard
                          active={vv.inputProcessingProfile === "studio"}
                          title="Студия"
                          subtitle="Чистый звук: открытый микрофон без обработки (мок)"
                          onClick={() => applyProcProfile("studio")}
                        />
                        <RadioCard
                          active={vv.inputProcessingProfile === "custom"}
                          title="Пользовательский"
                          subtitle="Продвинутый режим: ручные настройки и переключатели"
                          onClick={() => applyProcProfile("custom")}
                        />
                      </div>

                      {vv.inputProcessingProfile === "custom" && (
                        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4">
                          <div className="text-sm font-semibold text-white/80">Обработка (пользовательская)</div>
                          <div className="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <div className="text-xs text-white/60">Шумоподавление</div>
                              <select
                                value={audio.preset}
                                onChange={(e) => patchAudio({ preset: e.target.value as any })}
                                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 outline-none focus:border-white/20"
                              >
                                <option value="off">Выкл</option>
                                <option value="balanced">Сбалансированное</option>
                                <option value="strong">Сильное</option>
                                <option value="music">Музыка</option>
                              </select>
                            </div>

                            <div className="space-y-3">
                              <Switch
                                checked={audio.aec}
                                onChange={(v) => patchAudio({ aec: v })}
                                label="Подавление эха (AEC)"
                              />
                              <Switch
                                checked={audio.agc}
                                onChange={(v) => patchAudio({ agc: v })}
                                label="Автогромкость (AGC)"
                              />
                              <Switch
                                checked={audio.dtx}
                                onChange={(v) => patchAudio({ dtx: v })}
                                label="DTX (экономия при тишине)"
                                hint="В UI уже есть, реальная интеграция в медиа‑пайплайн — позже"
                              />
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                              onClick={resetAudio}
                            >
                              Сбросить обработку
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <SectionTitle>Режим ввода</SectionTitle>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <RadioCard
                          active={vv.inputMode === "vad"}
                          title="Активация по голосу"
                          subtitle="Микрофон активен, когда вы говорите (VAD)"
                          onClick={() => patchVv({ inputMode: "vad" })}
                        />
                        <RadioCard
                          active={vv.inputMode === "ptt"}
                          title="Режим рации"
                          subtitle="Нажмите и держите горячую клавишу, чтобы говорить (PTT)"
                          onClick={() => patchVv({ inputMode: "ptt" })}
                        />
                      </div>

                      {vv.inputMode === "vad" && (
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-white/80">Порог активации (VAD)</div>
                            <div className="text-sm text-white/60 tabular-nums">{vv.vadThreshold}%</div>
                          </div>
                          <div className="mt-2">
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={vv.vadThreshold}
                              onChange={(e) => patchVv({ vadThreshold: Number(e.target.value) })}
                              className="altnet-range w-full"
                              style={{ background: rangeFill(vv.vadThreshold) }}
                            />
                          </div>
                          <div className="mt-1 text-[11px] text-white/50">
                            MVP: сейчас это настройка UI. На следующем шаге подключим реальный VAD по RMS/энергии в WebAudio.
                          </div>
                        </div>
                      )}

                      {vv.inputMode === "ptt" && (
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-white/80">Горячая клавиша</div>
                              <div className="mt-0.5 text-[11px] text-white/50">
                                MVP: назначение — мок. Реальная привязка к медиа‑пайплайну появится после подключения getUserMedia.
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className={[
                                  "rounded-lg px-3 py-2 text-sm font-semibold",
                                  capturingHotkey ? "bg-amber-600 text-white" : "bg-indigo-600 text-white hover:bg-indigo-500",
                                ].join(" ")}
                                onClick={() => setCapturingHotkey(true)}
                              >
                                {capturingHotkey ? "Нажмите клавишу…" : "Нажмите для назначения"}
                              </button>

                              <button
                                type="button"
                                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                                onClick={() => patchVv({ pttHotkey: "Не назначено" })}
                                title="Сбросить"
                              >
                                Сброс
                              </button>
                            </div>
                          </div>

                          <div className="mt-2 text-sm text-white/70">
                            Текущая: <span className="font-semibold text-white">{vv.pttHotkey}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <details className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <summary className="cursor-pointer select-none text-sm font-semibold text-white/80">Расширенные</summary>
                      <div className="mt-3 space-y-4">
                        <Switch
                          checked={vv.highPriorityPackets}
                          onChange={(v) => patchVv({ highPriorityPackets: v })}
                          label="Включить пакеты с высоким приоритетом"
                          hint="Мок: позже это будет DSCP/QoS. Может конфликтовать с некоторыми роутерами/провайдерами."
                        />

                        <div>
                          <div className="text-sm text-white/80">Глобальное приглушение звука (ducking)</div>
                          <div className="mt-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                            {([
                              "off",
                              "when_i_speak",
                              "when_others_speak",
                            ] as DuckingMode[]).map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => patchVv({ ducking: m })}
                                className={[
                                  "rounded-lg border px-3 py-2 text-sm transition",
                                  vv.ducking === m ? "border-indigo-500/40 bg-indigo-500/10 text-white" : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white",
                                ].join(" ")}
                              >
                                {duckingTitle(m)}
                              </button>
                            ))}
                          </div>
                          <div className="mt-1 text-[11px] text-white/50">
                            Как в Discord: приглушаем звук других приложений, когда кто-то говорит.
                          </div>
                        </div>
                      </div>
                    </details>
                  </div>
                )}

                {tab === "video" && (
                  <div className="space-y-6">
                    {profile === "anon" && !vv.allowVideoInAnon && (
                      <PolicyLockHint
                        title="Видео ограничено политикой профиля"
                        message="В Anon видео по умолчанию выключено (риск утечек/качества). Вы можете включить вручную — это понижает приватность и может ухудшить задержку."
                      />
                    )}

                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <Switch
                        checked={vv.allowVideoInAnon}
                        disabled={profile !== "anon"}
                        onChange={(v) => patchVv({ allowVideoInAnon: v })}
                        label={profile === "anon" ? "Разрешить видео в анонимном профиле" : "Разрешить видео в Anon"}
                        hint={
                          profile === "anon"
                            ? "Явное согласие: пониженная приватность/качество."
                            : "Эта настройка актуальна только для профиля Anon."
                        }
                      />
                    </div>

                    <div className="space-y-4">
                      <SectionTitle>Устройство видео</SectionTitle>
                      <select
                        value={vv.cameraDeviceId || "default"}
                        disabled={!canShowVideoControls}
                        onChange={(e) => patchVv({ cameraDeviceId: e.target.value })}
                        /* мок */

                        className={[
                          "w-full rounded-xl border px-3 py-2 text-sm outline-none",
                          !canShowVideoControls
                            ? "border-white/10 bg-white/5 text-white/30 cursor-not-allowed"
                            : "border-white/10 bg-white/5 text-white/90 focus:border-white/20",
                        ].join(" ")}
                      >
                        {cameraDevices.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.label}
                          </option>
                        ))}
                      </select>

                      {!canShowVideoControls && (
                        <PolicyLockHint
                          title="Видео-настройки заблокированы"
                          message="Пока вы не разрешите видео в профиле Anon, камера и связанные параметры недоступны."
                        />
                      )}
                    </div>

                    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white/85">Проверка видео</div>
                          <div className="mt-0.5 text-[11px] text-white/50">
                            Реальный предпросмотр через getUserMedia (локально, без сети).
                            {!media.hasRealLabels && " Названия камер могут появиться после разрешения на камеру/микрофон."}
                          </div>
                        </div>

                        <button
                          type="button"
                          className={[
                            "rounded-lg px-3 py-2 text-sm font-semibold text-white transition",
                            !media.supported || !canShowVideoControls
                              ? "cursor-not-allowed bg-white/10 text-white/40"
                              : "bg-indigo-600 hover:bg-indigo-500",
                          ].join(" ")}
                          disabled={!media.supported || !canShowVideoControls}
                          onClick={() => setVideoTesting((v) => !v)}
                          title={
                            !media.supported
                              ? "getUserMedia/enumerateDevices недоступны"
                              : !canShowVideoControls
                                ? "Недоступно в текущем профиле"
                                : videoTesting
                                  ? "Остановить"
                                  : "Начать"
                          }
                        >
                          {videoTesting ? "Остановить" : "Давайте проверим"}
                        </button>
                      </div>

                      {media.error && (
                        <div className="mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/60">
                          Устройства: {media.error}
                        </div>
                      )}

                      {camPreview.error && (
                        <div className="mt-2 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200/90">
                          Камера: {camPreview.error}
                        </div>
                      )}

                      <div className="mt-3 relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black/30">
                        <video
                          ref={videoPreviewRef}
                          className={[
                            "h-full w-full object-cover transition-opacity",
                            camPreview.running ? "opacity-100" : "opacity-0",
                          ].join(" ")}
                          muted
                          playsInline
                          autoPlay
                        />

                        {!camPreview.running && (
                          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-white/50">
                            {canShowVideoControls
                              ? videoTesting
                                ? "Запуск предпросмотра… (проверьте разрешения браузера)"
                                : "Нажмите “Давайте проверим”, чтобы запустить предпросмотр"
                              : "Недоступно"}
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                )}

                {tab === "soundboard" && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm font-semibold text-white/85">Звуковая панель (мок)</div>
                      <div className="mt-1 text-sm text-white/60">
                        Здесь будет локальная коллекция клипов/эмодзи звука (CID‑вложения). На MVP — только UI.
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {["Airhorn", "Clap", "Bruh", "Laser"].map((x) => (
                        <button
                          key={x}
                          type="button"
                          className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:bg-white/10"
                          onClick={() => {
                            /* мок */
                          }}
                        >
                          <div className="text-sm font-semibold text-white/80">{x}</div>
                          <div className="mt-0.5 text-[11px] text-white/50">Нажмите, чтобы воспроизвести (мок)</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {tab === "debug" && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm font-semibold text-white/85">Диагностика</div>
                      <div className="mt-1 text-sm text-white/60">
                        Здесь соберём полезные флаги и состояние медиа‑пайплайна. Сейчас — снимок настроек (UI‑мок).
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Сводка</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/70">
                        <li>Профиль: <span className="text-white/85">{profileTitle(profile)}</span></li>
                        <li>Ввод: <span className="text-white/85">{modeTitle(vv.inputMode)}</span></li>
                        <li>Профиль обработки: <span className="text-white/85">{procTitle(vv.inputProcessingProfile)}</span></li>
                        <li>NS preset: <span className="text-white/85">{audio.preset}</span> · AEC: {audio.aec ? "on" : "off"} · AGC: {audio.agc ? "on" : "off"} · DTX: {audio.dtx ? "on" : "off"}</li>
                        <li>Видео в Anon: <span className="text-white/85">{vv.allowVideoInAnon ? "разрешено" : "выключено"}</span></li>
                        <li>QoS: <span className="text-white/85">{vv.highPriorityPackets ? "high-priority" : "обычно"}</span> · Ducking: {duckingTitle(vv.ducking)}</li>
                      </ul>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/15"
                        onClick={resetVv}
                      >
                        Сбросить “Голос и видео”
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/15"
                        onClick={resetAudio}
                      >
                        Сбросить обработку
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/15"
                        onClick={() => clearDismissedKeys()}
                        title="Сбросить локальные dedupe/скрытия Security Coach"
                      >
                        Сбросить скрытые подсказки
                      </button>

                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm font-semibold text-white/85">Заметки по “реальному” внедрению</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/70">
                        <li>Следующий шаг: getUserMedia → реальный тест микрофона/камеры + применение AEC/NS/AGC constraints.</li>
                        <li>VAD: WebAudio анализ энергии/RMS + порог из этой вкладки.</li>
                        <li>PTT: привязка hotkey → включение/отключение audioTrack.enabled.</li>
                        <li>NS “RNNoise/WASM” подключим после того, как базовая линия WebRTC будет стабильной.</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(body, document.body);
}
