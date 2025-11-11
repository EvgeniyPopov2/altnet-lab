// src/screens/SiteBuilder/palette/IconSvg.tsx
import React from "react";

type Props = { name: string; size?: number; title?: string };

export default function IconSvg({ name, size = 18, title }: Props) {
  const src = `/icons/aura/${name}`;
  const [ok, setOk] = React.useState(true);
  return ok ? (
    // Локальный файл из public/, внешних источников нет — безопасно.
    <img
      src={src}
      width={size}
      height={size}
      alt={title || name}
      onError={() => setOk(false)}
      draggable={false}
      referrerPolicy="no-referrer"
    />
  ) : (
    // Заглушка, если файла нет
    <span
      className="inline-block rounded-sm bg-[#101735] text-[#9aa3b2] grid place-items-center"
      style={{ width: size, height: size, fontSize: 10 }}
      aria-label={title || name}
      title={title || name}
    >
      ●
    </span>
  );
}
