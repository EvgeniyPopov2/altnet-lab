"""Примитив подтверждения локального сеанса, запущенного доверенным родителем.

Это только строительный блок интеграции. Он не проверяет исполняемый файл,
не защищает от другого процесса с теми же правами и не авторизует последующие
HTTP-ответы. Секрет должен поступать только через приватный канал родителя.
"""
import base64
import binascii
import hashlib
import hmac
import json
from pathlib import Path
import re

PROTOCOL = "altnet-native-v1"
_TOKEN = re.compile(r"[A-Za-z0-9_-]{43}\Z")
_AUTHORITY = re.compile(r"127\.0\.0\.1:([1-9][0-9]{0,4})\Z")
_ASSET = re.compile(r"(?:index\.html|altnet-logo\.png|vite\.svg|assets/[A-Za-z0-9_.-]{1,200}\.(?:js|css|jpg|jpeg|png|webp|svg|woff2?|ico)|icons/aura/[A-Za-z0-9_-]{1,200}\.svg|fonts/manrope/(?:Manrope-Regular\.ttf|OFL\.txt))\Z")
ASSET_CHUNK = 8192
ASSET_LIMIT = 10 * 1024 * 1024
SITE_CHUNK = 49152


def _unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Повторное поле")
        result[key] = value
    return result


def decode_token(value):
    if not isinstance(value, str) or not _TOKEN.fullmatch(value):
        raise ValueError("Некорректный параметр локального сеанса")
    try:
        decoded = base64.b64decode(value + "=", altchars=b"-_", validate=True)
    except (ValueError, binascii.Error):
        raise ValueError("Некорректный параметр локального сеанса") from None
    if len(decoded) != 32 or base64.urlsafe_b64encode(decoded).decode("ascii").rstrip("=") != value:
        raise ValueError("Некорректный параметр локального сеанса")
    return decoded


def read_bootstrap(stream):
    """Прочитать ограниченное сообщение из унаследованного stdin, не печатая секрет."""
    raw = stream.readline(257)
    if not raw.endswith(b"\n") or len(raw) > 256:
        raise ValueError("Некорректное сообщение локального запуска")
    try:
        msg = json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_pairs)
    except (ValueError, UnicodeError):
        raise ValueError("Некорректное сообщение локального запуска") from None
    if not isinstance(msg, dict) or set(msg) != {"protocol", "secret"} or msg["protocol"] != PROTOCOL:
        raise ValueError("Некорректное сообщение локального запуска")
    return decode_token(msg["secret"])


def read_command(stream):
    """Прочитать строго ограниченную команду из приватного канала родителя."""
    raw = stream.readline(32769)
    if not raw:
        return None
    if len(raw) > 32768 or not raw.endswith(b"\n"):
        raise ValueError("Некорректный запрос локального сеанса")
    try:
        message = json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_pairs)
    except (ValueError, UnicodeError):
        raise ValueError("Некорректный запрос локального сеанса") from None
    if (not isinstance(message, dict) or type(message.get("id")) is not int
            or not 1 <= message["id"] <= 2147483647):
        raise ValueError("Некорректный запрос локального сеанса")
    if len(raw) > 1024 and message.get("method") != "manual":
        raise ValueError("Некорректный запрос локального сеанса")
    if message.get("method") == "status" and set(message) == {"id", "method"}:
        return message
    if (message.get("method") == "asset" and set(message) == {"id", "method", "path", "offset"}
            and isinstance(message["path"], str) and _ASSET.fullmatch(message["path"])
            and type(message["offset"]) is int and 0 <= message["offset"] <= ASSET_LIMIT):
        return message
    if message.get("method") in ("refresh", "switch", "pause", "resume") and set(message) == {"id", "method"}:
        return message
    if (message.get("method") == "manual" and set(message) == {"id", "method", "lines"}
            and isinstance(message["lines"], str) and 0 < len(message["lines"]) <= 16384):
        return message
    if (message.get("method") == "site_open" and set(message) == {"id", "method", "onion", "cid", "profile"}
            and message["profile"] == "anon" and isinstance(message["onion"], str) and len(message["onion"]) == 62
            and isinstance(message["cid"], str) and len(message["cid"]) == 59):
        return message
    if (message.get("method") == "site_read" and set(message) == {"id", "method", "offset"}
            and type(message["offset"]) is int and 0 <= message["offset"] <= 72 * 1024 * 1024):
        return message
    if message.get("method") == "site_close" and set(message) == {"id", "method"}:
        return message
    raise ValueError("Некорректный запрос локального сеанса")


def read_request(stream):
    """Совместимый ограниченный читатель команд статуса."""
    command = read_command(stream)
    if command is None:
        return None
    if command["method"] != "status":
        raise ValueError("Некорректный запрос локального сеанса")
    return command["id"]


def read_asset(dist, name, offset):
    """Только собранные ресурсы интерфейса; без токена и файлов состояния."""
    if (not isinstance(name, str) or not _ASSET.fullmatch(name) or type(offset) is not int
            or not 0 <= offset <= ASSET_LIMIT):
        raise ValueError("Некорректный ресурс")
    root = Path(dist).resolve(strict=True)
    candidate = root
    for part in name.split("/"):
        candidate = candidate / part
        if candidate.is_symlink() or (hasattr(candidate, "is_junction") and candidate.is_junction()):
            raise ValueError("Ссылки в ресурсах запрещены")
    if root not in candidate.resolve(strict=True).parents or not candidate.is_file():
        raise ValueError("Некорректный ресурс")
    with candidate.open("rb") as file:
        file.seek(0, 2)
        total = file.tell()
        if total > ASSET_LIMIT or offset > total:
            raise ValueError("Недопустимый размер ресурса")
        fingerprint = ""
        if offset == 0:
            file.seek(0)
            digest = hashlib.sha256()
            remaining = total
            while remaining:
                block = file.read(min(65536, remaining))
                if not block:
                    raise ValueError("Ресурс изменился во время чтения")
                digest.update(block)
                remaining -= len(block)
            if file.read(1):
                raise ValueError("Ресурс изменился во время чтения")
            fingerprint = digest.hexdigest()
        file.seek(offset)
        chunk = file.read(min(ASSET_CHUNK, total - offset))
    if len(chunk) != min(ASSET_CHUNK, total - offset):
        raise ValueError("Ресурс изменился во время чтения")
    return total, base64.b64encode(chunk).decode("ascii"), fingerprint


def public_route_status(manager):
    """Возвращает только перечисленные поля, без адресов и строк мостов."""
    status = manager.public_status()
    phase = status.get("phase")
    internet = status.get("internet")
    progress = status.get("progress")
    connected = status.get("connected")
    if (phase not in {"starting", "paused", "waiting", "ready", "recovering", "checking"}
            or internet not in {"unchecked", "checking", "verified", "https", "unreachable"}
            or type(progress) is not int or not 0 <= progress <= 100
            or type(connected) is not bool):
        raise ValueError("Некорректное состояние маршрута")
    return {"phase": phase, "progress": progress, "torConnected": connected,
            "internet": internet, "fastAvailable": False}


def proof(secret, authority, challenge):
    if not isinstance(secret, bytes) or len(secret) != 32:
        raise ValueError("Некорректный ключ локального сеанса")
    match = _AUTHORITY.fullmatch(authority) if isinstance(authority, str) else None
    if not match or int(match.group(1)) > 65535:
        raise ValueError("Некорректный адрес локального сеанса")
    nonce = decode_token(challenge)
    payload = PROTOCOL.encode("ascii") + b"\0" + authority.encode("ascii") + b"\0" + nonce
    return base64.urlsafe_b64encode(hmac.new(secret, payload, hashlib.sha256).digest()).decode("ascii").rstrip("=")
