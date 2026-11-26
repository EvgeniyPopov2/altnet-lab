"""Получение и раздача выбранной публикации через транспорт конкретной ВМ."""
import argparse
import fcntl
import json
import os
import pwd
import struct
import tempfile
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import socket
import sys
import threading

sys.path.insert(0, str(Path(__file__).resolve().parent))
from site_mesh import MeshRoute
from site_onion import MAX_CAR, fetch_car, site_cid, onion_address

CONFIG = Path("/etc/altnet-browser")
SHARE = Path.home() / ".local/share/altnet/published-car"


def receive(profile, cid, onion):
    site_cid(cid)
    if profile == "fast" and not onion:
        return MeshRoute.from_file(CONFIG / "mesh.json").fetch(cid, lambda: True)
    if profile == "anon" and onion:
        return fetch_car(9050, onion, cid, lambda: True)
    raise ValueError("Адрес не соответствует профилю")


def route_status():
    tor = False
    try:
        with socket.socket(socket.AF_UNIX) as sock:
            sock.settimeout(2)
            sock.connect("/run/tor/socks")
            _, uid, _ = struct.unpack("3i", sock.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
            if uid == pwd.getpwnam("debian-tor").pw_uid:
                sock.sendall(b"\x05\x01\x00")
                tor = sock.recv(2, socket.MSG_WAITALL) == b"\x05\x00"
    except (OSError, KeyError):
        pass
    mesh = False
    try:
        route = MeshRoute.from_file(CONFIG / "mesh.json")
        with socket.socket(socket.AF_INET6) as sock:
            sock.setsockopt(socket.SOL_SOCKET,socket.SO_BINDTODEVICE,route.interface.encode()+b"\0")
            sock.bind((route.source,0))
            mesh = True
    except (OSError, ValueError):
        pass
    return {"tor":tor,"mesh":mesh}


def share_status():
    onion = onion_address((CONFIG / "publisher.onion").read_text().strip())
    if (SHARE / "paused").exists():
        return {"active": False, "reason": "paused"}
    try:
        cid, mode = (SHARE / "current").read_text().split()
    except FileNotFoundError:
        return {"active": False, "reason": "stopped"}
    return {"active": True, "reachability": "unverified", "onion": onion, "cid": site_cid(cid), "mesh": mode == "both"}


def write_private(path, data):
    with tempfile.NamedTemporaryFile(dir=SHARE, delete=False) as out:
        tmp = Path(out.name)
        try:
            out.write(data)
            out.flush()
            os.fsync(out.fileno())
        except BaseException:
            tmp.unlink()
            raise
    try:
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)


def publish(action, cid, mode):
    SHARE.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (SHARE / "lock").open("a+b") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        status = share_status()
        if action == "stop" and status["active"]:
            (SHARE / "current").unlink()
            (SHARE / (status["cid"] + ".car")).unlink(missing_ok=True)
        elif action == "start":
            if status.get("reason") == "paused": raise ValueError("Паника включена")
            if status["active"]: raise ValueError("Сначала остановите предыдущую публикацию")
            site_cid(cid)
            data = sys.stdin.buffer.read(MAX_CAR + 1)
            if not 0 < len(data) <= MAX_CAR: raise ValueError("Некорректный размер CAR")
            write_private(SHARE / (cid + ".car"), data)
            write_private(SHARE / "current", f"{cid} {mode}".encode())
        return share_status()


class Publication(BaseHTTPRequestHandler):
    server_version = "AltNet"
    sys_version = ""

    def log_message(self, *_):
        pass

    def do_GET(self):
        public = self.server
        if self.headers.get_all("Host") != [public.host] or (public.peer and self.client_address[0] != public.peer):
            self.send_error(404)
            return
        try:
            cid = site_cid(self.path.removeprefix("/ipfs/").removesuffix("?format=car"))
            status = share_status()
            if self.path != f"/ipfs/{cid}?format=car" or status.get("cid") != cid or (public.peer and not status["mesh"]):
                raise ValueError()
            with (SHARE / (cid + ".car")).open("rb") as f:
                data = f.read(MAX_CAR + 1)
            if not 0 < len(data) <= MAX_CAR:
                raise ValueError()
        except (OSError, ValueError):
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/vnd.ipld.car")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        for offset in range(0, len(data), 65536):
            if share_status().get("cid") != cid: return
            self.wfile.write(data[offset:offset+65536])


class Publisher(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, *, host, peer=None, interface=None):
        self.host, self.peer = host, peer
        self.slots = threading.BoundedSemaphore(2)
        self.address_family = socket.AF_INET6 if interface else socket.AF_INET
        super().__init__(address, Publication, bind_and_activate=False)
        try:
            if interface:
                self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
                self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_BINDTODEVICE, interface.encode() + b"\0")
            self.server_bind()
            self.server_activate()
        except BaseException:
            self.server_close()
            raise

    def process_request(self, request, address):
        if not self.slots.acquire(False):
            self.shutdown_request(request)
            return
        request.settimeout(12)
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


def serve():
    from site_onion import onion_address
    route = MeshRoute.from_file(CONFIG / "mesh.json")
    onion = onion_address((CONFIG / "publisher.onion").read_text().strip())
    with Publisher(("127.0.0.1", 17884), host=onion) as tor, Publisher(
        (route.source, route.port), host=f"[{route.source}]:{route.port}", peer=route.peer, interface=route.interface
    ) as mesh:
        worker = threading.Thread(target=mesh.serve_forever, daemon=True)
        worker.start()
        try:
            tor.serve_forever()
        finally:
            mesh.shutdown()
            worker.join()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest="action", required=True)
    init = actions.add_parser("init")
    init.add_argument("profile", type=Path)
    get = actions.add_parser("get")
    get.add_argument("profile", choices=("fast", "anon"))
    get.add_argument("cid")
    get.add_argument("onion", nargs="?", default="")
    publisher = actions.add_parser("share")
    publisher.add_argument("operation", choices=("status", "stop", "start", "route-status"))
    publisher.add_argument("cid", nargs="?", default="")
    publisher.add_argument("mode", choices=("tor","both"), nargs="?", default="tor")
    actions.add_parser("serve")
    args = parser.parse_args()
    if args.action == "init":
        key = args.profile / "altnet-workspace.key"
        if not key.exists():
            if (args.profile / "altnet-workspace.sqlite").exists():
                raise SystemExit("Восстановите ключ из резервной копии профиля AltNet")
            with tempfile.NamedTemporaryFile(dir=args.profile) as fresh:
                fresh.write(os.urandom(32))
                fresh.flush()
                os.fsync(fresh.fileno())
                try:
                    os.link(fresh.name, key)
                except FileExistsError:
                    pass
    elif args.action == "share":
        print(json.dumps(route_status() if args.operation == "route-status" else publish(args.operation, args.cid, args.mode)))
    elif args.action == "get":
        sys.stdout.buffer.write(receive(args.profile, args.cid, args.onion))
    else:
        serve()
