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
    const id = setInterval(() => setVal(leftParts(block.target)), 1000);
    return () => clearInterval(id);
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
          <div className="text-2xl font-extrabold text-[#e6e9f4]">{String(num).padStart(2, "0")}</div>
          <div className="text-[11px] text-[#9aa3b2]">{label as string}</div>
        </div>
      ))}
    </div>
  );
}
