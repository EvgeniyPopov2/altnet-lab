import type { PrivacyProfile } from "../core/policy/types";
import { useMemo } from "react";
import { motion } from "framer-motion";



export default function NetStatus({
  profile,
  onChangeProfile,
}: {
  profile: PrivacyProfile;
  onChangeProfile?: (p: PrivacyProfile) => void;
}) {
  const policy = useMemo(() => {
    if (profile === "anon") {
      return {
        title: "Анонимный",
        color: "from-rose-500/30 to-fuchsia-500/20",
        chips: [
          "Transport: libp2p через Tor/I2P",
          "Публичный DHT: выкл",
          "mDNS: выкл",
          "Relay: только свои",
          "Payload: E2E",
          "Метрики: локально",
        ],
      };
    }
    return {
      title: "Приватный быстрый",
      color: "from-emerald-500/30 to-cyan-500/20",
      chips: [
        "Transport: libp2p поверх Yggdrasil/WireGuard",
        "Публичный DHT: выкл/локально",
        "mDNS: LAN on",
        "Relay: свои в оверлее",
        "Payload: E2E",
        "Метрики: локально",
      ],
    };
  }, [profile]);

  const Chip = ({ children }: { children: React.ReactNode }) => (
    <span className="px-2 py-1 rounded-full text-xs bg-white/10 text-white/80">{children}</span>
  );

  const Segm = ({ p, label }: { p: PrivacyProfile; label: string }) => (
    <button
      onClick={() => onChangeProfile?.(p)}
      className={`px-3 py-1.5 rounded-lg text-sm transition
        ${profile === p ? "bg-white/20 text-white" : "bg-white/10 text-white/80 hover:bg-white/15"}`}
      title={label}
    >
      {p === "anon" ? "🕶️ " : "⚡ "}{label}
    </button>
  );

  return (
    <motion.div
      className={`rounded-2xl border border-white/10 p-5 bg-gradient-to-br ${policy.color}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-white/90 font-semibold text-lg">Состояние сети</div>
        <div className="flex items-center gap-2">
          <Segm p="anon" label="Анонимный" />
          <Segm p="fast" label="Приватный быстрый" />
        </div>
      </div>

      <p className="mt-4 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100" role="status">
        Сеть ещё не подключена. Маршрут и шифрование не подтверждены; измерения недоступны.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Chip>Путь: не подтверждён</Chip>
        <Chip>Резервный маршрут: не проверен</Chip>
        <Chip>Профиль: {policy.title}</Chip>
      </div>

      <div className="mt-4 text-xs text-white/60">Запланированные правила профиля, пока не применены к сети:</div>
      <div className="mt-4 flex flex-wrap gap-2">
        {policy.chips.map((c) => <Chip key={c}>{c}</Chip>)}
      </div>
    </motion.div>
  );
}
