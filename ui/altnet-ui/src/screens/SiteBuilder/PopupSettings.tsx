import { popupId, popupSettings, popupTriggers, type PopupOptions, type PopupTrigger } from "./popup";
import type { Device } from "./types";

const deviceNames = { desktop: "Компьютер", tablet: "Планшет", mobile: "Телефон" };
export default function PopupSettings({
  id,
  value,
  onChange,
}: {
  id: string;
  value?: PopupOptions;
  onChange: (patch: Partial<PopupOptions>) => void;
}) {
  const s = popupSettings(value);
  return (
    <fieldset className="sb-popup-settings grid gap-2">
      <legend>Показ всплывающего окна</legend>
      <label>
        Ссылка для открытия кнопкой
        <input readOnly value={"#" + popupId(id)} onFocus={(e) => e.currentTarget.select()} />
      </label>
      <fieldset>
        <legend>Автоматическое открытие</legend>
        {Object.entries(popupTriggers).map(([key, label]) => {
          const trigger = key as PopupTrigger;
          return (
            <label key={key}>
              <input
                type="checkbox"
                checked={s.triggers.includes(trigger)}
                onChange={(e) =>
                  onChange({
                    triggers: e.target.checked ? [...s.triggers, trigger] : s.triggers.filter((v) => v !== trigger),
                  })
                }
              />{" "}
              {label}
            </label>
          );
        })}
      </fieldset>
      {(
        [
          ["load", "delay", "Задержка после загрузки, с", 0, 3600],
          ["scroll", "scroll", "Прокрутка страницы, %", 0, 100],
          ["clicks", "clicks", "Количество нажатий", 1, 100],
          ["idle", "idle", "Время бездействия, с", 1, 3600],
        ] as const
      )
        .filter(([key]) => s.triggers.includes(key))
        .map(([, key, label, min, max]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              min={min}
              max={max}
              value={s[key]}
              onChange={(e) => {
                if (Number.isFinite(e.target.valueAsNumber)) onChange({ [key]: e.target.valueAsNumber });
              }}
            />
          </label>
        ))}
      {s.triggers.includes("anchor") && (
        <label>
          ID элемента на странице
          <input value={value?.anchor ?? ""} onChange={(e) => onChange({ anchor: e.target.value })} />
        </label>
      )}
      <fieldset>
        <legend>На каких экранах показывать</legend>
        {Object.entries(deviceNames).map(([key, label]) => {
          const device = key as Device;
          return (
            <label key={key}>
              <input
                type="checkbox"
                checked={s.devices.includes(device)}
                onChange={(e) =>
                  onChange({
                    devices: e.target.checked ? [...s.devices, device] : s.devices.filter((v) => v !== device),
                  })
                }
              />{" "}
              {label}
            </label>
          );
        })}
      </fieldset>
      <label>
        Максимум автопоказов за сеанс (0 — без ограничения)
        <input
          type="number"
          min={0}
          max={100}
          value={s.limit}
          onChange={(e) => {
            if (Number.isFinite(e.target.valueAsNumber)) onChange({ limit: e.target.valueAsNumber });
          }}
        />
      </label>
      <label>
        Ширина окна, px
        <input
          type="number"
          min={200}
          max={1600}
          value={s.width}
          onChange={(e) => {
            if (Number.isFinite(e.target.valueAsNumber)) onChange({ width: e.target.valueAsNumber });
          }}
        />
      </label>
      <label>
        Положение окна
        <select value={s.position} onChange={(e) => onChange({ position: e.target.value as PopupOptions["position"] })}>
          <option value="center">По центру</option>
          <option value="top">Сверху</option>
          <option value="bottom">Снизу</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={s.backdropClose}
          onChange={(e) => onChange({ backdropClose: e.target.checked })}
        />{" "}
        Закрывать нажатием на фон
      </label>
    </fieldset>
  );
}
