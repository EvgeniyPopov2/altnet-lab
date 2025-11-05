import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

export type NetProfile = "anon" | "fast";

type Metrics = {
  rtt: number;     // ms
  jitter: number;  // ms
  loss: number;    // %
  mtu: number;     // bytes
  path: string;    // основной путь
  failover: "готов" | "переключение…";
};

function rand(min: number, max: number) {
  return Math.round(min + Math.random() * (max - min));
}

function genMetrics(profile: NetProfile): Metrics {
  if (profile === "anon") {
    return {
      rtt: rand(300, 800),
      jitter: rand(40, 140),
      loss: Math.round((Math.random() * 3 + 0.2) * 10) / 10,
      mtu: 1300,
      path: "Tor → libp2p (Noise/TLS)",
      failover: Math.random() < 0.1 ? "переключение…" : "готов",
    };
  }
  // fast
  return {
    rtt: rand(18, 60),
    jitter: rand(2, 10),
    loss: Math.round((Math.random() * 0.9 + 0.05) * 100) / 100,
    mtu: 1420,
    path: "Yggdrasil/WireGuard → libp2p (Noise/TLS)",
    failover: Math.random() < 0.05 ? "переключение…" : "готов",
  };
}

export default function NetStatus({
  profile,
  onChangeProfile,
}: {
  profile: NetProfile;
  onChangeProfile?: (p: NetProfile) => void;
}) {
  const [m, setM] = useState<Metrics>(() => genMetrics(profile));

  useEffect(() => {
    // при смене профиля даём «пересчёт»
    setM(genMetrics(profile));
  }, [profile]);

  useEffect(() => {
    const t = setInterval(() => setM(genMetrics(profile)), 2000);
    return () => clearInterval(t);
  }, [profile]);

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

  const Segm = ({ p, label }: { p: NetProfile; label: string }) => (
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

      {/* Метрики */}
      <div className="mt-4 grid sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-white/10 p-3">
          <div className="text-xs text-white/60">RTT</div>
          <div className="text-white/90 text-lg">{m.rtt} ms</div>
        </div>
        <div className="rounded-xl bg-white/10 p-3">
          <div className="text-xs text-white/60">Jitter</div>
          <div className="text-white/90 text-lg">{m.jitter} ms</div>
        </div>
        <div className="rounded-xl bg-white/10 p-3">
          <div className="text-xs text-white/60">Loss</div>
          <div className="text-white/90 text-lg">{m.loss}%</div>
        </div>
        <div className="rounded-xl bg-white/10 p-3">
          <div className="text-xs text-white/60">MTU</div>
          <div className="text-white/90 text-lg">{m.mtu}</div>
        </div>
      </div>

      {/* Путь и failover */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Chip>Путь: {m.path}</Chip>
        <Chip>
          <span className={m.failover === "готов" ? "text-emerald-300" : "text-amber-300"}>●</span>{" "}
          Hot-failover: {m.failover}
        </Chip>
        <Chip>Профиль: {policy.title}</Chip>
      </div>

      {/* Политики */}
      <div className="mt-4 flex flex-wrap gap-2">
        {policy.chips.map((c) => <Chip key={c}>{c}</Chip>)}
      </div>
    </motion.div>
  );
}
