import { useCallback, useEffect, useMemo, useState } from "react";

export type DeviceOption = {
  id: string;
  label: string;
};

export type MediaDevicesSnapshot = {
  supported: boolean;
  loading: boolean;
  error: string | null;
  audioInputs: DeviceOption[];
  audioOutputs: DeviceOption[];
  videoInputs: DeviceOption[];
  /**
   * Истина, если браузер уже раскрывает label устройств (обычно после getUserMedia).
   * Это нужно, чтобы в UI показать подсказку "названия появятся после разрешения".
   */
  hasRealLabels: boolean;
  refresh: () => Promise<void>;
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function withDefaultOption(items: DeviceOption[], label: string): DeviceOption[] {
  const hasDefault = items.some((x) => x.id === "default");
  if (hasDefault) return items;
  return [{ id: "default", label }, ...items];
}

function kindTitle(kind: MediaDeviceKind): string {
  switch (kind) {
    case "audioinput":
      return "Микрофон";
    case "audiooutput":
      return "Динамики";
    case "videoinput":
      return "Камера";
    default:
      return "Устройство";
  }
}

function deviceLabel(d: MediaDeviceInfo, index: number): string {
  if (d.label && d.label.trim().length > 0) return d.label;
  return `${kindTitle(d.kind)} ${index + 1}`;
}

export function useMediaDevices(enabled = true): MediaDevicesSnapshot {
  const supported = isBrowser() && !!navigator.mediaDevices?.enumerateDevices;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<MediaDeviceInfo[]>([]);

  const refresh = useCallback(async () => {
    if (!supported) {
      setRaw([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setRaw(devices);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setRaw([]);
    } finally {
      setLoading(false);
    }
  }, [supported]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    if (!supported) return;

    const handler = () => {
      void refresh();
    };

    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handler);
  }, [enabled, refresh, supported]);

  const audioInputs = useMemo(() => {
    const items = raw.filter((d) => d.kind === "audioinput").map((d, idx) => ({ id: d.deviceId, label: deviceLabel(d, idx) }));
    return withDefaultOption(items, "Микрофон (по умолчанию)");
  }, [raw]);

  const audioOutputs = useMemo(() => {
    const items = raw.filter((d) => d.kind === "audiooutput").map((d, idx) => ({ id: d.deviceId, label: deviceLabel(d, idx) }));
    return withDefaultOption(items, "Динамики (по умолчанию)");
  }, [raw]);

  const videoInputs = useMemo(() => {
    const items = raw.filter((d) => d.kind === "videoinput").map((d, idx) => ({ id: d.deviceId, label: deviceLabel(d, idx) }));
    return withDefaultOption(items, "Камера (по умолчанию)");
  }, [raw]);

  const hasRealLabels = useMemo(() => raw.some((d) => !!d.label && d.label.trim().length > 0), [raw]);

  return {
    supported,
    loading,
    error,
    audioInputs,
    audioOutputs,
    videoInputs,
    hasRealLabels,
    refresh,
  };
}
