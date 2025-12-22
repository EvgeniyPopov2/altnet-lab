import { useEffect, useState } from "react";
import { getOrCreateDeviceId, nextDeviceSeq } from "../identity/device";

export type DeviceTrust = "trusted" | "untrusted" | "revoked";

export type SecurityDevice = {
  id: string;
  label: string;
  trust: DeviceTrust;
  createdAt: number;
  lastSeenAt: number;
  note?: string;
};

export type SecurityCenterState = {
  currentDeviceId: string;
  devices: SecurityDevice[];
  // Счётчик "эпохи" ключей/сессий — увеличиваем при ротации (мок).
  rotationEpoch: number;
  lastRotationAt?: number;
};

const LS_KEY = "altnet.security.center.v1";
const EVT_KEY = "altnet:security-center";

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function makeId(prefix = "dev"): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${uuid}`;
}

function now(): number {
  return Date.now();
}

function defaultDevices(currentId: string): SecurityDevice[] {
  const t = now();

  const mk = (label: string, trust: DeviceTrust): SecurityDevice => ({
    id: makeId("dev"),
    label,
    trust,
    createdAt: t - Math.floor(Math.random() * 7 * 24 * 3600_000),
    lastSeenAt: t - Math.floor(Math.random() * 4 * 3600_000),
  });

  return [
    {
      id: currentId,
      label: "Это устройство",
      trust: "trusted",
      createdAt: t - 12 * 3600_000,
      lastSeenAt: t,
      note: "Текущее",
    },
    mk("Ноутбук", "trusted"),
    mk("Телефон", "untrusted"),
    mk("Неизвестное устройство", "untrusted"),
  ];
}

function normalizeState(input: SecurityCenterState): SecurityCenterState {
  const currentId = input.currentDeviceId || getOrCreateDeviceId();
  const devices = Array.isArray(input.devices) ? input.devices : [];

  const hasCurrent = devices.some((d) => d.id === currentId);
  const normalized: SecurityCenterState = {
    currentDeviceId: currentId,
    rotationEpoch: Number.isFinite(input.rotationEpoch) ? input.rotationEpoch : 0,
    lastRotationAt: input.lastRotationAt,
    devices: hasCurrent
      ? devices
      : [
          {
            id: currentId,
            label: "Это устройство",
            trust: "trusted",
            createdAt: now(),
            lastSeenAt: now(),
            note: "Текущее",
          },
          ...devices,
        ],
  };

  return normalized;
}

export function getSecurityCenterState(): SecurityCenterState {
  if (typeof window === "undefined") {
    const currentId = getOrCreateDeviceId();
    return { currentDeviceId: currentId, devices: defaultDevices(currentId), rotationEpoch: 0 };
  }

  const raw = window.localStorage.getItem(LS_KEY);
  const parsed = safeParse<SecurityCenterState>(raw);

  if (!parsed) {
    const currentId = getOrCreateDeviceId();
    const init: SecurityCenterState = { currentDeviceId: currentId, devices: defaultDevices(currentId), rotationEpoch: 0 };
    setSecurityCenterState(init);
    return init;
  }

  return normalizeState(parsed);
}

export function setSecurityCenterState(next: SecurityCenterState): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeState(next);

  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(normalized));
  } catch {
    // fail-silent: безопасность не должна ломать UI
  }

  window.dispatchEvent(new CustomEvent(EVT_KEY, { detail: normalized }));
}

export function onSecurityCenterChange(cb: (s: SecurityCenterState) => void): () => void {
  const handler = (ev: Event) => {
    const ce = ev as CustomEvent<SecurityCenterState>;
    const s = ce.detail;
    if (s) cb(s);
  };

  window.addEventListener(EVT_KEY, handler as EventListener);
  return () => window.removeEventListener(EVT_KEY, handler as EventListener);
}

export function useSecurityCenterState(): [SecurityCenterState, (s: SecurityCenterState) => void] {
  const [state, setState] = useState<SecurityCenterState>(() => getSecurityCenterState());

  useEffect(() => onSecurityCenterChange(setState), []);

  return [state, setSecurityCenterState];
}

export function touchCurrentDevice(): SecurityCenterState {
  const cur = getSecurityCenterState();
  const t = now();
  const next: SecurityCenterState = {
    ...cur,
    devices: cur.devices.map((d) => (d.id === cur.currentDeviceId ? { ...d, lastSeenAt: t } : d)),
  };
  setSecurityCenterState(next);
  return next;
}

export function setDeviceTrust(deviceId: string, trust: DeviceTrust): SecurityCenterState {
  const cur = getSecurityCenterState();
  const next: SecurityCenterState = {
    ...cur,
    devices: cur.devices.map((d) => {
      if (d.id !== deviceId) return d;
      // Текущее устройство нельзя пометить как "revoked" через UI.
      if (d.id === cur.currentDeviceId && trust === "revoked") return d;
      return { ...d, trust };
    }),
  };
  setSecurityCenterState(next);
  return next;
}

export function revokeDevice(deviceId: string): SecurityCenterState {
  return setDeviceTrust(deviceId, "revoked");
}

export function renameDevice(deviceId: string, label: string): SecurityCenterState {
  const cur = getSecurityCenterState();
  const next: SecurityCenterState = {
    ...cur,
    devices: cur.devices.map((d) => (d.id === deviceId ? { ...d, label } : d)),
  };
  setSecurityCenterState(next);
  return next;
}

export function rotateKeysAndSessions(): SecurityCenterState {
  const cur = getSecurityCenterState();
  const next: SecurityCenterState = {
    ...cur,
    rotationEpoch: (cur.rotationEpoch ?? 0) + 1,
    lastRotationAt: now(),
  };
  setSecurityCenterState(next);
  return next;
}

// dev-only: добавить "новое" устройство для демонстрации доверия/отзыва
export function addMockDevice(trust: DeviceTrust = "untrusted"): SecurityCenterState {
  const cur = getSecurityCenterState();
  const t = now();
  const seq = nextDeviceSeq();

  const device: SecurityDevice = {
    id: makeId("dev"),
    label: `Устройство #${seq}`,
    trust,
    createdAt: t,
    lastSeenAt: t,
    note: trust === "untrusted" ? "Новое" : undefined,
  };

  const next: SecurityCenterState = {
    ...cur,
    devices: [device, ...cur.devices],
  };
  setSecurityCenterState(next);
  return next;
}
