import type { EffectiveSessionMode, RtcPolicy } from "./types";

export function computeRtcPolicy(esm: EffectiveSessionMode): RtcPolicy {
  if (esm.family === "anon") {
    return {
      iceTransportPolicy: "relay",
      allowStun: false,
      requireTurnAllowList: true,
      note: "Анонимный режим: только relay (TURN), без STUN и прямых кандидатов — защита от утечки IP.",
    };
  }

  // fast
  return {
    iceTransportPolicy: "all",
    allowStun: false,
    requireTurnAllowList: false,
    note: "Быстрый режим: допускаем прямые кандидаты внутри оверлея; STUN выключен, чтобы избежать утечек на публичные STUN.",
  };
}
