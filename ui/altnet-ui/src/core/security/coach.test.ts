import { describe, expect, it } from "vitest";
import { subscribeSecurityEvents } from "./bus";
import { SecurityCoach } from "./coach";
import type { SecurityEvent } from "./types";

describe("подсказки о безопасности прототипа", () => {
  it.each(["anon", "fast"] as const)("не обещают готовое соединение для профиля %s", (profile) => {
    const events: SecurityEvent[] = [];
    const unsubscribe = subscribeSecurityEvents((event) => events.push(event));
    try {
      SecurityCoach.intro(profile);
      expect(events).toHaveLength(1);
      expect(events[0].message).toContain("не подтверждены");
      expect(events[0].details?.join(" ")).toContain("не установлена");
    } finally {
      unsubscribe();
    }
  });

  it("советует отключить сеть средствами системы при подозрении на взлом", () => {
    const events: SecurityEvent[] = [];
    const unsubscribe = subscribeSecurityEvents((event) => events.push(event));
    try {
      SecurityCoach.suspectedCompromise();
      expect(events[0].details?.join(" ")).toContain("операционной системы");
      expect(events[0].details?.join(" ")).toContain("ещё не реализованы");
    } finally {
      unsubscribe();
    }
  });
});
