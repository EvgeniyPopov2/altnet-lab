import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type MicInputMode = "vad" | "ptt";

export type MicTestConstraints = {
  echoCancellation: boolean;
  autoGainControl: boolean;
  noiseSuppression: boolean;
};

export type MicTestOptions = {
  active: boolean;

  inputDeviceId: string;
  outputDeviceId: string;

  /** 0..100 */
  micVolumePct: number;
  /** 0..100 */
  outputVolumePct: number;

  inputMode: MicInputMode;
  /** 0..100 */
  vadThresholdPct: number;

  /** например: "Ctrl+Shift+V" или "Не назначено" */
  pttHotkey: string;

  /**
   * Локальный монитор ("прослушать себя").
   * Важно: используйте наушники, иначе получите фидбек.
   */
  monitor: boolean;

  /**
   * Audio element ref для вывода (чтобы можно было setSinkId).
   * Передаём ref (а не элемент), чтобы он успевал инициализироваться до эффекта.
   */
  audioElRef: { current: HTMLAudioElement | null };

  constraints: MicTestConstraints;
};

export type MicTestState = {
  running: boolean;
  error: string | null;
  level: number; // 0..1
  rms: number; // 0..1
  clipped: boolean;
  speaking: boolean;
  pttDown: boolean;
  thresholdRms: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * Маппим UI‑ползунок (0..100) в RMS‑порог примерно разумного диапазона.
 * Линейно — слишком грубо (35% превращается в 0.35 RMS, что слишком высоко).
 * Экспоненциальная шкала даёт “Discord‑like” ощущение.
 */
function vadPctToRms(pct: number): number {
  const t = clamp(pct, 0, 100) / 100;
  const min = 0.005; // очень чувствительно
  const max = 0.2;   // почти “кричать”
  return min * Math.pow(max / min, t);
}

type ParsedHotkey = {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string | null;
};

function normalizeKey(k: string): string {
  if (!k) return "";
  if (k === " ") return "Space";
  if (k.length === 1) return k.toUpperCase();
  return k;
}

function parseHotkey(hk: string): ParsedHotkey {
  const clean = (hk || "").trim();
  if (!clean || clean === "Не назначено") {
    return { ctrl: false, alt: false, shift: false, meta: false, key: null };
  }

  const parts = clean.split("+").map((x) => x.trim()).filter(Boolean);
  let key: string | null = null;
  const parsed = { ctrl: false, alt: false, shift: false, meta: false, key } as ParsedHotkey;

  for (const p of parts) {
    const up = p.toLowerCase();
    if (up === "ctrl" || up === "control") parsed.ctrl = true;
    else if (up === "alt") parsed.alt = true;
    else if (up === "shift") parsed.shift = true;
    else if (up === "meta" || up === "cmd" || up === "win") parsed.meta = true;
    else key = p;
  }

  parsed.key = key ? normalizeKey(key) : null;
  return parsed;
}

function matchesHotkey(parsed: ParsedHotkey, e: KeyboardEvent): boolean {
  if (!parsed.key) return false;

  if (parsed.ctrl !== !!e.ctrlKey) return false;
  if (parsed.alt !== !!e.altKey) return false;
  if (parsed.shift !== !!e.shiftKey) return false;
  if (parsed.meta !== !!e.metaKey) return false;

  const ek = normalizeKey(e.key);
  if (!ek) return false;

  // Игнорируем “модификаторы без клавиши”
  if (ek === "Control" || ek === "Shift" || ek === "Alt" || ek === "Meta") return false;

  return ek === parsed.key;
}

function supportsSetSinkId(el: HTMLMediaElement): el is HTMLMediaElement & { setSinkId: (id: string) => Promise<void> } {
  return typeof (el as any).setSinkId === "function";
}

export function useMicTest(opts: MicTestOptions): MicTestState {
  const [state, setState] = useState<MicTestState>(() => ({
    running: false,
    error: null,
    level: 0,
    rms: 0,
    clipped: false,
    speaking: false,
    pttDown: false,
    thresholdRms: vadPctToRms(opts.vadThresholdPct),
  }));

  const optsRef = useRef(opts);
  optsRef.current = opts;

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const analyserRef = useRef<AnalyserNode | null>(null);
  // Явно используем ArrayBuffer, чтобы совпасть с типами DOM (getByteTimeDomainData).
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const micGainRef = useRef<GainNode | null>(null);
  const gateGainRef = useRef<GainNode | null>(null);

  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const pttDownRef = useRef(false);

  const parsedHotkey = useMemo(() => parseHotkey(opts.pttHotkey), [opts.pttHotkey]);
  const parsedHotkeyRef = useRef(parsedHotkey);
  parsedHotkeyRef.current = parsedHotkey;

  const stop = useCallback(() => {
    pttDownRef.current = false;

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // остановить поток
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }

    // закрыть аудио контекст
    if (ctxRef.current) {
      void ctxRef.current.close();
      ctxRef.current = null;
    }

    analyserRef.current = null;
    dataRef.current = null;
    micGainRef.current = null;
    gateGainRef.current = null;
    destRef.current = null;

    const el = optsRef.current.audioElRef.current;
    if (el) {
      try {
        el.pause();
      } catch {
        // ignore
      }
      try {
        (el as any).srcObject = null;
      } catch {
        // ignore
      }
    }

    setState((prev) => ({
      ...prev,
      running: false,
      level: 0,
      rms: 0,
      clipped: false,
      speaking: false,
      pttDown: false,
      error: null,
    }));
  }, []);

  const applySinkAndVolume = useCallback(async () => {
    const { audioElRef, outputDeviceId, outputVolumePct } = optsRef.current;
    const audioEl = audioElRef.current;
    if (!audioEl) return;

    try {
      audioEl.volume = clamp(outputVolumePct / 100, 0, 1);
    } catch {
      // ignore
    }

    // setSinkId поддерживается не во всех браузерах.
    // Если не поддерживается — просто игнорируем.
    if (supportsSetSinkId(audioEl) && outputDeviceId && outputDeviceId !== "default") {
      try {
        await audioEl.setSinkId(outputDeviceId);
      } catch {
        // ignore: браузер может запретить без https/perm
      }
    }
  }, []);

  const start = useCallback(async () => {
    if (!isBrowser()) return;

    stop();

    const { inputDeviceId, micVolumePct, monitor, constraints, audioElRef } = optsRef.current;
    const audioEl = audioElRef.current;

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      setState((prev) => ({
        ...prev,
        running: false,
        error: "navigator.mediaDevices.getUserMedia недоступен в этом окружении.",
      }));
      return;
    }

    try {
      const track: MediaTrackConstraints = {
        echoCancellation: constraints.echoCancellation,
        autoGainControl: constraints.autoGainControl,
        noiseSuppression: constraints.noiseSuppression,
      };

      if (inputDeviceId && inputDeviceId !== "default") {
        track.deviceId = { exact: inputDeviceId };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: track,
        video: false,
      });

      streamRef.current = stream;

      const CtxCtor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (!CtxCtor) {
        throw new Error("AudioContext недоступен в этом браузере.");
      }

      const ctx = new CtxCtor({ latencyHint: "interactive" });
      ctxRef.current = ctx;

      const src = ctx.createMediaStreamSource(stream);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.2;

      const micGain = ctx.createGain();
      micGain.gain.value = clamp(micVolumePct / 100, 0, 1);

      const gateGain = ctx.createGain();
      gateGain.gain.value = 1;

      // source -> analyser (для метра)
      src.connect(analyser);

      // source -> micGain -> gateGain -> (monitor dest)
      src.connect(micGain);
      micGain.connect(gateGain);

      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));

      micGainRef.current = micGain;
      gateGainRef.current = gateGain;

      if (monitor && audioEl) {
        const dest = ctx.createMediaStreamDestination();
        destRef.current = dest;

        gateGain.connect(dest);

        // srcObject может быть “не типизирован” в некоторых ts/dom версиях
        (audioEl as any).srcObject = dest.stream;
        audioEl.loop = true;
        audioEl.muted = false;

        await applySinkAndVolume();

        try {
          await audioEl.play();
        } catch {
          // autoplay policy: если браузер не дал play — это не критично, метр всё равно работает
        }
      }

      setState((prev) => ({
        ...prev,
        running: true,
        error: null,
        thresholdRms: vadPctToRms(optsRef.current.vadThresholdPct),
      }));

      const tick = () => {
        const analyserNode = analyserRef.current;
        const buf = dataRef.current;
        if (!analyserNode || !buf) return;

        analyserNode.getByteTimeDomainData(buf);

        let sum = 0;
        let clipped = false;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128; // -1..1
          sum += v * v;
          if (!clipped && Math.abs(v) > 0.98) clipped = true;
        }
        const rms = Math.sqrt(sum / buf.length);

        // Немного "поднимаем" визуальный уровень, чтобы шкала была живее.
        const level = clamp(rms * 3.2, 0, 1);

        const thresholdRms = vadPctToRms(optsRef.current.vadThresholdPct);
        const speaking = rms >= thresholdRms;

        const mode = optsRef.current.inputMode;
        const pttDown = pttDownRef.current;

        // gate для PTT (в VAD сейчас не "режем" монитор, только индикатор)
        if (gateGainRef.current) {
          gateGainRef.current.gain.value = mode === "ptt" ? (pttDown ? 1 : 0) : 1;
        }

        setState((prev) => {
          // небольшая защита от лишних перерисовок
          const next: MicTestState = {
            running: true,
            error: null,
            level,
            rms,
            clipped,
            speaking,
            pttDown,
            thresholdRms,
          };

          const same =
            Math.abs(prev.level - next.level) < 0.01 &&
            Math.abs(prev.rms - next.rms) < 0.01 &&
            prev.clipped === next.clipped &&
            prev.speaking === next.speaking &&
            prev.pttDown === next.pttDown &&
            Math.abs(prev.thresholdRms - next.thresholdRms) < 0.001 &&
            prev.error === next.error &&
            prev.running === next.running;

          return same ? prev : next;
        });

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      stop();
      setState((prev) => ({
        ...prev,
        running: false,
        error: msg,
      }));
    }
  }, [applySinkAndVolume, stop]);

  // Старт/рестарт при смене ключевых параметров
  useEffect(() => {
    if (!opts.active) {
      stop();
      return;
    }

    // запустим; stop() внутри start() уже есть
    void start();

    return () => {
      stop();
    };
    // Важно: mic/output volume не включаем в deps (это обновляется без рестарта)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.active, opts.inputDeviceId, opts.monitor, opts.constraints.echoCancellation, opts.constraints.autoGainControl, opts.constraints.noiseSuppression]);

  // Обновление мик-усиления без рестарта
  useEffect(() => {
    const node = micGainRef.current;
    if (!node) return;
    node.gain.value = clamp(opts.micVolumePct / 100, 0, 1);
  }, [opts.micVolumePct]);

  // Обновление output volume + sink без рестарта
  useEffect(() => {
    if (!opts.active) return;
    void applySinkAndVolume();
  }, [opts.active, opts.outputDeviceId, opts.outputVolumePct, applySinkAndVolume]);

  // PTT key listeners
  useEffect(() => {
    if (!opts.active) {
      pttDownRef.current = false;
      setState((prev) => ({ ...prev, pttDown: false }));
      return;
    }

    if (opts.inputMode !== "ptt") {
      pttDownRef.current = false;
      setState((prev) => ({ ...prev, pttDown: false }));
      return;
    }

    const onDown = (e: KeyboardEvent) => {
      const parsed = parsedHotkeyRef.current;
      if (!matchesHotkey(parsed, e)) return;

      // Нельзя preventDefault глобально на все — только на наши совпадения.
      e.preventDefault();
      e.stopPropagation();
      pttDownRef.current = true;
      setState((prev) => ({ ...prev, pttDown: true }));
    };

    const onUp = (e: KeyboardEvent) => {
      const parsed = parsedHotkeyRef.current;
      if (!matchesHotkey(parsed, e)) return;
      e.preventDefault();
      e.stopPropagation();
      pttDownRef.current = false;
      setState((prev) => ({ ...prev, pttDown: false }));
    };

    const onBlur = () => {
      pttDownRef.current = false;
      setState((prev) => ({ ...prev, pttDown: false }));
    };

    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [opts.active, opts.inputMode, parsedHotkey]);

  // VAD threshold пересчитываем сразу
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      thresholdRms: vadPctToRms(opts.vadThresholdPct),
    }));
  }, [opts.vadThresholdPct]);

  return state;
}
