/** Поля JSON проверяются в месте чтения, включая старые форматы документов. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function recordList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function oneOf<const T extends string | number>(value: unknown, choices: readonly T[]): value is T {
  return choices.some((choice) => choice === value);
}
