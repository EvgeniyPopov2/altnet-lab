"""Проверка реального маршрута между двумя тестовыми ВМ. В гостях файлы не создаются."""
import argparse
import base64
import ipaddress
import json
from pathlib import Path
import shlex
import subprocess

import paramiko

ROOT = Path(__file__).resolve().parents[1]


def connect(port, key, hosts):
    client = paramiko.SSHClient()
    client.load_host_keys(str(hosts))
    client.connect("127.0.0.1", port=port, username="vagrant", key_filename=str(key),
                   allow_agent=False, look_for_keys=False, timeout=6, auth_timeout=8, banner_timeout=8)
    return client


def python(client, source, *args):
    command = shlex.join(["python3", "-I", "-B", "-u", "-c", source, *map(str, args)])
    return client.exec_command(command, timeout=25)


def address(client, interface):
    _, out, _ = client.exec_command(shlex.join(["ip", "-j", "-6", "addr", "show", "dev", interface]), timeout=5)
    addresses = [value["local"] for dev in json.load(out) for value in dev["addr_info"]
                 if ipaddress.IPv6Address(value["local"]) in ipaddress.IPv6Network("200::/8")]
    if len(addresses) != 1:
        raise ValueError("Нужен один подтверждённый адрес стенда")
    return addresses[0]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    for role in ("reader", "publisher"):
        ap.add_argument("--" + role + "-port", type=int, required=True)
        for part in ("key", "hosts"):
            ap.add_argument("--" + role + "-" + part, type=Path, required=True)
    ap.add_argument("--fixture", type=Path, required=True, help="Каталог синтетического unixfs-network-fixture")
    ap.add_argument("--interface", default="tun0")
    args = ap.parse_args()
    car = (args.fixture / "site.car").read_bytes()
    cid = (args.fixture / "root.txt").read_text().strip()
    if not 0 < len(car) < 8192:
        raise ValueError("Нужен небольшой синтетический пакет")
    modules = {name: (ROOT / f"scripts/{name}.py").read_text(encoding="utf-8") for name in ("bridge_route", "site_onion", "site_mesh")}
    bootstrap = """
import base64,json,sys,types
for name, source in json.loads(base64.b64decode(sys.argv[1])).items():
    mod = types.ModuleType(name)
    sys.modules[name] = mod
    exec(compile(source, name, 'exec'), mod.__dict__)
"""
    server = """
import base64,socket,sys
from http.server import BaseHTTPRequestHandler,HTTPServer
interface,source,peer,cid,encoded=sys.argv[1:]
car=base64.b64decode(encoded)
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        self.connection.settimeout(6)
        if self.client_address[0] != peer or self.headers.get('Host') != f'[{source}]:{self.server.server_port}' or self.path != f'/ipfs/{cid}?format=car':
            self.send_error(403)
            return
        self.send_response(200)
        self.send_header('Content-Type','application/vnd.ipld.car')
        self.send_header('Content-Length',str(len(car)))
        self.end_headers()
        self.wfile.write(car)
class Server(HTTPServer):
    address_family=socket.AF_INET6
    def server_bind(self):
        self.socket.setsockopt(socket.SOL_SOCKET,socket.SO_BINDTODEVICE,interface.encode()+b'\\0')
        super().server_bind()
with Server((source,0),Handler) as service:
    print(service.server_port,flush=True)
    service.timeout=25
    service.handle_request()
"""
    receiver = """
from site_mesh import MeshRoute
interface,source,peer,port,cid=sys.argv[2:]
route=MeshRoute(interface, source, peer, int(port))
try:
    MeshRoute('no-such-altnet',source,peer,int(port)).fetch(cid,lambda:True)
except OSError:
    pass
else:
    raise RuntimeError('Обнаружено подключение без интерфейса')
sys.stdout.buffer.write(route.fetch(cid,lambda:True))
"""
    with connect(args.reader_port, args.reader_key, args.reader_hosts) as reader, connect(
            args.publisher_port, args.publisher_key, args.publisher_hosts) as publisher:
        src, peer = address(reader, args.interface), address(publisher, args.interface)
        _, out, err = python(publisher, server, args.interface, peer, src, cid, base64.b64encode(car).decode())
        line = out.readline().strip()
        if not line.isdigit():
            raise RuntimeError("Временный узел раздачи не запущен: " + err.read(500).decode())
        _, result, failure = python(reader, bootstrap + receiver, base64.b64encode(json.dumps(modules).encode()).decode(),
                                    args.interface, src, peer, line, cid)
        received = result.read(8193)
        if result.channel.recv_exit_status() or received != car or out.channel.recv_exit_status():
            raise RuntimeError("Передача CAR не подтверждена: " + failure.read(800).decode())
    with (args.fixture / "received.car").open("xb") as stream:
        stream.write(received)
    subprocess.run(["node", str(args.fixture / "unixfs.mjs"), "verify", str(args.fixture)], check=True)
    print("PASS: две ВМ, адреса узлов Yggdrasil, отказ без интерфейса, CAR и корневой CID проверены")


if __name__ == "__main__":
    main()
