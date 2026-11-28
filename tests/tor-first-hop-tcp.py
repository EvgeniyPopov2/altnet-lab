"""Exercise a silent first-hop failure with stock Linux TCP in an isolated network namespace."""
import asyncio
import json
import os
import socket
import struct
import subprocess
import time


def setup():
    if os.readlink("/proc/self/ns/net") == os.readlink("/proc/1/ns/net"):
        raise RuntimeError("Use an isolated network namespace")
    if {p["ifname"] for p in json.loads(subprocess.check_output(["ip","-j","link"]))} != {"lo"}:
        raise RuntimeError("Expected only a loopback interface")
    subprocess.run(["ip", "link", "set", "lo", "up"], check=True)
    subprocess.run(["tc", "qdisc", "add", "dev", "lo", "root", "netem", "delay", "35ms"], check=True)


class Flow:
    def __init__(self, reader, writer):
        self.reader, self.writer = reader, writer
        self.restored = None
        self.heard = asyncio.Event()
        self.elapsed = None

    async def transmit(self):
        while True:
            self.writer.write(struct.pack("!d", time.monotonic()))
            await self.writer.drain()
            await asyncio.sleep(.15)

    async def receive(self):
        while True:
            stamp, = struct.unpack("!d", await self.reader.readexactly(8))
            if self.restored is not None and stamp >= self.restored and not self.heard.is_set():
                self.elapsed = round(time.monotonic()-self.restored, 2)
                self.heard.set()


async def fresh_connection(port):
    # A separate candidate starts on loss and has no access to the restore
    # marker. Bound the lifetime and frequency of unfinished handshakes.
    await asyncio.sleep(8)
    async def exchange():
        reader, writer = await asyncio.open_connection("127.0.0.1", port)
        try:
            writer.write(b"ping")
            await writer.drain()
            if await reader.readexactly(4) != b"pong":
                raise ValueError("Bad echo")
            return time.monotonic()
        finally:
            writer.close()
    while True:
        try:
            return await asyncio.wait_for(exchange(), 2.5)
        except (OSError, asyncio.TimeoutError):
            await asyncio.sleep(.5)


async def trial(duration, cap):
    peers = {}
    tasks = []
    accepted = asyncio.Queue()
    server = await asyncio.start_server(lambda r,w:accepted.put_nowait(Flow(r,w)), "127.0.0.1", 0)
    async def echo(reader, writer):
        try:
            if await asyncio.wait_for(reader.readexactly(4),4) == b"ping":
                writer.write(b"pong")
                await writer.drain()
        except (OSError, asyncio.TimeoutError, asyncio.IncompleteReadError):
            pass
        finally:
            writer.close()
    new_channel = await asyncio.start_server(echo, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    try:
        policies = {"stock": (None,None), "clientThin": ((16,1),None)}
        if cap:
            policies.update(clientRtoCap=((44,2000),None), bothRtoCap=((44,2000),(44,2000)))
        for label, options in policies.items():
            left = Flow(*(await asyncio.open_connection("127.0.0.1",port)))
            pair = peers[label] = (left, await accepted.get())
            for flow, option in zip(pair, options):
                sock = flow.writer.get_extra_info("socket")
                sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_USER_TIMEOUT, 180000)
                if option:
                    sock.setsockopt(socket.IPPROTO_TCP, *option)
                tasks.extend((asyncio.create_task(flow.transmit()), asyncio.create_task(flow.receive())))
        await asyncio.sleep(2)
        rules = "add table inet test\nadd chain inet test ingress { type filter hook input priority -250; }\nadd rule inet test ingress iifname lo counter drop\n"
        subprocess.run(["nft","-f","-"],input=rules,text=True,check=True)
        fresh = asyncio.create_task(fresh_connection(new_channel.sockets[0].getsockname()[1]))
        tasks.append(fresh)
        await asyncio.sleep(duration)
        stats = json.loads(subprocess.check_output(["nft","-j","list","table","inet","test"]))
        dropped = next(e["counter"]["packets"] for row in stats["nftables"] if "rule" in row
                       for e in row["rule"]["expr"] if "counter" in e)
        assert dropped > 0
        info = {k:[f.writer.get_extra_info("socket").getsockopt(socket.IPPROTO_TCP, socket.TCP_INFO, 104)
                   for f in pair] for k,pair in peers.items()}
        backoff = {k:[sample[4] for sample in pair] for k,pair in info.items()}
        subprocess.run(["nft","delete","table","inet","test"],check=True)
        restored = time.monotonic()
        for pair in peers.values():
            for flow in pair:
                flow.restored = restored
        events = [asyncio.create_task(flow.heard.wait()) for pair in peers.values() for flow in pair]
        tasks.extend(events)
        await asyncio.wait([*events, fresh],timeout=80)
        new_seconds = round(fresh.result()-restored,2) if fresh.done() else None
        print(json.dumps({"cutSeconds":duration, "droppedPackets":dropped,"backoff":backoff,
            "newTcpRoundTrip":new_seconds,"freshPayloadSeconds":{
            k:{"toClient":p[0].elapsed,"fromClient":p[1].elapsed} for k,p in peers.items()}}),flush=True)
        if not all(e.done() for e in events) or new_seconds is None or new_seconds < 0 or not any(backoff["stock"]):
            raise RuntimeError("Missing post-restoration data or TCP backoff")
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)
        for pair in peers.values():
            for flow in pair:
                flow.writer.close()
        server.close()
        new_channel.close()
        await asyncio.gather(server.wait_closed(), new_channel.wait_closed())


async def main():
    setup()
    with socket.socket() as sock:
        try:
            sock.setsockopt(socket.IPPROTO_TCP, 44, 2000)
            cap = sock.getsockopt(socket.IPPROTO_TCP, 44) == 2000
        except OSError:
            cap = False
    print(json.dumps({"kernel":os.uname().release,"socketRtoCap":cap}))
    for duration in (42,54,66):
        await trial(duration, cap)


if __name__ == "__main__":
    asyncio.run(main())
