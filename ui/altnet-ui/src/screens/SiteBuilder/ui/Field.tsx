// src/screens/SiteBuilder/ui/Field.tsx
import React from "react";

/** Обёртка для подписи + контента поля ввода (единый стиль) */
export default function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs text-[#9aa3b2]">{props.label}</span>
      {props.children}
    </label>
  );
}