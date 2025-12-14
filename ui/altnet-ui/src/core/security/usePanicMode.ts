import { useEffect, useState } from "react";
import { getPanicMode, onPanicModeChange, setPanicMode } from "./panic";

/**
 * UI-хук для “паники”.
 * Паника = локальный флаг, который должен блокировать любые сетевые действия (fail-closed).
 */
export function usePanicMode(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(() => getPanicMode());

  useEffect(() => onPanicModeChange(setEnabled), []);

  return [enabled, setPanicMode];
}
