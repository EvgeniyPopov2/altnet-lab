import { computeRtcPolicy } from "./rtc";
import type { EffectiveSessionMode } from "./types";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const anonEsm: EffectiveSessionMode = {
  family: "anon",
  compat: false,
  commonPath: true,
  reason: "test",
};

const anonRtc = computeRtcPolicy(anonEsm);
assert(anonRtc.iceTransportPolicy === "relay", "anon: iceTransportPolicy must be relay");
assert(anonRtc.allowStun === false, "anon: STUN must be disabled");
assert(anonRtc.requireTurnAllowList === true, "anon: TURN allow-list must be required");

const fastEsm: EffectiveSessionMode = {
  family: "fast",
  compat: false,
  commonPath: true,
  reason: "test",
};

const fastRtc = computeRtcPolicy(fastEsm);
assert(fastRtc.iceTransportPolicy === "all", "fast: iceTransportPolicy must be all");
assert(fastRtc.allowStun === false, "fast: STUN must be disabled by default");
assert(fastRtc.requireTurnAllowList === false, "fast: TURN allow-list must NOT be required");

export {};
