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

export type DmMessage = {
  id: string; // уникально (deviceId:seq)
  createdAt: number; // unix ms
  author: DmAuthor;
  text: string;
  attachments?: DmAttachment[];
};

export type DmJournalV1 = {
  version: 1;
  dmId: string;
  entries: DmMessage[];
};
