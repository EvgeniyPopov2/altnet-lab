// ui/altnet-ui/src/core/dm/types.ts
// Типы DM для MVP (локальный CRDT-журнал).

import type { CID } from "../content/cid";

export type DmAttachment = {
  cid: CID;
  name: string;
  mime: string;
  size: number;
};

export type DmAuthor = "me" | "them";

// emoji -> список actorId, кто поставил реакцию.
// Храним как set (через массив) для простого union-merge.
export type DmReactions = Record<string, string[]>;

export type DmMessage = {
  id: string; // уникально (deviceId:seq)
  createdAt: number; // unix ms
  // Последнее изменение сообщения/метаданных (реакции/удаление/доставка).
  // Для CRDT-мока используем как LWW-маркер (по времени).
  updatedAt?: number;
  author: DmAuthor;
  text: string;

  // Ответ на сообщение (id).
  replyTo?: string;

  // Реакции на сообщение.
  reactions?: DmReactions;

  // Статус доставки (мок UI).
  delivery?: "sent" | "delivered" | "read";

  // Tombstone: если выставлено — сообщение считается удалённым.
  deletedAt?: number;
  attachments?: DmAttachment[];
};

export type DmJournalV1 = {
  version: 1;
  dmId: string;
  entries: DmMessage[];
};
