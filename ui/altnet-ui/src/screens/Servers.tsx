import type { PrivacyProfile } from "../core/policy/types";

export type ServerItem = {
  id: string;
  title: string;
  subtitle?: string;
};

export default function Servers({ profile, server }: { profile: PrivacyProfile; server: ServerItem }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-white/90 font-semibold">{server.title}</div>
            {server.subtitle && <div className="text-xs text-white/60">{server.subtitle}</div>}
          </div>
          <div className="text-xs text-white/60">Профиль: {profile === "anon" ? "Anon" : "Fast"}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
        Каналы выбранного сервера (текст/вики/файлы/голос) — моки.
        <div className="mt-3 text-sm text-white/60">
          Следующий шаг: экран каналов + голосовой канал с политикой ESM для групп (fail-closed).
        </div>
      </div>
    </div>
  );
}
