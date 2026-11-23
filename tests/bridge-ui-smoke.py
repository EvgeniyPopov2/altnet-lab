#!/usr/bin/env python3
"""Exercise the running local UI with Chromium and websocket-client. No bridge strings in output."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import time
from urllib.request import urlopen
from urllib.parse import urlsplit

import websocket


def until(check, seconds=20):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        result = check()
        if result:
            return result
        time.sleep(.3)
    raise AssertionError("Timed out waiting for an expected UI state")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("browser", type=Path)
    ap.add_argument("--url", default="http://127.0.0.1:17860/")
    ap.add_argument("--switch", action="store_true")
    args = ap.parse_args()
    if urlsplit(args.url).hostname != "127.0.0.1":
        ap.error("Test only a local installation")
    with tempfile.TemporaryDirectory() as root:
        proc = subprocess.Popen([str(args.browser), "--headless=new", "--disable-gpu", "--no-first-run",
            "--disable-background-networking", "--disable-extensions", "--remote-debugging-port=0",
            "--remote-debugging-address=127.0.0.1", "--user-data-dir=" + root, args.url],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        try:
            socket_file = Path(root) / "DevToolsActivePort"
            until(socket_file.exists)
            port = socket_file.read_text().splitlines()[0]
            def page():
                with urlopen(f"http://127.0.0.1:{port}/json/list", timeout=5) as reply:
                    return next((p for p in json.load(reply) if p["type"] == "page" and p["url"] == args.url), None)
            target = until(page)
            ws = websocket.create_connection(target["webSocketDebuggerUrl"], suppress_origin=True, timeout=10)
            seq = 0
            def js(expression):
                nonlocal seq
                seq += 1
                ws.send(json.dumps({"id":seq, "method":"Runtime.evaluate", "params":{
                    "expression":expression, "returnByValue":True, "awaitPromise":True}}))
                while True:
                    msg = json.loads(ws.recv())
                    if msg.get("id") == seq:
                        result = msg["result"]
                        if "exceptionDetails" in result:
                            raise AssertionError("Browser JS evaluation failed")
                        return result["result"].get("value")
            def click(label):
                return js("(()=>{const scope=document.querySelector('dialog[open]')||document;const b=[...scope.querySelectorAll('button')].find(b=>b.textContent.trim()==="
                          + json.dumps(label) + ");if(!b||b.disabled)return false;b.click();return true})()")
            until(lambda: click("Мосты Tor"))
            until(lambda: js("document.querySelector('dialog[open] #manual-bridges')!==null"))
            if js("fetch('/api/bridges/status').then(r=>r.status)") != 403:
                raise AssertionError("Local control requires a session")
            js("""(()=>{const area=document.querySelector('#manual-bridges');
                Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(area,'invalid test input');
                area.dispatchEvent(new Event('input',{bubbles:true}));})()""")
            until(lambda: click("Добавить и проверить"))
            until(lambda: js("document.querySelector('dialog [role=alert]')?.textContent.includes('формат')"))
            until(lambda: click("Обновить список"))
            if args.switch:
                until(lambda: js("document.querySelector('dialog [role=status]')?.textContent.includes('подтверждено')"), 420)
                until(lambda: click("Сменить мост"))
                until(lambda: js("document.querySelector('dialog').innerText.includes('Проверяем другой мост')"), 15)
                until(lambda: js("document.querySelector('dialog').innerText.includes('Цепочка проверена') || "
                                 "document.querySelector('dialog').innerText.includes('Последняя проверка цепочки')"), 180)
                until(lambda: js("document.querySelector('dialog [role=status]')?.textContent.includes('подтверждено')"), 420)
                if js("/Проба завершилась|Резервных мостов пока нет/.test(document.querySelector('dialog').innerText)"):
                    raise AssertionError("Switch preserved the old route but did not find a new one")
            until(lambda: click("Закрыть"))
            until(lambda: js("document.querySelector('dialog[open]')===null"))
            until(lambda: click("Мосты Tor"))
            until(lambda: js("document.querySelector('dialog[open] #manual-bridges')?.value===''"))
            print("PASS bridge dialog, validation, update, session isolation" + (", live switch" if args.switch else ""))
            ws.send(json.dumps({"id": seq+1, "method":"Browser.close"}))
            ws.close()
        finally:
            try:
                proc.wait(4)
            except subprocess.TimeoutExpired:
                proc.terminate()
                proc.wait(6)


if __name__ == "__main__":
    main()

