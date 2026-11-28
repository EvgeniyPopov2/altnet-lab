"""Временный вход в Yggdrasil через системный Tor. Адрес живёт до закрытия контроллера."""
import asyncio
from pathlib import Path
import re
import runpy
import socket
import tempfile


def serve(port):
    directory = Path(__file__).resolve().parent
    control = runpy.run_path(str(directory / "bridge_tor.py"))["command"]
    transport = runpy.run_path(str(directory / "invite_transport.py"))
    target = transport["ONION_ENTRY"]
    target.unlink(missing_ok=True)
    local = transport["LOOPBACK"].read_text().strip()
    match = re.fullmatch(r"tls://127\.0\.0\.1:17910\?key=([a-f0-9]{64})", local)
    if not match:
        raise ValueError("Не удалось проверить локальную точку входа Yggdrasil.")
    cookie = Path("/run/tor/control.authcookie").read_bytes()
    if len(cookie) != 32:
        raise ValueError("Недоступна авторизация системного Tor.")
    with socket.socket(socket.AF_UNIX) as sock:
        sock.settimeout(12)
        sock.connect("/run/tor/control")
        with sock.makefile("rwb", buffering=0) as stream:
            control(stream, b"AUTHENTICATE " + cookie.hex().encode("ascii"))
            if b"status/circuit-established=1" not in control(stream, b"GETINFO status/circuit-established").splitlines():
                raise OSError("Tor пока не установил цепочку.")
            reply = control(stream, f"ADD_ONION NEW:ED25519-V3 Flags=DiscardPK MaxStreams=16 Port=17907,127.0.0.1:{port}".encode("ascii"))
            value = re.search(rb"(?m)^ServiceID=([a-z2-7]{56})$", reply)
            if not value:
                raise OSError("Tor не вернул адрес сервиса.")
            uri = transport["peer"](f"onion://{value[1].decode('ascii')}.onion:17907?key={match[1]}")
            with tempfile.NamedTemporaryFile(dir=target.parent, mode="w", delete=False) as out:
                staging = Path(out.name)
                out.write(uri + "\n")
            try:
                staging.chmod(0o644)
                staging.replace(target)
                sock.settimeout(None)
                # Соединением владеет служба. Остановка процесса удаляет сервис в Tor.
                if not stream.readline():
                    raise ConnectionError("Контроллер Tor завершил соединение.")
            finally:
                staging.unlink(missing_ok=True)
                target.unlink(missing_ok=True)


async def main():
    gateway = runpy.run_path(str(Path(__file__).with_name("onion_proxy.py")))["EntryGateway"]()
    async with await asyncio.start_server(gateway.handle, "127.0.0.1", 0) as server:
        await asyncio.to_thread(serve, server.sockets[0].getsockname()[1])


if __name__ == "__main__":
    asyncio.run(main())
