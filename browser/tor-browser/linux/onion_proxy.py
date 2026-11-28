"""Сохраняет незавершённое соединение Tor между короткими попытками Yggdrasil 0.4."""
import asyncio
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
        self.clients = set()
        self.last_receive = {}
        self.server = None

    async def start(self):
        self.server = await asyncio.start_server(self.handle, "127.0.0.1", 0)
        return self.server.sockets[0].getsockname()[1]

    def prepare(self, host):
        task = self.pending.get(host)
        if task is None:
            task = asyncio.create_task(asyncio.wait_for(self.dial(host),100))
            self.pending[host] = task
        return task

    async def ready(self):
        waiting = {self.prepare(host) for host in self.allowed}
        while waiting:
            done, waiting = await asyncio.wait(waiting,return_when=asyncio.FIRST_COMPLETED)
            if any(not task.cancelled() and task.exception() is None for task in done):
                return
        raise ConnectionError("Не удалось открыть ни одну точку входа через Tor.")

    async def dial(self, host, isolation=None):
        user = self.user if isolation is None else isolation
        reader, writer = await asyncio.open_connection("127.0.0.1", 9050)
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

    async def park(self, host):
        reader, writer = await self.dial(host, b"air-standby-" + secrets.token_hex(24).encode("ascii"))
        try:
            writer.write(STANDBY)
            await writer.drain()
            if await reader.readexactly(1) != b"P":
                raise ConnectionError("Точка входа не поддерживает резерв.")
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
        async def activate():
            writer.write(b"G")
            await writer.drain()
            if await reader.readexactly(1) != b"R":
                raise ConnectionError("Точка входа не подтвердила соединение.")
            return reader, writer
        activation = asyncio.create_task(activate())
        def close_on_failure(done):
            if done.cancelled() or done.exception() is not None:
                writer.close()
        activation.add_done_callback(close_on_failure)
        return activation

    async def dial_for_room(self, host):
        # Keep a request in flight while a second Tor rendezvous is being built.
        # The normal stream keeps its profile isolation. A replacement gets its
        # own isolation so Tor need not attach it to the stalled rendezvous.
        loop = asyncio.get_running_loop()
        deadline = loop.time() + self.RECOVERY_WINDOW
        pending = [asyncio.create_task(self.dial(host))]
        standby = self.take_standby(host)
        next_attempt = loop.time() + self.HEDGE_DELAY
        winner = None

        async def release(task):
            task.cancel()
            result, = await asyncio.gather(task, return_exceptions=True)
            if isinstance(result, tuple):
                result[1].close()

        try:
            while loop.time() < deadline:
                delay = max(0, min(next_attempt, deadline) - loop.time())
                candidates = pending + ([standby] if standby else [])
                if candidates:
                    done, _ = await asyncio.wait(candidates, timeout=delay,
                                                 return_when=asyncio.FIRST_COMPLETED)
                    for task in sorted(done, key=lambda t: t is not standby):
                        if not task.cancelled() and task.exception() is None:
                            winner = task
                            return task.result()
                        if task is standby:
                            standby = None
                        else:
                            pending.remove(task)
                elif delay:
                    await asyncio.sleep(delay)
                if loop.time() >= deadline:
                    break
                if loop.time() >= next_attempt:
                    if len(pending) == 2:
                        await release(pending[0])
                        pending.pop(0)
                    isolation = secrets.token_hex(24).encode("ascii")
                    pending.append(asyncio.create_task(self.dial(host, isolation)))
                    next_attempt = loop.time() + self.ISOLATION_INTERVAL
            raise TimeoutError("Не удалось восстановить цепочку Tor.")
        finally:
            if standby:
                pending.append(standby)
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
                self.last_receive.pop(current, None)

    async def close(self):
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
