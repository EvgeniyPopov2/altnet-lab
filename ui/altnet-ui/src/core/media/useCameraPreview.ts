import { useCallback, useEffect, useRef, useState } from "react";

export type CameraPreviewOptions = {
  active: boolean;
  deviceId: string;
  /**
   * Видео-элемент, в который будет подключён stream через srcObject.
   * Важно: элемент должен существовать в DOM, когда active=true.
   */
  videoElRef: { current: HTMLVideoElement | null };
};

export type CameraPreviewState = {
  running: boolean;
  error: string | null;
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function useCameraPreview(opts: CameraPreviewOptions): CameraPreviewState {
  const [state, setState] = useState<CameraPreviewState>(() => ({
    running: false,
    error: null,
  }));

  const optsRef = useRef(opts);
  optsRef.current = opts;

  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      for (const t of stream.getTracks()) {
        try {
          t.stop();
        } catch {
          // ignore
        }
      }
      streamRef.current = null;
    }

    const videoEl = optsRef.current.videoElRef.current;
    if (videoEl) {
      try {
        videoEl.pause();
      } catch {
        // ignore
      }
      try {
        (videoEl as any).srcObject = null;
      } catch {
        // ignore
      }
    }

    setState((prev) => {
      if (!prev.running && prev.error === null) return prev;
      return { running: false, error: null };
    });
  }, []);

  const start = useCallback(async () => {
    if (!isBrowser()) return;

    stop();

    const { deviceId, videoElRef } = optsRef.current;

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      setState({
        running: false,
        error: "navigator.mediaDevices.getUserMedia недоступен в этом окружении.",
      });
      return;
    }

    try {
      const track: MediaTrackConstraints = {};
      if (deviceId && deviceId !== "default") {
        track.deviceId = { exact: deviceId };
      }

      // Локально, без сети: только видео-трек.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: track,
        audio: false,
      });

      streamRef.current = stream;

      const videoEl = videoElRef.current;
      if (videoEl) {
        (videoEl as any).srcObject = stream;
        videoEl.muted = true;
        videoEl.autoplay = true;
        (videoEl as any).playsInline = true;

        try {
          await videoEl.play();
        } catch {
          // autoplay policy: не критично — после взаимодействия пойдёт
        }
      }

      setState({ running: true, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      stop();
      setState({ running: false, error: msg });
    }
  }, [stop]);

  useEffect(() => {
    if (!opts.active) {
      stop();
      return;
    }

    void start();
    return () => stop();

    // deviceId важен: при смене камеры рестартим preview
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.active, opts.deviceId]);

  return state;
}
