#!/usr/bin/env python3
"""Локальный тестовый SOCKS и API: не подключается к Tor или публичной сети."""
import base64
import importlib.util
import json
from pathlib import Path
import sys
import threading
from types import SimpleNamespace
from http.server import ThreadingHTTPServer

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("site_onion_tests", root / "tests/site-onion-transport.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
car = base64.b64decode(sys.stdin.readline().strip(), validate=True)
if not 0 < len(car) < 1024 * 1024:
    raise ValueError("Unexpected fixture size")
with module.Server(("127.0.0.1", 0), module.FakeSocks) as proxy, ThreadingHTTPServer(("127.0.0.1", 0), module.LocalUI) as ui:
    proxy.response = (b"HTTP/1.1 200 OK\r\nContent-Type: application/vnd.ipld.car\r\nContent-Length: "
                      + str(len(car)).encode() + b"\r\n\r\n" + car)
    threading.Thread(target=proxy.serve_forever, daemon=True).start()
    ui.authority = f"127.0.0.1:{ui.server_port}"
    ui.dist = (root / "ui/altnet-ui/dist").resolve()
    ui.token = "fixture-session"
    ui.manager = SimpleNamespace(active_port=1, paused=False, stop=threading.Event(), lock=threading.RLock(),
                                 public_status=lambda: {"phase": "ready", "connected": True, "busy": False},
                                 request=lambda action, value: None)
    ui.socks_port = proxy.server_address[1]
    ui.site_fetch = threading.BoundedSemaphore(1)
    print(json.dumps({"port": ui.server_port, "onion": module.onion()}), flush=True)
    try:
        ui.serve_forever()
    finally:
        proxy.shutdown()
