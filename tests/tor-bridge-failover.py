#!/usr/bin/env python3
"""РЎРµС‚РµРІРѕР№ С‚РµСЃС‚ РѕС‚РґРµР»СЊРЅРѕРіРѕ Tor, Р·Р°РїСѓСЃРєР°РµС‚СЃСЏ РѕР±С‹С‡РЅС‹Рј РїРѕР»СЊР·РѕРІР°С‚РµР»РµРј СЃ РїСЂРѕРІРµСЂРµРЅРЅС‹Рј РїСѓР±Р»РёС‡РЅС‹Рј РєР°С‚Р°Р»РѕРіРѕРј."""
import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import time

spec = importlib.util.spec_from_file_location("bridge_catalog", Path(__file__).resolve().parents[1]
                                              / "scripts" / "tor-bridge-catalog.py")
catalog_format = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog_format)


class BridgeLink:
    """Р›РѕРєР°Р»СЊРЅС‹Р№ РєР°РЅР°Р» РёСЃРєР»СЋС‡РёС‚РµР»СЊРЅРѕ Рє РѕРґРЅРѕРјСѓ РјРѕСЃС‚Сѓ С‚РµСЃС‚РѕРІРѕР№ РїРѕСЃС‚Р°РІРєРё."""

    def __init__(self, line):
        self.fields = line.split()
        host, port = self.fields[1].rsplit(":", 1)
        self.target = host.strip("[]"), int(port)
        self.fingerprint = self.fields[2].upper()
        self.connections = set()
        self.hold = False

    async def start(self):
        self.server = await asyncio.start_server(self.forward, "127.0.0.1", 0)
        fields = self.fields.copy()
        fields[1] = f"127.0.0.1:{self.server.sockets[0].getsockname()[1]}"
        return "Bridge " + " ".join(fields)

    async def forward(self, reader, writer):
        task = asyncio.current_task()
        self.connections.add(task)
        remote = None
        tasks = []

        async def copy(source, dest):
            while data := await source.read(65536):
                dest.write(data)
                await dest.drain()

        try:
            if self.hold:
                await asyncio.sleep(240)
                return
            upstream, remote = await asyncio.wait_for(asyncio.open_connection(*self.target), 8)
            tasks = [asyncio.create_task(copy(reader, remote)), asyncio.create_task(copy(upstream, writer))]
            await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        except (OSError, asyncio.TimeoutError):
            pass
        finally:
            for task in tasks:
                task.cancel()
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
            if remote:
                remote.close()
            writer.close()
            self.connections.discard(asyncio.current_task())

    async def disconnect(self):
        self.server.close()
        await self.server.wait_closed()
        active = list(self.connections)
        for task in active:
            task.cancel()
        await asyncio.gather(*active, return_exceptions=True)


async def test(catalog, parallel=False):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
    from bridge_manager import Manager
    from bridge_route import check
    from bridge_tor import Instance
    from types import SimpleNamespace

    if catalog.get("source") != "tor-expert-bundle" or not 2 <= len(catalog["bridges"]) <= 32:
        raise ValueError("Expected a verified public catalog with independent bridge endpoints")
    links = [BridgeLink(catalog_format.canonical_bridge(line)) for line in catalog["bridges"]]
    if parallel:
        for link in links[:3]:
            link.hold = True
    gates = await asyncio.gather(*(link.start() for link in links))
    local = {link.fingerprint: gate.removeprefix("Bridge ") for link, gate in zip(links, gates)}

    def instance(root, tor, transport, lines):
        return Instance(root, tor, transport, [local[line.split()[2]] for line in lines])

    with tempfile.TemporaryDirectory() as tmp:
        manager = Manager(Path(tmp), SimpleNamespace(current=catalog, status="cache"),
                          "/usr/bin/tor", "/usr/bin/obfs4proxy", factory=instance,
                          budget=(lambda: ("mains", 2)) if parallel else None)
        async def until(predicate, timeout):
            async def poll():
                while True:
                    await asyncio.to_thread(manager.step)
                    if predicate():
                        return
                    await asyncio.sleep(2)
            await asyncio.wait_for(poll(), timeout)

        try:
            if parallel:
                await until(lambda: len(manager.trials) == 2, 60)
                slow = manager.trials[0].instance
                await until(lambda: manager.active_port, 240)
                if slow.process.poll() is None or manager.trials or manager.active is slow:
                    raise AssertionError("Slow search was not retired after reserve recovery")
                result = await asyncio.to_thread(check, manager.active_port)
                if result not in ("verified", "https"):
                    raise RuntimeError("Parallel reserve did not transfer HTTPS traffic")
                print("PASS parallel reserve confirmed HTTPS, slow process exited, zero remaining probes")
                return
            await until(lambda: manager.active_port, 300)
            lost = set(manager.health.hops)
            if not set(local) - lost:
                raise RuntimeError("No independent reserve in this run")
            for link in links:
                if link.fingerprint in lost:
                    await link.disconnect()
            start = time.monotonic()
            print(f"Disconnected {len(lost)} active bridge(s)", flush=True)
            await until(lambda: manager.active_port and bool(manager.health.hops - lost), 480)
            print(f"PASS confirmed a circuit through a different bridge after {time.monotonic()-start:.1f}s")
            result = await asyncio.to_thread(check, manager.active_port)
            if result not in ("verified", "https"):
                raise RuntimeError("The replacement circuit did not complete an external HTTPS request")
            print(f"PASS HTTPS through the replacement bridge ({result})")
        finally:
            manager.reset()
            await asyncio.gather(*(link.disconnect() for link in links))


if __name__ == "__main__":
    asyncio.run(test(json.loads(Path(sys.argv[1]).read_text()), "--parallel" in sys.argv[2:]))
