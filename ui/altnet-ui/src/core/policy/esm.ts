import type { ContactCapabilities, EffectiveSessionMode, PrivacyProfile } from "./types";

/**
 * Правило:
 * - если локально Anon → вся сессия Anon
 * - если локально Fast:
 *    - если у контакта есть Fast → Fast
 *    - иначе если у контакта есть Anon → Anon (compat)
 *    - иначе нет общего пути (fail-closed)
 */
export function computeEsm(localProfile: PrivacyProfile, contact: ContactCapabilities): EffectiveSessionMode {
  if (localProfile === "anon") {
    if (!contact.supportsAnon) {
      return {
        family: "anon",
        compat: false,
        commonPath: false,
        reason: "Вы в анонимном профиле, но у собеседника нет анонимного адреса (Tor/I2P). Безопасного пути нет (fail-closed).",
      };
    }
    return {
      family: "anon",
      compat: false,
      commonPath: true,
      reason: "По настройкам прототипа выбран анонимный маршрут. Реальное соединение и маршрут не подтверждены.",
    };
  }

  // localProfile === "fast"
  if (contact.supportsFast) {
    return {
      family: "fast",
      compat: false,
      commonPath: true,
      reason: "По настройкам прототипа выбран быстрый маршрут. Его фактическая доступность не подтверждена.",
    };
  }

  if (contact.supportsAnon) {
    return {
      family: "anon",
      compat: true,
      commonPath: true,
      reason: "По правилам совместимости прототип выбрал анонимный маршрут. Реальное соединение не подтверждено.",
    };
  }

  return {
    family: "anon",
    compat: true,
    commonPath: false,
    reason: "Нет общего защищённого пути до собеседника (fail-closed).",
  };
}
