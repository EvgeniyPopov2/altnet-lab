/* Нативная компоновка окна. Не запускает клиент и не выбирает источник страницы.
 * Этот модуль доступен только привилегированному коду браузера. */
const MIN_WIDTH = 800;

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
  const title = element("label", { value: "AltNet · тестовое окно", flex: "1", style: "font-weight: 600;" });
  const close = element("toolbarbutton", { label: "Скрыть", tooltiptext: "Скрыть рабочую область AltNet" });
  const client = element("browser", { id: "altnet-workspace-client", type: "content", remote: "true", flex: "1", disableglobalhistory: "true", disablefullscreen: "true", src: "about:blank" });
  const splitter = element("splitter", { id: "altnet-workspace-splitter", class: "chromeclass-extrachrome sidebar-splitter", resizebefore: "sibling", resizeafter: "none" });
  const toggle = element("toolbarbutton", { id: "altnet-workspace-toggle", class: "toolbarbutton-1 chromeclass-toolbar-additional", label: "AltNet", tooltiptext: "Показать или скрыть рабочую область AltNet", style: "list-style-image: url('chrome://branding/content/about-logo.png');" });
  header.append(title, close);
  panel.append(header, client);
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
