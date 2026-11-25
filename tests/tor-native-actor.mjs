import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const patch = await readFile(new URL("../browser/tor-browser/patches/0001-about-altnet.patch", import.meta.url), "utf8");
function addedFile(path) {
  const marker = `diff --git a/${path} b/${path}\n`;
  const section = patch.split(marker)[1]?.split("\ndiff --git ")[0];
  assert.ok(section, `Missing ${path}`);
  return section.split("\n").filter(line => line.startsWith("+") && !line.startsWith("+++")).map(line => line.slice(1)).join("\n");
}
globalThis.JSWindowActorParent = class {};
globalThis.JSWindowActorChild = class {};
const load = async name => import(`data:text/javascript;base64,${Buffer.from(addedFile(`browser/components/abouttor/${name}.sys.mjs`)).toString("base64")}`);
const { AboutAltNetParent } = await load("AboutAltNetParent");
const { AboutAltNetChild } = await load("AboutAltNetChild");

function parentFixture(uri = "about:altnet", topLevel = true) {
  const calls = [];
  const parent = new AboutAltNetParent();
  parent.manager = { documentURI: { spec: uri } };
  parent.browsingContext = { embedderElement: { documentGlobal: { openPreferences: pane => calls.push(pane) } } };
  parent.browsingContext.top = topLevel ? parent.browsingContext : {};
  return { parent, calls };
}

test("parent opens only the three fixed settings panes", () => {
  const { parent, calls } = parentFixture();
  for (const pane of ["general", "privacy", "search"]) parent.receiveMessage({ name: "AboutAltNet:OpenPreferences", data: pane });
  for (const pane of ["", "about:config", "https://example.invalid", null, {}, "constructor", "__proto__"]) parent.receiveMessage({ name: "AboutAltNet:OpenPreferences", data: pane });
  parent.receiveMessage({ name: "different message", data: "privacy" });
  assert.deepEqual(calls, ["general", "privacy", "search"]);
});

test("parent rejects wrong document and embedded page", () => {
  for (const [uri, top] of [["https://example.invalid/", true], ["about:altnet", false]]) {
    const { parent, calls } = parentFixture(uri, top);
    parent.receiveMessage({ name: "AboutAltNet:OpenPreferences", data: "privacy" });
    assert.deepEqual(calls, []);
  }
});

test("child accepts only trusted primary clicks on allowlisted buttons", () => {
  const child = new AboutAltNetChild();
  const sent = [];
  child.sendAsyncMessage = (...message) => sent.push(message);
  const button = { dataset: { altnetSetting: "privacy" }, ownerDocument: { documentURI: "about:altnet" } };
  const event = { isTrusted: true, defaultPrevented: false, button: 0, target: { closest: () => button } };
  child.handleEvent(event);
  child.handleEvent({ ...event, isTrusted: false });
  child.handleEvent({ ...event, defaultPrevented: true });
  child.handleEvent({ ...event, button: 2 });
  button.dataset.altnetSetting = "about:config";
  child.handleEvent(event);
  button.dataset.altnetSetting = "privacy";
  button.ownerDocument.documentURI = "https://example.invalid/";
  child.handleEvent(event);
  assert.deepEqual(sent, [["AboutAltNet:OpenPreferences", "privacy"]]);
});
