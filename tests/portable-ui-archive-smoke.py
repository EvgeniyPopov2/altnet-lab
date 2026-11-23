#!/usr/bin/env python3
"""Проверить интерфейс внутри переносимых архивов без запуска сетевого клиента."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import mimetypes
from pathlib import Path
import subprocess
import sys
import tarfile
import threading
from urllib.parse import urlsplit
import zipfile

PREFIX = "AltNet/ui/"
TEST = Path(__file__).with_name("sitebuilder-drag-ui.py")


def read_ui(path):
    if path.suffix == ".zip":
        with zipfile.ZipFile(path) as archive:
            return {name[len(PREFIX):]: archive.read(name) for name in archive.namelist() if name.startswith(PREFIX) and not name.endswith("/")}
    with tarfile.open(path, "r:gz") as archive:
        return {item.name[len(PREFIX):]: archive.extractfile(item).read() for item in archive if item.isfile() and item.name.startswith(PREFIX)}


def check(path, browser):
    files = read_ui(path)
    if "index.html" not in files:
        raise ValueError("UI index missing from " + str(path))

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            name = urlsplit(self.path).path.lstrip("/") or "index.html"
            payload = files.get(name)
            if payload is None:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(name)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        url = f"http://127.0.0.1:{server.server_port}/"
        for flag in ("--image-style-smoke", "--mobile-touch-smoke", "--mobile-grid-touch-smoke", "--mobile-sort-touch-smoke"):
            print(path.name, flag, flush=True)
            subprocess.run([sys.executable, "-B", str(TEST), browser, "--url", url, flag], check=True, timeout=90)
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("browser")
    parser.add_argument("archives", nargs="+", type=Path)
    args = parser.parse_args()
    for archive in args.archives:
        check(archive, args.browser)
    print("PASS UI from all portable archives")


if __name__ == "__main__":
    main()
