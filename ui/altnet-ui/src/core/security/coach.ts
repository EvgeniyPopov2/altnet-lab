import { pushSecurityEvent } from "./bus";
import { dismiss, isDismissed } from "./storage";
import { setPanicMode } from "./panic";
import type { PrivacyProfile } from "../policy/types";
import type { PolicyDecision } from "../policy/decisions";

function pushOnce(dedupeKey: string, factory: () => Parameters<typeof pushSecurityEvent>[0]) {
  if (isDismissed(dedupeKey)) return;
  pushSecurityEvent(factory());
}

export const SecurityCoach = {
  intro(profile: PrivacyProfile) {
    const dedupeKey = `intro/${profile}`;
    pushOnce(dedupeKey, () => ({
      severity: "info",
      code: "UI_INTRO",
      title: profile === "anon" ? "Выбран анонимный профиль" : "Выбран приватный быстрый профиль",
      message:
        profile === "anon"
          ? "Настройки анонимного профиля выбраны в интерфейсе. Подключение к сети и анонимный маршрут пока не подтверждены."
          : "Настройки быстрого профиля выбраны в интерфейсе. Подключение к сети и защищённый маршрут пока не подтверждены.",
      details:
        profile === "anon"
          ? [
              "Прямые соединения и видео ограничены правилами прототипа.",
              "Правила совместимости пока имитируются; настоящая сессия не установлена.",
            ]
          : [
              "Правила совместимости пока имитируются; настоящая сессия не установлена.",
              "Сквозное шифрование не подтверждено: отправка заблокирована.",
            ],
      dedupeKey,
      actions: [
        {
          label: "Не показывать снова",
          kind: "ghost",
          onClick: () => dismiss(dedupeKey),
        },
      ],
    }));
  },

  deniedByPolicy(decision: PolicyDecision) {
    if (decision.ok) return;

    const dedupeKey = `deny/${decision.code}`;
    pushOnce(dedupeKey, () => ({
      severity: "warning",
      code: decision.code,
      title: decision.title,
      message: decision.message,
      details: decision.details,
      dedupeKey,
      actions: [
        {
          label: "Понятно",
          kind: "secondary",
          onClick: () => {
            /* просто закрытие в UI */
          },
        },
        {
          label: "Не показывать снова",
          kind: "ghost",
          onClick: () => dismiss(dedupeKey),
        },
      ],
    }));
  },

  suspectedCompromise() {
    const dedupeKey = "security/compromise";
    pushSecurityEvent({
      severity: "critical",
      code: "SUSPECTED_COMPROMISE",
      title: "Подозрение на компрометацию",
      message: "Если вы подозреваете взлом, лучше действовать быстро: изолировать устройство и отозвать доступ.",
      details: [
        "1) Отключите сеть на устройстве средствами операционной системы.",
        "2) Проверьте доверенные устройства и ключи доступными средствами.",
        "3) Отзыв устройств и ротация ключей в прототипе ещё не реализованы.",
      ],
      sticky: true,
      dedupeKey,
      actions: [
        {
          label: "Включить режим паники в приложении",
          kind: "danger",
          onClick: () => {
            setPanicMode(true);
            pushSecurityEvent({
              severity: "critical",
              code: "PANIC_ENABLED",
              title: "Режим паники включён",
              message: "Интерфейс запросил блокировку действий. Отключение сети на уровне системы не подтверждено.",
              sticky: false,
              ttlMs: 15000,
            });
          },
        },
      ],
    });
  },
};
