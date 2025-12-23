import { useEffect, useMemo, useState } from "react";
import type { PrivacyProfile } from "../policy/types";

export type VoiceInputMode = "vad" | "ptt";
export type InputProcessingProfile = "isolation" | "studio" | "custom";

export type DuckingMode = "off" | "when_i_speak" | "when_others_speak";

export type VoiceVideoSettings = {
  // Устройства (в MVP — только “моки”, чтобы UI был как у Discord)
  inputDeviceId: string;
  outputDeviceId: string;

  // Громкости 0..100
  micVolume: number;
  outputVolume: number;

  // Профиль обработки микрофона (мок, маппинг на реальные DSP — позже)
  inputProcessingProfile: InputProcessingProfile;

  // Режим ввода
  inputMode: VoiceInputMode;
  vadThreshold: number; // 0..100
  pttHotkey: string; // "Не назначено" | "Ctrl+Shift+V" и т.д.

  // Видео
  /**
   * В анонимном профиле видео по умолчанию выключено политикой.
   * Этот флаг — явное согласие пользователя (пониженная приватность/качество).
   */
  allowVideoInAnon: boolean;

  // Advanced (моки)
  highPriorityPackets: boolean;
  ducking: DuckingMode;
};

const LS_PREFIX = "altnet.settings.voiceVideo.v1";

function lsKey(profile: PrivacyProfile): string {
  return `${LS_PREFIX}.${profile}`;
}

function clamp01x100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function safeParseJson(raw: string | null): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isInputMode(v: unknown): v is VoiceInputMode {
  return v === "vad" || v === "ptt";
}

function isProcProfile(v: unknown): v is InputProcessingProfile {
  return v === "isolation" || v === "studio" || v === "custom";
}

function isDucking(v: unknown): v is DuckingMode {
  return v === "off" || v === "when_i_speak" || v === "when_others_speak";
}

export function getDefaultVoiceVideoSettings(profile: PrivacyProfile): VoiceVideoSettings {
  // Дефолты могут отличаться по профилю. Сейчас минимальная подстройка,
  // чтобы:
  // 1) не ловить TS6133 (noUnusedParameters)
  // 2) заложить место под будущие пресеты по доктрине голоса.
  const isAnon = profile === "anon";

  return {
    inputDeviceId: "default",
    outputDeviceId: "default",
    micVolume: 100,
    outputVolume: isAnon ? 50 : 55,
    inputProcessingProfile: "isolation",
    inputMode: "vad",
    vadThreshold: isAnon ? 70 : 65,
    pttHotkey: "Не назначено",
    allowVideoInAnon: false,
    highPriorityPackets: false,
    ducking: "when_others_speak",
  };
}


export function readVoiceVideoSettings(profile: PrivacyProfile): VoiceVideoSettings {
  const def = getDefaultVoiceVideoSettings(profile);
  if (typeof window === "undefined") return def;

  const v = safeParseJson(window.localStorage.getItem(lsKey(profile)));
  if (!v || typeof v !== "object") return def;

  const o = v as Record<string, unknown>;
  return {
    inputDeviceId: typeof o.inputDeviceId === "string" ? o.inputDeviceId : def.inputDeviceId,
    outputDeviceId: typeof o.outputDeviceId === "string" ? o.outputDeviceId : def.outputDeviceId,
    micVolume: typeof o.micVolume === "number" ? clamp01x100(o.micVolume) : def.micVolume,
    outputVolume: typeof o.outputVolume === "number" ? clamp01x100(o.outputVolume) : def.outputVolume,
    inputProcessingProfile: isProcProfile(o.inputProcessingProfile) ? o.inputProcessingProfile : def.inputProcessingProfile,
    inputMode: isInputMode(o.inputMode) ? o.inputMode : def.inputMode,
    vadThreshold: typeof o.vadThreshold === "number" ? clamp01x100(o.vadThreshold) : def.vadThreshold,
    pttHotkey: typeof o.pttHotkey === "string" ? o.pttHotkey : def.pttHotkey,
    allowVideoInAnon: typeof o.allowVideoInAnon === "boolean" ? o.allowVideoInAnon : def.allowVideoInAnon,
    highPriorityPackets: typeof o.highPriorityPackets === "boolean" ? o.highPriorityPackets : def.highPriorityPackets,
    ducking: isDucking(o.ducking) ? o.ducking : def.ducking,
  };
}

export function writeVoiceVideoSettings(profile: PrivacyProfile, s: VoiceVideoSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lsKey(profile), JSON.stringify(s));
  } catch {
    // fail-silent
  }
}

/**
 * Хук: настройки хранятся локально и отдельно для каждого PrivacyProfile.
 */
export function useVoiceVideoSettings(
  profile: PrivacyProfile,
): [VoiceVideoSettings, (patch: Partial<VoiceVideoSettings>) => void, () => void] {
  const [s, setS] = useState<VoiceVideoSettings>(() => readVoiceVideoSettings(profile));

  useEffect(() => {
    setS(readVoiceVideoSettings(profile));
  }, [profile]);

  useEffect(() => {
    writeVoiceVideoSettings(profile, s);
  }, [profile, s]);

  const patch = (p: Partial<VoiceVideoSettings>) => {
    setS((prev) => ({ ...prev, ...p }));
  };

  const reset = () => setS(getDefaultVoiceVideoSettings(profile));

  return useMemo(() => [s, patch, reset] as const, [s]);
}
