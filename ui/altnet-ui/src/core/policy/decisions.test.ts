import { checkSendMessage, checkStartCall } from "./decisions";
import type { CallCheckInput, MessageCheckInput, PolicyDecision } from "./decisions";
import type { ContactCapabilities } from "./types";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function mkContact(id: string, supportsAnon: boolean, supportsFast: boolean): ContactCapabilities {
  return { contactId: id, supportsAnon, supportsFast };
}

function mkMsgInput(patch: Partial<MessageCheckInput>): MessageCheckInput {
  const base: MessageCheckInput = {
    localProfile: "fast",
    contact: mkContact("both", true, true),
    e2eReady: true,
    anonPathReady: true,
  };
  return { ...base, ...patch };
}

function mkCallInput(patch: Partial<CallCheckInput>): CallCheckInput {
  const base: CallCheckInput = {
    kind: "voice",
    localProfile: "fast",
    contact: mkContact("both", true, true),
    e2eReady: true,
    anonPathReady: true,
    hasTurnAllowList: true,
  };
  return { ...base, ...patch };
}

function assertDenied(dec: PolicyDecision, code: string): void {
  assert(dec.ok === false, `expected ok=false, got ok=true`);
  if (dec.ok) return; // type narrow guard
  assert(dec.code === code, `expected code=${code}, got code=${dec.code}`);
}

function assertOk(dec: PolicyDecision): void {
  assert(dec.ok === true, `expected ok=true, got ok=false`);
  if (!dec.ok) return; // type narrow guard
  assert(dec.esm.commonPath === true, "ok decision must have esm.commonPath=true");
}

const tests: Array<[string, () => void]> = [
  [
    "send: E2E required",
    () => {
      const dec = checkSendMessage(mkMsgInput({ e2eReady: false }));
      assertDenied(dec, "E2E_REQUIRED");
    },
  ],
  [
    "send: no common path (anon profile + contact has no anon)",
    () => {
      const dec = checkSendMessage(
        mkMsgInput({
          localProfile: "anon",
          contact: mkContact("c-no-anon", false, true),
          e2eReady: true,
          anonPathReady: true,
        })
      );
      assertDenied(dec, "NO_COMMON_PATH");
      if (!dec.ok) {
        assert(!!dec.esm, "expected esm to be present on NO_COMMON_PATH");
        assert(dec.esm?.commonPath === false, "expected esm.commonPath=false");
      }
    },
  ],
  [
    "send: anon path not ready",
    () => {
      const dec = checkSendMessage(
        mkMsgInput({
          localProfile: "anon",
          contact: mkContact("c-anon", true, true),
          e2eReady: true,
          anonPathReady: false,
        })
      );
      assertDenied(dec, "ANON_PATH_NOT_READY");
    },
  ],
  [
    "send: ok fast",
    () => {
      const dec = checkSendMessage(
        mkMsgInput({
          localProfile: "fast",
          contact: mkContact("c-fast", true, true),
          e2eReady: true,
          anonPathReady: true,
        })
      );
      assertOk(dec);
      if (dec.ok) {
        assert(dec.esm.family === "fast", "expected fast family");
        assert(dec.esm.compat === false, "expected compat=false");
      }
    },
  ],
  [
    "call: E2E required",
    () => {
      const dec = checkStartCall(mkCallInput({ e2eReady: false }));
      assertDenied(dec, "E2E_REQUIRED");
    },
  ],
  [
    "call: no common path (anon profile + contact has no anon)",
    () => {
      const dec = checkStartCall(
        mkCallInput({
          kind: "voice",
          localProfile: "anon",
          contact: mkContact("c-no-anon", false, true),
          e2eReady: true,
          anonPathReady: true,
          hasTurnAllowList: true,
        })
      );
      assertDenied(dec, "NO_COMMON_PATH");
    },
  ],
  [
    "call: anon path not ready",
    () => {
      const dec = checkStartCall(
        mkCallInput({
          kind: "voice",
          localProfile: "anon",
          contact: mkContact("c-anon", true, false),
          e2eReady: true,
          anonPathReady: false,
          hasTurnAllowList: true,
        })
      );
      assertDenied(dec, "ANON_PATH_NOT_READY");
    },
  ],
  [
    "call: TURN required in anon-family",
    () => {
      const dec = checkStartCall(
        mkCallInput({
          kind: "voice",
          localProfile: "anon",
          contact: mkContact("c-anon", true, false),
          e2eReady: true,
          anonPathReady: true,
          hasTurnAllowList: false,
        })
      );
      assertDenied(dec, "TURN_REQUIRED");
    },
  ],
  [
    "call: video blocked in anon by default",
    () => {
      const dec = checkStartCall(
        mkCallInput({
          kind: "video",
          localProfile: "anon",
          contact: mkContact("c-anon", true, false),
          e2eReady: true,
          anonPathReady: true,
          hasTurnAllowList: true,
          allowVideoInAnon: false,
        })
      );
      assertDenied(dec, "VIDEO_BLOCKED_IN_ANON");
    },
  ],
  [
    "call: ok anon voice (relay policy expected)",
    () => {
      const dec = checkStartCall(
        mkCallInput({
          kind: "voice",
          localProfile: "anon",
          contact: mkContact("c-anon", true, false),
          e2eReady: true,
          anonPathReady: true,
          hasTurnAllowList: true,
        })
      );
      assertOk(dec);
      if (dec.ok) {
        assert(dec.esm.family === "anon", "expected anon family");
        assert(!!dec.rtc, "expected rtc policy to be present");
        assert(dec.rtc?.iceTransportPolicy === "relay", "anon RTC must be relay");
      }
    },
  ],
  [
    "call: ok fast (all candidates policy expected)",
    () => {
      const dec = checkStartCall(
        mkCallInput({
          kind: "voice",
          localProfile: "fast",
          contact: mkContact("c-fast", true, true),
          e2eReady: true,
          anonPathReady: true,
          hasTurnAllowList: true,
        })
      );
      assertOk(dec);
      if (dec.ok) {
        assert(dec.esm.family === "fast", "expected fast family");
        assert(!!dec.rtc, "expected rtc policy to be present");
        assert(dec.rtc?.iceTransportPolicy === "all", "fast RTC must be all");
      }
    },
  ],
];

for (const [name, fn] of tests) {
  try {
    fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`[decisions.test] ${name}: ${msg}`);
  }
}

export {};

