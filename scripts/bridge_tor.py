"""A client-only Tor instance with cookie-authenticated loopback control."""
from dataclasses import dataclass
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import time


def command(stream, request):
    stream.write(request + b"\r\n")
    lines = []
    while True:
        line = stream.readline(8192)
        if not line.startswith((b"250 ", b"250-", b"250+")):
            raise RuntimeError("Tor отклонил команду или закрыл соединение")
        lines.append(line[4:].strip())
        if line.startswith(b"250+"):
            while True:
                data = stream.readline(8192)
                if data == b".\r\n":
                    break
                if not data:
                    raise RuntimeError("Tor прервал ответ")
                lines.append(data.removeprefix(b".").rstrip(b"\r\n"))
        if line.startswith(b"250 "):
            return b"\n".join(lines)


@dataclass
class Health:
    progress: int = 0
    hops: frozenset = frozenset()
    socks: int = 0
    bridges_enabled: bool = False
    established: bool = False
    repeated_failure: bool = False

    @property
    def ready(self):
        return self.progress == 100 and bool(self.hops)


def inspect(stream):
    enabled = b"UseBridges=1" in command(stream, b"GETCONF UseBridges").splitlines()
    state = command(stream, b"GETINFO status/bootstrap-phase status/circuit-established")
    configured = command(stream, b"GETCONF Bridge")
    circuits = command(stream, b"GETINFO circuit-status")
    progress = re.search(rb"\bPROGRESS=(\d+)\b", state)
    known = {m[1].decode().upper() for m in re.finditer(rb"(?im)^Bridge=(?:obfs4|snowflake) \S+ ([0-9a-f]{40}) ", configured)}
    data_purposes = {b"PURPOSE=GENERAL", b"PURPOSE=CONFLUX_LINKED"}
    hops = {m[1].decode().upper() for line in circuits.splitlines() if data_purposes.intersection(line.split())
            and b"ONEHOP_TUNNEL" not in line
            and (m := re.match(rb"(?i)^\d+ BUILT \$([0-9a-f]{40})", line))}
    established = b"status/circuit-established=1" in state.splitlines()
    failures = re.search(rb"\bCOUNT=(\d+)\b", state)
    repeated = bool(failures and int(failures[1]) >= 5 and b"RECOMMENDATION=warn" in state and
                    re.search(rb"\bREASON=(?:TLS_ERROR|CONNECTREFUSED|CONNECTRESET|NOROUTE|TIMEOUT)\b", state))
    return Health(int(progress[1]) if progress else 0, frozenset(hops & known) if enabled and established else frozenset(),
                  bridges_enabled=enabled, established=established, repeated_failure=repeated)


class Instance:
    def __init__(self, root, tor, transport, lines):
        executable = Path(transport).resolve(strict=True)
        if not re.fullmatch(r"[\w.-]+", executable.name):
            raise ValueError("Недопустимое имя исполняемого файла транспорта")
        self.directory = Path(tempfile.mkdtemp(prefix="session-", dir=root)).resolve()
        self.lines = list(lines)
        self.control = None
        def path(name):
            value = (self.directory / name).as_posix()
            return '"' + value.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\r', '\\r') + '"'

        plugin = "./" + executable.name
        transport_name = self.lines[0].split()[0]
        options = ["DataDirectory " + path("data"), "ClientOnly 1", "UseBridges 1", "SocksPort auto IsolateSOCKSAuth",
                   "ControlPort auto", "ControlPortWriteToFile " + path("control.addr"), "CookieAuthentication 1",
                   "CookieAuthFile " + path("control.cookie"), "SafeLogging 1", "AvoidDiskWrites 1",
                   f"__OwningControllerProcess {os.getpid()}", f"ClientTransportPlugin {transport_name} exec {plugin}"]
        (self.directory / "torrc").write_text("\n".join(options + ["Bridge " + x for x in lines]) + "\n", encoding="utf-8")
        env = os.environ.copy()
        libraries = Path(tor).resolve().parent
        if os.name == "posix" and (libraries / "libevent-2.1.so.7").is_file():
            env["LD_LIBRARY_PATH"] = str(libraries) + (":" + env["LD_LIBRARY_PATH"] if env.get("LD_LIBRARY_PATH") else "")
        try:
            self.process = subprocess.Popen([str(tor), "-f", str(self.directory / "torrc")], cwd=executable.parent,
                     env=env,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL,
                     creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        except BaseException:
            shutil.rmtree(self.directory)
            raise

    def health(self):
        if self.process.poll() is not None:
            return Health()
        try:
            if not self.control:
                addr = (self.directory / "control.addr").read_text().strip()
                match = re.fullmatch(r"PORT=127\.0\.0\.1:(\d+)", addr)
                if not match:
                    return Health()
                self.control = int(match[1])
            cookie = (self.directory / "control.cookie").read_bytes()
            with socket.create_connection(("127.0.0.1", self.control), 2) as sock, sock.makefile("rwb", buffering=0) as stream:
                command(stream, b"AUTHENTICATE " + cookie.hex().encode("ascii"))
                health = inspect(stream)
                socks = command(stream, b"GETINFO net/listeners/socks")
                port = re.search(rb'"127\.0\.0\.1:(\d+)"', socks)
                health.socks = int(port[1]) if port else 0
                return health
        except (OSError, RuntimeError, ValueError):
            return Health()

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(4)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
        for delay in (0, .2, .6):
            time.sleep(delay)
            try:
                shutil.rmtree(self.directory)
                return
            except FileNotFoundError:
                return
            except PermissionError:
                pass

