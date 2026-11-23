#!/usr/bin/env python3
"""Проверка готовности цепочки через локальный Unix-сокет Tor без внешнего HTTP-запроса."""
import sys
import socket
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from bridge_tor import command, inspect


def main():
    cookie = Path("/run/tor/control.authcookie").read_bytes()
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
        sock.settimeout(5)
        sock.connect("/run/tor/control")
        with sock.makefile("rwb", buffering=0) as stream:
            command(stream, b"AUTHENTICATE " + cookie.hex().encode("ascii"))
            health = inspect(stream)
    print(f"UseBridges={int(health.bridges_enabled)}, bootstrap={health.progress}%, "
          f"circuit-established={int(health.established)}, confirmed-bridge-first-hops={len(health.hops)}")
    return 0 if health.ready else 1


if __name__ == "__main__":
    raise SystemExit(main())
