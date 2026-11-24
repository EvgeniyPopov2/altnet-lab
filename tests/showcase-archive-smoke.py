#!/usr/bin/env python3
"""Галерея из переносимых сборок, только локальный HTTP и тестовые проекты."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import mimetypes
from pathlib import Path
import subprocess
import tarfile
import threading
from urllib.parse import urlsplit
import zipfile

PREFIX = "AltNet/ui/"
root = Path(__file__).resolve().parents[1]
ui = root / "ui/altnet-ui"
parser = argparse.ArgumentParser()
parser.add_argument("--engine", choices=("chromium", "firefox", "webkit"), default="chromium")
parser.add_argument("--focus", help="Проверить отдельный шаблон по названию")
parser.add_argument("--full-export", action="store_true", help="Проверить экспорт и повторный импорт CAR")
parser.add_argument("archives", nargs="+", type=Path)
args = parser.parse_args()


def read_files(path):
    if path.suffix == ".zip":
        with zipfile.ZipFile(path) as archive:
            return {name[len(PREFIX):]: archive.read(name) for name in archive.namelist() if name.startswith(PREFIX) and not name.endswith("/")}
    with tarfile.open(path, "r:gz") as archive:
        return {item.name[len(PREFIX):]: archive.extractfile(item).read() for item in archive if item.isfile() and item.name.startswith(PREFIX)}


for archive in args.archives:
    files = read_files(archive)
    if "index.html" not in files:
        raise ValueError("В архиве нет интерфейса")

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            path = urlsplit(self.path).path.lstrip("/") or "index.html"
            body = files.get(path)
            if body is None:
                return self.send_error(404)
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(path)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass

    with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            url = f"http://127.0.0.1:{server.server_port}/"
            command = ["node", "tests/showcase-gallery-ui.mjs", "--url", url, "--engine", args.engine]
            if args.focus:
                command.extend(["--focus", args.focus])
            if args.full_export:
                command.append("--full-export")
            subprocess.run(command, cwd=ui, check=True, timeout=300)
        finally:
            server.shutdown()
            worker.join()
    print("PASS:", archive.name, flush=True)
