"""Временная раздача одного CAR через onion-сервис управляемого Tor.

Ключ не сохраняется: после остановки Tor адрес нельзя восстановить. Это не
IPFS routing и не механизм имён. Проверка CAR выполняется до отправки в API.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import re
import select
import socket
import threading

from bridge_tor import command
from site_onion import MAX_CAR, onion_address, site_cid


class Gateway(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, owner):
        super().__init__(("127.0.0.1", 0), GatewayRequest)
        self.owner = owner
        self.slots = threading.BoundedSemaphore(2)

    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, address)
        except BaseException:
            self.slots.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()


class GatewayRequest(BaseHTTPRequestHandler):
    server_version = "AltNet"
    sys_version = ""

    def log_message(self, *args):
        pass

    def handle(self):
        self.request.settimeout(10)
        try:
            super().handle()
        except (OSError, TimeoutError):
            pass

    def do_GET(self):
        share = self.server.owner
        if (not share.is_current(self.server) or self.path != f"/ipfs/{self.server.cid}?format=car"
                or self.headers.get("Host") != self.server.onion):
            self.send_error(404)
            return
        data = self.server.car
        self.send_response(200)
        self.send_header("Content-Type", "application/vnd.ipld.car")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        for offset in range(0, len(data), 65536):
            if not share.is_current(self.server):
                return
            self.wfile.write(data[offset:offset + 65536])


class Share:
    def __init__(self, manager):
        self.manager = manager
        self.lock = threading.RLock()
        self.server = None
        self.control = None
        self.instance = None
        self.reason = "not_started"

    def route_is(self, instance):
        with self.manager.lock:
            return bool(instance and self.manager.active is instance and self.manager.active_port
                        and not self.manager.paused and not self.manager.stop.is_set())

    def is_current(self, server):
        return self.server is server and self.route_is(self.instance)

    def status(self):
        with self.lock:
            server = self.server
            if not server or not self.is_current(server):
                return {"active": False, "reason": self.reason if not server else "route_lost"}
            return {"active": True, "onion": server.onion, "cid": server.cid, "reachability": "unverified"}

    def start(self, cid, car):
        site_cid(cid)
        if not isinstance(car, bytes) or not 0 < len(car) <= MAX_CAR:
            raise ValueError("Некорректный размер CAR")
        with self.lock:
            if self.server:
                raise ValueError("Сначала остановите текущую раздачу")
            with self.manager.lock:
                instance = self.manager.active
                if not self.route_is(instance) or not instance.control:
                    raise ValueError("Подключение Tor пока не готово")
                control_port = instance.control
                cookie_path = instance.directory / "control.cookie"
            gateway = Gateway(self)
            sock = None
            stream = None
            try:
                cookie = cookie_path.read_bytes()
                if len(cookie) != 32:
                    raise OSError("Некорректный ключ управления Tor")
                sock = socket.create_connection(("127.0.0.1", control_port), 5)
                sock.settimeout(10)
                stream = sock.makefile("rwb", buffering=0)
                command(stream, b"AUTHENTICATE " + cookie.hex().encode("ascii"))
                # NonAnonymous не запрашивается: Tor отклонит небезопасный режим.
                reply = command(stream, f"ADD_ONION NEW:ED25519-V3 Flags=DiscardPK MaxStreams=8 Port=80,127.0.0.1:{gateway.server_port}".encode("ascii"))
                match = re.search(rb"(?m)^ServiceID=([a-z2-7]{56})$", reply)
                if not match:
                    raise OSError("Tor не вернул адрес onion v3")
                gateway.onion = onion_address(match[1].decode("ascii") + ".onion")
                gateway.cid, gateway.car = cid, car
                if not self.route_is(instance):
                    raise OSError("Маршрут Tor изменился")
                sock.settimeout(None)
                self.server, self.control, self.instance = gateway, sock, instance
                self.reason = "active"
                threading.Thread(target=gateway.serve_forever, daemon=True).start()
                threading.Thread(target=self._watch, args=(gateway, sock, stream), daemon=True).start()
                return self.status()
            except BaseException:
                if sock:
                    try:
                        sock.shutdown(socket.SHUT_RDWR)
                    except OSError:
                        pass
                    sock.close()
                if stream:
                    stream.close()
                if self.server is gateway:
                    self.server = self.control = self.instance = None
                gateway.server_close()
                raise

    def _watch(self, server, sock, stream):
        try:
            while self.is_current(server):
                ready, _, _ = select.select([sock], [], [], 1)
                if ready:
                    # Никаких событий мы не подписывали: данные или EOF означают сбой.
                    break
        except (OSError, ValueError):
            pass
        finally:
            self.stop("route_lost", expected=server)
            stream.close()

    def stop(self, reason="stopped", expected=None):
        with self.lock:
            if expected is not None and self.server is not expected:
                return
            server, sock = self.server, self.control
            self.server = self.control = self.instance = None
            self.reason = reason
            if sock:
                try:
                    sock.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
                sock.close()
            if server:
                server.shutdown()
                server.server_close()
