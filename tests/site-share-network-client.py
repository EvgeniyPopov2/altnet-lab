#!/usr/bin/env python3
"""Run an isolated test client; closing stdin asks it to shut down cleanly."""
from http.server import ThreadingHTTPServer
from pathlib import Path
import sys
import threading

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import bridge_client

original_load_catalog = bridge_client.catalog.load_catalog


def logged_catalog(*args, **kwargs):
    try:
        return original_load_catalog(*args, **kwargs)
    except Exception as error:
        print("Тест: ошибка проверки каталога:", type(error).__name__, flush=True)
        raise


bridge_client.catalog.load_catalog = logged_catalog


class TestServer(ThreadingHTTPServer):
    def __init__(self, address, handler):
        super().__init__(address, handler)
        if handler is bridge_client.LocalUI:
            threading.Thread(target=self.wait_for_shutdown, daemon=True).start()

    def wait_for_shutdown(self):
        sys.stdin.buffer.read(1)
        self.shutdown()


bridge_client.ThreadingHTTPServer = TestServer
bridge_client.main()
