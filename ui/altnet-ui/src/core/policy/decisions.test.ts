import { describe, expect, it } from "vitest";

import { checkSendMessage, checkStartCall } from "./decisions";
import type { CallCheckInput, MessageCheckInput, PolicyDecision } from "./decisions";
import type { ContactCapabilities } from "./types";

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

function expectDenied(dec: PolicyDecision, code: string): void {
  expect(dec.ok).toBe(false);
  if (!dec.ok) {
    expect(dec.code).toBe(code);
  }
}

function expectOk(dec: PolicyDecision): void {
  expect(dec.ok).toBe(true);
  if (dec.ok) {
    expect(dec.esm.commonPath).toBe(true);
  }
}

describe("policy decisions", () => {
  it("send: E2E required", () => {
    const dec = checkSendMessage(mkMsgInput({ e2eReady: false }));
    expectDenied(dec, "E2E_REQUIRED");
  });

  it("send: no common path (anon profile + contact has no anon)", () => {
    const dec = checkSendMessage(
      mkMsgInput({
        localProfile: "anon",
        contact: mkContact("c-no-anon", false, true),
        e2eReady: true,
        anonPathReady: true,
      }),
    );
    expectDenied(dec, "NO_COMMON_PATH");
    if (!dec.ok) {
      expect(dec.esm?.commonPath).toBe(false);
    }
  });

  it("send: anon path not ready", () => {
    const dec = checkSendMessage(
      mkMsgInput({
        localProfile: "anon",
        contact: mkContact("c-anon", true, true),
        e2eReady: true,
        anonPathReady: false,
      }),
    );
    expectDenied(dec, "ANON_PATH_NOT_READY");
  });

  it("send: ok fast", () => {
    const dec = checkSendMessage(
      mkMsgInput({
        localProfile: "fast",
        contact: mkContact("c-fast", true, true),
      }),
    );
    expectOk(dec);
    if (dec.ok) {
      expect(dec.esm.family).toBe("fast");
      expect(dec.esm.compat).toBe(false);
    }
  });

  it("call: E2E required", () => {
    const dec = checkStartCall(mkCallInput({ e2eReady: false }));
    expectDenied(dec, "E2E_REQUIRED");
  });

  it("call: no common path (anon profile + contact has no anon)", () => {
    const dec = checkStartCall(
      mkCallInput({
        kind: "voice",
        localProfile: "anon",
        contact: mkContact("c-no-anon", false, true),
      }),
    );
    expectDenied(dec, "NO_COMMON_PATH");
  });

  it("call: anon path not ready", () => {
    const dec = checkStartCall(
      mkCallInput({
        kind: "voice",
        localProfile: "anon",
        contact: mkContact("c-anon", true, false),
        anonPathReady: false,
      }),
    );
    expectDenied(dec, "ANON_PATH_NOT_READY");
  });

  it("call: TURN required in anon-family", () => {
    const dec = checkStartCall(
      mkCallInput({
        kind: "voice",
        localProfile: "anon",
        contact: mkContact("c-anon", true, false),
        hasTurnAllowList: false,
      }),
    );
    expectDenied(dec, "TURN_REQUIRED");
  });

  it("call: video blocked in anon by default", () => {
    const dec = checkStartCall(
      mkCallInput({
        kind: "video",
        localProfile: "anon",
        contact: mkContact("c-anon", true, false),
        allowVideoInAnon: false,
      }),
    );
    expectDenied(dec, "VIDEO_BLOCKED_IN_ANON");
  });

  it("call: ok anon voice (relay policy expected)", () => {
    const dec = checkStartCall(
      mkCallInput({
        kind: "voice",
        localProfile: "anon",
        contact: mkContact("c-anon", true, false),
      }),
    );
    expectOk(dec);
    if (dec.ok) {
      expect(dec.esm.family).toBe("anon");
      expect(dec.rtc?.iceTransportPolicy).toBe("relay");
    }
  });

  it("call: ok fast (all candidates policy expected)", () => {
    const dec = checkStartCall(
      mkCallInput({
        kind: "voice",
        localProfile: "fast",
        contact: mkContact("c-fast", true, true),
      }),
    );
    expectOk(dec);
    if (dec.ok) {
      expect(dec.esm.family).toBe("fast");
      expect(dec.rtc?.iceTransportPolicy).toBe("all");
    }
  });
});
