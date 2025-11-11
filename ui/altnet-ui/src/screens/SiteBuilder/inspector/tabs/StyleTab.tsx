// src/screens/SiteBuilder/inspector/tabs/StyleTab.tsx
import type { Block } from "../../types";

type Props = { block?: Block; onChange?: (patch: Partial<Block>) => void };

export default function StyleTab({ block, onChange }: Props) {
  void onChange;
  if (!block) return null;

  return (
    <div className="grid gap-2 text-sm">
      <div className="text-[#9aa3b2]">Стиль (каркас): отступы, выравнивание, цвета, типографика…</div>
      <div className="rounded-lg border border-[#1f2751] bg-[#0f1630] p-2 text-[#e6e9f4]">
        Будут настройки для <b>{block.type}</b>
      </div>
    </div>
  );
}
