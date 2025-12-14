export type PrivacyProfile = "anon" | "fast";

export type EsmFamily = "anon" | "fast";

export type ContactCapabilities = {
  contactId: string;

  /**
   * Есть ли у контакта “анонимный путь” (onion/i2p и т.п.).
   */
  supportsAnon: boolean;

  /**
   * Есть ли у контакта “быстрый путь” (ygg/wg и т.п.).
   */
  supportsFast: boolean;
};

export type EffectiveSessionMode = {
  family: EsmFamily;

  /**
   * compat=true когда локальный профиль Fast, но сессия упала в anon-family
   * из-за требований/возможностей собеседника.
   */
  compat: boolean;

  /**
   * Есть ли общий путь вообще (иначе fail-closed).
   */
  commonPath: boolean;

  /**
   * Короткое объяснение (для UI).
   */
  reason: string;
};

export type RtcPolicy = {
  /**
   * "relay" = только TURN/relay, "all" = допускаем прямые кандидаты.
   */
  iceTransportPolicy: "relay" | "all";

  /**
   * STUN выключаем по умолчанию, чтобы не было утечек на публичные STUN.
   */
  allowStun: boolean;

  /**
   * Требуется allow-list TURN серверов (особенно важно для anon).
   */
  requireTurnAllowList: boolean;

  note: string;
};
