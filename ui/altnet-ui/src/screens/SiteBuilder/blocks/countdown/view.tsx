import React from "react";
import type { CountdownBlock } from "../../types";

function leftParts(targetIso: string) {
  const t = Date.parse(targetIso);
  if (!isFinite(t)) return null;
  const ms = Math.max(0, t - Date.now());
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return { d, h, m, s: sec };
}

export default function CountdownView({ block }: { block: CountdownBlock }) {
  const [val, setVal] = React.useState(() => leftParts(block.target));
  React.useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      setVal(leftParts(block.target));
      const remaining = Date.parse(block.target) - Date.now();
      if (!Number.isFinite(remaining) || remaining <= 0) { if (id) clearInterval(id); id = undefined; }
    };
    const start = () => {
      if (id) clearInterval(id);
      id = undefined;
      if (!document.hidden) { update(); if (Date.parse(block.target) > Date.now()) id = setInterval(update, 1000); }
    };
    document.addEventListener("visibilitychange", start);
    start();
    return () => { if (id) clearInterval(id); document.removeEventListener("visibilitychange", start); };
  }, [block.target]);

  if (!val) return <div className="text-sm text-[#9aa3b2]">Неверная дата</div>;

  return (
    <div className="flex gap-3 text-center">
      {[
        ["Дней", val.d],
        ["Часов", val.h],
        ["Мин", val.m],
        ["Сек", val.s],
      ].map(([label, num]) => (
        <div key={label} className="grid">
          <div className="text-2xl font-extrabold text-[#1d2440]">{String(num).padStart(2, "0")}</div>
          <div className="text-[11px] text-[#535d75]">{label as string}</div>
        </div>
      ))}
    </div>
  );
}
