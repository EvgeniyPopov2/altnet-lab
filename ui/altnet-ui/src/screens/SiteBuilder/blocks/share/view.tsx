import type { ShareBlock, ShareNetwork } from "../../types";

const labels: Record<ShareNetwork, string> = { copy: "Копировать ссылку", telegram: "Telegram", vk: "ВКонтакте", twitter: "X / Twitter", facebook: "Facebook" };

export default function ShareView({ block }: { block: ShareBlock }) {
  return <div className="flex flex-wrap gap-2">
    {(block.networks || []).map(network => <button key={network} type="button" title="Действие работает на опубликованной странице"
      className="rounded-lg border border-[#1f2751] bg-[#101735] px-2 py-1 text-[#e6e9f4]">{labels[network] || network}</button>)}
  </div>;
}
