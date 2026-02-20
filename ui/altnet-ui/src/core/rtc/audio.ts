import { useEffect, useState } from "react";
import type { PrivacyProfile } from "../policy/types";

export type DenoisePreset = "off" | "balanced" | "strong" | "music";

export type RtcAudioConfig = {
  /**
   * Пресет шумоподавления (UI-мок).
   * В будущем: будет мапиться на AudioWorklet/WASM (RNNoise/NS) + параметры AEC/AGC.
   */
  preset: DenoisePreset;
  /**
   * Acoustic Echo Cancellation (подавление эха)
   */
  aec: boolean;
  /**
   * Automatic Gain Control (автогромкость)
   */
  agc: boolean;
  /**
   * Discontinuous Transmission (DTX) — экономия полосы/батареи при тишине.
   * В MVP это только переключатель/бейдж, реальная интеграция — позже.
   */
  dtx: boolean;
};

const LS_PREFIX = "altnet.rtc.audio.v1";

function lsKey(profile: PrivacyProfile): string {
  return `${LS_PREFIX}.${profile}`;
}

function safeParseJson(raw: string | null): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isPreset(v: unknown): v is DenoisePreset {
  return v === "off" || v === "balanced" || v === "strong" || v === "music";
}

export function getDefaultRtcAudioConfig(profile: PrivacyProfile): RtcAudioConfig {
  // Дефолты из доктрины голоса (v1)
  if (profile === "anon") {
    return {
      preset: "balanced",
      aec: true,
      agc: true,
      dtx: true, // в anon больше устойчивости/экономии
    };
  }

  // fast
  return {
    preset: "balanced",
    aec: true,
    agc: true,
    dtx: false,
  };
}

export function readRtcAudioConfig(profile: PrivacyProfile): RtcAudioConfig {
  const def = getDefaultRtcAudioConfig(profile);
  if (typeof window === "undefined") return def;

  const v = safeParseJson(window.localStorage.getItem(lsKey(profile)));
  if (!v || typeof v !== "object") return def;

  const o = v as Record<string, unknown>;
  return {
    preset: isPreset(o.preset) ? o.preset : def.preset,
    aec: typeof o.aec === "boolean" ? o.aec : def.aec,
    agc: typeof o.agc === "boolean" ? o.agc : def.agc,
    dtx: typeof o.dtx === "boolean" ? o.dtx : def.dtx,
  };
}

export function writeRtcAudioConfig(profile: PrivacyProfile, cfg: RtcAudioConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lsKey(profile), JSON.stringify(cfg));
  } catch {
    // fail-silent: quota/disabled storage не должны ломать UI
  }
}

export function presetTitle(p: DenoisePreset): string {
  switch (p) {
    case "off":
      return "Выкл";
    case "balanced":
      return "Сбаланс.";
    case "strong":
      return "Сильное";
    case "music":
      return "Музыка";
  }
}

export function presetLongTitle(p: DenoisePreset): string {
  switch (p) {
    case "off":
      return "Выкл";
    case "balanced":
      return "Сбалансированное";
    case "strong":
      return "Сильное";
    case "music":
      return "Музыка";
  }
}

/**
 * Хук: конфиг хранится локально и отдельно для каждого PrivacyProfile.
 */
export function useRtcAudioConfig(
  profile: PrivacyProfile,
): [RtcAudioConfig, (patch: Partial<RtcAudioConfig>) => void, () => void] {
  const [cfg, setCfg] = useState<RtcAudioConfig>(() => readRtcAudioConfig(profile));

  // при смене профиля — подхватить профильный конфиг
  useEffect(() => {
    setCfg(readRtcAudioConfig(profile));
  }, [profile]);

  // persist
  useEffect(() => {
    writeRtcAudioConfig(profile, cfg);
  }, [profile, cfg]);

  const patch = (p: Partial<RtcAudioConfig>) => {
    setCfg((prev) => ({ ...prev, ...p }));
  };

  const reset = () => setCfg(getDefaultRtcAudioConfig(profile));

  return [cfg, patch, reset];
}
