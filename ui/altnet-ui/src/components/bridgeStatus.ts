export type BridgeStatus = {
  phase: "starting" | "checking" | "recovering" | "ready" | "waiting" | "paused";
  connected: boolean;
  progress: number;
  source: string;
  publicCount: number;
  manualCount: number;
  busy: boolean;
  userAction: boolean;
  transport: string | null;
  internet: string;
  note: string;
  retryIn: number;
  lastVerified: number | null;
  probes: number;
  probeLimit: number;
  power: string;
};

export function connectionText(status: BridgeStatus | null) {
  if (!status) return "Нет данных от локального клиента";
  switch (status.phase) {
    case "ready":
      if (status.internet === "unreachable") return "Цепочка Tor построена. Проверочные сайты пока недоступны.";
      if (status.internet === "checking") return "Цепочка Tor построена. Проверяем выход в интернет…";
      return "Соединение Tor через мост подтверждено";
    case "checking":
      return "Проверяем другой мост. Текущее соединение работает.";
    case "starting":
      return "Запускаем клиент Tor";
    case "recovering":
      return "Восстанавливаем доступ через мост. Подождите…";
    case "waiting":
      return "Мост недоступен. AltNet повторит подключение автоматически.";
    case "paused":
      return "Подключение через мост приостановлено";
  }
}
