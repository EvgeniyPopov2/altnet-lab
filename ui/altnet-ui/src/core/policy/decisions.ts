import type { ContactCapabilities, EffectiveSessionMode, PrivacyProfile } from "./types";
import { computeEsm } from "./esm";
import { computeRtcPolicy } from "./rtc";

export type CallKind = "voice" | "video";

export type PolicyDecision =
  | {
      ok: true;
      esm: EffectiveSessionMode;
      rtc: ReturnType<typeof computeRtcPolicy>;
    }
  | {
      ok: false;
      code: string;
      title: string;
      message: string;
      details?: string[];
      esm?: EffectiveSessionMode;
    };

export type CallCheckInput = {
  kind: CallKind;
  localProfile: PrivacyProfile;
  contact: ContactCapabilities;

  /**
   * E2E статус. Пока мок: в реале будет "есть ли установленная E2E-сессия".
   * В доктрине — без E2E отправка/сигналинг должен быть заблокирован (fail-closed).
   */
  e2eReady: boolean;

  /**
   * Для anon-family: “готов ли Tor/I2P путь”.
   * Пока мок: позже это будет приходить из TAL.
   */
  anonPathReady: boolean;

  /**
   * Для anon-family RTC: есть ли разрешённый TURN (allow-list).
   * Пока мок: позже приходит из TAL/настроек.
   */
  hasTurnAllowList: boolean;

  /**
   * Разрешаем ли видео в anon-family (по умолчанию нет).
   */
  allowVideoInAnon?: boolean;
};

export function checkStartCall(input: CallCheckInput): PolicyDecision {
  if (!input.e2eReady) {
    return {
      ok: false,
      code: "E2E_REQUIRED",
      title: "Звонок заблокирован",
      message: "Сквозное шифрование не готово. По правилам безопасности звонки и сообщения без E2E запрещены.",
      details: ["Попробуйте позже или проверьте список устройств/ключей."],
    };
  }

  const esm = computeEsm(input.localProfile, input.contact);
  if (!esm.commonPath) {
    return {
      ok: false,
      code: "NO_COMMON_PATH",
      title: "Нет безопасного пути",
      message: "Не удалось найти общий защищённый путь до собеседника. Соединение заблокировано (fail-closed).",
      details: [
        "Если собеседник в анонимном профиле — вам нужен совместимый анонимный путь (Tor/I2P).",
        "Проверьте профиль и состояние сети.",
      ],
      esm,
    };
  }

  const rtc = computeRtcPolicy(esm);

  if (esm.family === "anon") {
    if (!input.anonPathReady) {
      return {
        ok: false,
        code: "ANON_PATH_NOT_READY",
        title: "Анонимный путь не готов",
        message: "Анонимный профиль включён, но анонимный транспорт ещё не готов. Звонок временно недоступен.",
        details: ["Подождите подключения Tor/I2P или переключитесь на быстрый профиль (если это допустимо)."],
        esm,
      };
    }

    if (!input.hasTurnAllowList) {
      return {
        ok: false,
        code: "TURN_REQUIRED",
        title: "Нужен безопасный relay",
        message: "В анонимном режиме звонки требуют разрешённого relay (TURN) без утечек IP. Сейчас он не настроен.",
        details: ["Откройте настройки сети/звонков и выберите разрешённый relay."],
        esm,
      };
    }

    if (input.kind === "video" && input.allowVideoInAnon !== true) {
      return {
        ok: false,
        code: "VIDEO_BLOCKED_IN_ANON",
        title: "Видео отключено в анонимном режиме",
        message: "Видео-звонки в анонимном профиле по умолчанию отключены, чтобы снизить риск утечек и деградации качества.",
        details: ["Можно включить вручную в настройках (пониженная приватность/качество)."],
        esm,
      };
    }
  }

  return { ok: true, esm, rtc };
}
