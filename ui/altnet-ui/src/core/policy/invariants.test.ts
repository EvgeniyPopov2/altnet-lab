import { describe, expect, it } from "vitest";
import { computeEsm } from "./esm";
import { checkSendMessage, checkStartCall } from "./decisions";
import type { PrivacyProfile } from "./types";

describe("обязательные ограничения политики", () => {
  const profiles: PrivacyProfile[] = ["anon", "fast"];
  const flags = [false, true];

  for (const profile of profiles) {
    for (const supportsAnon of flags) {
      for (const supportsFast of flags) {
        for (const anonPathReady of flags) {
          const contact = { contactId: "тестовый", supportsAnon, supportsFast };
          const label = `${profile}, анонимный=${supportsAnon}, быстрый=${supportsFast}, путь=${anonPathReady}`;

          it(`без E2E блокирует сообщения и оба вида звонков: ${label}`, () => {
            const base = { localProfile: profile, contact, e2eReady: false, anonPathReady };
            expect(checkSendMessage(base)).toMatchObject({ ok: false, code: "E2E_REQUIRED" });
            for (const kind of ["voice", "video"] as const) {
              expect(checkStartCall({ ...base, kind, hasTurnAllowList: true, allowVideoInAnon: true }))
                .toMatchObject({ ok: false, code: "E2E_REQUIRED" });
            }
          });

          it(`не выбирает прямой профиль для анонимного пользователя: ${label}`, () => {
            const session = computeEsm(profile, contact);
            if (profile === "anon") {
              expect(session.family).toBe("anon");
              expect(session.commonPath).toBe(supportsAnon);
            }
            if (!supportsAnon && !supportsFast) expect(session.commonPath).toBe(false);
          });
        }
      }
    }
  }

  it("не использует быстрый путь, когда совместим только анонимный", () => {
    expect(computeEsm("fast", { contactId: "1", supportsAnon: true, supportsFast: false }))
      .toMatchObject({ family: "anon", compat: true, commonPath: true });
  });
});
