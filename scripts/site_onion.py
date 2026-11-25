"""Получение IPFS CAR у onion-шлюза только через локальный SOCKS Tor.

Этот модуль не проверяет содержимое CAR: проверка каждого блока и корневого CID
обязательна у вызывающей стороны до сохранения или показа сайта.
"""
import base64
import hashlib
import hmac
import http.client
import re
import secrets
import socket
import struct
import threading
import time

from bridge_route import read_exact

MAX_CAR = 72 * 1024 * 1024
MAX_SECONDS = 120
CONNECT_ATTEMPTS = 3
RETRY_DELAY = 0.4


class OnionUnavailable(OSError):
    """Tor не смог построить соединение с onion-сервисом; можно повторить."""


def onion_address(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-z2-7]{56}\.onion", value):
        raise ValueError("Нужен полный адрес onion v3 без протокола и пути")
    raw = base64.b32decode(value[:56].upper())
    checksum = hashlib.sha3_256(b".onion checksum" + raw[:32] + b"\x03").digest()[:2]
    if raw[34] != 3 or not hmac.compare_digest(raw[32:34], checksum):
        raise ValueError("Контрольная сумма адреса onion не совпадает")
    return value


def site_cid(value):
    if not isinstance(value, str) or not re.fullmatch(r"b[a-z2-7]{58}", value):
        raise ValueError("Нужен канонический CIDv1 сайта")
    try:
        raw = base64.b32decode((value[1:].upper() + "=" * 7)[:64])
    except (ValueError, TypeError):
        raise ValueError("Некорректный CID сайта") from None
    if len(raw) != 36 or raw[0] != 1 or raw[1] not in (0x55, 0x70, 0x71) or raw[2:4] != b"\x12\x20" or "b" + base64.b32encode(raw).decode().lower().rstrip("=") != value:
        raise ValueError("Неподдерживаемый CID сайта")
    return value


def connect_onion(proxy_port, host):
    """Не выполняет DNS-разрешение и никогда не подключается к адресу напрямую."""
    sock = socket.create_connection(("127.0.0.1", proxy_port), 5)
    try:
        sock.settimeout(20)
        # Tor uses these values as circuit-isolation tokens, not as account credentials.
        # Offer no unauthenticated fallback: otherwise unrelated downloads could share
        # the same SOCKS isolation context without the user knowing.
        sock.sendall(b"\x05\x01\x02")
        if read_exact(sock, 2) != b"\x05\x02":
            raise OSError("SOCKS negotiation failed")
        token = secrets.token_hex(32).encode("ascii")
        sock.sendall(b"\x01" + bytes([len(token)]) + token + b"\x01x")
        if read_exact(sock, 2) != b"\x01\x00":
            raise OSError("SOCKS isolation failed")
        name = host.encode("ascii")
        sock.sendall(b"\x05\x01\x00\x03" + bytes([len(name)]) + name + struct.pack("!H", 80))
        version, result, reserved, family = read_exact(sock, 4)
        if (version, reserved) != (5, 0):
            raise OSError("Invalid SOCKS reply")
        if result in (1, 3, 4, 5, 6):
            raise OnionUnavailable("SOCKS destination unavailable")
        if result:
            raise OSError("SOCKS destination rejected")
        if family == 3:
            length = read_exact(sock, 1)[0]
        elif family in (1, 4):
            length = 4 if family == 1 else 16
        else:
            raise OSError("Invalid SOCKS reply")
        read_exact(sock, length + 2)
        return sock
    except BaseException:
        sock.close()
        raise


def fetch_car(proxy_port, host, cid, route_ready):
    host, cid = onion_address(host), site_cid(cid)
    if not route_ready():
        raise OSError("Подключение Tor пока не готово")
    deadline = time.monotonic() + MAX_SECONDS
    sock = None
    for attempt in range(CONNECT_ATTEMPTS):
        if not route_ready() or time.monotonic() >= deadline:
            raise OSError("Подключение Tor прервано или истекло время ожидания")
        try:
            sock = connect_onion(proxy_port, host)
            break
        except (OnionUnavailable, TimeoutError, ConnectionError):
            if attempt + 1 == CONNECT_ATTEMPTS or not route_ready():
                raise
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise OSError("Истекло время ожидания Tor") from None
            time.sleep(min(RETRY_DELAY * (attempt + 1), remaining))
    if sock is None:
        raise OSError("Не удалось подключиться через Tor")
    with sock:
        remaining = deadline - time.monotonic()
        if remaining <= 0 or not route_ready():
            raise OSError("Подключение Tor прервано или истекло время ожидания")
        timer = threading.Timer(remaining, lambda: _interrupt(sock))
        timer.daemon = True
        timer.start()
        try:
            return _receive(sock, host, cid, route_ready, deadline)
        finally:
            timer.cancel()


def _interrupt(sock):
    try:
        sock.shutdown(socket.SHUT_RDWR)
    except OSError:
        pass


def _receive(sock, host, cid, route_ready, deadline):
    if not route_ready():
        raise OSError("Подключение Tor прервано")
    sock.sendall((f"GET /ipfs/{cid}?format=car HTTP/1.1\r\nHost: {host}\r\n"
                  "Accept: application/vnd.ipld.car\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n").encode("ascii"))
    response = http.client.HTTPResponse(sock)
    response.begin()
    if response.status != 200 or response.headers.get_content_type() != "application/vnd.ipld.car":
        raise OSError("Узел не предоставил CAR для этого CID")
    if response.getheader("Content-Encoding", "identity").lower() != "identity":
        raise OSError("Сжатый ответ узла не поддерживается")
    length = response.getheader("Content-Length")
    if length is not None and (not length.isascii() or not length.isdecimal() or not 0 < int(length) <= MAX_CAR):
        raise OSError("Некорректный размер CAR")
    data = bytearray()
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0 or not route_ready():
            raise OSError("Подключение Tor прервано или истекло время ожидания")
        sock.settimeout(min(20, remaining))
        part = response.read(min(65536, MAX_CAR + 1 - len(data)))
        if not part:
            break
        data.extend(part)
        if len(data) > MAX_CAR:
            raise OSError("CAR превышает допустимый размер")
    if not data or (length is not None and len(data) != int(length)):
        raise OSError("Ответ узла неполон")
    return bytes(data)
