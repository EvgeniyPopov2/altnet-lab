#!/usr/bin/env python3
"""Native stdin/stdout endpoint for one configured, mutually authenticated voice peer."""
import asyncio
import array
import base64
import ctypes as C
import errno
import hashlib
import hmac
import ipaddress
import json
import math
import os
from pathlib import Path
import re
import secrets
import signal
import socket
import ssl
import stat
import struct
import subprocess
import sys
import time

CONFIG = Path("/etc/altnet-browser/voice.json")
NODES = ipaddress.IPv6Network("200::/8")
RATE, SAMPLES, MAX_PACKET = 48000, 960, 1275
PREFACE = b"ALTNET-VOICE\x01"
FIELDS = {"interface", "source", "peer", "port", "mode", "selfName", "peerName", "cert", "key", "peerCert"}


class VoiceError(Exception):
    """Only messages from this class are safe to return to the UI."""


def trusted_file(path, private=False):
    for parent in path.parents:
        directory = parent.lstat()
        if not stat.S_ISDIR(directory.st_mode) or directory.st_uid != 0 or directory.st_mode & 0o022:
            raise VoiceError("Каталог ключей должен контролироваться администратором.")
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & (0o027 if private else 0o022):
        raise VoiceError("Проверьте владельца и права файлов голосовой связи.")


def load_route():
    trusted_file(CONFIG)
    if CONFIG.stat().st_size > 8192:
        raise VoiceError("Некорректная конфигурация голосовой связи.")
    return validate_route(json.loads(CONFIG.read_bytes()))


def validate_route(data):
    if not isinstance(data, dict) or data.keys() != FIELDS:
        raise VoiceError("Некорректная конфигурация голосовой связи.")
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,15}", data["interface"]):
        raise VoiceError("Некорректный сетевой интерфейс.")
    for key in ("source", "peer"):
        value = data[key]
        if not isinstance(value, str) or "%" in value or ipaddress.IPv6Address(value) not in NODES:
            raise VoiceError("Нужен адрес узла Yggdrasil.")
        data[key] = str(ipaddress.IPv6Address(value))
    if data["source"] == data["peer"] or data["mode"] not in ("listen", "connect"):
        raise VoiceError("Некорректная пара узлов.")
    if type(data["port"]) is not int or not 1 <= data["port"] <= 65535:
        raise VoiceError("Некорректный порт.")
    for key in ("selfName", "peerName"):
        name = data[key]
        if not isinstance(name, str) or not name.strip() or len(name) > 64 or not name.isprintable():
            raise VoiceError("Некорректный позывной.")
    for key in ("cert", "key", "peerCert"):
        path = Path(data[key])
        if not path.is_absolute():
            raise VoiceError("Нужен абсолютный путь к ключам голосовой связи.")
        trusted_file(path, private=key == "key")
    return data


def credentials(route):
    server = route["mode"] == "listen"
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER if server else ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False  # Identity is the exact provisioned peer certificate, never a host name.
    ctx.minimum_version = ctx.maximum_version = ssl.TLSVersion.TLSv1_3
    ctx.verify_mode = ssl.CERT_REQUIRED
    ctx.verify_flags |= getattr(ssl, "VERIFY_X509_PARTIAL_CHAIN", 0)
    pem = Path(route["peerCert"]).read_text(encoding="ascii").strip()
    if pem.count("-----BEGIN CERTIFICATE-----") != 1 or not pem.endswith("-----END CERTIFICATE-----"):
        raise VoiceError("Ожидался один сертификат собеседника.")
    pinned = ssl.PEM_cert_to_DER_cert(pem)
    if hmac.compare_digest(pinned, ssl.PEM_cert_to_DER_cert(Path(route["cert"]).read_text(encoding="ascii"))):
        raise VoiceError("Участникам нужны разные сертификаты.")
    ctx.load_verify_locations(cadata=pem)
    ctx.load_cert_chain(route["cert"], route["key"], password=lambda: b"")
    if server:
        ctx.num_tickets = 0
    return ctx, pinned


def bound_socket(route, listening):
    sock = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    try:
        sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BINDTODEVICE, route["interface"].encode("ascii") + b"\0")
        if listening:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((route["source"], route["port"] if listening else 0))
        sock.setblocking(False)
        return sock
    except BaseException:
        sock.close()
        raise


def voice_identity(route):
    return {key: hashlib.sha256(ssl.PEM_cert_to_DER_cert(Path(route[field]).read_text(encoding="ascii"))).hexdigest()
            for key, field in (("localCert", "cert"), ("peerCert", "peerCert"))}


class RoomDial:
    """Бюджет TCP только для повторного соединения с принятым собеседником."""

    def __init__(self):
        self.last_connect = None

    def timeout(self, attempt, seconds_waiting):
        if self.last_connect is None or attempt % 4 == 3 or seconds_waiting >= 90:
            return 4
        return min(4, max(1.1, 3*self.last_connect + .15))


async def routed_stream(route, ctx, pinned, preface=PREFACE, timing=None):
    loop = asyncio.get_running_loop()
    server = route["mode"] == "listen"
    if server:
        with bound_socket(route, True) as listener:
            listener.listen(2)
            while True:
                sock, address = await loop.sock_accept(listener)
                if address[0] == route["peer"]:
                    break
                sock.close()
    else:
        started, attempt = loop.time(), 0
        while True:
            sock = bound_socket(route, False)
            try:
                sent = loop.time()
                budget = timing.timeout(attempt, sent-started) if timing else 4
                await asyncio.wait_for(loop.sock_connect(sock, (route["peer"], route["port"])), budget)
                elapsed = loop.time()-sent
                break
            except (ConnectionRefusedError, asyncio.TimeoutError) as exc:
                sock.close()
                attempt += 1
                # При отказе узла сохраняем паузу. После истёкшего короткого
                # ожидания SYN можно заново отправлять по восстановленному пути.
                await asyncio.sleep(.15 if isinstance(exc, asyncio.TimeoutError) and budget < 4 else .65)
            except BaseException:
                sock.close()
                raise
    writer = None
    try:
        if sock.getsockname()[0] != route["source"] or sock.getpeername()[0] != route["peer"]:
            raise VoiceError("Соединение вышло за пределы настроенного маршрута.")
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        if server:
            reader = asyncio.StreamReader(limit=8192)
            protocol = asyncio.StreamReaderProtocol(reader)
            transport, _ = await loop.connect_accepted_socket(lambda: protocol, sock, ssl=ctx, ssl_handshake_timeout=4)
            writer = asyncio.StreamWriter(transport, protocol, reader, loop)
        else:
            reader, writer = await asyncio.open_connection(sock=sock, ssl=ctx, server_hostname="", ssl_handshake_timeout=4, limit=8192)
        identity = writer.get_extra_info("ssl_object")
        if identity.version() != "TLSv1.3" or not hmac.compare_digest(identity.getpeercert(binary_form=True), pinned):
            raise VoiceError("Сертификат собеседника не совпадает.")
        # Both processes must have accepted the other's pin before opening either device.
        writer.write(preface)
        await writer.drain()
        if await asyncio.wait_for(reader.readexactly(len(preface)), 4) != preface:
            raise VoiceError("Несовместимый протокол голосовой связи.")
        if timing and not server:
            timing.last_connect = elapsed
        return reader, writer
    except BaseException:
        if writer:
            writer.transport.abort()
        sock.close()
        raise


async def wait_mesh_echo(route):
    """Подсказка для уже подтверждённого собеседника. Захват звука требует ответа по TLS."""
    if any(ipaddress.IPv6Address(route[key]) not in NODES for key in ("peer", "source")):
        return False
    loop = asyncio.get_running_loop()
    started = loop.time()
    try:
        with socket.socket(socket.AF_INET6, socket.SOCK_DGRAM, socket.IPPROTO_ICMPV6) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BINDTODEVICE, route["interface"].encode("ascii") + b"\0")
            sock.bind((route["source"], 0))
            sock.connect((route["peer"], 0))
            sock.setblocking(False)
            seq = 0
            while True:
                sent = loop.time()
                seq = (seq + 1) & 65535
                proof = struct.pack("!H", seq) + secrets.token_bytes(16)
                try:
                    await loop.sock_sendall(sock, b"\x80\0\0\0\0\0" + proof)
                    reply = await asyncio.wait_for(loop.sock_recv(sock, 128), 1)
                    if reply[:2] == b"\x81\0" and hmac.compare_digest(reply[6:], proof):
                        return True
                except (OSError, asyncio.TimeoutError):
                    pass
                period = 1.25 if sent - started < 90 else 5
                await asyncio.sleep(max(.1, period - (loop.time() - sent)))
    except OSError:
        # В системах без непривилегированного ICMP продолжают работать TLS и уведомление пира.
        return False


class RoomChannels:
    """Один тихий запасной TLS-поток на принятого собеседника в комнате."""
    protocol = "altnet-air-standby/1"

    def __init__(self, dial, server, route=None):
        self.route = route
        self.retry_after = 0
        self.dial = dial
        self.server = server
        self.spare = None
        self.wake = asyncio.Event()
        self.echo = asyncio.Event()
        self.waiting_since = None

    @staticmethod
    def recoverable(exc):
        return isinstance(exc, (ConnectionError, asyncio.IncompleteReadError, asyncio.TimeoutError)) or (
            isinstance(exc, OSError) and exc.errno in (errno.ENETUNREACH, errno.EHOSTUNREACH, errno.ENETDOWN,
                                                       errno.EHOSTDOWN, errno.ENODEV, errno.EADDRNOTAVAIL))

    @classmethod
    def negotiated(cls, writer):
        return writer.get_extra_info("ssl_object").selected_alpn_protocol() == cls.protocol

    @staticmethod
    async def discard(tasks):
        for task in tasks:
            task.cancel()
        for result in await asyncio.gather(*tasks, return_exceptions=True):
            if isinstance(result, tuple):
                result[1].transport.abort()

    async def close(self):
        if self.spare is not None:
            task, self.spare = self.spare, None
            await self.discard([task])

    def prepare(self, writer):
        if self.negotiated(writer):
            self.spare = asyncio.create_task(self.dial())

    def refresh(self):
        if not self.spare or not self.spare.done() or time.monotonic() < self.retry_after:
            return
        if not self.spare.cancelled() and self.spare.exception() is None:
            reader, writer = self.spare.result()
            if not reader.at_eof() and not writer.is_closing():
                return
            writer.transport.abort()
        self.retry_after = time.monotonic() + 3
        self.spare = asyncio.create_task(self.dial())

    async def signal_route(self, writer):
        await self.wake.wait()
        if self.route and not self.echo.is_set():
            # Данные на входной цепочке Tor могут появиться раньше, чем
            # дойдёт пакет до собеседника. Не занимать тихий TCP преждевременно.
            try:
                await asyncio.wait_for(self.echo.wait(), 1.5)
            except asyncio.TimeoutError:
                pass
        if not self.server and self.echo.is_set():
            return
        writer.write(b"!" if self.server else b"?")
        await writer.drain()

    async def propose(self, stream=None):
        warm = stream is not None
        reader, writer = stream if warm else await self.dial()
        signal = None
        keep = False
        try:
            if self.negotiated(writer):
                if warm:
                    signal = asyncio.create_task(self.signal_route(writer))
                if self.server:
                    command = await reader.readexactly(1) if warm else await asyncio.wait_for(reader.readexactly(1), 8)
                    if command == b"?":
                        writer.write(b"!")
                        await writer.drain()
                        command = await reader.readexactly(1)
                    if command != b"C":
                        raise VoiceError("Неверное подтверждение канала Эфира.")
                elif warm:
                    # После ответа именно этого mesh-адреса можно сразу послать
                    # C. Подтверждение A внутри TLS всё ещё обязательно.
                    response = asyncio.create_task(reader.readexactly(1))
                    echo = asyncio.create_task(self.echo.wait())
                    try:
                        done, _ = await asyncio.wait((response, echo), return_when=asyncio.FIRST_COMPLETED)
                        if response in done and response.result() != b"!":
                            raise VoiceError("Неверный ответ резервного канала.")
                    finally:
                        for task in (response, echo):
                            task.cancel()
                        await asyncio.gather(response, echo, return_exceptions=True)
            keep = True
            return reader, writer
        finally:
            if not keep:
                writer.transport.abort()
            if signal:
                signal.cancel()
                await asyncio.gather(signal, return_exceptions=True)

    async def acquire(self):
        # Только соединяющая сторона выбирает победителя. Слушающая принимает
        # C ровно на выбранном сокете. До A микрофон остаётся закрытым.
        warm = None
        if self.spare is not None:
            if self.spare.done() and not self.spare.cancelled() and self.spare.exception() is None:
                warm = self.spare.result()
                self.spare = None
            else:
                await self.close()
        self.wake.clear()
        self.echo.clear()
        self.waiting_since = time.monotonic()
        async def fresh():
            while True:
                try:
                    return await self.propose()
                except (OSError, asyncio.IncompleteReadError, asyncio.TimeoutError) as exc:
                    if not warm or not self.recoverable(exc):
                        raise
                    await asyncio.sleep(.35)
        candidates = {asyncio.create_task(fresh())}
        if warm:
            candidates.add(asyncio.create_task(self.propose(warm)))
        async def wake_on_echo():
            if await wait_mesh_echo(self.route):
                self.echo.set()
                self.wake.set()
        probe = asyncio.create_task(wake_on_echo()) if warm and self.route else None
        pending = candidates.copy()
        winner = None
        writer = None
        success = False
        try:
            while pending:
                done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    try:
                        reader, writer = task.result()
                    except (OSError, asyncio.IncompleteReadError, asyncio.TimeoutError) as exc:
                        if not self.recoverable(exc):
                            raise
                        if pending or any(other is not task and other.exception() is None for other in done):
                            continue
                        raise
                    winner = task
                    break
                if winner:
                    break
            if self.negotiated(writer):
                if self.server:
                    writer.write(b"A")
                else:
                    writer.write(b"C")
                await writer.drain()
                if not self.server:
                    async def acknowledged():
                        for _ in range(3):
                            answer = await reader.readexactly(1)
                            if answer == b"A":
                                return
                            if answer != b"!":
                                break
                        raise VoiceError("Собеседник не подтвердил канал Эфира.")
                    await asyncio.wait_for(acknowledged(), 5)
            success = True
            return reader, writer
        finally:
            self.waiting_since = None
            if probe:
                probe.cancel()
                await asyncio.gather(probe, return_exceptions=True)
            if writer and not success:
                writer.transport.abort()
            await self.discard(candidates - {winner})
            if warm and (not success or writer is not warm[1]):
                warm[1].transport.abort()


class Opus:
    def __init__(self):
        lib = self.lib = C.CDLL("libopus.so.0")
        i, p, ptr = C.c_int, C.c_void_p, C.POINTER
        signatures = {
            "opus_encoder_create": (p, [i, i, i, ptr(i)]),
            "opus_decoder_create": (p, [i, i, ptr(i)]),
            "opus_encode": (i, [p, p, i, p, i]),
            "opus_decode": (i, [p, p, i, p, i, i]),
            "opus_encoder_destroy": (None, [p]),
            "opus_decoder_destroy": (None, [p]),
        }
        for name, (result, args) in signatures.items():
            fn = getattr(lib, name)
            fn.restype, fn.argtypes = result, args
        error = i()
        self.encoder = lib.opus_encoder_create(RATE, 1, 2048, C.byref(error))  # OPUS_APPLICATION_VOIP
        self.decoder = lib.opus_decoder_create(RATE, 1, C.byref(error))
        if not self.encoder or not self.decoder:
            self.close()
            raise VoiceError("Не удалось открыть речевой кодек Opus.")

    def encode(self, frame):
        data = C.create_string_buffer(MAX_PACKET)
        if len(frame) != SAMPLES * 2:
            raise VoiceError("Неполный аудиокадр.")
        n = self.lib.opus_encode(self.encoder, frame, SAMPLES, data, MAX_PACKET)
        if n <= 0:
            raise VoiceError("Не удалось закодировать звук.")
        return data.raw[:n]

    def decode(self, packet):
        data = C.create_string_buffer(SAMPLES * 2)
        if not 0 < len(packet) <= MAX_PACKET or self.lib.opus_decode(self.decoder, packet, len(packet), data, SAMPLES, 0) != SAMPLES:
            raise VoiceError("Некорректный речевой кадр.")
        return data.raw

    def close(self):
        if self.encoder:
            self.lib.opus_encoder_destroy(self.encoder)
            self.encoder = None
        if self.decoder:
            self.lib.opus_decoder_destroy(self.decoder)
            self.decoder = None


class Meter:
    def __init__(self):
        self.reset()

    def reset(self):
        self.level, self.last, self.voice = 0., 0., 0.

    def feed(self, pcm):
        samples = array.array("h", pcm)
        if sys.byteorder != "little":
            samples.byteswap()
        rms = math.sqrt(sum(x * x for x in samples) / SAMPLES) / 32768
        self.last = time.monotonic()
        self.level = min(1., rms * 4)
        if rms >= 0.018:
            self.voice = self.last

    def snapshot(self):
        now = time.monotonic()
        return (round(self.level, 3) if now - self.last < .30 else 0., now - self.voice < .19)


_LIBC = C.CDLL(None)


def start_audio(args, recording):
    # In addition to orderly EOF/leave, SIGKILL of the helper tears down its audio children.
    parent_pid = os.getpid()
    def child_lifetime():
        if _LIBC.prctl(1, signal.SIGKILL, 0, 0, 0) != 0 or os.getppid() != parent_pid:
            os._exit(1)
    proc = subprocess.Popen(args, stdin=subprocess.DEVNULL if recording else subprocess.PIPE,
                            stdout=subprocess.PIPE if recording else subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL, bufsize=0, close_fds=True, preexec_fn=child_lifetime)
    os.set_blocking((proc.stdout if recording else proc.stdin).fileno(), False)
    return proc


def pactl(*command):
    try:
        return subprocess.check_output(["/usr/bin/pactl", *command], env={**os.environ, "LC_ALL": "C"},
                                       stdin=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                       timeout=.8, encoding="utf-8", errors="replace").strip()
    except (OSError, subprocess.SubprocessError) as exc:
        raise VoiceError("Не удалось определить аудиоустройства PulseAudio.") from exc


def pulse_device(kind):
    selected = os.environ.get("PULSE_" + kind.upper())
    if not selected or selected == "@DEFAULT_" + kind.upper() + "@":
        selected = pactl("get-default-" + kind)
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,255}", selected) or selected.isdecimal():
        raise VoiceError("Выберите микрофон и устройство вывода в настройках звука Ubuntu.")
    return selected


def private_pulse_socket():
    server = os.environ.get("PULSE_SERVER", "")
    if not server.startswith("unix:/"):
        return False
    path = Path(server.removeprefix("unix:"))
    try:
        entry, directory = path.lstat(), path.parent.lstat()
        return (stat.S_ISSOCK(entry.st_mode) and stat.S_ISDIR(directory.st_mode)
                and entry.st_uid == directory.st_uid == os.geteuid() and not directory.st_mode & 0o077)
    except OSError:
        return False


def microphone_for(sink):
    source = pulse_device("source")
    # Monitor identity comes from Pulse itself, even if the source has a custom name.
    for record in re.split(r"(?m)^Source #\d+\n", pactl("list", "sources"))[1:]:
        if f"\tName: {source}\n" not in record:
            continue
        role = re.search(r"(?m)^\tMonitor of Sink: (.+)$", record)
        if role:
            monitor = role.group(1)
            if monitor == "n/a" and not source.endswith(".monitor"):
                return source
            if (monitor not in ("n/a", sink) and source != sink + ".monitor"
                    and os.environ.get("PULSE_SOURCE") == source and os.environ.get("PULSE_SINK") == sink
                    and private_pulse_socket()):
                return source
        break
    raise VoiceError("Микрофон недоступен. Подключите микрофон и выберите его в настройках звука Ubuntu.")


def audio_process(program, *, recording, sink):
    device = microphone_for(sink) if recording else sink
    args = [program, "--device=" + device, "--raw", f"--rate={RATE}", "--channels=1", "--format=s16le", "--latency-msec=40"]
    return start_audio(args, recording)


def stop_process(proc):
    if proc is not None:
        if proc.poll() is None:
            proc.kill()
        for stream in (proc.stdout, proc.stdin):
            if stream:
                stream.close()
        proc.wait()


async def pipe_ready(fd, writing, future):
    loop = asyncio.get_running_loop()
    def wake():
        if not future.done():
            future.set_result(None)
    (loop.add_writer if writing else loop.add_reader)(fd, wake)
    try:
        await asyncio.wait_for(future, 5)
    finally:
        (loop.remove_writer if writing else loop.remove_reader)(fd)


class Pulse:
    def __init__(self, playback=True):
        self.capture, self.waiter = None, None
        self.sink = pulse_device("sink")
        self.playback = audio_process("/usr/bin/pacat", recording=False, sink=self.sink) if playback else None

    def mute(self):
        if self.waiter and not self.waiter.done():
            self.waiter.set_result(None)
        capture, self.capture = self.capture, None
        stop_process(capture)

    async def read(self):
        if self.capture is None:
            self.capture = audio_process("/usr/bin/parec", recording=True, sink=self.sink)
        capture = self.capture
        data = bytearray()
        while len(data) < SAMPLES * 2:
            fd = capture.stdout.fileno()
            try:
                part = os.read(fd, SAMPLES * 2 - len(data))
            except BlockingIOError:
                self.waiter = asyncio.get_running_loop().create_future()
                try:
                    await pipe_ready(fd, False, self.waiter)
                finally:
                    self.waiter = None
                if self.capture is not capture:
                    return None
                continue
            if not part:
                raise VoiceError("Микрофон недоступен.")
            data.extend(part)
        return bytes(data)

    async def play(self, frame):
        if self.playback.poll() is not None:
            raise VoiceError("Аудиовыход недоступен.")
        fd = self.playback.stdin.fileno()
        while frame:
            try:
                n = os.write(fd, frame)
                frame = frame[n:]
            except BlockingIOError:
                await pipe_ready(fd, True, asyncio.get_running_loop().create_future())

    def close(self):
        self.mute()
        stop_process(self.playback)
        self.playback = None


def load_room():
    path = CONFIG.with_name("voice-room.json")
    # A missing room keeps the existing two-party setup. Invalid installed files fail closed.
    try:
        path.lstat()
    except FileNotFoundError:
        return None
    trusted_file(path)
    if path.stat().st_size > 8192:
        raise VoiceError("Некорректный список участников эфира.")
    data = json.loads(path.read_bytes())
    common = {"interface", "source", "selfName", "key", "cert"}
    if not isinstance(data, dict) or set(data) != common | {"peers"} or not isinstance(data["peers"], list) or not 1 <= len(data["peers"]) <= 7:
        raise VoiceError("Некорректный список участников эфира.")
    routes, ids, addresses, names, ports = [], set(), set(), {data["selfName"]}, set()
    for peer in data["peers"]:
        if not isinstance(peer, dict):
            raise VoiceError("Некорректный участник эфира.")
        if set(peer) != FIELDS - common:
            raise VoiceError("Некорректный маршрут участника.")
        route = validate_route({**{k:data[k] for k in common}, **peer})
        context, pin = credentials(route)
        identity = hashlib.sha256(pin).hexdigest()
        if (identity in ids or route["peer"] in addresses or route["peerName"] in names
                or (route["mode"] == "listen" and route["port"] in ports)):
            raise VoiceError("Участники эфира должны иметь разные маршруты и сертификаты.")
        ids.add(identity)
        addresses.add(route["peer"])
        names.add(route["peerName"])
        if route["mode"] == "listen":
            ports.add(route["port"])
        routes.append((route, context, pin, identity))
    ids.add(voice_identity(routes[0][0])["localCert"])
    roster = hashlib.sha256("".join(sorted(ids)).encode("ascii")).digest()
    return routes, b"ALTNET-ROOM\x01" + roster


class Room:
    """One microphone/encoder, one pinned TLS stream and one playback/meter per peer."""
    def __init__(self, session, config):
        self.session = session
        self.routes, self.preface = config
        self.members = {}
        self.ready = asyncio.Event()
        self.channels = set()
        self.session.self_name = self.routes[0][0]["selfName"]

    def people(self):
        people = []
        for identity, (name, meter, _) in self.members.items():
            level, speaking = meter.snapshot()
            people.append({"id": identity, "name": name, "level": level, "speaking": speaking})
        return sorted(people, key=lambda p:p["name"])

    async def broadcast(self):
        codec = Opus()
        try:
            while True:
                await self.ready.wait()
                if self.session.muted:
                    packet = b""
                    await asyncio.sleep(.12)
                else:
                    pcm = await self.session.devices.read()
                    if pcm is None or self.session.muted or not self.members:
                        continue
                    self.session.local.feed(pcm)
                    packet = codec.encode(pcm)
                frame = struct.pack("!H", len(packet)) + packet
                for _, _, queue in self.members.values():
                    if queue.full():
                        queue.get_nowait()
                    queue.put_nowait(frame)
        finally:
            codec.close()

    async def transmit(self, writer, queue):
        while True:
            writer.write(await queue.get())
            await asyncio.wait_for(writer.drain(), 5)

    async def link(self, route, context, pin, identity):
        timing = RoomDial()
        def dial():
            return routed_stream(route, context, pin, self.preface, timing)
        channels = RoomChannels(dial, route.get("mode") == "listen", route)
        self.channels.add(channels)
        try:
            await self.media_loop(route, identity, channels)
        finally:
            self.channels.discard(channels)
            await channels.close()

    def route_received(self, stamp):
        for channel in self.channels:
            channel.refresh()
            if channel.waiting_since is not None and stamp > channel.waiting_since:
                channel.wake.set()

    async def media_loop(self, route, identity, channels):
        while True:
            writer = codec = output = None
            pumps = []
            try:
                reader, writer = await channels.acquire()
                output, codec = Pulse(), Opus()
                meter, queue = Meter(), asyncio.Queue(maxsize=6)
                self.members[identity] = (route["peerName"], meter, queue)
                self.session.phase = "connected"
                self.ready.set()
                channels.prepare(writer)
                pumps = [asyncio.create_task(self.transmit(writer, queue)),
                         asyncio.create_task(self.session.receive(reader, codec, meter, output))]
                await asyncio.gather(*pumps)
            except (asyncio.IncompleteReadError, ConnectionError, ssl.SSLError, asyncio.TimeoutError):
                pass
            except OSError as error:
                # Linux может временно потерять маршрут, интерфейс или его адрес.
                # Та же комната повторит соединение с ранее подтверждённым собеседником.
                if error.errno not in (errno.ENETUNREACH, errno.EHOSTUNREACH, errno.ENETDOWN,
                                       errno.EHOSTDOWN, errno.ENODEV, errno.EADDRNOTAVAIL):
                    raise
            finally:
                if writer:
                    writer.transport.abort()
                for pump in pumps:
                    pump.cancel()
                await asyncio.gather(*pumps, return_exceptions=True)
                if output:
                    output.close()
                if codec:
                    codec.close()
                self.members.pop(identity, None)
                if not self.members:
                    self.ready.clear()
                    self.session.devices.mute()
                    self.session.local.reset()
                    self.session.phase = "waiting"
            # После потери живого канала сразу открываем слушатель и резерв.
            # Быстрые отказы открытия ограничены паузой.
            await asyncio.sleep(0 if writer else .45)

    def extend(self, routes):
        for route in routes:
            task=asyncio.create_task(self.link(*route))
            self.workers.append(task)
            task.add_done_callback(self.worker_finished)

    def worker_finished(self, task):
        if not self.failure.done() and not task.cancelled():
            self.failure.set_exception(task.exception() or VoiceError("Соединение Эфира завершилось."))

    async def run(self):
        self.session.devices = Pulse(playback=False)
        self.failure=asyncio.get_running_loop().create_future()
        capture=asyncio.create_task(self.broadcast())
        self.workers=[capture]
        capture.add_done_callback(self.worker_finished)
        try:
            self.extend(self.routes)
            await self.failure
        finally:
            self.failure.cancel()
            for task in self.workers:
                task.cancel()
            await asyncio.gather(*self.workers, return_exceptions=True)


class Session:
    def __init__(self):
        self.task, self.devices = None, None
        self.phase, self.error = "idle", ""
        self.self_name, self.peer_name = "", ""
        self.muted = False
        self.local, self.remote = Meter(), Meter()
        self.intent, self.pins, self.gate = None, None, None
        self.dynamic = None
        self.room = None
        self.challenge = {}

    def state(self):
        local, speaking = self.local.snapshot()
        remote, hearing = self.remote.snapshot()
        return {"phase": self.phase, "self": self.self_name, "peer": self.peer_name,
                "muted": self.muted, "localLevel": local, "remoteLevel": remote,
                "localSpeaking": speaking, "remoteSpeaking": hearing, **self.challenge,
                **({"participants": self.room.people()} if self.room else {}), **({"error": self.error} if self.error else {})}

    def join(self, muted, intent=None, pins=None):
        if self.task and not self.task.done():
            return
        self.error = ""
        self.room = None
        self.muted = muted
        self.intent, self.pins = intent, pins
        self.phase = "waiting"
        self.task = asyncio.create_task(self.run())

    async def decision(self, phase, details, timeout):
        self.gate = asyncio.get_running_loop().create_future()
        self.challenge, self.phase = details, phase
        try:
            return await asyncio.wait_for(self.gate, timeout)
        finally:
            self.gate, self.challenge = None, {}

    async def authenticate(self, reader, writer):
        nonce = secrets.token_bytes(32)
        calling = self.intent == "dial"
        writer.write(bytes([int(calling)]) + nonce)
        await writer.drain()
        hello = await reader.readexactly(33)
        if hello[0] != int(not calling) or hello[1:] == nonce:
            raise VoiceError("Один участник должен позвонить, а второй включить приём.")
        def encode(value):
            return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")
        challenge = {"nonce": encode(nonce), "peerNonce": encode(hello[1:])}
        proof = (await self.decision("proving", challenge, 12)).encode("ascii")
        writer.write(struct.pack("!H", len(proof)) + proof)
        await writer.drain()
        size, = struct.unpack("!H", await reader.readexactly(2))
        if not 1 <= size <= 3000:
            raise VoiceError("Некорректная подпись устройства.")
        peer_proof = (await reader.readexactly(size)).decode("ascii")
        if not re.fullmatch(r"[\w-]+\.[\w-]+\.[\w-]+", peer_proof, re.ASCII):
            raise VoiceError("Некорректная подпись устройства.")
        await self.decision("checking", {**challenge, "peerProof": peer_proof}, 12)
        writer.write(b"V")
        await writer.drain()
        if await reader.readexactly(1) != b"V":
            raise VoiceError("Собеседник не подтвердил устройство.")
        if calling:
            self.phase = "ringing"
            if await reader.readexactly(1) != b"A":
                raise VoiceError("Собеседник не принял вызов.")
        else:
            accepted = asyncio.create_task(self.decision("incoming", {}, 60))
            disconnected = asyncio.create_task(reader.read(1))
            try:
                await asyncio.wait([accepted, disconnected], return_when=asyncio.FIRST_COMPLETED)
                if disconnected.done():
                    raise VoiceError("Собеседник завершил вызов.")
                await accepted
            finally:
                for task in (accepted, disconnected):
                    task.cancel()
                await asyncio.gather(accepted, disconnected, return_exceptions=True)
            writer.write(b"A")
            await writer.drain()

    def mute(self, muted):
        self.muted = muted
        if muted:
            self.local.reset()
            if self.devices:
                self.devices.mute()

    async def send(self, writer, codec):
        while True:
            if self.muted:
                writer.write(b"\0\0")
                await asyncio.wait_for(writer.drain(), 5)
                await asyncio.sleep(.15)
                continue
            pcm = await self.devices.read()
            if pcm is None or self.muted:
                continue
            self.local.feed(pcm)
            packet = codec.encode(pcm)
            writer.write(struct.pack("!H", len(packet)) + packet)
            await asyncio.wait_for(writer.drain(), 5)

    async def receive(self, reader, codec, meter=None, output=None):
        meter = meter or self.remote
        output = output or self.devices
        while True:
            header = await asyncio.wait_for(reader.readexactly(2), 6)
            size, = struct.unpack("!H", header)
            if size > MAX_PACKET:
                raise VoiceError("Превышен размер речевого кадра.")
            if size == 0:
                meter.reset()
                continue
            packet = await asyncio.wait_for(reader.readexactly(size), 4)
            pcm = codec.decode(packet)
            meter.feed(pcm)
            await output.play(pcm)

    async def run(self):
        writer, codec, pumps = None, None, []
        try:
            config = None if self.intent else (self.dynamic or load_room())
            if config is not None:
                self.room = Room(self, config)
                await self.room.run()
                return
            route = load_route()
            self.self_name, self.peer_name = route["selfName"], route["peerName"]
            ctx, pinned = credentials(route)
            if self.intent:
                if self.pins != voice_identity(route):
                    raise VoiceError("Изменился сертификат голосового маршрута.")
                reader, writer = await asyncio.wait_for(routed_stream(route, ctx, pinned, b"ALTNET-VOICE\x02"), 120)
                await asyncio.wait_for(self.authenticate(reader, writer), 90)
            else:
                reader, writer = await routed_stream(route, ctx, pinned)
            codec = Opus()
            self.devices = Pulse()
            self.phase = "connected"
            pumps = [asyncio.create_task(self.send(writer, codec)), asyncio.create_task(self.receive(reader, codec))]
            await asyncio.gather(*pumps)
        except VoiceError as exc:
            self.error = str(exc)
        except ssl.SSLError:
            self.error = "Не удалось подтвердить сертификат собеседника."
        except (asyncio.IncompleteReadError, ConnectionError, asyncio.TimeoutError):
            self.error = "Голосовое соединение прервано."
        except (ValueError, KeyError, TypeError, OSError):
            self.error = "Проверьте маршрут, конфигурацию голоса и системные аудиоустройства."
        finally:
            if writer:
                writer.transport.abort()
            for pump in pumps:
                pump.cancel()
            if self.devices:
                self.devices.close()
                self.devices = None
            if pumps:
                await asyncio.gather(*pumps, return_exceptions=True)
            if codec:
                codec.close()
            self.local.reset()
            self.remote.reset()
            self.phase = "error" if self.error else "idle"

    async def leave(self):
        if self.task:
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)
            self.task = None
        self.phase, self.error, self.muted = "idle", "", False
        self.local.reset()
        self.remote.reset()

    async def command(self, cmd):
        if not isinstance(cmd, dict) or type(cmd.get("id")) not in (int, str):
            raise VoiceError("Некорректная команда.")
        op = cmd.get("op")
        keys = {"id", "op"}
        if op in ("dial", "listen"):
            keys.update(("localCert", "peerCert"))
            if any(not isinstance(cmd.get(k), str) or not re.fullmatch("[a-f0-9]{64}", cmd[k]) for k in ("localCert", "peerCert")):
                raise VoiceError("Некорректные отпечатки.")
        if op == "prove":
            keys.add("proof")
            if not isinstance(cmd.get("proof"), str) or len(cmd["proof"]) > 3000 or not re.fullmatch(r"[\w-]+\.[\w-]+\.[\w-]+", cmd["proof"], re.ASCII):
                raise VoiceError("Некорректная подпись.")
        if op in ("mute", "join") and "muted" in cmd:
            keys.add("muted")
        if set(cmd) != keys or ("muted" in cmd and type(cmd["muted"]) is not bool):
            raise VoiceError("Некорректные параметры команды.")
        if op == "join":
            self.join(cmd.get("muted", False))
        elif op in ("dial", "listen"):
            self.join(False, op, {k: cmd[k] for k in ("localCert", "peerCert")})
        elif op in ("prove", "verified", "accept"):
            if self.phase != {"prove":"proving", "verified":"checking", "accept":"incoming"}[op] or not self.gate or self.gate.done():
                raise VoiceError("Вызов изменился.")
            self.gate.set_result(cmd.get("proof", True))
        elif op == "leave":
            await self.leave()
        elif op == "mute" and "muted" in cmd:
            self.mute(cmd["muted"])
        elif op != "status":
            raise VoiceError("Неизвестная команда.")
        return self.state()


async def serve():
    session = Session()
    loop = asyncio.get_running_loop()
    reader = asyncio.StreamReader(limit=4096)
    pipe, _ = await loop.connect_read_pipe(lambda: asyncio.StreamReaderProtocol(reader), sys.stdin.buffer)
    waiter = asyncio.current_task()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, waiter.cancel)
    try:
        while True:
            line = await reader.readline()
            if not line:
                break
            cid = None
            try:
                cmd = json.loads(line)
                if isinstance(cmd, dict) and type(cmd.get("id")) in (str, int):
                    cid = cmd["id"]
                state = await session.command(cmd)
            except (ValueError, RecursionError, VoiceError):
                state = {**session.state(), "error": "Некорректная команда голосовой связи."}
            print(json.dumps({"id": cid, "state": state}, ensure_ascii=False, allow_nan=False), flush=True)
    except (ValueError, BrokenPipeError, asyncio.CancelledError):
        pass
    finally:
        pipe.close()
        await session.leave()


if __name__ == "__main__":
    if sys.argv[1:] == ["--identity"]:
        try:
            print(json.dumps(voice_identity(load_route())))
        except (ValueError, OSError, VoiceError, TypeError, KeyError):
            sys.exit(1)
    elif sys.argv[1:] == ["--contact-air"]:
        # Завершение браузера должно сразу освобождать микрофон и слушающий порт,
        # в том числе когда канал команд ещё открыт во время сетевого ожидания.
        parent = os.getppid()
        if parent == 1 or _LIBC.prctl(1, signal.SIGKILL, 0, 0, 0) or os.getppid() != parent:
            sys.exit(1)
        import runpy
        asyncio.run(runpy.run_path(str(Path(__file__).with_name("contact_air.py")))["serve"](sys.modules[__name__]))
    elif not sys.argv[1:]:
        asyncio.run(serve())
    else:
        sys.exit(2)

