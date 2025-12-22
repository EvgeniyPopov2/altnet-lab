import { useEffect, useMemo, useState } from "react";
import { pushSecurityEvent } from "../core/security/bus";
import { dismiss } from "../core/security/storage";
import { usePanicMode } from "../core/security/usePanicMode";
import {
  addMockDevice,
  revokeDevice,
  rotateKeysAndSessions,
  setDeviceTrust,
  touchCurrentDevice,
  useSecurityCenterState,
  type DeviceTrust,
  type SecurityDevice,
} from "../core/security/center";

function fmtTs(ts?: number): string {
  if (!ts) return "—";
  try {
    return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

function shortId(id: string): string {
  if (!id) return "—";
  return id.length <= 14 ? id : `${id.slice(0, 6)}…${id.slice(-6)}`;
}

function Badge({ trust }: { trust: DeviceTrust }) {
  const cls =
    trust === "trusted"
      ? "bg-emerald-600/20 text-emerald-200 border-emerald-500/30"
      : trust === "untrusted"
        ? "bg-amber-600/20 text-amber-200 border-amber-500/30"
        : "bg-red-600/20 text-red-200 border-red-500/30";

  const label = trust === "trusted" ? "Доверенное" : trust === "untrusted" ? "Недоверенное" : "Отозвано";
  return <span className={`px-2 py-0.5 rounded-full text-xs border ${cls}`}>{label}</span>;
}

function DeviceCard({
  d,
  isCurrent,
}: {
  d: SecurityDevice;
  isCurrent: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold text-white/90 truncate">{d.label}</div>
            <Badge trust={d.trust} />
            {isCurrent && (
              <span className="px-2 py-0.5 rounded-full text-xs border border-white/10 bg-white/10 text-white/80">
                Текущее
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-white/60 flex flex-wrap gap-x-3 gap-y-1">
            <span title={d.id}>ID: {shortId(d.id)}</span>
            <span>Последний раз: {fmtTs(d.lastSeenAt)}</span>
            {d.note && <span className="text-white/50">• {d.note}</span>}
          </div>
        </div>
      </div>

      <div className="mt-1 flex flex-wrap gap-2">
        {d.trust === "untrusted" && (
          <button
            type="button"
            onClick={() => setDeviceTrust(d.id, "trusted")}
            className="px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm"
          >
            Доверять
          </button>
        )}

        {d.trust === "trusted" && !isCurrent && (
          <button
            type="button"
            onClick={() => setDeviceTrust(d.id, "untrusted")}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 text-sm"
          >
            Сделать недоверенным
          </button>
        )}

        {!isCurrent && d.trust !== "revoked" && (
          <button
            type="button"
            onClick={() => {
              revokeDevice(d.id);
              pushSecurityEvent({
                severity: "warning",
                code: "DEVICE_REVOKED",
                title: "Устройство отозвано",
                message:
                  "Это устройство помечено как отозванное (мок). Для завершения сценария выполните ротацию ключей/сессий.",
                details: [
                  "В реальном протоколе отзыв будет публиковаться как подписанный манифест доверия/отзыва.",
                  "Старые сессии/ключи должны быть выведены из употребления после ротации.",
                ],
                ttlMs: 12000,
              });
            }}
            className="px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-sm"
          >
            Отозвать
          </button>
        )}
      </div>
    </div>
  );
}

export default function SecurityCenter() {
  const [panic, setPanic] = usePanicMode();
  const [state] = useSecurityCenterState();

  const [mockTrust, setMockTrust] = useState<DeviceTrust>("untrusted");

  useEffect(() => {
    // обновляем lastSeen текущего устройства (локально)
    touchCurrentDevice();
  }, []);

  const currentId = state.currentDeviceId;

  const grouped = useMemo(() => {
    const trusted = state.devices.filter((d) => d.trust === "trusted");
    const untrusted = state.devices.filter((d) => d.trust === "untrusted");
    const revoked = state.devices.filter((d) => d.trust === "revoked");

    return { trusted, untrusted, revoked };
  }, [state.devices]);

  return (
    <div className="p-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-white/90 text-xl font-semibold">Security Center (мок)</div>
            <div className="mt-1 text-sm text-white/70">
              Здесь мы локально (без сети) моделируем доверенные устройства, отзыв и ротацию ключей/сессий. В проде это
              будет подписанный журнал/манифест доверия и протокол ротации.
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {panic ? (
              <button
                type="button"
                onClick={() => setPanic(false)}
                className="px-3 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-600 text-white font-semibold text-sm"
              >
                Паника: выкл
              </button>
            ) : (
              <span className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-white/80 text-sm">
                Паника: выкл
              </span>
            )}
          </div>
        </div>

        {panic && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-600/10 p-4">
            <div className="font-semibold text-red-200">Паника включена (fail-closed)</div>
            <div className="mt-1 text-sm text-red-100/90">
              Сетевые действия должны быть заблокированы. Рекомендуемые шаги: проверьте список устройств → отзовите
              неизвестные → выполните ротацию ключей/сессий.
            </div>
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-white/90">Ротация ключей/сессий (мок)</div>
              <span className="text-xs text-white/60">Эпоха: {state.rotationEpoch}</span>
            </div>
            <div className="mt-1 text-sm text-white/70">
              Ротация делает украденные сессионные ключи бесполезными. Но если украден “корень доверия” — нужны отзыв
              устройства и перевыпуск доверенных ключей (в MVP — мок).
            </div>

            <div className="mt-3 text-sm text-white/70">
              Последняя ротация: <span className="text-white/90">{fmtTs(state.lastRotationAt)}</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  rotateKeysAndSessions();
                  pushSecurityEvent({
                    severity: "info",
                    code: "ROTATION_DONE",
                    title: "Ротация выполнена",
                    message: "Сессии/ключи обновлены (мок). Старые ключи должны считаться недействительными.",
                    details: [
                      "В реальном протоколе: Double Ratchet/MLS + привязка к устройствам и манифестам доверия.",
                      "После ротации — перехендшейк с контактами/сервером, пересоздание медиа‑транспортов.",
                    ],
                    ttlMs: 8000,
                  });
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm"
              >
                Выполнить ротацию
              </button>

              <button
                type="button"
                onClick={() => {
                  const key = "panic/security-center";
                  dismiss(key);
                  pushSecurityEvent({
                    severity: "info",
                    code: "SECURITY_CENTER_HINTS_OFF",
                    title: "Подсказки отключены",
                    message: "Подсказка «Паника → Security Center» больше не будет появляться.",
                    ttlMs: 6000,
                  });
                }}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-sm"
              >
                Не показывать подсказку
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="font-semibold text-white/90">Текущее устройство</div>
            <div className="mt-1 text-sm text-white/70">
              ID: <span className="text-white/90">{shortId(currentId)}</span>
            </div>
            <div className="mt-2 text-xs text-white/60">
              Примечание: в MVP мы считаем, что “корень доверия” хранится локально. Поэтому защищаем контейнером ОС и
              предлагаем “Панику” и “Отзыв”.
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-white/90">Доверенные устройства</div>
                <div className="text-xs text-white/60">{grouped.trusted.length} шт.</div>
              </div>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                {grouped.trusted.map((d) => (
                  <DeviceCard key={d.id} d={d} isCurrent={d.id === currentId} />
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-white/90">Недоверенные / новые устройства</div>
                <div className="text-xs text-white/60">{grouped.untrusted.length} шт.</div>
              </div>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                {grouped.untrusted.map((d) => (
                  <DeviceCard key={d.id} d={d} isCurrent={false} />
                ))}
              </div>
            </div>

            {grouped.revoked.length > 0 && (
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-white/90">Отозванные</div>
                  <div className="text-xs text-white/60">{grouped.revoked.length} шт.</div>
                </div>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {grouped.revoked.map((d) => (
                    <DeviceCard key={d.id} d={d} isCurrent={false} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <details className="rounded-xl border border-white/10 bg-white/5 p-4">
              <summary className="cursor-pointer select-none text-white/80 font-semibold">
                Моки (для разработки)
              </summary>
              <div className="mt-3 text-sm text-white/70">
                Быстро добавить “новое устройство”, чтобы проверить доверие/отзыв и UX‑подсказки.
              </div>

              <div className="mt-3 flex items-center gap-2">
                <label className="text-xs text-white/60">Статус:</label>
                <select
                  value={mockTrust}
                  onChange={(e) => setMockTrust(e.target.value as DeviceTrust)}
                  className="px-2 py-1 rounded-lg bg-white/10 border border-white/10 text-white/90 text-sm"
                >
                  <option value="untrusted">untrusted</option>
                  <option value="trusted">trusted</option>
                </select>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    addMockDevice(mockTrust);
                    pushSecurityEvent({
                      severity: "info",
                      code: "MOCK_DEVICE_ADDED",
                      title: "Добавлено устройство (мок)",
                      message: "В список устройств добавлен новый элемент для проверки UI/политик.",
                      ttlMs: 6000,
                    });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 text-sm"
                >
                  Добавить устройство
                </button>
              </div>
            </details>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="font-semibold text-white/90">Инварианты (что мы защищаем)</div>
              <ul className="mt-2 text-sm text-white/70 list-disc pl-5 space-y-1">
                <li>Fail-closed: при “Панике” и/или без E2E — сеть/звонки/отправка блокируются.</li>
                <li>Отзыв устройства должен приводить к прекращению доверия к его ключам.</li>
                <li>Ротация делает украденные сессии временными; корневое доверие требует отдельной защиты.</li>
                <li>Никаких внешних метрик/телеметрии — всё локально.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
