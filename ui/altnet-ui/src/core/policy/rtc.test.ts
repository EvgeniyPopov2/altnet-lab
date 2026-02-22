import { describe, expect, it } from "vitest";

import { computeRtcPolicy } from "./rtc";
import type { EffectiveSessionMode } from "./types";

describe("computeRtcPolicy", () => {
  it("anon family uses relay and requires TURN allow-list", () => {
    const anonEsm: EffectiveSessionMode = {
      family: "anon",
      compat: false,
      commonPath: true,
      reason: "test",
    };

    const anonRtc = computeRtcPolicy(anonEsm);
    expect(anonRtc.iceTransportPolicy).toBe("relay");
    expect(anonRtc.allowStun).toBe(false);
    expect(anonRtc.requireTurnAllowList).toBe(true);
  });

  it("fast family uses all candidates without TURN allow-list", () => {
    const fastEsm: EffectiveSessionMode = {
      family: "fast",
      compat: false,
      commonPath: true,
      reason: "test",
    };

    const fastRtc = computeRtcPolicy(fastEsm);
    expect(fastRtc.iceTransportPolicy).toBe("all");
    expect(fastRtc.allowStun).toBe(false);
    expect(fastRtc.requireTurnAllowList).toBe(false);
  });
});
