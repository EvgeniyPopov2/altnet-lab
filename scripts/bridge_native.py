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
import re

PROTOCOL = "altnet-native-v1"
_TOKEN = re.compile(r"[A-Za-z0-9_-]{43}\Z")
_AUTHORITY = re.compile(r"127\.0\.0\.1:([1-9][0-9]{0,4})\Z")


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


def read_request(stream):
    """Допустить только ограниченный запрос статуса из приватного канала."""
    raw = stream.readline(1025)
    if not raw:
        return None
    if len(raw) > 1024 or not raw.endswith(b"\n"):
        raise ValueError("Некорректный запрос локального сеанса")
    try:
        message = json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_pairs)
    except (ValueError, UnicodeError):
        raise ValueError("Некорректный запрос локального сеанса") from None
    if (not isinstance(message, dict) or set(message) != {"id", "method"}
            or type(message["id"]) is not int or not 1 <= message["id"] <= 2147483647
            or message["method"] != "status"):
        raise ValueError("Некорректный запрос локального сеанса")
    return message["id"]


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
