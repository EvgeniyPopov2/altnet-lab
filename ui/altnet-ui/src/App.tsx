import { useState } from "react";
import AltNetWireframes from "./screens/AltNetWireframes";

export default function App() {
  const [screen, setScreen] = useState<"home" | "wires">("home");

  return (
    <div className="min-h-screen p-6">
      <header className="max-w-7xl mx-auto flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AltNet UI · каркас</h1>
          <p className="text-sm text-white/70 mt-1">
            Vite + React + TypeScript + Tailwind. Дальше — вкладки и мок-состояние сети.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className={`px-3 py-1.5 rounded-full text-sm ${screen === "home" ? "bg-white/20" : "bg-white/10 hover:bg-white/20"}`}
            onClick={() => setScreen("home")}
          >
            Главная
          </button>
          <button
            className={`px-3 py-1.5 rounded-full text-sm ${screen === "wires" ? "bg-indigo-600" : "bg-white/10 hover:bg-white/20"}`}
            onClick={() => setScreen("wires")}
          >
            Открыть вайрфреймы
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto mt-6">
        {screen === "home" && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="text-white/80">
              Если видишь этот блок — Tailwind работает. Нажми «Открыть вайрфреймы».
            </div>
          </div>
        )}
        {screen === "wires" && <AltNetWireframes />}
      </main>
    </div>
  );
}