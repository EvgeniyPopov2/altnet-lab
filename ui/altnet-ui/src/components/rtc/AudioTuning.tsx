import { useEffect, useMemo, useState } from "react";
import type { PrivacyProfile } from "../../core/policy/types";
import type { RtcAudioConfig } from "../../core/rtc/audio";
import { getDefaultRtcAudioConfig, presetLongTitle, presetTitle } from "../../core/rtc/audio";

type Props = {
  profile: PrivacyProfile;
  cfg: RtcAudioConfig;
  patch: (p: Partial<RtcAudioConfig>) => void;
  reset: () => void;
};

function profileTitle(p: PrivacyProfile): string {
  return p === "anon" ? "Анонимный" : "Приватный быстрый";
}

export function AudioTuning({ profile, cfg, patch, reset }: Props) {
  // Мок тест-уровня микрофона, чтобы UI выглядел живым без запроса разрешений.
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!testing) return;
    const i = window.setInterval(() => {
      // 0..1
      setLevel((Math.random() * 0.85 + 0.05) % 1);
    }, 180);
    return () => window.clearInterval(i);
  }, [testing]);

  const summary = useMemo(() => {
    const parts: string[] = [`NS: ${presetTitle(cfg.preset)}`];
    if (cfg.aec) parts.push("AEC");
    if (cfg.agc) parts.push("AGC");
    if (cfg.dtx) parts.push("DTX");
    return parts.join(" • ");
  }, [cfg]);

  const defaults = useMemo(() => getDefaultRtcAudioConfig(profile), [profile]);

  return (
    <details className="rounded-xl border border-white/10 bg-white/5 p-3">
      <summary className="cursor-pointer text-sm text-white/80 select-none">
        Звук и шумоподавление{" "}
        <span className="ml-1 text-xs text-white/50">({summary})</span>
      </summary>

      <div className="mt-3 space-y-4">
        <div className="grid gap-1">
          <div className="text-xs text-white/60">Шумоподавление</div>
          <select
            className="rounded-lg border border-white/10 bg-neutral-900/60 px-3 py-2 text-sm text-white/90 outline-none focus:border-white/20"
            value={cfg.preset}
            onChange={(e) => patch({ preset: e.target.value as RtcAudioConfig["preset"] })}
          >
            <option value="off">Выкл</option>
            <option value="balanced">Сбалансированное</option>
            <option value="strong">Сильное</option>
            <option value="music">Музыка</option>
          </select>
          <div className="text-[11px] text-white/50">
            MVP: пока это UI‑мок. Позже сопоставим с WebRTC constraints и AudioWorklet/WASM (RNNoise).
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-white/80">
            <input
              type="checkbox"
              checked={cfg.aec}
              onChange={(e) => patch({ aec: e.target.checked })}
            />
            Подавление эха (AEC)
          </label>

          <label className="inline-flex items-center gap-2 text-xs text-white/80">
            <input
              type="checkbox"
              checked={cfg.agc}
              onChange={(e) => patch({ agc: e.target.checked })}
            />
            Автогромкость (AGC)
          </label>

          <label className="inline-flex items-center gap-2 text-xs text-white/80">
            <input
              type="checkbox"
              checked={cfg.dtx}
              onChange={(e) => patch({ dtx: e.target.checked })}
            />
            DTX (экономия при тишине)
          </label>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-white/80">Тест микрофона (мок)</div>

            <button
              type="button"
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
              onClick={() => setTesting((v) => !v)}
            >
              {testing ? "Стоп" : "Старт"}
            </button>
          </div>

          <div className="mt-2 h-2 rounded bg-white/10 overflow-hidden">
            <div
              className="h-2 bg-emerald-500/40"
              style={{ width: `${Math.round(level * 100)}%` }}
            />
          </div>

          <div className="mt-1 text-[11px] text-white/50">
            В реале здесь будет уровень, клиппинг и “прослушать себя” (локальный монитор ≤ 50 мс).
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] text-white/50">
            Профиль: <span className="text-white/70">{profileTitle(profile)}</span>. Рекомендации:{" "}
            <span className="text-white/70">{presetLongTitle(defaults.preset)}</span>
            {defaults.dtx ? " • DTX" : ""}.
          </div>

          <button
            type="button"
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
            onClick={reset}
            title="Сбросить на рекомендованные значения для текущего профиля"
          >
            Сбросить
          </button>
        </div>
      </div>
    </details>
  );
}
