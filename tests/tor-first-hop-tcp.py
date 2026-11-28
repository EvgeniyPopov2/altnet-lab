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


async def trial(duration, cap):
    peers = {}
    tasks = []
    accepted = asyncio.Queue()
    server = await asyncio.start_server(lambda r,w:accepted.put_nowait(Flow(r,w)), "127.0.0.1", 0)
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
        rules = "add table inet test\nadd chain inet test out { type filter hook output priority -250; }\nadd rule inet test out oifname lo counter drop\n"
        subprocess.run(["nft","-f","-"],input=rules,text=True,check=True)
        await asyncio.sleep(duration)
        subprocess.run(["nft","delete","table","inet","test"],check=True)
        restored = time.monotonic()
        for pair in peers.values():
            for flow in pair:
                flow.restored = restored
        events = [asyncio.create_task(flow.heard.wait()) for pair in peers.values() for flow in pair]
        tasks.extend(events)
        await asyncio.wait(events,timeout=80)
        print(json.dumps({"cutSeconds":duration, "freshPayloadSeconds":{
            k:{"toClient":p[0].elapsed,"fromClient":p[1].elapsed} for k,p in peers.items()}}),flush=True)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)
        for pair in peers.values():
            for flow in pair:
                flow.writer.close()
        server.close()
        await server.wait_closed()


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
