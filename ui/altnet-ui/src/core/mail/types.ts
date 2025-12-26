// ui/altnet-ui/src/core/mail/types.ts
// Типы почты (MVP). Пока это локальная имитация inbox/sent/drafts.

export type MailFolder = "inbox" | "sent" | "drafts";

export type MailDelivery = "queued" | "sent" | "delivered" | "failed";

export type MailAttachment = {
  cid: string;
  name: string;
  mime: string;
  size: number;
};

export type MailMessage = {
  id: string;
  folder: MailFolder;

  createdAt: number;
  updatedAt: number;

  from: string;
  to: string[];
  subject: string;
  body: string;

  /** undefined = не прочитано */
  readAt?: number;

  /** Вложения как CID (в будущем: загружаются по требованию). */
  attachments?: MailAttachment[];

  /** Для исходящих (sent) — локальный мок доставки. */
  delivery?: MailDelivery;
};

export type MailStoreV1 = {
  version: 1;
  messages: MailMessage[];
};
