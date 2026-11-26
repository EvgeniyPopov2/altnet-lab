/* Нативная компоновка окна. Не запускает клиент и не выбирает источник страницы.
 * Этот модуль доступен только привилегированному коду браузера. */
const MIN_WIDTH = 800;
const BUNDLED_ROOT = "altnet-workspace";
const BUNDLED_PATH = "altnet-workspace-client/";
let bundledUsers = 0;
let bundledURI = null;

// Назначение фиксировано в привилегированном модуле. Введённый текст попадает
// только во фрагмент адреса и разбирается обычным непривилегированным просмотрщиком.
export function workspaceViewerURI(input, profile) {
  if (typeof input !== "string" || input.length > 2048 || /[\u0000-\u001f\u007f]/u.test(input)) return null;
  const address = input.trim().replace(/^(alt|ipfs):/i, scheme => scheme.toLowerCase());
  if (!/^(?:alt|ipfs):\/\//.test(address)) return null;
  const query = new URLSearchParams({ address });
  if (profile === "fast") query.set("profile", "fast");
  return `resource://altnet-workspace/index.html#altnet-open?${query}`;
}

function readEntry(zip, name, maxSize) {
  const size = zip.getEntry(name).realSize;
  if (!Number.isSafeInteger(size) || size < 1 || size > maxSize) throw new Error("Некорректный модуль клиента");
  const input = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
  input.setInputStream(zip.getInputStream(name));
  try { return Uint8Array.from(input.readByteArray(size)); }
  finally { input.close(); }
}

async function attachWindowsClient(binding) {
  const { openNativeSession } = ChromeUtils.importESModule("moz-src:///browser/components/abouttor/NativeSessionChannel.sys.mjs");
  const { command, root, sha256 } = binding.config;
  if (Services.appinfo.OS !== "WINNT" || typeof root !== "string" || !PathUtils.isAbsolute(root) ||
      typeof command !== "string" || !PathUtils.isAbsolute(command) || PathUtils.filename(command).toLowerCase() !== "python.exe" ||
      !/^[0-9a-f]{64}$/.test(sha256)) throw new Error("Неизвестная установка клиента");
  // Передаём ровно байты адаптера из своего omni.ja, без импорта из каталога сайта.
  const code = "import base64,sys;source=base64.b64decode(''.join(sys.argv[3:3+int(sys.argv[2])]),validate=True);sys.argv=['altnet-attach',sys.argv[1]];exec(compile(source,'altnet-attach','exec'))";
  const parts = btoa(String.fromCharCode(...binding.adapter)).match(/.{1,3000}/g);
  return openNativeSession({
    command, args: ["-I", "-S", "-B", "-c", code, root, String(parts.length), ...parts],
    verifyExecutable: async exe => exe === command && await IOUtils.computeHexDigest(exe, "sha256") === sha256,
  });
}

export function workspaceConnectionText(status) {
  if (!status || typeof status.torConnected !== "boolean") return "Проверяем связь с клиентом…";
  if (status.torConnected) {
    if (status.internet === "verified" || status.internet === "https") return "Tor подключён · интернет проверен";
    if (status.internet === "unreachable") return "Tor подключён · проверочные сайты недоступны";
    if (status.internet === "checking") return "Tor подключён · проверяем интернет";
    return "Tor подключён · интернет не проверен";
  }
  if (status.phase === "paused") return "Tor приостановлен";
  if (status.phase === "waiting") return "Tor: мост недоступен, повторим попытку";
  if (status.phase === "recovering") return "Tor: восстанавливаем подключение…";
  if (status.phase === "checking") return "Tor: проверяем мост…";
  return "Tor: подключение…";
}

/**
 * Экспериментальная панель из ресурсов собственной сборки браузера.
 * Не запускает клиент и не подключает локальный API или пользовательские данные.
 * Владелец сеанса отвечает за его закрытие после уничтожения панели.
 */
export function createBundledWorkspace(window, { session, attachInstalled = false } = {}) {
  if (session !== undefined && (!session || typeof session.getStatus !== "function")) throw new Error("Некорректный локальный сеанс");
  const handler = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsISubstitutingProtocolHandler);
  const omni = Services.dirsvc.get("GreD", Ci.nsIFile).clone();
  omni.append("omni.ja");
  if (!omni.exists() || !omni.isFile()) throw new Error("Ресурсы браузера недоступны");
  const zip = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(Ci.nsIZipReader);
  zip.open(omni);
  let binding = null, hasRecords = false;
  try { if (!zip.hasEntry(`${BUNDLED_PATH}index.html`)) throw new Error("Интерфейс клиента не включён в эту сборку");
    hasRecords = Services.appinfo.OS === "Linux" && zip.hasEntry("moz-src/browser/components/abouttor/LinuxWorkspaceCipher.sys.mjs");
    if (attachInstalled && zip.hasEntry("altnet-native/installed.json")) {
      binding = { config: JSON.parse(new TextDecoder().decode(readEntry(zip, "altnet-native/installed.json", 4096))),
        adapter: readEntry(zip, "altnet-native/attach.py", 16000) };
    }
  } finally { zip.close(); }
  const expected = Services.io.newURI(`jar:${Services.io.newFileURI(omni).spec}!/${BUNDLED_PATH}`);
  if (!bundledUsers) {
    if (handler.hasSubstitution(BUNDLED_ROOT)) throw new Error("Адрес панели уже занят");
    handler.setSubstitutionWithFlags(BUNDLED_ROOT, expected, 0);
    bundledURI = expected.spec;
  } else if (!handler.hasSubstitution(BUNDLED_ROOT) || handler.getSubstitution(BUNDLED_ROOT).spec !== bundledURI || expected.spec !== bundledURI) {
    throw new Error("Источник панели изменился");
  }
  bundledUsers++;
  const records = hasRecords && ChromeUtils.importESModule("moz-src:///browser/components/abouttor/WorkspaceRecords.sys.mjs");
  let shell, releaseRecords;
  try {
    shell = createWorkspaceShell(window);
    if (records) releaseRecords = records.bindWorkspaceRecords(window, shell.client);
    shell.client.loadURI(Services.io.newURI(`resource://${BUNDLED_ROOT}/index.html`), {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
  } catch (error) {
    releaseRecords?.();
    shell?.destroy();
    if (!--bundledUsers) {
      if (handler.hasSubstitution(BUNDLED_ROOT) && handler.getSubstitution(BUNDLED_ROOT).spec === bundledURI) handler.setSubstitution(BUNDLED_ROOT, null);
      bundledURI = null;
    }
    throw error;
  }
  let destroyed = false;
  let timer, ownedSession;
  const prefix = binding ? "Клиент AltNet · " : "Тестовый сеанс · ";
  const poll = async () => {
    try {
      const status = await (ownedSession || session).getStatus();
      if (!destroyed) shell.setConnectionStatus(prefix + workspaceConnectionText(status));
    } catch { if (!destroyed) shell.setConnectionStatus(prefix + "нет связи"); }
    if (!destroyed) timer = window.setTimeout(poll, 8000);
  };
  if (session) void poll();
  if (binding) {
    shell.setConnectionStatus("Подключаем локальный клиент…");
    void attachWindowsClient(binding).then(async live => {
      if (destroyed) { await live.close(); return; }
      ownedSession = live;
      shell.setBridgeAction(async action => {
        await live.bridgeAction(action);
        shell.setConnectionStatus(prefix + workspaceConnectionText(await live.getStatus()));
      });
      void poll();
    }).catch(() => { if (!destroyed) shell.setConnectionStatus("Не удалось подтвердить локальный клиент"); });
  }
  return Object.freeze({
    client: shell.client,
    openAddress(input, where = "current") {
      if (destroyed || !handler.hasSubstitution(BUNDLED_ROOT) || handler.getSubstitution(BUNDLED_ROOT).spec !== expected.spec) return;
      if (/^alt:\/\/home\/?$/i.test(input.trim())) {
        shell.show();
        shell.client.focus();
        return;
      }
      const viewer = workspaceViewerURI(input, records ? records.selectedProfile() : undefined) ?? `resource://${BUNDLED_ROOT}/index.html#altnet-open?`;
      const target = ["current", "tab", "tabshifted", "window"].includes(where) ? where : "current";
      window.openTrustedLinkIn(viewer, target, { allowInheritPrincipal: false });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (ownedSession) void ownedSession.close().catch(() => {});
      if (timer !== undefined) window.clearTimeout(timer);
      releaseRecords?.();
      shell.destroy();
      if (!--bundledUsers) {
        if (handler.hasSubstitution(BUNDLED_ROOT) && handler.getSubstitution(BUNDLED_ROOT).spec === bundledURI) handler.setSubstitution(BUNDLED_ROOT, null);
        bundledURI = null;
      }
    },
  });
}

export function createWorkspaceShell(window) {
  const doc = window?.document;
  const root = doc?.getElementById("browser");
  const tabs = doc?.getElementById("tabbrowser-tabbox");
  const toolbar = doc?.getElementById("nav-bar-customization-target");
  if (!root || !tabs || !toolbar || doc.getElementById("altnet-workspace")) throw new Error("Рабочее окно недоступно");
  const element = (name, attributes) => {
    const node = doc.createXULElement(name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  };
  const panel = element("vbox", { id: "altnet-workspace", flex: "0", style: "width: 390px; min-width: 280px; max-width: 46vw; background: #111725; color: #f2efff; border-inline-end: 1px solid #343a50;" });
  const header = element("hbox", { align: "center", style: "min-height: 40px; padding: 0 10px; gap: 8px;" });
  const title = element("label", { value: "AltNet", flex: "1", style: "font-weight: 600;" });
  const close = element("toolbarbutton", { label: "Скрыть", tooltiptext: "Скрыть рабочую область AltNet" });
  const connection = element("label", { id: "altnet-workspace-connection", value: "", style: "padding: 0 10px 6px; color: #b6c2d9; font-size: 11px;" });
  connection.hidden = true;
  const client = element("browser", { id: "altnet-workspace-client", type: "content", remote: "true", flex: "1", disableglobalhistory: "true", disablefullscreen: "true", src: "about:blank" });
  const splitter = element("splitter", { id: "altnet-workspace-splitter", class: "chromeclass-extrachrome sidebar-splitter", resizebefore: "sibling", resizeafter: "none" });
  const toggle = element("toolbarbutton", { id: "altnet-workspace-toggle", class: "toolbarbutton-1 chromeclass-toolbar-additional", label: "AltNet", tooltiptext: "Показать или скрыть рабочую область AltNet", style: "list-style-image: url('resource://altnet-workspace/altnet-logo.png');" });
  const actions = element("hbox", { align: "center", style: "padding: 0 8px 4px; gap: 3px;" });
  actions.hidden = true;
  let bridgeAction;
  for (const [id, label] of [["refresh", "Обновить мосты"], ["switch", "Сменить мост"]]) {
    const button = element("toolbarbutton", { label });
    button.addEventListener("command", async () => {
      if (!bridgeAction || actions.disabled) return;
      actions.disabled = true;
      try { await bridgeAction(id); }
      catch { if (!destroyed) connection.setAttribute("value", "Клиент не принял команду"); }
      finally { actions.disabled = false; }
    });
    actions.append(button);
  }
  header.append(title, close);
  panel.append(header, connection, actions, client);
  root.insertBefore(panel, tabs);
  root.insertBefore(splitter, tabs);
  toolbar.insertBefore(toggle, toolbar.firstChild);
  const oldPosition = root.style.position;
  root.style.position = "relative";
  let requestedOpen = true, destroyed = false;
  const update = () => {
    const narrow = window.innerWidth < MIN_WIDTH;
    const visible = requestedOpen;
    panel.style.position = narrow ? "absolute" : "";
    panel.style.inset = narrow ? "0" : "";
    panel.style.zIndex = narrow ? "3" : "";
    panel.style.width = narrow ? "auto" : "390px";
    panel.style.maxWidth = narrow ? "none" : "46vw";
    panel.hidden = !visible;
    splitter.hidden = !visible || narrow;
    toggle.setAttribute("aria-expanded", String(visible));
    toggle.setAttribute("tooltiptext", "Показать или скрыть рабочую область AltNet");
  };
  const onToggle = () => { requestedOpen = !requestedOpen; update(); };
  const onClose = () => { requestedOpen = false; update(); };
  toggle.addEventListener("command", onToggle);
  close.addEventListener("command", onClose);
  window.addEventListener("resize", update);
  update();
  return Object.freeze({
    // Источник может назначать только вызывающий привилегированный код после проверки.
    client,
    setBridgeAction(callback) {
      if (destroyed) return;
      title.setAttribute("value", "AltNet");
      bridgeAction = callback;
      actions.hidden = false;
    },
    show() { requestedOpen = true; update(); },
    setConnectionStatus(text) {
      if (destroyed || typeof text !== "string" || text.length > 120) return;
      connection.setAttribute("value", text);
      connection.hidden = !text;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener("resize", update);
      root.style.position = oldPosition;
      toggle.removeEventListener("command", onToggle);
      close.removeEventListener("command", onClose);
      toggle.remove(); splitter.remove(); panel.remove();
    },
  });
}
