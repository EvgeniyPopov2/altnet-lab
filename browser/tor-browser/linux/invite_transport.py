"""Вход по приглашению через ограниченный список TLS-пиров быстрого профиля."""
import asyncio
import base64
import ctypes
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import runpy
import sys
import tempfile
import time
from urllib.parse import urlsplit

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


LOOPBACK = Path("/run/yggdrasil/altnet-loopback.uri")
ENTRIES = Path("/etc/altnet-transport")
PORT = 17907
LIMIT = 4
ONION_ENTRY = Path("/run/altnet-onion-entry/peer")


def onion_host(public):
    checksum = hashlib.sha3_256(b".onion checksum" + public + b"\x03").digest()[:2]
    return base64.b32encode(public + checksum + b"\x03").decode("ascii").lower() + ".onion"


def via_tor(uri):
    return uri.startswith("onion://")


def peer(uri):
    if not isinstance(uri, str) or len(uri) > 160:
        raise ValueError("Некорректная точка входа.")
    onion = re.fullmatch(r"onion://([a-z2-7]{56})\.onion:17907\?key=([a-f0-9]{64})", uri)
    if onion:
        public = base64.b32decode(onion[1].upper())[:32]
        if onion_host(public) != onion[1] + ".onion":
            raise ValueError("Некорректная контрольная сумма адреса Tor.")
        return uri
    match = re.fullmatch(r"tls://(\[[0-9a-fA-F:]+\]|[0-9.]+):17907\?key=([0-9a-f]{64})", uri)
    if not match:
        raise ValueError("Для входа нужен TLS-пир с закреплённым ключом.")
    address = ipaddress.ip_address(match[1].strip("[]"))
    if (not address.is_global or address.is_reserved or address.is_multicast or
            (address.version == 6 and (address not in ipaddress.ip_network("2000::/3")
                                       or address.sixtofour or address.teredo))):
        raise ValueError("В приглашении допустим только публичный одноадресный IP.")
    host = str(address) if address.version == 4 else f"[{address}]"
    return f"tls://{host}:{PORT}?key={match[2]}"


def local_entry():
    try:
        value = peer(ONION_ENTRY.read_text(encoding="ascii").strip())
        if via_tor(value):
            return value
    except (OSError, ValueError):
        pass
    return None


def entry_generation(uri):
    return hashlib.sha256(uri.encode("ascii")).hexdigest()


def shareable(learned, expected_generation=None):
    local = local_entry()
    if expected_generation is not None and (not local or entry_generation(local) != expected_generation):
        raise ValueError("Точка входа сменилась. Проверьте её состояние и создайте новую ссылку.")
    if local:
        return [local]
    values = []
    for name in ("invite-peers.json", "peers.json"):
        if name == "peers.json":
            values.extend(learned)
        try:
            raw = (ENTRIES / name).read_bytes()
            batch = json.loads(raw) if len(raw) <= 4096 else []
            if isinstance(batch, list):
                values.extend(batch[:LIMIT])
        except (OSError, ValueError):
            pass
    result = []
    for entry in values:
        try:
            uri = peer(entry)
        except ValueError:
            continue
        if uri not in result:
            result.append(uri)
    # Одна ссылка задаёт один способ входа, в том числе при повторной передаче.
    return [uri for uri in result if via_tor(uri) == via_tor(result[0])][:LIMIT]


def pack_peers(entries):
    data = bytearray()
    if not 1 <= len(entries) <= LIMIT:
        raise ValueError("Допускается от одной до четырёх точек входа.")
    for entry in entries:
        address = urlsplit(peer(entry))
        if via_tor(entry):
            encoded = b"\x03" + base64.b32decode(address.hostname[:56].upper())[:32]
        else:
            ip = ipaddress.ip_address(address.hostname)
            encoded = bytes([ip.version]) + ip.packed
        data.extend(encoded + bytes.fromhex(address.query[4:]))
    return bytes(data)


def unpack_peers(data, *, onion=False):
    result = []
    while data and len(result) < LIMIT:
        size = ({3: 32} if onion else {4: 4, 6: 16}).get(data[0])
        if not size or len(data) < 33 + size:
            raise ValueError("Повреждён адрес точки входа.")
        if onion:
            endpoint = "onion://" + onion_host(data[1:1 + size])
        else:
            address = ipaddress.ip_address(data[1:1 + size])
            endpoint = "tls://" + (str(address) if size == 4 else f"[{address}]")
        uri = peer(f"{endpoint}:{PORT}?key={data[1+size:33+size].hex()}")
        if uri in result:
            raise ValueError("Повторяющаяся точка входа.")
        result.append(uri)
        data = data[33 + size:]
    if data or not result:
        raise ValueError("Некорректный список точек входа.")
    return result


class Transport:
    def __init__(self):
        self.process = self.directory = None
        self.entries = []
        self.retry = 0
        self.onion = None
        self.proxy_port = None
        self.priming = None
        self.config = None
        self.call_probe = None
        self.call_shared = False
        self.call_retry_at = 0
        self.call_entry = 0

    def destination(self, uri, *, authenticated=False):
        peer(uri)
        if not via_tor(uri):
            return uri
        # Yggdrasil 0.4 передаёт имя службе SOCKS и включает TLS и проверку ключа.
        isolation = self.onion.user.decode("ascii") + ":x@" if authenticated else ""
        return f"socks://{isolation}127.0.0.1:{self.proxy_port}/" + uri[len("onion://"):]

    async def update(self, entries, *, warm_entry=None):
        if self.process and self.process.returncode is None and self.entries == entries:
            return
        if self.priming is not None and self.entries == entries:
            if not self.priming.done():
                return
            task, self.priming = self.priming, None
            self.retry = time.monotonic() + 15
            await task
            await self.launch()
            return
        if entries and entries == self.entries and time.monotonic() < self.retry:
            raise OSError("Идёт повторное подключение быстрого профиля.")
        await self.close()
        if not entries:
            return
        self.entries = entries.copy()
        self.retry = time.monotonic() + 15
        local = LOOPBACK.read_text().strip()
        if not re.fullmatch(r"tls://127\.0\.0\.1:17910\?key=[0-9a-f]{64}", local):
            raise ValueError("Недоступен локальный транспорт быстрого профиля.")
        self.directory = tempfile.TemporaryDirectory(prefix="altnet-invite-")
        if len(entries) > LIMIT or any(via_tor(entry) != via_tor(entries[0]) for entry in entries):
            raise ValueError("Некорректная комбинация точек входа.")
        for entry in entries:
            peer(entry)
        if via_tor(entries[0]):
            proxy = runpy.run_path(str(Path(__file__).with_name("onion_proxy.py")))
            self.onion = proxy["OnionProxy"](entries)
            self.proxy_port = await self.onion.start()
        self.config = dict(IfName="none", Listen=[], Peers=[local, *(self.destination(e, authenticated=True) for e in entries)], InterfacePeers={},
                      AdminListen="unix://" + self.directory.name + "/admin.sock",
                      MulticastInterfaces=[], NodeInfoPrivacy=True)
        if self.onion:
            # The intermediate peer keeps its identity only for this unlocked transport.
            key = Ed25519PrivateKey.generate()
            seed = key.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption())
            public = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
            self.config.update(PrivateKey=(seed+public).hex(), PublicKey=public.hex())
            if warm_entry is None:
                self.priming = asyncio.create_task(self.onion.ready())
            else:
                assert warm_entry in entries
                host = urlsplit(warm_entry).hostname.encode("ascii")
                self.onion.independent(host)
                self.priming = self.onion.prepare(host)
        else:
            await self.launch()

    async def launch(self):
        self.process = await asyncio.create_subprocess_exec(
            sys.executable, "-IB", __file__, "worker", str(os.getpid()),
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
        self.process.stdin.write(json.dumps(self.config).encode())
        self.process.stdin.close()

    async def discard_call_probe(self):
        if self.call_probe is not None:
            host, task = self.call_probe
            self.call_probe = None
            if self.claimed_by_worker(host, task):
                return
            task.cancel()
            result, = await asyncio.gather(task, return_exceptions=True)
            if isinstance(result, tuple):
                result[1].close()

    def claimed_by_worker(self, host, task):
        if not self.call_shared:
            return False
        self.call_shared = False
        if self.onion.pending.get(host) is not task:
            # The local authenticated SOCKS client took ownership (or the
            # failed request was cleared). Its live stream belongs to the worker.
            return True
        del self.onion.pending[host]
        return False

    async def recover_call(self, waiting, *, paced=False, fresh_circuits=False):
        # A dial to the same authorised onion can complete while Yggdrasil 0.4
        # is between its fixed one-minute attempts. Leave every live path in place
        # until Tor has a usable replacement and there is still no incoming traffic.
        now = time.monotonic()
        if (not waiting or not self.onion or not self.process or
                any(now-stamp < 8 for stamp in self.onion.last_receive.values())):
            await self.discard_call_probe()
            return
        if self.call_probe is None:
            if now < self.call_retry_at:
                return
            host = urlsplit(self.entries[self.call_entry % len(self.entries)]).hostname.encode("ascii")
            self.call_entry += 1
            if paced:
                dial = self.onion.dial_for_room(host)
            elif fresh_circuits:
                dial = self.onion.dial_on_new_circuits(host)
            else:
                dial = asyncio.wait_for(self.onion.dial(host), 45)
            task = asyncio.create_task(dial)
            # Let the running worker consume this same dial if its own retry
            # arrives first. A successful hand-off preserves its local peering.
            self.call_shared = host not in self.onion.pending
            if self.call_shared:
                self.onion.pending[host] = task
            self.call_probe = host, task
            return
        host, task = self.call_probe
        if not task.done():
            return
        self.call_probe = None
        if self.claimed_by_worker(host, task):
            self.call_retry_at = now + 5
            return
        try:
            reader, writer = task.result()
        except (OSError, asyncio.TimeoutError, asyncio.IncompleteReadError):
            self.call_retry_at = now + 2
            return
        if reader.at_eof() or writer.is_closing():
            writer.close()
            self.call_retry_at = now + 2
            return
        transferred = False
        try:
            if not paced and await self.connected():
                return
            await self.stop_worker(grace=.35)
            previous = self.onion.pending.pop(host, None)
            if previous is not None:
                previous.cancel()
                result, = await asyncio.gather(previous, return_exceptions=True)
                if isinstance(result, tuple):
                    result[1].close()
            self.onion.pending[host] = task
            transferred = True
            await self.launch()
        finally:
            if not transferred:
                writer.close()
            # A completed SOCKS request can still lead to a silent peering.
            # Once incoming bytes arrive the check above suppresses all probes.
            self.call_retry_at = time.monotonic() + (6 if paced else 25)

    async def connected(self):
        if not self.directory:
            return []
        writer = None
        try:
            reader, writer = await asyncio.wait_for(asyncio.open_unix_connection(self.directory.name + "/admin.sock"), 1)
            writer.write(b'{"request":"getpeers","keepalive":false}\n')
            await writer.drain()
            data = b""
            while len(data) < 32768:
                part = await asyncio.wait_for(reader.read(4096), 1)
                if not part:
                    break
                data += part
                if data.rstrip().endswith(b"}"):
                    try:
                        json.loads(data)
                        break
                    except ValueError:
                        pass
            rows = json.loads(data)["response"]["peers"]
            rows = rows.values() if isinstance(rows, dict) else rows
            return [uri for uri in self.entries if any(
                row.get("key") == uri.rsplit("=", 1)[1] and row.get("remote", "").split("?")[0] == self.destination(uri).split("?")[0]
                for row in rows)]
        except (OSError, ValueError, KeyError, asyncio.TimeoutError):
            return []
        finally:
            if writer:
                writer.close()

    async def stop_worker(self, grace=3):
        if self.process and self.process.returncode is None:
            try:
                self.process.terminate()
                await asyncio.wait_for(self.process.wait(), grace)
            except asyncio.TimeoutError:
                self.process.kill()
                await self.process.wait()
            except ProcessLookupError:
                pass
        self.process = None

    async def close(self):
        await self.discard_call_probe()
        self.call_retry_at = self.call_entry = 0
        if self.priming is not None:
            self.priming.cancel()
            await asyncio.gather(self.priming,return_exceptions=True)
            self.priming = None
        self.config = None
        await self.stop_worker()
        if self.onion:
            await self.onion.close()
            self.onion = self.proxy_port = None
        if self.directory:
            self.directory.cleanup()
            self.directory = None
        self.entries = []


class CallRoutes:
    """Резерв одного принятого звонка. Профиль владеет обоими маршрутами."""

    def __init__(self):
        self.current = Transport()
        self.reserve = None
        self.warm_after = 0
        self.verify_after = 0
        self.last_entry = None
        self.engaged = False
        self.waiting_since = None

    async def release_reserve(self):
        reserve, self.reserve = self.reserve, None
        self.engaged = False
        if reserve:
            await reserve.close()

    async def update(self, entries):
        if entries != self.current.entries:
            await self.release_reserve()
            self.warm_after = 0
            self.last_entry = None
        await self.current.update(entries)

    async def connected(self):
        return await self.current.connected()

    def last_incoming(self):
        return max((stamp for path in (self.current, self.reserve) if path and path.onion
                    for stamp in path.onion.last_receive.values()), default=0)

    async def recover_call(self, waiting, connected=False):
        now = time.monotonic()
        if not waiting:
            self.waiting_since = None
        elif self.waiting_since is None:
            self.waiting_since = now
        if not (waiting or connected) or not self.current.onion:
            await self.release_reserve()
            await self.current.discard_call_probe()
            if self.current.onion:
                self.current.onion.clear_standby()
            self.warm_after = 0
            self.last_entry = None
            return
        if not self.engaged:
            await self.current.recover_call(waiting)
        if self.reserve is None:
            if now >= self.warm_after:
                self.warm_after = now + 3
                active = await self.current.connected()
                if active:
                    self.last_entry = active[0]
                if self.last_entry in self.current.entries:
                    self.reserve = Transport()
                    try:
                        await self.reserve.update(self.current.entries, warm_entry=self.last_entry)
                    except (OSError, ValueError):
                        await self.release_reserve()
            return
        spare = self.reserve
        if not self.engaged:
            task = spare.priming
            if not task.done():
                return
            if task.cancelled() or task.exception() is not None or task.result()[0].at_eof():
                await self.release_reserve()
                self.warm_after = now + 5
                return
            # Finish the pinned Yggdrasil handshake while the accepted call is
            # healthy, so two independent paths can carry the room after a cut.
            try:
                await spare.update(self.current.entries)
            except (OSError, ValueError):
                await self.release_reserve()
                self.warm_after = now + 5
                return
            self.engaged = True
            self.verify_after = 0
            return
        if now < self.verify_after:
            return
        self.verify_after = now + .5
        primary, matched = await asyncio.gather(self.current.connected(), spare.connected())
        if matched:
            self.last_entry = matched[0]
        if primary and connected and spare.onion and spare.onion.lost_lease():
            await self.release_reserve()
            self.warm_after = now + 3
            return
        if spare.onion:
            # A pinned worker can already be receiving traffic while the media
            # session is negotiating. Leave that recovered Tor connection alone.
            name=urlsplit(self.last_entry).hostname if matched else None
            host=name.encode("ascii") if name else None
            received=spare.onion.received_on(host) if host and waiting else 0
            live=host and self.waiting_since is not None and received>=self.waiting_since and now-received<4
            spare.onion.interruption(waiting and not live)
            if live and self.last_entry in primary:
                # The old worker may still advertise the dead link into the
                # local mesh. Withdraw only that silent connection to the same
                # signed peer once the independent worker is receiving again.
                self.current.onion.retire_stale(host,min(self.waiting_since,now-8))
        if connected and matched and not primary and spare.onion.lease_writer is None:
            # Звук уже вернулся через резерв. Сохраняем его, а прежний
            # основной пир ремонтируем на месте, пока разговор продолжается.
            self.current, self.reserve = spare, self.current
            self.current.onion.clear_standby()
            spare, primary, matched = self.reserve, matched, []
        # Если закреплённый пир исчез на обоих путях, используем обе уже
        # разрешённые цепочки. У живого основного пира сохраняем его соединение.
        if connected and matched and not primary:
            # The independent worker remains scoped to the room. Re-arm the
            # original route while audio is flowing through the other worker.
            await self.current.recover_call(True,paced=True)
        elif waiting and not primary and not matched:
            await self.current.recover_call(True, fresh_circuits=True)
        else:
            await self.current.recover_call(waiting and not primary)
        if spare.process is None or isinstance(spare.process.returncode, int):
            await self.release_reserve()
            self.warm_after = 0
            return
        if connected and not waiting and matched:
            spare.onion.warm_standby(urlsplit(matched[0]).hostname.encode("ascii"))
        await spare.recover_call(waiting or not matched, paced=True)

    async def close(self):
        await self.release_reserve()
        await self.current.close()


if __name__ == "__main__" and len(sys.argv) == 3 and sys.argv[1] == "worker":
    # Завершить пир вместе с процессом профиля, в том числе после аварии клиента.
    import signal
    if ctypes.CDLL(None).prctl(1, signal.SIGTERM, 0, 0, 0) or os.getppid() != int(sys.argv[2]):
        raise SystemExit(1)
    os.execv("/usr/sbin/yggdrasil", ["yggdrasil", "-useconf", "-loglevel", "error"])
