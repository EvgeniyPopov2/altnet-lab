import assert from "node:assert/strict";
import { test } from "node:test";
import { workspaceConnectionText } from "../browser/tor-browser/native/NativeWorkspaceShell.sys.mjs";

test("нативная панель показывает только подтверждённое состояние маршрута", () => {
  assert.equal(workspaceConnectionText(null), "Проверяем связь с клиентом…");
  assert.equal(workspaceConnectionText({ torConnected: false, phase: "paused" }), "Tor приостановлен");
  assert.equal(workspaceConnectionText({ torConnected: false, phase: "waiting" }), "Tor: мост недоступен, повторим попытку");
  assert.equal(workspaceConnectionText({ torConnected: false, phase: "recovering" }), "Tor: восстанавливаем подключение…");
  assert.equal(workspaceConnectionText({ torConnected: true, internet: "checking" }), "Tor подключён · проверяем интернет");
  assert.equal(workspaceConnectionText({ torConnected: true, internet: "unreachable" }), "Tor подключён · проверочные сайты недоступны");
  assert.equal(workspaceConnectionText({ torConnected: true, internet: "unchecked" }), "Tor подключён · интернет не проверен");
  assert.equal(workspaceConnectionText({ torConnected: true, internet: "https" }), "Tor подключён · интернет проверен");
});
