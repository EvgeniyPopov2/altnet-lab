import React from "react";
import DeviceSwitch from "../ui/DeviceSwitch";

type Breakpoint = "desktop" | "tablet" | "mobile";

export default function Topbar(props: {
  bp: Breakpoint;
  onChangeBp: (bp: Breakpoint) => void;
  mode: "fit" | Breakpoint;
  onChangeMode: (m: "fit" | Breakpoint) => void;
  left?: React.ReactNode;     // опциональный заголовок/хлебные крошки
  right?: React.ReactNode;    // опциональные кнопки действий (экспорт/превью и т.п.)
}) {
  const { bp, onChangeBp, mode, onChangeMode, left, right } = props;

  return (
    <div className="mb-3 grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
      {/* Левая зона — под заголовок страницы (пока пусто) */}
      <div className="min-h-[36px] flex items-center">{left}</div>

      {/* Центр — переключатель устройств/ширины */}
      <DeviceSwitch
        bp={bp}
        onChangeBp={onChangeBp}
        mode={mode}
        onChangeMode={onChangeMode}
      />

      {/* Правая зона — под действия (пока пусто) */}
      <div className="min-h-[36px] flex items-center justify-end">{right}</div>
    </div>
  );
}
