export type SecuritySeverity = "info" | "warning" | "critical";

export type SecurityActionKind = "primary" | "secondary" | "danger" | "ghost";

export type SecurityAction = {
  id?: string;
  label: string;
  kind?: SecurityActionKind;
  onClick?: () => void;
};

export type SecurityEvent = {
  id: string;
  createdAt: number;

  severity: SecuritySeverity;
  code: string;

  title: string;
  message: string;
  details?: string[];

  actions?: SecurityAction[];

  /**
   * Если задано — UI может дедуплицировать/помнить “не показывать снова”.
   * Пример: "intro/anon", "deny/video/anon".
   */
  dedupeKey?: string;

  /**
   * true = не авто-скрывать.
   */
  sticky?: boolean;

  /**
   * Время жизни в мс (если не sticky). Если не задано — выбирается по severity.
   */
  ttlMs?: number;
};
