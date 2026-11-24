#!/usr/bin/env python3
"""Два локальных клиента с имитацией Tor; внешние соединения не создаются."""
import importlib.util
import json
from pathlib import Path
import select
import socket
import sys
import tempfile
import threading
from types import SimpleNamespace
from http.server import ThreadingHTTPServer

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "scripts"))
from bridge_client import LocalUI
from bridge_route import read_exact
from site_share import Share

spec = importlib.util.spec_from_file_location("share_tests", root / "tests/site-share.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SocksRelay(module.socketserver.BaseRequestHandler):
    def handle(self):
        source = self.request
        source.settimeout(5)
        try:
            if read_exact(source, 3) != b"\x05\x01\x02":
                return
            source.sendall(b"\x05\x02")
            version, length = read_exact(source, 2)
            username = read_exact(source, length)
            password = read_exact(source, read_exact(source, 1)[0])
            if version != 1 or not username or not password:
                return
            source.sendall(b"\x01\x00")
            prefix = read_exact(source, 5)
            host = read_exact(source, prefix[4]).decode("ascii")
            port = read_exact(source, 2)
            server = self.server.share.server
            if prefix[:4] != b"\x05\x01\x00\x03" or host != module.onion() or port != b"\x00\x50" or not server:
                return
            with socket.create_connection(("127.0.0.1", server.server_port), 3) as target:
                source.sendall(b"\x05\x00\x00\x01\x7f\x00\x00\x01\x00\x50")
                while True:
                    ready, _, _ = select.select([source, target], [], [], 5)
                    if not ready:
                        return
                    for connection in ready:
                        data = connection.recv(65536)
                        if not data:
                            return
                        (target if connection is source else source).sendall(data)
        except OSError:
            return


def make_ui(manager, proxy_port, share):
    ui = ThreadingHTTPServer(("127.0.0.1", 0), LocalUI)
    ui.authority = f"127.0.0.1:{ui.server_port}"
    ui.dist = (root / "ui/altnet-ui/dist").resolve()
    ui.token = "local-fixture-session"
    ui.manager = manager
    ui.socks_port = proxy_port
    ui.site_fetch = threading.BoundedSemaphore(1)
    ui.site_publish = threading.BoundedSemaphore(1)
    ui.site_share = share
    threading.Thread(target=ui.serve_forever, daemon=True).start()
    return ui


with tempfile.TemporaryDirectory(prefix="altnet-e2e-share-") as temp:
    directory = Path(temp)
    (directory / "control.cookie").write_bytes(bytes(range(32)))
    with module.Server(("127.0.0.1", 0), module.Controller) as controller:
        controller.closed = threading.Event()
        threading.Thread(target=controller.serve_forever, daemon=True).start()
        instance = SimpleNamespace(control=controller.server_address[1], directory=directory)
        manager = SimpleNamespace(active=instance, active_port=1, paused=False, stop=threading.Event(),
                                  lock=threading.RLock(), request=lambda action, value: None,
                                  public_status=lambda: {"phase": "ready", "connected": True, "busy": False})
        share = Share(manager)
        with module.Server(("127.0.0.1", 0), SocksRelay) as relay:
            relay.share = share
            threading.Thread(target=relay.serve_forever, daemon=True).start()
            author = make_ui(manager, relay.server_address[1], share)
            reader = make_ui(manager, relay.server_address[1], Share(manager))
            print(json.dumps({"author": author.server_port, "reader": reader.server_port}), flush=True)
            try:
                threading.Event().wait()
            finally:
                share.stop()
                author.shutdown()
                reader.shutdown()
                relay.shutdown()
                controller.shutdown()
