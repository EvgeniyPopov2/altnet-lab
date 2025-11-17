import React from "react";

type Props = {
  /** Текущий брейкпоинт (если используешь отдельно) */
  bp?: "desktop" | "tablet" | "mobile";
  onChangeBp?: (bp: "desktop" | "tablet" | "mobile") => void;

  /** Режим предпросмотра канваса — именно то, что меняет ширину */
  mode?: "desktop" | "tablet" | "mobile" | "fit";
  onChangeMode?: (m: "desktop" | "tablet" | "mobile" | "fit") => void;

  /** Правый блок действий (кнопки экспорта/предпросмотра) — прокидывается как есть */
  right?: React.ReactNode;

  /** Название страницы (необязательно) */
  title?: string;
};

/* Прозрачная иконка-кнопка (как в Elementor: тонкий контур, без фона) */
function DeviceBtn(props: {
  title: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        title={props.title}
        onClick={props.onClick}
        className={[
          // размер и форма
          "h-8 w-8 grid place-items-center rounded-md",
          // фон и рамка — по умолчанию прозрачные, чтобы не было белого квадрата
          "border border-transparent bg-transparent",
          // цвет иконки
          "text-[#bfc3cf] hover:text-[#e6e9f4] transition-colors",
          // активное состояние: подсветить иконку и рамку
          props.active ? "text-[#e6e9f4] border-[#e6e9f4]" : ""
        ].join(" ")}
      >
        {props.children}
      </button>
      {/* Небольшая «подчёркивающая» полоска под активной иконкой */}
      <div
        className={[
          "h-[2px] w-5 rounded",
          props.active ? "bg-[#e6e9f4]" : "bg-transparent"
        ].join(" ")}
      />
    </div>
  );
}

/* Тонкие контурные иконки (stroke), максимально похожие стилем */
const Ic = {
  desktop: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="3" y="5" width="18" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="9" y="18" width="6" height="1.5" rx="0.75" fill="currentColor" />
    </svg>
  ),
  tablet: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="6" y="3" width="12" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="18" r="0.9" fill="currentColor" />
    </svg>
  ),
  mobile: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="8" y="2.5" width="8" height="19" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="11" y="5" width="2" height="1.4" rx="0.2" fill="currentColor" />
    </svg>
  ),
};

export default function Topbar({
  bp,
  onChangeBp,
  mode,
  onChangeMode,
  right,
  title,
}: Props) {
  // Активное устройство берём из mode (если нет — из bp; по умолчанию desktop)
  const current: "desktop" | "tablet" | "mobile" =
    (mode === "desktop" || mode === "tablet" || mode === "mobile"
      ? mode
      : undefined) || bp || "desktop";

  const set = (m: "desktop" | "tablet" | "mobile") => {
    onChangeMode?.(m);
    onChangeBp?.(m);
  };

  return (
    <div className="sticky top-0 z-20 h-12 bg-[#0b0f17] border-b border-[#1f2751] flex items-center justify-between px-3 select-none">
      {/* Лево: логотип+название (минимально) */}
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 grid place-items-center rounded-md border border-[#2a2f45] text-[#cfd5e6]">
          {/* простая «Е»-плашка, можно заменить позже на наш логотип */}
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path fill="currentColor" d="M6 4h12v3H9v5h8v3H9v5H6z" />
          </svg>
        </div>
        <div className="text-sm text-[#e6e9f4] font-medium">
          {title || "Страница"} <span className="ml-2 text-[#9aa3b2]">(Черновик)</span>
        </div>
      </div>

      {/* Центр: только три иконки устройств */}
      <div className="flex items-end gap-6 pb-1">
        <DeviceBtn title="Рабочий стол" active={current === "desktop"} onClick={() => set("desktop")}>
          {Ic.desktop}
        </DeviceBtn>
        <DeviceBtn title="Планшет (≤1024)" active={current === "tablet"} onClick={() => set("tablet")}>
          {Ic.tablet}
        </DeviceBtn>
        <DeviceBtn title="Мобильный (≤767)" active={current === "mobile"} onClick={() => set("mobile")}>
          {Ic.mobile}
        </DeviceBtn>
      </div>

      {/* Право: действия — как есть из родителя */}
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
}
