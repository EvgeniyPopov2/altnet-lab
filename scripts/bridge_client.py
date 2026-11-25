#!/usr/bin/env python3
"""Run the AltNet UI and bridge recovery for one local installation."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.client import HTTPException
import hmac
import json
import mimetypes
import os
from pathlib import Path
import secrets
import select
import shutil
import socket
import socketserver
import subprocess
import sys
import threading
from urllib.parse import urlsplit

from bridge_manager import Manager
from bridge_power import Budget
from bridge_sources import Sources, catalog
from site_onion import fetch_car, MAX_CAR
from site_share import Share
import bridge_native


class HTTP(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Never log manual bridge strings, session tokens, or peer requests.

    def reply(self, status, body=b"", mime="application/json"):
        size = body.stat().st_size if isinstance(body, Path) else len(body)
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(size))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        try:
            if isinstance(body, Path):
                with body.open("rb") as file:
                    shutil.copyfileobj(file, self.wfile)
            else:
                self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass


class Mirror(HTTP):
    def do_GET(self):
        manager = getattr(self.server, "manager", None)
        content = None if manager and manager.paused else self.server.sources.mirror_file(self.path)
        self.reply(200 if content is not None else 404, content or b"", "application/octet-stream")


class LocalUI(HTTP):
    def local(self):
        return self.headers.get_all("Host", []) == [self.server.authority]

    def authorized(self):
        values = self.headers.get_all("X-AltNet-Session", [])
        return len(values) == 1 and hmac.compare_digest(values[0].encode(), self.server.token.encode())

    def do_GET(self):
        if not self.local():
            return self.reply(403)
        route = urlsplit(self.path).path
        if route == "/api/native/attest":
            secret = getattr(self.server, "native_secret", None)
            if secret is None:
                return self.reply(404)
            # A single canonical 32-byte challenge; no secrets in the URL.
            parsed = urlsplit(self.path)
            query = parsed.query
            if parsed.fragment or not query.startswith("challenge=") or "&" in query:
                return self.reply(400)
            try:
                tag = bridge_native.proof(secret, self.server.authority, query[len("challenge="):])
            except ValueError:
                return self.reply(400)
            return self.reply(200, json.dumps({"protocol": bridge_native.PROTOCOL, "proof": tag}).encode("ascii"))
        if route == "/api/bridges/status":
            if not self.authorized():
                return self.reply(403)
            return self.reply(200, json.dumps(self.server.manager.public_status()).encode())
        if route == "/api/sites/share":
            if not self.authorized():
                return self.reply(403)
            return self.reply(200, json.dumps(self.server.site_share.status()).encode())
        if route == "/api/browser/standalone":
            if not self.authorized():
                return self.reply(403)
            return self.reply(200, json.dumps({"available": bool(getattr(self.server, "standalone_browser", None))}).encode())
        if route in ("/", "/index.html"):
            doc = (self.server.dist / "index.html").read_bytes()
            tag = f'<meta name="altnet-session" content="{self.server.token}">'
            return self.reply(200, doc.replace(b"</head>", tag.encode() + b"</head>"), "text/html; charset=utf-8")
        file = (self.server.dist / route.lstrip("/")).resolve()
        if self.server.dist not in file.parents or not file.is_file():
            return self.reply(404)
        self.reply(200, file, mimetypes.guess_type(file.name)[0] or "application/octet-stream")

    def do_POST(self):
        if (not self.local() or self.headers.get_all("Origin", []) != ["http://" + self.server.authority]
                or not self.authorized()):
            return self.reply(403)
        if self.path == "/api/sites/share":
            return self.publish_car()
        if self.headers.get_content_type() != "application/json":
            return self.reply(403)
        allowed = {"/api/bridges/" + a: a for a in ("refresh", "switch", "manual", "pause", "resume")}
        if self.path not in allowed and self.path not in ("/api/sites/onion-car", "/api/sites/share-stop", "/api/browser/standalone"):
            return self.reply(404)
        if self.path == "/api/browser/standalone" and (self.headers.get("Transfer-Encoding") or len(self.headers.get_all("Content-Length", [])) != 1):
            return self.reply(400)
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 32768:
                return self.reply(413)
            self.connection.settimeout(5)
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ValueError()
        except (ValueError, OSError):
            return self.reply(400)
        if self.path == "/api/browser/standalone":
            # Страница не выбирает ни исполняемый файл, ни аргументы, ни адрес.
            # Это только запуск отдельного окна; профили клиента не подключены.
            if body != {}:
                return self.reply(400)
            executable = getattr(self.server, "standalone_browser", None)
            if executable is None:
                return self.reply(503)
            with self.server.browser_launch_lock:
                try:
                    subprocess.Popen([str(executable)], cwd=str(executable.parent), close_fds=True)
                except OSError:
                    return self.reply(503)
            return self.reply(202, b'{}')
        if self.path == "/api/sites/share-stop":
            self.server.site_share.stop()
            return self.reply(200, json.dumps(self.server.site_share.status()).encode())
        if self.path == "/api/sites/onion-car":
            if not self.server.site_fetch.acquire(blocking=False):
                return self.reply(429, json.dumps({"error": "Дождитесь окончания текущей загрузки."}).encode())
            try:
                def ready():
                    manager = self.server.manager
                    with manager.lock:
                        return bool(manager.active_port and not manager.paused and not manager.stop.is_set())
                car = fetch_car(self.server.socks_port, body.get("onion"), body.get("cid"), ready)
                return self.reply(200, car, "application/vnd.ipld.car")
            except (ValueError, OSError, HTTPException):
                return self.reply(502, json.dumps({"error": "Не удалось получить пакет через Tor. Проверьте адреса, подключение и доступность узла."}).encode())
            finally:
                self.server.site_fetch.release()
        try:
            self.server.manager.request(allowed[self.path], body.get("lines"))
        except ValueError as error:
            # Parsing libraries may include private bridge fields in their exceptions.
            msg = "Проверьте формат строки obfs4 или дождитесь завершения текущей проверки." if allowed[self.path] == "manual" else str(error)
            return self.reply(409, json.dumps({"error": msg}).encode())
        self.reply(202, json.dumps(self.server.manager.public_status()).encode())

    def publish_car(self):
        if (self.headers.get_content_type() != "application/vnd.ipld.car" or self.headers.get("Transfer-Encoding")
                or len(self.headers.get_all("Content-Length", [])) != 1):
            return self.reply(400)
        try:
            length = int(self.headers["Content-Length"])
            if not 0 < length <= MAX_CAR:
                return self.reply(413)
        except ValueError:
            return self.reply(400)
        if not self.server.site_publish.acquire(blocking=False):
            return self.reply(429)
        try:
            self.connection.settimeout(10)
            car = self.rfile.read(length)
            if len(car) != length:
                return self.reply(400)
            result = self.server.site_share.start(self.headers.get("X-AltNet-Site-CID"), car)
            return self.reply(202, json.dumps(result).encode())
        except (ValueError, OSError, RuntimeError):
            return self.reply(503, json.dumps({"error": "Не удалось запустить временную раздачу. Проверьте подключение Tor и состояние текущей раздачи."}).encode())
        finally:
            self.server.site_publish.release()


class Forward(socketserver.BaseRequestHandler):
    def handle(self):
        manager = self.server.manager
        port = manager.active_port
        if not port:
            return
        try:
            with socket.create_connection(("127.0.0.1", port), 3) as upstream:
                self.request.settimeout(10)
                upstream.settimeout(10)
                while not manager.stop.is_set() and not manager.paused:
                    ready, _, _ = select.select([self.request, upstream], [], [], 2)
                    for source in ready:
                        data = source.recv(65536)
                        if not data:
                            return
                        (upstream if source is self.request else self.request).sendall(data)
        except OSError:
            return


class SOCKS(socketserver.ThreadingTCPServer):
    daemon_threads = True


def serve_native_parent(stream, output, server, manager):
    # Only a bounded, allowlisted status command is accepted over this pipe.
    try:
        while True:
            try:
                request_id = bridge_native.read_request(stream)
            except ValueError:
                break
            if request_id is None:
                break
            try:
                result = {"id": request_id, "ok": True, "status": bridge_native.public_route_status(manager)}
            except Exception:
                result = {"id": request_id, "ok": False, "error": "status_unavailable"}
            output.write(json.dumps(result, separators=(",", ":")) + "\n")
            output.flush()
    except (OSError, ValueError):
        pass
    finally:
        server.shutdown()


def main():
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    for name in ("state", "keyring", "dist", "tor", "transport"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--seed", type=Path)
    parser.add_argument("--snowflake", type=Path, help="Optional Snowflake-capable managed transport executable")
    parser.add_argument("--gpgv", default="gpgv")
    parser.add_argument("--peer", action="append", default=[])
    parser.add_argument("--no-official", action="store_true")
    parser.add_argument("--no-lan", action="store_true", help="Skip local multicast discovery on source failure")
    parser.add_argument("--mirror-host", help="Interface for distributing signed public catalog files")
    parser.add_argument("--mirror-port", type=int, default=17862)
    parser.add_argument("--port", type=int, default=17860)
    parser.add_argument("--parallel-probes", choices=(1, 2), type=int, default=2)
    parser.add_argument("--socks-port", type=int, default=17861)
    parser.add_argument("--native-stdio", action="store_true", help="Экспериментальный запуск дочернего сеанса через stdin/stdout")
    parser.add_argument("--native-http-proof", action="store_true", help="Только для экспериментов: включить HTTP-подтверждение сеанса")
    parser.add_argument("--standalone-browser", type=Path, help="Явно заданный исполняемый файл для запуска браузера в отдельном окне")
    args = parser.parse_args()
    if args.standalone_browser and (not args.standalone_browser.is_absolute() or not args.standalone_browser.is_file()
                                    or (os.name == "nt" and args.standalone_browser.suffix.lower() != ".exe")
                                    or (os.name != "nt" and not os.access(args.standalone_browser, os.X_OK))):
        parser.error("Нужен абсолютный путь к существующему исполняемому файлу браузера")
    if args.native_http_proof and not args.native_stdio:
        parser.error("HTTP-подтверждение доступно только в дочернем сеансе")
    native_secret = None
    if args.native_stdio:
        if args.port != 0 or args.socks_port != 0:
            parser.error("Для дочернего сеанса оба локальных порта должны выбираться системой (0)")
        try:
            native_secret = bridge_native.read_bootstrap(sys.stdin.buffer)
        except ValueError:
            parser.error("Некорректное сообщение дочернего сеанса")
    os.umask(0o077)
    state = args.state.resolve()
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    dist = args.dist.resolve()
    if not (dist / "index.html").is_file() or not all(p.is_file() for p in (args.tor, args.transport, args.keyring)):
        parser.error("Нужны сборка интерфейса, Tor, транспорт obfs4 и доверенный ключ")
    with ThreadingHTTPServer(("127.0.0.1", args.port), LocalUI) as ui, SOCKS(("127.0.0.1", args.socks_port), Forward) as proxy:
        with catalog.catalog_lock(state / "client"):
            sources = Sources(state / "public", args.keyring.resolve(), args.gpgv, official=not args.no_official)
            sources.bootstrap(args.seed)
            manager = Manager(state, sources, args.tor.resolve(), args.transport.resolve(),
                              snowflake=args.snowflake.resolve() if args.snowflake else None,
                              budget=Budget(args.parallel_probes))
            sources.route = lambda: manager.active_port if not manager.paused else 0
            ui.dist, ui.authority = dist, f"127.0.0.1:{ui.server_port}"
            ui.token = secrets.token_urlsafe(32)
            ui.standalone_browser = args.standalone_browser.resolve() if args.standalone_browser else None
            ui.browser_launch_lock = threading.Lock()
            ui.native_secret = native_secret if args.native_http_proof else None
            ui.manager = proxy.manager = manager
            ui.socks_port = proxy.server_address[1]
            ui.site_fetch = threading.BoundedSemaphore(1)
            ui.site_share = Share(manager)
            ui.site_publish = threading.BoundedSemaphore(1)
            if args.peer or args.mirror_host:
                print("Обмен каталогом с соседями отключён до интеграции сетевых профилей.", file=sys.stderr if args.native_stdio else sys.stdout, flush=True)
            worker = threading.Thread(target=manager.run)
            try:
                worker.start()
                for service in [proxy]:
                    threading.Thread(target=service.serve_forever, daemon=True).start()
                if args.native_stdio:
                    print(json.dumps({"protocol": bridge_native.PROTOCOL, "authority": ui.authority}, separators=(",", ":")), flush=True)
                    threading.Thread(target=serve_native_parent, args=(sys.stdin.buffer, sys.stdout, ui, manager), daemon=True).start()
                else:
                    print("AltNet http://" + ui.authority, flush=True)
                ui.serve_forever()
            except KeyboardInterrupt:
                pass
            finally:
                ui.site_share.stop()
                manager.stop.set()
                manager.fetch.set()
                manager.wake.set()
                worker.join()
                proxy.shutdown()


if __name__ == "__main__":
    main()

