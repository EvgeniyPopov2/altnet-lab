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
    return {
      family: "anon",
      compat: false,
      commonPath: contact.supportsAnon || contact.supportsFast, // общий путь в принципе есть, но используем anon-family
      reason: "Вы в анонимном профиле: соединение будет установлено через анонимный оверлей.",
    };
  }

  // localProfile === "fast"
  if (contact.supportsFast) {
    return {
      family: "fast",
      compat: false,
      commonPath: true,
      reason: "Быстрая сессия: доступен быстрый оверлей у обеих сторон.",
    };
  }

  if (contact.supportsAnon) {
    return {
      family: "anon",
      compat: true,
      commonPath: true,
      reason: "Совместимость: собеседник доступен только через анонимный оверлей, поэтому сессия понизится до Anon.",
    };
  }

  return {
    family: "anon",
    compat: true,
    commonPath: false,
    reason: "Нет общего защищённого пути до собеседника (fail-closed).",
  };
}
