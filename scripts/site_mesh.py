"""Получение CAR от настроенного узла Yggdrasil по привязанному к интерфейсу сокету."""
from dataclasses import dataclass
import ipaddress
import json
import re
import socket
import sys
import time

from site_onion import MAX_SECONDS, receive_car, site_cid

NODES = ipaddress.IPv6Network("200::/8")


def node_address(value):
    if not isinstance(value, str) or "%" in value:
        raise ValueError("Нужен IPv6-адрес узла Yggdrasil")
    addr = ipaddress.IPv6Address(value)
    if addr not in NODES:
        raise ValueError("Адрес не принадлежит диапазону узлов Yggdrasil")
    return str(addr)


@dataclass(frozen=True)
class MeshRoute:
    interface: str
    source: str
    peer: str
    port: int

    def __post_init__(self):
        if not isinstance(self.interface, str) or not re.fullmatch(r"[A-Za-z0-9_. -]{1,64}", self.interface):
            raise ValueError("Некорректный интерфейс")
        object.__setattr__(self, "source", node_address(self.source))
        object.__setattr__(self, "peer", node_address(self.peer))
        if self.source == self.peer or type(self.port) is not int or not 1 <= self.port <= 65535:
            raise ValueError("Некорректный адрес узла")

    @classmethod
    def from_file(cls, path):
        with path.open("rb") as stream:
            data = stream.read(4097)
        if len(data) > 4096:
            raise ValueError("Слишком большая конфигурация маршрута")
        fields = json.loads(data)
        if not isinstance(fields, dict) or set(fields) != {"interface", "source", "peer", "port"}:
            raise ValueError("Нужны интерфейс, локальный адрес, доверенный узел и порт")
        return cls(**fields)

    def fetch(self, cid, ready):
        cid = site_cid(cid)
        if not ready():
            raise OSError("Быстрый маршрут выключен")
        deadline = time.monotonic() + MAX_SECONDS
        index = socket.if_nametoindex(self.interface)
        with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
            if sys.platform.startswith("linux"):
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_BINDTODEVICE, self.interface.encode("ascii") + b"\0")
            elif sys.platform == "win32":
                # Значение IPV6_UNICAST_IF в Winsock, индекс для IPv6 в порядке байтов хоста.
                sock.setsockopt(socket.IPPROTO_IPV6, getattr(socket, "IPV6_UNICAST_IF", 31), index)
            else:
                raise OSError("Привязка к интерфейсу этой системы не поддерживается")
            sock.bind((self.source, 0))
            sock.settimeout(8)
            sock.connect((self.peer, self.port))
            if sock.getsockname()[0] != self.source or sock.getpeername()[0] != self.peer:
                raise OSError("Маршрут изменился")
            return receive_car(sock, f"[{self.peer}]:{self.port}", cid, ready, deadline)
