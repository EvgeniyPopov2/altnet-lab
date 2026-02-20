// src/screens/SiteBuilder/palette/Palette.tsx
import React from "react";
import type { InsertChoice } from "../../../builder/SortableCanvas";
import IconSvg from "./IconSvg";
import { groupsWithItems } from "./blocksMeta";

type Props = { onInsert: (type: InsertChoice) => void };

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#1f2751] bg-[#0b1022] p-2">
      <div className="px-1 pb-2 text-xs uppercase tracking-wide text-[#9aa3b2]">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Item({
  label,
  icon,
  disabled,
  onClick,
  hint,
}: {
  label: string;
  icon: string;
  disabled?: boolean;
  onClick?: () => void;
  hint?: string;
}) {
  return (
    <button
      className={`px-2 py-1 rounded-lg text-sm border ${disabled ? "cursor-not-allowed opacity-50 border-[#1f2751] bg-[#0b1022]" : "bg-[#101735] hover:bg-[#121b3f] border-[#1f2751]"} text-[#e6e9f4] inline-flex items-center gap-2`}
      onClick={disabled ? undefined : onClick}
      title={hint}
      aria-disabled={disabled}
    >
      <IconSvg name={icon} />
      {label}
    </button>
  );
}

/** Палитра блоков: рендерится из метаданных. */
export default function Palette({ onInsert }: Props) {
  const groups = React.useMemo(() => groupsWithItems(), []);
  return (
    <div className="grid gap-2">
      {groups.map(({ group, items }) => (
        <Group key={group} title={group}>
          {items.map((m, index) =>
            m.type === "unsupported" ? (
              <Item
                key={`${m.id}-${index}`}
                label={m.title}
                icon={m.icon}
                disabled
                hint="Скоро"
              />
            ) : (
              <Item
                key={`${m.id}-${index}`}
                label={m.title}
                icon={m.icon}
                onClick={() => onInsert(m.type)}
                hint={m.description}
              />
            )
          )}
        </Group>
      ))}
    </div>
  );
}
