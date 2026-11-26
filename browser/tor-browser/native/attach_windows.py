"""Адаптер штатного клиента Windows. Запускается браузером с -I -S и закрытым каналом stdin/stdout."""
import ctypes as C
from ctypes import wintypes as W
import http.client
import json
import os
from pathlib import Path
import re
import socket
import sys

# Доверенная поставка подставляет абсолютный путь к существующей установке.
ROOT = Path(sys.argv[1])
PORT = 17860
HOST = f"127.0.0.1:{PORT}"
PHASES = {"starting", "checking", "recovering", "ready", "waiting", "paused"}
INTERNET = {"unchecked", "checking", "verified", "https", "unreachable"}


class Start(C.Structure):
    _fields_ = [("pid", W.DWORD), ("birth", W.FILETIME)]


class Owner(C.Structure):
    _fields_ = [("start", Start), ("app", W.WCHAR * 256), ("service", W.WCHAR * 64), ("type", W.DWORD),
                ("status", W.DWORD), ("session", W.DWORD), ("restartable", W.BOOL)]


class Row(C.Structure):
    _fields_ = [(f, W.DWORD) for f in ("state", "local", "port", "remote", "remotePort", "pid")]


def filetime(ft):
    return ft.dwLowDateTime | ft.dwHighDateTime << 32


def client_owner():
    """Restart Manager привязывает установку к открытому настоящим клиентом файлу state/client.lock."""
    lock = ROOT / "state/client.lock"
    if not ROOT.is_absolute() or not lock.is_file():
        raise OSError("Клиент недоступен")
    rm = C.WinDLL("rstrtmgr", winmode=0x800)
    session, name = W.DWORD(), C.create_unicode_buffer(33)
    if rm.RmStartSession(C.byref(session), 0, name):
        raise OSError("Не удалось определить владельца")
    try:
        paths = (C.c_wchar_p * 1)(str(lock))
        if rm.RmRegisterResources(session, 1, paths, 0, None, 0, None):
            raise OSError("Не удалось проверить установку")
        required, count, reason = W.UINT(), W.UINT(16), W.DWORD()
        owners = (Owner * count.value)()
        if rm.RmGetList(session, C.byref(required), C.byref(count), owners, C.byref(reason)) or count.value != 1:
            raise OSError("Неоднозначный владелец клиента")
        return owners[0].start.pid, filetime(owners[0].start.birth)
    finally:
        rm.RmEndSession(session)


class Client:
    def __init__(self):
        self.pid, birth = client_owner()
        kernel = self.kernel = C.WinDLL("kernel32", winmode=0x800)
        kernel.OpenProcess.restype = W.HANDLE
        handle = kernel.OpenProcess(0x1000 | 0x100000, False, self.pid)
        if not handle:
            raise OSError("Клиент недоступен")
        self.handle = W.HANDLE(handle)
        try:
            times = [W.FILETIME() for _ in range(4)]
            buf, size = C.create_unicode_buffer(32768), W.DWORD(32768)
            if not kernel.GetProcessTimes(self.handle, *(C.byref(t) for t in times)) or filetime(times[0]) != birth:
                raise OSError("Владелец изменился")
            if not kernel.QueryFullProcessImageNameW(self.handle, 0, buf, C.byref(size)) or not os.path.samefile(buf.value, sys.executable):
                raise OSError("Неизвестная программа клиента")
            self.table = C.WinDLL("iphlpapi", winmode=0x800).GetExtendedTcpTable
            self.token = None
            html = self.request("/", limit=65536)
            tags = re.findall(rb'<meta name="altnet-session" content="([A-Za-z0-9_-]{43})">', html)
            if len(tags) != 1:
                raise OSError("Сеанс недоступен")
            self.token = tags[0].decode("ascii")
        except BaseException:
            self.close()
            raise

    def close(self):
        self.kernel.CloseHandle(self.handle)

    def owns_connection(self, sock):
        if self.kernel.WaitForSingleObject(self.handle, 0) != 258:
            return False
        size = W.DWORD()
        if self.table(None, C.byref(size), False, socket.AF_INET, 5, 0) != 122:
            return False
        for _ in range(3):
            if not 4 <= size.value <= 32 * 1024 * 1024:
                return False
            buf = C.create_string_buffer(size.value)
            code = self.table(buf, C.byref(size), False, socket.AF_INET, 5, 0)
            if code != 122:
                break
        if code:
            return False
        count = W.DWORD.from_buffer(buf).value
        if 4 + count * C.sizeof(Row) > len(buf):
            return False
        loopback = int.from_bytes(socket.inet_aton("127.0.0.1"), sys.byteorder)
        client_port = sock.getsockname()[1]
        return any(row.state == 5 and row.pid == self.pid and row.local == row.remote == loopback
                   and socket.ntohs(row.port & 65535) == PORT and socket.ntohs(row.remotePort & 65535) == client_port
                   for row in (Row * count).from_buffer(buf, 4))

    def request(self, path, data=None, limit=32768):
        # После проверки обращаемся только по уже установленному TCP-соединению.
        # HTTPConnection не имеет права переподключаться к сменившемуся владельцу.
        conn = http.client.HTTPConnection("127.0.0.1", PORT, timeout=6)
        conn.auto_open = False
        try:
            conn.connect()
            if not self.owns_connection(conn.sock):
                raise OSError("Служба изменилась")
            headers = {"Host": HOST, "Connection": "close"}
            if self.token:
                headers["X-AltNet-Session"] = self.token
            if data is not None:
                headers.update({"Content-Type": "application/json", "Origin": "http://" + HOST})
            conn.request("GET" if data is None else "POST", path, data, headers)
            response = conn.getresponse()
            if response.status not in (200, 202):
                raise ValueError("Клиент отклонил запрос")
            body = response.read(limit + 1)
            if len(body) > limit:
                raise ValueError("Слишком большой ответ")
            return body
        finally:
            conn.close()

    def status(self):
        s = json.loads(self.request("/api/bridges/status"))
        if s["phase"] not in PHASES or s["internet"] not in INTERNET or type(s["progress"]) is not int or not 0 <= s["progress"] <= 100 or type(s["connected"]) is not bool:
            raise ValueError("Некорректное состояние")
        return dict(phase=s["phase"], progress=s["progress"], torConnected=s["connected"], internet=s["internet"], fastAvailable=False)


def answer(**fields):
    print(json.dumps(fields, ensure_ascii=True, separators=(",", ":")), flush=True)


def serve():
    raw = sys.stdin.buffer.readline(257)
    msg = json.loads(raw)
    if set(msg) != {"protocol", "secret"} or msg["protocol"] != "altnet-native-v1" or not re.fullmatch("[A-Za-z0-9_-]{43}", msg["secret"]):
        return
    client = Client()
    try:
        answer(protocol=msg["protocol"], authority=HOST)
        current = 0
        while raw := sys.stdin.buffer.readline(32769):
            if len(raw) > 32768 or not raw.endswith(b"\n"):
                return
            cmd = json.loads(raw)
            index, method = cmd.get("id"), cmd.get("method")
            if type(index) is not int or not current < index <= 2147483647:
                return
            current = index
            if method == "manual":
                lines = cmd.get("lines")
                if set(cmd) != {"id", "method", "lines"} or not isinstance(lines, str) or not 0 < len(lines) <= 16384:
                    return
            elif set(cmd) != {"id", "method"}:
                return
            if method == "status":
                answer(id=index, ok=True, status=client.status())
            elif method in {"refresh", "switch", "pause", "resume", "manual"}:
                try:
                    data = {"lines": lines} if method == "manual" else {}
                    client.request("/api/bridges/" + method, json.dumps(data).encode())
                except ValueError:
                    answer(id=index, ok=False, error="action_rejected")
                else:
                    answer(id=index, ok=True)
            else:
                return
    finally:
        client.close()


if __name__ == "__main__":
    try:
        serve()
    except (OSError, ValueError, KeyError, TypeError, http.client.HTTPException):
        sys.exit(1)
