#!/usr/bin/env python3
"""Offline integration test for AltNet's native browser page and settings actor.

Runs an explicitly supplied experimental Firefox binary in a fresh isolated
profile, with non-local networking disabled and a non-routable SOCKS proxy.
"""
import argparse
import base64
import json
import os
from pathlib import Path
import socket
import subprocess
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


def run(browser, artifact_root, theme):
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
            with wait_for(connect, "isolated Marionette", timeout=45) as sock:
                sock.settimeout(30)
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
                result = client.call("WebDriver:ExecuteScript", {"script": "let w = Services.wm.getMostRecentWindow('navigator:browser'); let d = w.document; let bg = d.querySelector('#urlbar > .urlbar-background'); return {loaded: !!d.querySelector('link[href*=\\\"altnet-chrome.css\\\"]'), radius: bg && w.getComputedStyle(bg).borderTopLeftRadius};", "args": []})["value"]
                assert result["loaded"] and result["radius"] == "10px", result
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
    args = parser.parse_args()
    run(args.browser.resolve(strict=True), args.artifacts.resolve(strict=True), args.theme)
