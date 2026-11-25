#!/usr/bin/env python3
"""Offline integration test for AltNet's native browser page and settings actor.

Runs an explicitly supplied experimental Firefox binary in a fresh isolated
profile, with non-local networking disabled and a non-routable SOCKS proxy.
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time

ELEMENT = "element-6066-11e4-a52e-4f735466cecf"


def receive(sock):
    header = b""
    while not header.endswith(b":"):
        part = sock.recv(1)
        if not part:
            raise RuntimeError("Marionette connection closed")
        header += part
    length = int(header[:-1])
    data = bytearray()
    while len(data) < length:
        part = sock.recv(length - len(data))
        if not part:
            raise RuntimeError("Marionette response truncated")
        data.extend(part)
    return json.loads(data)


class Client:
    def __init__(self, sock):
        self.sock = sock
        self.sequence = 0

    def call(self, name, params=None):
        self.sequence += 1
        request = json.dumps([0, self.sequence, name, params or {}], separators=(",", ":")).encode()
        self.sock.sendall(str(len(request)).encode() + b":" + request)
        response = receive(self.sock)
        if response[0] != 1 or response[1] != self.sequence or response[2] is not None:
            raise RuntimeError(f"{name}: {response}")
        return response[3]


def wait_for(callback, label, timeout=15):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        result = callback()
        if result:
            return result
        time.sleep(0.1)
    raise AssertionError(f"Timed out: {label}")


def run(browser, artifact_root, theme, expect_no_updater=False, test_native_proof_module=False, native_live=None, native_channel=None, native_tor=None):
    root = Path(tempfile.mkdtemp(prefix="altnet-native-ui-", dir=artifact_root))
    profile = root / "profile"
    for folder in (profile, root / "appdata", root / "localappdata"):
        folder.mkdir()
    with socket.socket() as reserve:
        reserve.bind(("127.0.0.1", 0))
        port = reserve.getsockname()[1]
    (profile / "user.js").write_text("\n".join([
        f'user_pref("marionette.port", {port});',
        'user_pref("network.proxy.type", 1);',
        'user_pref("network.proxy.socks", "127.0.0.1");',
        'user_pref("network.proxy.socks_port", 1);',
        'user_pref("network.proxy.socks_remote_dns", true);',
        'user_pref("network.proxy.no_proxies_on", "127.0.0.1,localhost");',
        'user_pref("media.peerconnection.enabled", false);',
        'user_pref("browser.startup.homepage_override.mstone", "ignore");',
        f'user_pref("layout.css.prefers-color-scheme.content-override", {0 if theme == "dark" else 1});',
    ]), encoding="utf-8")
    env = {**os.environ, "TEMP": str(artifact_root), "TMP": str(artifact_root),
           "APPDATA": str(root / "appdata"), "LOCALAPPDATA": str(root / "localappdata"),
           "MOZ_DISABLE_NONLOCAL_CONNECTIONS": "1", "MOZ_HEADLESS": "1",
           "TOR_SKIP_LAUNCH": "1", "TOR_SKIP_CONTROLPORTTEST": "1"}
    with (root / "browser.log").open("wb") as log:
        process = subprocess.Popen([str(browser), "-no-remote", "-profile", str(profile),
                                    "-headless", "-marionette", "--remote-allow-system-access", "about:altnet"],
                                   env=env, stdout=log, stderr=subprocess.STDOUT,
                                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        try:
            def connect():
                if process.poll() is not None:
                    raise RuntimeError("Browser exited before starting Marionette")
                try:
                    return socket.create_connection(("127.0.0.1", port), timeout=1)
                except OSError:
                    return None
            with wait_for(connect, "isolated Marionette", timeout=90) as sock:
                sock.settimeout(90)
                assert receive(sock)["applicationType"] == "gecko"
                client = Client(sock)
                client.call("WebDriver:NewSession", {"capabilities": {}})
                original = client.call("WebDriver:GetWindowHandle")["value"]
                assert client.call("WebDriver:GetCurrentURL")["value"] == "about:altnet"
                # A synthetic click is untrusted; it must not open privileged UI.
                client.call("WebDriver:ExecuteScript", {"script": "document.querySelector('button.primary').click();", "args": []})
                time.sleep(0.3)
                assert client.call("WebDriver:GetWindowHandles") == [original], "Synthetic click opened settings"
                for selector, pane in (
                    ("button.primary", "general"),
                    ("button.secondary", "privacy"),
                    ('.tile[data-altnet-setting="general"]', "general"),
                    ('.tile[data-altnet-setting="privacy"]', "privacy"),
                    ('.tile[data-altnet-setting="search"]', "search"),
                ):
                    element = client.call("WebDriver:FindElement", {"using": "css selector", "value": selector})["value"][ELEMENT]
                    client.call("WebDriver:ElementClick", {"id": element})
                    other = wait_for(lambda: next((h for h in client.call("WebDriver:GetWindowHandles") if h != original), None), pane)
                    client.call("WebDriver:SwitchToWindow", {"handle": other})
                    url = wait_for(lambda: (url if (url := client.call("WebDriver:GetCurrentURL")["value"]).startswith("about:preferences") else None), pane)
                    if pane == "general":
                        placeholders = client.call("WebDriver:ExecuteScript", {"script": "return document.querySelectorAll('[support-page=preferences]').length;", "args": []})["value"]
                        assert placeholders > 0, "Preferences support control missing"
                    print(f"PASS: {pane}: {url}")
                    client.call("WebDriver:CloseWindow")
                    client.call("WebDriver:SwitchToWindow", {"handle": original})
                    assert url == f"about:preferences#{pane}", url
                # Ordinary pages may use the same attribute but do not own the
                # actor, even when a real user click is dispatched.
                client.call("WebDriver:Navigate", {"url": "data:text/html,<button data-altnet-setting=privacy>Test</button>"})
                hostile = client.call("WebDriver:FindElement", {"using": "css selector", "value": "button"})["value"][ELEMENT]
                client.call("WebDriver:ElementClick", {"id": hostile})
                time.sleep(0.3)
                assert client.call("WebDriver:GetWindowHandles") == [original], "A web page opened privileged settings"
                client.call("WebDriver:Navigate", {"url": "about:altnet"})
                logo = client.call("WebDriver:ExecuteScript", {"script": "let img = document.querySelector('.mark img'); return {source: img?.getAttribute('src'), loaded: !!img?.naturalWidth};", "args": []})["value"]
                assert logo == {"source": "chrome://branding/content/about-logo.png", "loaded": True}, logo
                support_notice = client.call("WebDriver:ExecuteScript", {"script": "return document.querySelector('.notice')?.textContent;", "args": []})["value"]
                assert "Поддержка AltNet" in support_notice and "ещё не подключены" in support_notice, support_notice
                effective_theme = client.call("WebDriver:ExecuteScript", {"script": "return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';", "args": []})["value"]
                assert effective_theme == theme, (theme, effective_theme)
                for width in (500, 1200):
                    client.call("WebDriver:SetWindowRect", {"width": width, "height": 900})
                    dimensions = client.call("WebDriver:ExecuteScript", {"script": "return {viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth};", "args": []})["value"]
                    assert dimensions["content"] <= dimensions["viewport"], dimensions
                    screenshot = client.call("WebDriver:TakeScreenshot", {})["value"]
                    (root / f"page-{theme}-{dimensions['viewport']}.png").write_bytes(base64.b64decode(screenshot))
                    print(f"PASS: layout at {dimensions['viewport']}px")
                # Read the chrome stylesheet in this isolated test process; no browser
                # preferences or permissions are changed by this check.
                client.call("Marionette:SetContext", {"value": "chrome"})
                if test_native_proof_module:
                    secret, nonce, authority = bytes(range(32)), bytes(range(32, 64)), "127.0.0.1:17777"
                    encoded = lambda value: base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")
                    payload = b"altnet-native-v1\0" + authority.encode("ascii") + b"\0" + nonce
                    response = {"protocol": "altnet-native-v1", "proof": encoded(hmac.new(secret, payload, hashlib.sha256).digest())}
                    native_proof = client.call("WebDriver:ExecuteScript", {"script": "let m = ChromeUtils.importESModule('moz-src:///browser/components/abouttor/NativeSessionProof.sys.mjs'); let s = Uint8Array.from(arguments[0]); let p = arguments[1]; return Promise.all([m.verifyNativeProof(s,p.authority,p.challenge,p.response),m.verifyNativeProof(s,p.authority+'1',p.challenge,p.response)]);", "args": [list(secret), {"authority": authority, "challenge": encoded(nonce), "response": response}]})["value"]
                    assert native_proof == [True, False], native_proof
                    print("PASS: Gecko verifies a bound native-session proof and rejects a changed address")
                    if native_live:
                        live = client.call("WebDriver:ExecuteScript", {"script": "let m = ChromeUtils.importESModule('moz-src:///browser/components/abouttor/NativeSessionProof.sys.mjs'); let p=arguments[0]; let w=Services.wm.getMostRecentWindow('navigator:browser'); let c=m.createNativeChallenge(); return w.fetch('http://'+p.authority+'/api/native/attest?challenge='+c,{cache:'no-store',credentials:'omit',redirect:'error'}).then(r=>r.json()).then(async response=>[await m.verifyNativeProof(Uint8Array.from(p.secret),p.authority,c,response),await m.verifyNativeProof(Uint8Array.from(p.secret),p.authority,m.createNativeChallenge(),response)]);", "args": [native_live]})["value"]
                        assert live == [True, False], live
                        print("PASS: Gecko verifies the live child response and rejects replay")
                if native_channel:
                    channel_script = """let m=ChromeUtils.importESModule('moz-src:///browser/components/abouttor/NativeSessionChannel.sys.mjs');
let p=arguments[0]; return (async()=>{
  let denied=false,called=false,blocked=0,badReady=false,badStatus=false,hung=false,checking=false;
  try { await m.openNativeSession({command:p.command,args:p.args,verifyExecutable:async()=>false}); } catch { denied=true; }
  for (const option of ['--port=123','--native-http-proof','--native-http-pr']) {
    try { await m.openNativeSession({command:p.command,args:[...p.args,option],verifyExecutable:async()=>{called=true;return true;}}); } catch { blocked++; }
  }
  if (p.badReadyArgs) try { await m.openNativeSession({command:p.command,args:p.badReadyArgs,verifyExecutable:async()=>true,timeoutMs:2000}); } catch { badReady=true; }
  if (p.badStatusArgs) try { let s=await m.openNativeSession({command:p.command,args:p.badStatusArgs,verifyExecutable:async()=>true,timeoutMs:2000}); await s.getStatus(); await s.close(); } catch { badStatus=true; }
  if (p.hangArgs) try { await m.openNativeSession({command:p.command,args:p.hangArgs,verifyExecutable:async()=>true,timeoutMs:400}); } catch { hung=true; }
  if (p.checkingArgs) { let s=await m.openNativeSession({command:p.command,args:p.checkingArgs,verifyExecutable:async()=>true,timeoutMs:2000}); try { let v=await s.getStatus(); checking=v.internet==='checking' && v.torConnected && v.fastAvailable===false; } finally { await s.close(); } }
  let session=await m.openNativeSession({command:p.command,args:p.args,verifyExecutable:async(command,args)=>command===p.command && JSON.stringify(args)===JSON.stringify(p.args),timeoutMs:15000});
  try { let first=session.getStatus();let concurrent=await session.getStatus().then(()=>false,()=>true);let status=await first;await session.close();let closed=false;try{await session.getStatus();}catch{closed=true;}return {denied,blocked,called,badReady,badStatus,hung,checking,concurrent,status,closed}; }
  finally { await session.close(); }
})();"""
                    channel = client.call("WebDriver:ExecuteScript", {"script": channel_script, "args": [native_channel]})["value"]
                    assert channel["denied"] and channel["blocked"] == 3 and not channel["called"] and channel["concurrent"] and channel["closed"], channel
                    if native_channel.get("badReadyArgs"):
                        assert channel["badReady"] and channel["badStatus"] and channel["hung"] and channel["checking"], channel
                    assert channel["status"]["torConnected"] is False and channel["status"]["fastAvailable"] is False, channel
                    print("PASS: Gecko starts a verified-test child, reads bounded status over pipes and closes it")
                if native_tor:
                    create_script = """let m=ChromeUtils.importESModule('moz-src:///browser/components/abouttor/NativeSessionChannel.sys.mjs');
let p=arguments[0],w=Services.wm.getMostRecentWindow('navigator:browser');return (async()=>{
w.__altnetNativeTestSession=await m.openNativeSession({command:p.command,args:p.args,verifyExecutable:async(command,args)=>command===p.command && JSON.stringify(args)===JSON.stringify(p.args),timeoutMs:15000});
return w.__altnetNativeTestSession.getStatus();})();"""
                    status = client.call("WebDriver:ExecuteScript", {"script": create_script, "args": [native_tor]})["value"]
                    try:
                        deadline = time.monotonic() + min(max(int(native_tor.get("timeout", 420)), 1), 420)
                        last = None
                        while time.monotonic() < deadline:
                            safe = (status["phase"], status["progress"], status["torConnected"], status["internet"], status["fastAvailable"])
                            if safe != last:
                                print("Temporary native session:", safe, flush=True)
                                last = safe
                            assert status["fastAvailable"] is False
                            if status["torConnected"] and status["internet"] in ("verified", "https"):
                                print("PASS: Gecko-owned client connected through Tor and verified HTTPS; fast route remained unavailable", flush=True)
                                break
                            time.sleep(3)
                            status = client.call("WebDriver:ExecuteScript", {"script": "return Services.wm.getMostRecentWindow('navigator:browser').__altnetNativeTestSession.getStatus();", "args": []})["value"]
                        else:
                            raise TimeoutError("Временный дочерний клиент не подтвердил соединение Tor вовремя")
                    finally:
                        client.call("WebDriver:ExecuteScript", {"script": "let w=Services.wm.getMostRecentWindow('navigator:browser');let s=w.__altnetNativeTestSession;delete w.__altnetNativeTestSession;return s.close();", "args": []})
                result = client.call("WebDriver:ExecuteScript", {"script": "let w = Services.wm.getMostRecentWindow('navigator:browser'); let d = w.document; let bg = d.querySelector('#urlbar > .urlbar-background'); let tab = d.querySelector('#TabsToolbar .tab-background'); let ext = Services.prefs.getBoolPref('network.protocol-handler.external-default'); let brand = Services.strings.createBundle('chrome://branding/locale/brand.properties').GetStringFromName('brandShortName'); return {loaded: !!d.querySelector('link[href*=\\\"altnet-chrome.css\\\"]'), radius: bg && w.getComputedStyle(bg).borderTopLeftRadius, tabRadius: tab && w.getComputedStyle(tab).borderTopLeftRadius, brand, externalDefault: ext, externalAlt: Services.prefs.getBoolPref('network.protocol-handler.external.alt', ext), externalIpfs: Services.prefs.getBoolPref('network.protocol-handler.external.ipfs', ext)};", "args": []})["value"]
                assert result["loaded"] and result["radius"] == "10px" and result["tabRadius"] == "10px", result
                assert "AltNet" in result["brand"] and "Tor" not in result["brand"], result
                assert not any(result[key] for key in ("externalDefault", "externalAlt", "externalIpfs")), "Alt/IPFS must not be passed to external apps by default"
                if expect_no_updater:
                    flags = client.call("WebDriver:ExecuteScript", {"script": "let {AppConstants} = ChromeUtils.importESModule('resource://gre/modules/AppConstants.sys.mjs'); return {updater: !!AppConstants.MOZ_UPDATER, translations: Services.prefs.getBoolPref('browser.translations.enable', false)};", "args": []})["value"]
                    assert not flags["updater"], "The experimental fork must not silently install Tor Browser updates"
                    assert not flags["translations"], "Translation must remain disabled until its engine and model delivery are verified"
                    print("PASS: updater absent and unverified translation disabled")
                notification = client.call("WebDriver:ExecuteScript", {"script": "let d = Services.wm.getMostRecentWindow('navigator:browser').document; return d.l10n.formatValue('language-notification-label-system', {language: 'Русский'});", "args": []})["value"]
                settings_labels = client.call("WebDriver:ExecuteScript", {"script": "let Localization = Services.wm.getMostRecentWindow('navigator:browser').Localization; let l = new Localization(['browser/preferences/preferences.ftl', 'toolkit/global/base-browser.ftl'], true); return l.formatMessages([{id:'pane-about-firefox-title'},{id:'help-button-label2'},{id:'update-application-updates-managed-by-os'},{id:'pane-profiles-no-account-sync'}]);", "args": []})["value"]
                assert settings_labels[0]["value"] == "О браузере AltNet", settings_labels
                assert settings_labels[1]["value"] == "Поддержка AltNet", settings_labels
                assert any("обновления AltNet пока не подключены" in a["value"] for a in settings_labels[2]["attributes"]), settings_labels
                assert settings_labels[3]["value"] == "Профили", settings_labels
                assert "AltNet" in notification and "Tor" not in notification, notification
                routes = client.call("WebDriver:ExecuteScript", {"script": "let w = Services.wm.getMostRecentWindow('navigator:browser'); return {menu: w.getHelpLinkURL('firefox-help'), support: Services.prefs.getStringPref('browser.base-browser-support-url'), feedback: Services.prefs.getStringPref('app.feedback.baseURL'), feedbackHidden: w.document.getElementById('feedbackPage').hidden, aboutMenu: w.document.getElementById('aboutName').getAttribute('label'), releaseNotes: Services.prefs.getStringPref('app.releaseNotesURL.aboutDialog')};", "args": []})["value"]
                assert all(routes[key] == "about:altnet" for key in ("menu", "support", "feedback")), routes
                assert routes["feedbackHidden"] and routes["releaseNotes"] == "about:blank", routes
                assert "AltNet" in routes["aboutMenu"] and "Tor" not in routes["aboutMenu"], routes
                if routes["aboutMenu"].startswith("О "):
                    assert routes["aboutMenu"] == "О браузере AltNet", routes
                client.call("WebDriver:ExecuteScript", {"script": "Services.wm.getMostRecentWindow('navigator:browser').openHelpLink('firefox-help');", "args": []})
                client.call("Marionette:SetContext", {"value": "content"})
                support_tab = wait_for(lambda: next((h for h in client.call("WebDriver:GetWindowHandles") if h != original), None), "support tab")
                client.call("WebDriver:SwitchToWindow", {"handle": support_tab})
                assert wait_for(lambda: client.call("WebDriver:GetCurrentURL")["value"] == "about:altnet", "local support page")
                client.call("WebDriver:CloseWindow")
                client.call("WebDriver:SwitchToWindow", {"handle": original})
                client.call("Marionette:SetContext", {"value": "chrome"})
                chrome_windows = set(client.call("WebDriver:GetWindowHandles"))
                client.call("WebDriver:ExecuteScript", {"script": "Services.wm.getMostRecentWindow('navigator:browser').openAboutDialog();", "args": []})
                def about_text():
                    return client.call("WebDriver:ExecuteScript", {"script": "let w = Services.wm.getMostRecentWindow('Browser:About'); let d = w?.document; let project = d?.getElementById('projectDesc')?.textContent; let help = d?.getElementById('helpDesc')?.textContent; return project && help ? {title: d.title, project, help, releaseHidden: d.getElementById('release')?.hidden, feedbackHidden: d.getElementById('submit-feedback')?.hidden ?? true, notesHidden: d.getElementById('releasenotes')?.hidden, links: Array.from(d.querySelectorAll('[href]'), x => x.getAttribute('href'))} : null;", "args": []})["value"]
                about = wait_for(about_text, "localized about dialog")
                assert "AltNet" in about["title"] and "AltNet" in about["project"] and "Tor Project" in about["project"], about
                assert "AltNet" in about["help"] and "support.torproject.org/tor-browser" not in about["links"], about
                assert about["releaseHidden"] and about["feedbackHidden"] and about["notesHidden"], about
                assert "about:license" in about["links"], about
                print("PASS: AltNet support routes and accurate about-dialog attribution")
                dialog = wait_for(lambda: next(iter(set(client.call("WebDriver:GetWindowHandles")) - chrome_windows), None), "about window")
                client.call("WebDriver:SwitchToWindow", {"handle": dialog})
                screenshot = client.call("WebDriver:TakeScreenshot", {})["value"]
                (root / "about-dialog.png").write_bytes(base64.b64decode(screenshot))
                client.call("WebDriver:SwitchToWindow", {"handle": next(iter(chrome_windows))})
                screenshot = client.call("WebDriver:TakeScreenshot", {})["value"]
                (root / "browser-chrome.png").write_bytes(base64.b64decode(screenshot))
                print("PASS: native chrome stylesheet and untrusted click isolation")
                client.call("WebDriver:DeleteSession")
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
    print("Test artifacts:", root)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--browser", type=Path, required=True)
    parser.add_argument("--artifacts", type=Path, default=Path(os.environ.get("TEMP", tempfile.gettempdir())))
    parser.add_argument("--theme", choices=("light", "dark"), default="dark")
    parser.add_argument("--expect-no-updater", action="store_true")
    parser.add_argument("--test-native-proof-module", action="store_true")
    parser.add_argument("--native-proof-live-from-stdin", action="store_true", help="Только тест: получить параметры временного дочернего клиента через stdin")
    parser.add_argument("--native-channel-from-stdin", action="store_true", help="Только тест: получить конфигурацию дочернего клиента через stdin")
    parser.add_argument("--native-tor-live-from-stdin", action="store_true", help="Только тест: запустить изолированный дочерний Tor-клиент")
    args = parser.parse_args()
    if args.native_proof_live_from_stdin and not args.test_native_proof_module:
        parser.error("Для живой проверки нужен --test-native-proof-module")
    if sum((args.native_proof_live_from_stdin, args.native_channel_from_stdin, args.native_tor_live_from_stdin)) > 1:
        parser.error("Нельзя совместить тестовые режимы stdin")
    native_live = json.loads(sys.stdin.readline(512)) if args.native_proof_live_from_stdin else None
    native_channel = json.loads(sys.stdin.readline(16384)) if args.native_channel_from_stdin else None
    native_tor = json.loads(sys.stdin.readline(16384)) if args.native_tor_live_from_stdin else None
    run(args.browser.resolve(strict=True), args.artifacts.resolve(strict=True), args.theme, args.expect_no_updater, args.test_native_proof_module, native_live, native_channel, native_tor)
