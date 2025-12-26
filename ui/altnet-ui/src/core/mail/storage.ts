// ui/altnet-ui/src/core/mail/storage.ts
// Хранилище почты в localStorage (MVP).

import type { MailMessage, MailStoreV1 } from "./types";

function getLS(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const LS_KEY = "altnet.mail.store.v1";

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isMailMessage(v: unknown): v is MailMessage {
  if (!v || typeof v !== "object") return false;
  const o = v as Partial<MailMessage>;
  if (typeof o.id !== "string" || !o.id) return false;
  if (o.folder !== "inbox" && o.folder !== "sent" && o.folder !== "drafts") return false;
  if (typeof o.createdAt !== "number" || !Number.isFinite(o.createdAt)) return false;
  if (typeof o.updatedAt !== "number" || !Number.isFinite(o.updatedAt)) return false;
  if (typeof o.from !== "string") return false;
  if (!isStringArray(o.to)) return false;
  if (typeof o.subject !== "string") return false;
  if (typeof o.body !== "string") return false;
  if (typeof o.readAt !== "undefined" && (typeof o.readAt !== "number" || !Number.isFinite(o.readAt))) return false;
  return true;
}

function parseStore(raw: string): MailStoreV1 | null {
  try {
    const parsed = JSON.parse(raw) as Partial<MailStoreV1>;
    if (parsed.version !== 1) return null;
    if (!Array.isArray(parsed.messages)) return null;
    const messages = parsed.messages.filter(isMailMessage);
    return { version: 1, messages };
  } catch {
    return null;
  }
}

export function seedMailStore(now = Date.now()): MailStoreV1 {
  const t = now;
  return {
    version: 1,
    messages: [
      {
        id: "in-1",
        folder: "inbox",
        createdAt: t - 1000 * 60 * 60 * 6,
        updatedAt: t - 1000 * 60 * 60 * 6,
        from: "support@altnet",
        to: ["you@local"],
        subject: "Добро пожаловать в AltNet (MVP)",
        body:
          "Это локальная имитация почты.\n\nВ дальнейшем: адрес = ключ/алиас, TTL, узлы-доставщики и E2E-полезная нагрузка.\n\nВажно: без E2E-контекста отправка должна быть заблокирована (fail-closed).",
      },
      {
        id: "in-2",
        folder: "inbox",
        createdAt: t - 1000 * 60 * 45,
        updatedAt: t - 1000 * 60 * 45,
        from: "relay@altnet",
        to: ["you@local"],
        subject: "Ваше письмо будет жить ограниченное время (TTL)",
        body:
          "В MVP это подсказка. В бою письма будут храниться на добровольных узлах-доставщиках ограниченное время.\n\nЕсли сообщение важно — закрепите/пиньте вложения (CID) локально и/или в манифесте сообщества.",
      },
      {
        id: "sent-1",
        folder: "sent",
        createdAt: t - 1000 * 60 * 10,
        updatedAt: t - 1000 * 60 * 10,
        from: "you@local",
        to: ["henk@local"],
        subject: "Тест связи",
        body: "Проверка: UI почты открывается из верхней панели.\n\nДоставка — мок; в следующем шаге добавим compose->send + вложения (CID).",
        readAt: t - 1000 * 60 * 9,
        delivery: "delivered",
      },
      {
        id: "dr-1",
        folder: "drafts",
        createdAt: t - 1000 * 60 * 2,
        updatedAt: t - 1000 * 60 * 2,
        from: "you@local",
        to: [""],
        subject: "(черновик)",
        body: "Черновик: допишу позже…",
      },
    ],
  };
}

export function loadMailStore(): MailStoreV1 | null {
  const ls = getLS();
  if (!ls) return null;
  const raw = ls.getItem(LS_KEY);
  if (!raw) return null;
  return parseStore(raw);
}

export function saveMailStore(store: MailStoreV1): void {
  const ls = getLS();
  if (!ls) return;
  ls.setItem(LS_KEY, JSON.stringify(store));
}

export function clearMailStore(): void {
  const ls = getLS();
  if (!ls) return;
  ls.removeItem(LS_KEY);
}
