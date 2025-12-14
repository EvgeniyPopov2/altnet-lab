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
      title: profile === "anon" ? "Анонимный профиль включён" : "Приватный быстрый профиль включён",
      message:
        profile === "anon"
          ? "Соединения будут идти через анонимный оверлей. Некоторые функции могут работать медленнее или быть ограничены."
          : "Соединения идут через быстрый приватный оверлей. Качество звонков выше, но уровень анонимности ниже, чем в Anon.",
      details:
        profile === "anon"
          ? [
              "Видео и прямые соединения ограничены.",
              "Если собеседник в Fast — сессия всё равно будет Anon (совместимость).",
            ]
          : [
              "Если собеседник в Anon — ваша сессия понизится до Anon (совместимость).",
              "Сквозное шифрование включено по умолчанию.",
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
    pushOnce(dedupeKey, () => ({
      severity: "critical",
      code: "SUSPECTED_COMPROMISE",
      title: "Подозрение на компрометацию",
      message: "Если вы подозреваете взлом, лучше действовать быстро: изолировать устройство и отозвать доступ.",
      details: [
        "1) Нажмите «Паника: отключить сеть» (временно).",
        "2) Проверьте список доверенных устройств и отзовите неизвестные.",
        "3) Выполните ротацию ключей/сессий.",
      ],
      sticky: true,
      dedupeKey,
      actions: [
        {
          label: "Паника: отключить сеть",
          kind: "danger",
          onClick: () => {
            setPanicMode(true);
            pushSecurityEvent({
              severity: "critical",
              code: "PANIC_ENABLED",
              title: "Сеть отключена",
              message: "Паника включена: сетевые действия должны быть заблокированы до ручного отключения паники.",
              sticky: false,
              ttlMs: 15000,
            });
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
};
