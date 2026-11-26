import { useCallback, useEffect, useRef, useState } from "react";
import { Network } from "lucide-react";

import { connectionText, type BridgeStatus } from "./bridgeStatus";
export type { BridgeStatus } from "./bridgeStatus";

const sources: Record<string, string> = {
  unchecked: "Источник ещё не проверен", cache: "Используется проверенный локальный каталог",
  seed: "Используется каталог из поставки", checking_official: "Проверяем сайт Tor Project",
  checking_peer: "Запрашиваем каталог у знакомого узла", official: "Сайт Tor Project доступен",
  peer: "Каталог подтверждён через знакомый узел", unavailable: "Источники обновления сейчас недоступны",
  waiting_tor: "Обновление каталога ожидает подключения Tor",
};
const button = "rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20 disabled:opacity-45";

function UbuntuConnection({ panic }: { panic: boolean }) {
  const [text, setText] = useState("Проверяем транспорт Ubuntu…");
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function update() {
      try {
        const [result] = await window.altNetRecords!.batch("site-publication", [{op:"route-status",key:""}]);
        const status = result as {tor:boolean; mesh:boolean};
        if (active) setText([status.tor ? "Tor · SOCKS доступен" : "Tor · SOCKS недоступен", status.mesh ? "Yggdrasil · интерфейс готов" : ""].filter(Boolean).join("   ·   "));
      } catch { if (active) setText("Сведения о транспорте недоступны"); }
      if (active) timer = setTimeout(update, 30000);
    }
    if (!panic) void update();
    return () => { active = false; clearTimeout(timer); };
  }, [panic]);
  return <div role="status" className="flex items-center gap-2 px-3 py-2 text-xs"><Network size={16} />{panic ? "Паника включена" : text}</div>;
}

export default function BridgeConnection({ panic }: { panic: boolean }) {
  if (typeof window !== "undefined" && window.location.protocol === "resource:" && window.altNetRecords?.linuxSites) return <UbuntuConnection panic={panic} />;
  return <ManagedConnection panic={panic} />;
}
function ManagedConnection({ panic }: { panic: boolean }) {
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [lines, setLines] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  const modal = useRef<HTMLDialogElement>(null);
  const previousPanic = useRef(panic);
  const token = typeof document === "undefined" ? undefined : document.querySelector<HTMLMetaElement>('meta[name="altnet-session"]')?.content;
  const request = useCallback(async (action: string, body?: object) => {
    if (!token) throw new Error("Откройте AltNet через локальный клиент.");
    const response = await fetch("/api/bridges/" + action, {
      method: body ? "POST" : "GET", mode: "same-origin", cache: "no-store", referrerPolicy: "same-origin",
      headers: { "X-AltNet-Session": token, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Локальный клиент не принял запрос.");
    }
    return await response.json() as BridgeStatus;
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let current = true;
    let timer: ReturnType<typeof setTimeout>;
    let resume = previousPanic.current && !panic;
    previousPanic.current = panic;
    const poll = async () => {
      let interval = 2000;
      try {
        let next = await request("status");
        if (current && ((panic && next.phase !== "paused") || (resume && next.phase === "paused"))) {
          next = await request(panic ? "pause" : "resume", {});
        }
        resume = false;
        if (current) setStatus(next);
        if (!next.busy && next.phase === "ready") interval = 8000;
        if (document.hidden) interval = Math.max(interval, 15000);
      } catch { if (current) setStatus(null); }
      if (current) timer = setTimeout(poll, interval);
    };
    void poll();
    return () => { current = false; clearTimeout(timer); };
  }, [panic, token, request]);

  useEffect(() => {
    if (open) modal.current?.showModal();
    else if (modal.current?.open) modal.current.close();
  }, [open]);

  async function act(action: string) {
    setSending(true); setError("");
    try {
      setStatus(await request(action, action === "manual" ? { lines } : {}));
      if (action === "manual") setLines("");
    } catch (e) { setError(e instanceof Error ? e.message : "Нет связи с локальным клиентом"); }
    finally { setSending(false); }
  }

  function closeDialog() {
    setLines("");
    setError("");
    setOpen(false);
  }

  const disabled = !status || sending || panic || status.phase === "paused";
  return (
    <div className="border-b border-white/10 bg-[#191d29] px-4 py-2 text-white/90">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
          <Network size={16} aria-hidden="true" className={status?.connected ? "text-emerald-300" : "text-amber-300"} />
          <span>{connectionText(status)}</span>
        </div>
        <button type="button" onClick={() => setOpen(true)} className={button}>Мосты Tor</button>
      </div>
      <dialog ref={modal} onCancel={closeDialog} onClose={() => { if (!modal.current?.open) closeDialog(); }}
        aria-labelledby="bridge-heading" className="m-auto max-h-[90vh] w-[min(34rem,94vw)] overflow-y-auto rounded-2xl border border-white/15 bg-[#191d29] p-5 text-white shadow-2xl backdrop:bg-black/65">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="bridge-heading" className="text-lg font-semibold">Мосты Tor</h2>
          <button type="button" className={button} onClick={closeDialog}>Закрыть</button>
        </div>
        <p role="status">{connectionText(status)}</p>
        {status ? <>
          <p className="my-2 text-sm text-white/70">{sources[status.source]} · В каталоге {status.publicCount} · Личных {status.manualCount}</p>
          {status.busy && <p className="text-sm">Подключение Tor · {status.progress}%</p>}
          {status.probes > 0 && <p className="text-sm text-white/70">Проверок одновременно · {status.probes} из {status.probeLimit}
            {status.power === "battery" || status.power === "saver" ? " · экономия батареи" : status.power === "cpu" ? " · высокая нагрузка" : ""}</p>}
          {status.internet === "verified" && <p className="my-1 text-sm text-emerald-300">Tor Project подтвердил выход в интернет через Tor.</p>}
          {status.internet === "https" && <p className="my-1 text-sm">HTTPS-запрос через мост прошёл.</p>}
          {status.internet === "unreachable" && <p className="my-1 text-sm text-amber-300">Сайты проверки пока не ответили через эту цепочку.</p>}
          {status.retryIn > 0 && <p className="text-sm">Следующая попытка через {status.retryIn} с</p>}
          {status.lastVerified && <p className="text-sm text-white/70">Последняя проверка цепочки · {new Date(status.lastVerified * 1000).toLocaleTimeString("ru")} {status.transport}</p>}
          {status.note && status.phase !== "ready" && <p className="mt-2 text-sm">{status.note}</p>}
          {status.phase === "ready" && status.note && !status.note.startsWith("Подключение") && <p className="mt-2 text-sm" role="status">{status.note}</p>}
        </> : <p className="my-2 text-sm text-white/70">Запустите локальный клиент AltNet и откройте его окно.</p>}
        <div className="my-4 flex flex-wrap gap-2">
          <button className={button} type="button" disabled={disabled} onClick={() => void act("refresh")}>Обновить список</button>
          <button className={button} type="button" disabled={disabled || status?.userAction} onClick={() => void act("switch")}>Сменить мост</button>
          {status?.phase === "paused" && !panic && <button className={button} disabled={sending} onClick={() => void act("resume")}>Возобновить</button>}
        </div>
        <label htmlFor="manual-bridges" className="font-medium">Вставить мост вручную</label>
        <p id="manual-help" className="my-2 text-sm text-white/70">Скопируйте строку obfs4 целиком. Несколько мостов вставляйте по одному на строку. Эти адреса хранятся только на вашем устройстве.</p>
        <p className="mb-1 text-sm text-white/70">Если сайт заблокирован, запросите /obfs4 у @GetBridgesBot в Telegram или напишите на bridges@torproject.org с Gmail или Riseup.</p>
        <a className="text-sm text-indigo-300 underline" href="https://support.torproject.org/tor-browser/circumvention/getting-bridges/" target="_blank" rel="noreferrer">Другие способы получить мост</a>
        <textarea id="manual-bridges" aria-describedby="manual-help" rows={3} maxLength={16384} spellCheck={false} autoComplete="off"
          className="my-3 w-full rounded-lg border border-white/20 bg-black/20 p-2 font-mono text-sm"
          placeholder="obfs4 IP:порт отпечаток cert=сертификат iat-mode=0" value={lines} onChange={e => setLines(e.target.value)} />
        <button type="button" className={button} disabled={disabled || status?.userAction || !lines.trim()} onClick={() => void act("manual")}>Добавить и проверить</button>
        {error && <p role="alert" className="mt-2 text-sm text-amber-300">{error}</p>}
      </dialog>
    </div>
  );
}

