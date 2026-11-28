"""Сохраняет незавершённое соединение Tor между короткими попытками Yggdrasil 0.4."""
import asyncio
import secrets
import time
from urllib.parse import urlsplit


class OnionProxy:
    def __init__(self, entries):
        self.allowed = {urlsplit(entry).hostname.encode("ascii") for entry in entries}
        self.user = secrets.token_hex(24).encode("ascii")
        self.recovery_user = secrets.token_hex(24).encode("ascii")
        self.pending = {}
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

    async def dial_for_room(self, host):
        # Длинная попытка нужна для медленной цепочки. Вторая проверяет тот же
        # разрешённый адрес через тот же изолированный сеанс после возврата сети.
        async def retry():
            loop = asyncio.get_running_loop()
            deadline = loop.time() + 45
            await asyncio.sleep(1.25)
            budget = 8
            while (remaining := deadline - loop.time()) > 0:
                started = loop.time()
                try:
                    # Один изолированный сеанс для всех повторов этого резерва.
                    # Устаревшая цепочка исходного потока может ещё числиться рабочей.
                    return await asyncio.wait_for(self.dial(host, self.recovery_user), min(budget, remaining))
                except (OSError, asyncio.TimeoutError, asyncio.IncompleteReadError):
                    # Allow rebuilt rendezvous circuits to finish, including late
                    # in the outage. Pace fast refusals throughout the same window.
                    budget = 4 if budget == 8 else 8
                    await asyncio.sleep(min(max(.25, 6 - (loop.time() - started)),
                                            max(0, deadline - loop.time())))
            raise TimeoutError()
        tasks = {asyncio.create_task(self.dial(host)), asyncio.create_task(retry())}
        winner = None
        try:
            pending = tasks.copy()
            while pending:
                done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    if not task.cancelled() and task.exception() is None:
                        winner = task
                        return task.result()
            raise ConnectionError("Точка входа голосовой комнаты пока недоступна.")
        finally:
            unused = tasks - {winner}
            for task in unused:
                task.cancel()
            for result in await asyncio.gather(*unused, return_exceptions=True):
                if isinstance(result, tuple):
                    result[1].close()

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
