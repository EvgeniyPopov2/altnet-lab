"""Сохраняет незавершённое соединение Tor между короткими попытками Yggdrasil 0.4."""
import asyncio
import re
import secrets
import time
from urllib.parse import urlsplit

STANDBY = b"ALTNET-ONION-STANDBY\x01"


class EntryGateway:
    """One signed onion port. Ordinary TLS and deferred TLS use the same local peer."""

    def __init__(self, peer_port=17910):
        self.peer_port = peer_port
        self.handshakes = 0
        self.parked = 0

    async def handle(self, reader, writer):
        if self.handshakes >= 24:
            writer.close()
            return
        self.handshakes += 1
        handshaking = True
        upstream = None
        copies = []
        try:
            first = await asyncio.wait_for(reader.readexactly(1), 30)
            if first == STANDBY[:1]:
                rest = await asyncio.wait_for(reader.readexactly(len(STANDBY)-1), 4)
                if first + rest != STANDBY or self.parked >= 4:
                    return
                self.parked += 1
                try:
                    writer.write(b"P")
                    await writer.drain()
                    if await asyncio.wait_for(reader.readexactly(1), 180) != b"G":
                        return
                finally:
                    self.parked -= 1
            elif first != b"\x16":  # TLS handshake record from a normal Yggdrasil client
                return
            source, upstream = await asyncio.wait_for(asyncio.open_connection("127.0.0.1", self.peer_port), 3)
            self.handshakes -= 1
            handshaking = False
            if first == STANDBY[:1]:
                writer.write(b"R")
                await writer.drain()
            else:
                upstream.write(first)
                await upstream.drain()
            async def forward(input_stream, output):
                while data := await input_stream.read(65536):
                    output.write(data)
                    await output.drain()
            copies = [asyncio.create_task(forward(reader, upstream)), asyncio.create_task(forward(source, writer))]
            await asyncio.wait(copies, return_when=asyncio.FIRST_COMPLETED)
        except (OSError, asyncio.TimeoutError, asyncio.IncompleteReadError):
            pass
        finally:
            if handshaking:
                self.handshakes -= 1
            writer.close()
            if upstream is not None:
                upstream.close()
            for task in copies:
                task.cancel()
            await asyncio.gather(*copies, return_exceptions=True)


async def tor_stream(host, user, connection):
    reader, writer = await connection
    try:
        writer.write(b"\x05\x01\x02")
        if await reader.readexactly(2) != b"\x05\x02":
            raise ConnectionError("Tor не поддерживает изоляцию соединения.")
        writer.write(b"\x01" + bytes([len(user)]) + user + b"\x01x")
        if await reader.readexactly(2) != b"\x01\x00":
            raise ConnectionError("Tor отклонил изоляцию соединения.")
        writer.write(b"\x05\x01\x00\x03" + bytes([len(host)]) + host + (17907).to_bytes(2, "big"))
        header = await reader.readexactly(4)
        if header[:3] != b"\x05\x00\x00":
            raise ConnectionError("Tor не соединился с точкой входа.")
        if header[3] == 3:
            size = (await reader.readexactly(1))[0]
        elif header[3] in (1, 4):
            size = 4 if header[3] == 1 else 16
        else:
            raise ConnectionError("Tor вернул неизвестный тип адреса.")
        await reader.readexactly(size + 2)
        return reader, writer
    except BaseException:
        writer.close()
        raise


class OnionProxy:
    HEDGE_DELAY = 1.25
    ISOLATION_INTERVAL = 16
    RECOVERY_WINDOW = 90

    def __init__(self, entries):
        self.allowed = {urlsplit(entry).hostname.encode("ascii") for entry in entries}
        self.user = secrets.token_hex(24).encode("ascii")
        self.pending = {}
        self.standby = None
        self.standby_after = 0
        self.supports_standby = False
        self.lease = self.lease_writer = None
        self.lease_monitor=None
        self.guard_ready=asyncio.Event()
        self.down = False
        self.clients = set()
        self.last_receive = {}
        self.active_hosts = {}
        self.server = None

    async def start(self):
        self.server = await asyncio.start_server(self.handle, "127.0.0.1", 0)
        return self.server.sockets[0].getsockname()[1]

    def prepare(self, host, *, cold_start=False):
        task = self.pending.get(host)
        if task is None:
            dial = self.dial_on_new_circuits(host, first_delay=12) if cold_start else self.dial(host)
            task = asyncio.create_task(asyncio.wait_for(dial,100))
            self.pending[host] = task
        return task

    async def ready(self):
        waiting = {self.prepare(host,cold_start=True) for host in self.allowed}
        while waiting:
            done, waiting = await asyncio.wait(waiting,return_when=asyncio.FIRST_COMPLETED)
            if any(not task.cancelled() and task.exception() is None for task in done):
                return
        raise ConnectionError("Не удалось открыть ни одну точку входа через Tor.")

    async def dial(self, host, isolation=None):
        user = self.user if isolation is None else isolation
        if self.lease is not None:
            if host != self.lease_host:
                raise ConnectionError("Адрес отсутствует в резерве комнаты.")
            lease = await asyncio.shield(self.lease)
            if lease:
                reader, writer = await asyncio.open_unix_connection("\0"+lease[0])
                try:
                    writer.write(bytes([len(user)])+user)
                    await writer.drain()
                    if await reader.readexactly(1) != b"+":
                        raise ConnectionError("Резервная цепочка недоступна.")
                    return reader, writer
                except BaseException:
                    writer.close()
                    raise
        return await tor_stream(host, user, asyncio.open_connection("127.0.0.1", 9050))

    def independent(self, host):
        if host not in self.allowed:
            raise ValueError("Адрес отсутствует в приглашении.")
        self.lease_host = host
        self.lease = asyncio.create_task(self.open_lease(host))

    async def open_lease(self, host):
        writer = None
        try:
            reader, writer = await asyncio.open_unix_connection("/run/altnet-air-tor.sock")
            writer.write(host+b"\n")
            await writer.drain()
            name = (await asyncio.wait_for(reader.readline(), 18)).strip()
            if not re.fullmatch(rb"altnet-air-[0-9a-f]{48}",name):
                return None
            self.lease_writer = writer
            async def monitor():
                try:
                    while await reader.read(1)==b"R":
                        self.guard_ready.set()
                except OSError:
                    pass
            self.lease_monitor=asyncio.create_task(monitor())
            return name.decode("ascii"), reader
        except (OSError, asyncio.TimeoutError):
            return None
        finally:
            if writer and self.lease_writer is not writer:
                writer.close()

    def interruption(self, down):
        if self.lease_writer is not None and self.down != down and not self.lease_writer.is_closing():
            self.guard_ready.clear()
            self.lease_writer.write(b"D" if down else b"U")
            self.down = down

    def lost_lease(self):
        if self.lease_writer is None or self.lease is None or not self.lease.done() or self.lease.cancelled():
            return False
        lease=self.lease.result()
        return lease is not None and (lease[1].at_eof() or self.lease_writer.is_closing())

    def retire_stale(self, host, cutoff):
        for client,stamp in tuple(self.last_receive.items()):
            if self.active_hosts.get(client)==host and stamp<cutoff:
                client.cancel()

    def received_on(self, host):
        return max((stamp for client,stamp in self.last_receive.items()
                    if self.active_hosts.get(client)==host),default=0)

    async def park(self, host, isolation=None):
        reader, writer = await self.dial(host,isolation or b"air-standby-" + secrets.token_hex(24).encode("ascii"))
        try:
            writer.write(STANDBY)
            await writer.drain()
            if await reader.readexactly(1) != b"P":
                raise ConnectionError("Точка входа не поддерживает резерв.")
            self.supports_standby = True
            return reader, writer
        except BaseException:
            writer.close()
            raise

    def clear_standby(self):
        if self.standby is None:
            return
        _, task = self.standby
        self.standby = None
        if not task.done():
            task.cancel()
        elif not task.cancelled() and task.exception() is None:
            task.result()[1].close()

    def warm_standby(self, host):
        if host not in self.allowed:
            return
        if self.standby:
            name, task = self.standby
            if name == host and (not task.done() or (not task.cancelled() and task.exception() is None
                                                     and not task.result()[0].at_eof())):
                return
            self.clear_standby()
        now = time.monotonic()
        if now >= self.standby_after:
            self.standby_after = now + 45
            self.standby = host, asyncio.create_task(asyncio.wait_for(self.park(host), 35))

    def take_standby(self, host):
        if self.standby is None or self.standby[0] != host:
            return None
        task = self.standby[1]
        if not task.done() or task.cancelled() or task.exception() is not None:
            return None
        reader, writer = task.result()
        self.standby = None
        self.standby_after = 0
        if reader.at_eof():
            writer.close()
            return None
        activation = asyncio.create_task(self.activate(reader,writer))
        def close_on_failure(done):
            if done.cancelled() or done.exception() is not None:
                writer.close()
        activation.add_done_callback(close_on_failure)
        return activation

    @staticmethod
    async def activate(reader,writer):
        try:
            writer.write(b"G")
            await writer.drain()
            if await reader.readexactly(1) != b"R":
                raise ConnectionError("Точка входа не подтвердила соединение.")
            return reader,writer
        except BaseException:
            writer.close()
            raise

    async def dial_for_room(self, host):
        standby = self.take_standby(host)
        if self.lease_writer is not None and self.supports_standby:
            return await self.dial_on_new_circuits(host,standby=standby,confirm=True)
        if standby is not None:
            # The primary is already building fresh circuits. On the reserve,
            # keep the pre-outage rendezvous until the entry replies end to end.
            return await asyncio.wait_for(standby, self.RECOVERY_WINDOW)
        return await self.dial_on_new_circuits(host)

    async def dial_on_new_circuits(self, host, *, standby=None, confirm=False, first_delay=None):
        # Keep a request in flight while a second Tor rendezvous is being built.
        # The normal stream keeps its profile isolation. A replacement gets its
        # own isolation so Tor need not attach it to the stalled rendezvous.
        loop = asyncio.get_running_loop()
        deadline = loop.time() + self.RECOVERY_WINDOW
        async def connect(isolation=None):
            if confirm:
                reader,writer=await self.dial(host,isolation)
                try:
                    # The endpoint already supports parking. Request and activate
                    # the new stream together, still requiring both acknowledgements.
                    writer.write(STANDBY+b"G")
                    await writer.drain()
                    if await reader.readexactly(2)!=b"PR":
                        raise ConnectionError("Точка входа не подтвердила резерв.")
                    return reader,writer
                except BaseException:
                    writer.close()
                    raise
            return await self.dial(host,isolation)
        pending = [standby if standby is not None else asyncio.create_task(connect())]
        next_attempt = loop.time() + (self.HEDGE_DELAY if first_delay is None else first_delay)
        winner = None
        notice=asyncio.create_task(self.guard_ready.wait()) if self.lease_writer is not None else None

        async def release(task):
            task.cancel()
            result, = await asyncio.gather(task, return_exceptions=True)
            if isinstance(result, tuple):
                result[1].close()

        try:
            while loop.time() < deadline:
                delay = max(0, min(next_attempt, deadline) - loop.time())
                if pending or notice:
                    waiting=[*pending,notice] if notice else pending
                    done, _ = await asyncio.wait(waiting, timeout=delay,
                                                 return_when=asyncio.FIRST_COMPLETED)
                    if notice in done:
                        done.remove(notice)
                        notice=None
                        self.guard_ready.clear()
                        next_attempt=loop.time()
                    for task in done:
                        if not task.cancelled() and task.exception() is None:
                            winner = task
                            return task.result()
                        pending.remove(task)
                    if not pending and self.lease_writer is not None:
                        next_attempt=min(next_attempt,loop.time()+1.5)
                elif delay:
                    await asyncio.sleep(delay)
                if loop.time() >= deadline:
                    break
                if loop.time() >= next_attempt:
                    if len(pending) == 2:
                        # Keep the already parked circuit in the race. Replace
                        # only the unconfirmed fresh request on this same Tor.
                        await release(pending.pop(1 if pending[0] is standby else 0))
                    isolation = secrets.token_hex(24).encode("ascii")
                    pending.append(asyncio.create_task(connect(isolation)))
                    next_attempt = loop.time() + self.ISOLATION_INTERVAL
            raise TimeoutError("Не удалось восстановить цепочку Tor.")
        finally:
            if notice:
                notice.cancel()
                await asyncio.gather(notice,return_exceptions=True)
            await asyncio.gather(*(release(task) for task in pending if task is not winner))

    async def request(self, reader, writer):
        version, size = await reader.readexactly(2)
        if version != 5 or b"\x02" not in await reader.readexactly(size):
            raise ValueError("Требуется авторизация.")
        writer.write(b"\x05\x02")
        version, size = await reader.readexactly(2)
        name = await reader.readexactly(size)
        size = (await reader.readexactly(1))[0]
        password = await reader.readexactly(size)
        if version != 1 or not secrets.compare_digest(name,self.user) or password != b"x":
            raise ValueError("Неверный локальный сеанс.")
        writer.write(b"\x01\x00")
        if await reader.readexactly(4) != b"\x05\x01\x00\x03":
            raise ValueError("Разрешён только onion из приглашения.")
        size = (await reader.readexactly(1))[0]
        host = await reader.readexactly(size)
        if host not in self.allowed or await reader.readexactly(2) != (17907).to_bytes(2, "big"):
            raise ValueError("Адрес отсутствует в приглашении.")
        return host

    async def handle(self, reader, writer):
        current = asyncio.current_task()
        copies = []
        remote = None
        try:
            if len(self.clients) >= 12:
                return
            self.clients.add(current)
            host = await asyncio.wait_for(self.request(reader, writer), 4)
            task = self.prepare(host)
            # В ядре 0.4 бюджет SOCKS составляет 6 с. Реальная цепочка может строиться дольше.
            # Сохраняем попытку и передаём успешный сокет следующему запросу того же профиля.
            try:
                incoming, outbound = await asyncio.wait_for(asyncio.shield(task), 3)
            except (OSError, asyncio.TimeoutError, asyncio.IncompleteReadError):
                if task.done() and not task.cancelled() and task.exception() is not None and self.pending.get(host) is task:
                    del self.pending[host]
                return
            if reader.at_eof() or self.pending.get(host) is not task:
                return
            del self.pending[host]
            remote = outbound
            self.active_hosts[current] = host
            writer.write(b"\x05\x00\x00\x01" + b"\x00"*6)
            async def copy(source, dest):
                while data := await source.read(65536):
                    if source is incoming:
                        self.last_receive[current] = time.monotonic()
                    dest.write(data)
                    await dest.drain()
            copies = [asyncio.create_task(copy(reader,remote)), asyncio.create_task(copy(incoming,writer))]
            await asyncio.wait(copies,return_when=asyncio.FIRST_COMPLETED)
        except (OSError, asyncio.TimeoutError, asyncio.IncompleteReadError, ValueError):
            pass
        finally:
            # A concurrent profile close may cancel this handler during cleanup.
            # Release both sockets before the first cancellable wait.
            if remote:
                remote.close()
            writer.close()
            for task in copies:
                task.cancel()
            try:
                await asyncio.gather(*copies, return_exceptions=True)
            finally:
                self.clients.discard(current)
                self.active_hosts.pop(current,None)
                self.last_receive.pop(current, None)

    async def close(self):
        if self.lease is not None:
            self.lease.cancel()
            await asyncio.gather(self.lease,return_exceptions=True)
        if self.lease_monitor:
            self.lease_monitor.cancel()
            await asyncio.gather(self.lease_monitor,return_exceptions=True)
        if self.lease_writer:
            self.lease_writer.close()
        standby = self.standby
        self.clear_standby()
        if standby:
            await asyncio.gather(standby[1], return_exceptions=True)
        if self.server:
            self.server.close()
            await self.server.wait_closed()
        clients = list(self.clients)
        for task in clients:
            task.cancel()
        await asyncio.gather(*clients,return_exceptions=True)
        pending = list(self.pending.values())
        for task in pending:
            task.cancel()
        for result in await asyncio.gather(*pending,return_exceptions=True):
            if isinstance(result,tuple):
                result[1].close()
        self.pending.clear()
