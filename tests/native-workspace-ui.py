#!/usr/bin/env python3
"""Изолированная визуальная проверка нативной компоновки с реальным UI клиента.

Тестовый backend не подключается к сети и не использует пользовательские данные.
Исключение для loopback включено только во временном профиле тестового браузера.
"""
import argparse
from http.server import ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from bridge_client import LocalUI


class TestUI(LocalUI):
    def do_GET(self):
        self.server.paths.append(self.path.split("?", 1)[0])
        return super().do_GET()


class TestManager:
    def __init__(self):
        self.ui_ready = threading.Event()

    def public_status(self):
        self.ui_ready.set()
        return {"phase": "paused", "connected": False, "progress": 0, "internet": "unchecked",
                "source": "unchecked", "publicCount": 0, "manualCount": 0, "busy": False,
                "probes": 0, "probeLimit": 1, "power": "mains", "userAction": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser", type=Path, required=True)
    parser.add_argument("--dist", type=Path, default=ROOT / "ui/altnet-ui/dist")
    args = parser.parse_args()
    browser = args.browser.resolve(strict=True)
    dist = args.dist.resolve(strict=True)
    if not (dist / "index.html").is_file(): raise ValueError("Нужна сборка интерфейса")
    with ThreadingHTTPServer(("127.0.0.1", 0), TestUI) as server:
        server.authority = f"127.0.0.1:{server.server_port}"
        server.dist, server.token, server.manager = dist, secrets.token_urlsafe(32), TestManager()
        server.standalone_browser = None
        server.paths = []
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            for theme in ("dark", "light"):
                command = [sys.executable, "-B", str(ROOT / "tests/tor-native-ui.py"), "--browser", str(browser),
                           "--theme", theme, "--expect-no-updater", "--native-workspace-from-stdin"]
                env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
                result = subprocess.run(command, input=json.dumps({"url": "http://" + server.authority + "/"}),
                                        text=True, encoding="utf-8", capture_output=True, timeout=120, env=env)
                if result.returncode:
                    raise RuntimeError(result.stdout + "\n" + result.stderr)
                if "PASS: real client UI and Gecko tabs share a responsive native window" not in result.stdout:
                    raise RuntimeError("Не подтверждена компоновка рабочего окна")
                if not server.manager.ui_ready.is_set():
                    raise RuntimeError("HTML загружен, но React-клиент не подтвердил запуск: " + repr(server.paths))
                server.manager.ui_ready.clear()
                server.paths.clear()
                print(result.stdout, flush=True)
        finally:
            server.shutdown(); thread.join()


if __name__ == "__main__":
    main()
