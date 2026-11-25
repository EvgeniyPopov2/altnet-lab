/* Экспериментальный канал к собственному дочернему процессу.
 * Вызывается только привилегированным кодом после независимой проверки поставки.
 * Не предоставляет доступ страницам и не меняет маршруты браузера. */
import { Subprocess } from "resource://gre/modules/Subprocess.sys.mjs";
import { setTimeout, clearTimeout } from "resource://gre/modules/Timer.sys.mjs";

const PROTOCOL = "altnet-native-v1";
const PHASES = new Set(["starting", "paused", "waiting", "ready", "recovering", "checking"]);
const INTERNET = new Set(["unchecked", "verified", "https", "unreachable"]);

async function readLine(stream, limit = 1024) {
  let line = "";
  while (line.length <= limit) {
    const char = await stream.readString(1);
    if (char === "\n") return line;
    // Python's text stdout on Windows normally ends lines with CRLF.
    if (char === "\r") {
      if (await stream.readString(1) === "\n") return line;
      throw new Error("Некорректный ответ клиента");
    }
    if (!char || char.charCodeAt(0) < 32 || char.charCodeAt(0) > 126) throw new Error("Некорректный ответ клиента");
    line += char;
  }
  throw new Error("Слишком длинный ответ клиента");
}

async function bounded(promise, proc, timeout) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Клиент не ответил вовремя")), timeout); })]);
  } catch (error) {
    await kill(proc);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function briefly(promise, timeout) {
  let timer;
  try { return await Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve(false), timeout); })]); }
  finally { clearTimeout(timer); }
}

async function kill(proc) {
  // Give the owned client a chance to stop its managed Tor processes first.
  try { await briefly(proc.stdin.close(), 1000); } catch { /* канал уже закрыт */ }
  let exited = false;
  try { exited = await briefly(proc.wait().then(() => true), 2000); } catch { /* процесс уже завершён */ }
  if (!exited) {
    try { await briefly(proc.kill(0), 3000); } catch { /* процесс уже завершён */ }
  }
  try { proc.stdout.close(); } catch { /* уже закрыт */ }
}

function parseLine(line) {
  try {
    const value = JSON.parse(line);
    // The child writes canonical ASCII JSON; this also rejects duplicate keys.
    if (JSON.stringify(value) !== line) throw new Error();
    return value;
  } catch { throw new Error("Некорректный ответ клиента"); }
}

function validReady(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 2 ||
      !Object.hasOwn(value, "protocol") || !Object.hasOwn(value, "authority") || value.protocol !== PROTOCOL || typeof value.authority !== "string") return false;
  const match = /^127\.0\.0\.1:([1-9][0-9]{0,4})$/.exec(value.authority);
  return !!match && match[0] === value.authority && Number(match[1]) <= 65535;
}

function validStatus(value, id) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 3 ||
      !["id", "ok", "status"].every(key => Object.hasOwn(value, key)) || value.id !== id || value.ok !== true) return false;
  const s = value.status;
  return !!s && typeof s === "object" && !Array.isArray(s) && Object.keys(s).length === 5 &&
    ["phase", "internet", "progress", "torConnected", "fastAvailable"].every(key => Object.hasOwn(s, key)) &&
    PHASES.has(s.phase) && INTERNET.has(s.internet) && Number.isInteger(s.progress) && s.progress >= 0 && s.progress <= 100 &&
    typeof s.torConnected === "boolean" && s.fastAvailable === false;
}

export async function openNativeSession({ command, args, verifyExecutable, timeoutMs = 10000 } = {}) {
  if (typeof command !== "string" || !command || command.length > 2048 || command.includes("\0") || !Array.isArray(args) || args.length > 64 ||
      args.some(value => typeof value !== "string" || value.length > 4096 || value.includes("\0") || /^--(?:port|socks-port)(?:=|$)|^--native-/.test(value)) ||
      typeof verifyExecutable !== "function" || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) throw new Error("Некорректные параметры локального клиента");
  const fixedArgs = Object.freeze([...args]);
  // Проверку целостности поставки обязан реализовать вызывающий доверенный код.
  if (await verifyExecutable(command, fixedArgs) !== true) throw new Error("Подлинность локального клиента не подтверждена");
  const proc = await Subprocess.call({ command, arguments: [...fixedArgs, "--port", "0", "--socks-port", "0", "--native-stdio"] });
  let closed = false, busy = false, nextId = 1;
  try {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const encoded = btoa(String.fromCharCode(...secret)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    secret.fill(0);
    await bounded(proc.stdin.write(JSON.stringify({ protocol: PROTOCOL, secret: encoded }) + "\n"), proc, timeoutMs);
    const ready = parseLine(await bounded(readLine(proc.stdout, 256), proc, timeoutMs));
    if (!validReady(ready)) throw new Error("Некорректный ответ клиента");
  } catch (error) {
    await kill(proc);
    throw error;
  }
  return Object.freeze({
    async getStatus() {
      if (closed || busy || nextId > 2147483647) throw new Error("Локальный сеанс недоступен");
      busy = true;
      const id = nextId++;
      try {
        await bounded(proc.stdin.write(JSON.stringify({ id, method: "status" }) + "\n"), proc, timeoutMs);
        const response = parseLine(await bounded(readLine(proc.stdout), proc, timeoutMs));
        if (!validStatus(response, id)) throw new Error("Не удалось проверить состояние локального клиента");
        return response.status;
      } catch (error) {
        closed = true;
        await kill(proc);
        throw error;
      } finally { busy = false; }
    },
    async close() {
      if (closed) return;
      closed = true;
      if (busy) { await kill(proc); return; }
      try { await bounded(proc.stdin.close(), proc, timeoutMs); await bounded(proc.wait(), proc, timeoutMs); }
      finally { try { proc.stdout.close(); } catch { /* уже закрыт */ } }
    },
  });
}
