"""Проверки границы между системным и резервным Tor."""
import asyncio
import os
from pathlib import Path
import runpy
import socket
import tempfile
import time
import unittest
from unittest.mock import AsyncMock, Mock, patch


api=runpy.run_path(str(Path(__file__).resolve().parents[1]/"browser/tor-browser/linux/air_tor.py"))
A,B="A"*40,"B"*40
HOST="a"*56+".onion"


class Policy(unittest.TestCase):
    def select(self, config="", target=HOST, alternate=True, one_hop=False):
        def answer(stream, request):
            if request==b"GETINFO config-text":
                return ("config-text=\n"+config+"\nOK").encode()
            if request==b"GETINFO stream-status":
                return ("1 SUCCEEDED 7 "+HOST+":17907").encode()
            if request==b"GETINFO circuit-status":
                rows=[f"7 BUILT ${A}~a,x PURPOSE=HS_CLIENT_REND"]
                if alternate:
                    rows.append(f"8 BUILT ${B}~b PURPOSE=GENERAL BUILD_FLAGS=ONEHOP_TUNNEL" if one_hop
                                else f"8 BUILT ${B}~b,x PURPOSE=GENERAL")
                return "\n".join(rows).encode()
            return b"r test id digest 2020-01-01 00:00:00 192.1.2.3 443 0\ns Guard Running Valid"
        with patch.dict(api["policy"].__globals__,command=answer):
            return api["policy"](None,target)

    def test_only_existing_guard_endpoints(self):
        rules=self.select()
        self.assertIn("EntryNodes $"+B,rules)
        self.assertIn("ReachableAddresses accept 192.1.2.3:443, reject *:*",rules)
        self.assertIn("EntryNodes $"+A,self.select(alternate=False))
        self.assertIn("EntryNodes $"+A,self.select(one_hop=True))

    def test_no_direct_fallback_from_private_policy(self):
        for config in ("Socks5Proxy 127.0.0.1:1080","ExcludeNodes {xx}","DisableNetwork 1",
                       "UseBridges 1","ClientTransportPlugin unknown exec /bin/false"):
            with self.subTest(config=config), self.assertRaises(ValueError):
                self.select(config)
        with self.assertRaises(ValueError):
            self.select(target="b"*56+".onion")

    def test_bridge_policy_preserved(self):
        line="Bridge obfs4 192.0.2.4:443 "+A+" cert=YWJjZA== iat-mode=0"
        rows=self.select("UseBridges 1\nClientTransportPlugin obfs4 exec /usr/bin/obfs4proxy\n"+line)
        self.assertEqual(rows,["UseBridges 1","ClientTransportPlugin obfs4 exec /usr/bin/obfs4proxy",line])


class GuardTunnel(unittest.IsolatedAsyncioTestCase):
    async def test_exact_destination_and_authorization_before_outbound_tcp(self):
        async def echo(reader, writer):
            try:
                writer.write(await reader.readexactly(4))
                await writer.drain()
            finally:
                writer.close()
        async with await asyncio.start_server(echo,"127.0.0.1",0) as target:
            endpoint=f"127.0.0.1:{target.sockets[0].getsockname()[1]}"
            guard=api["GuardLink"](endpoint)
            await guard.start()
            self.addAsyncCleanup(guard.close)
            guard.connect=AsyncMock(wraps=guard.connect)
            port=guard.server.sockets[0].getsockname()[1]
            for host,auth,ok in [(guard.endpoint,b"wrong",False),(b"192.0.2.1:443",guard.header,False),
                                 (guard.endpoint,guard.header,True)]:
                reader,writer=await asyncio.open_connection("127.0.0.1",port)
                try:
                    writer.write(b"CONNECT "+host+b" HTTP/1.0\r\nProxy-Authorization: "+auth+b"\r\n\r\n")
                    if ok:
                        self.assertIn(b"200",await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"),2))
                        writer.write(b"test")
                        self.assertEqual(await asyncio.wait_for(reader.readexactly(4),2),b"test")
                        guard.connect.assert_awaited_once()
                    else:
                        self.assertEqual(await asyncio.wait_for(reader.read(),2),b"")
                        guard.connect.assert_not_awaited()
                finally:
                    writer.close()
                    await writer.wait_closed()

    async def test_real_local_guard_can_start_after_tor_requests_a_tunnel(self):
        listener=socket.socket(socket.AF_INET,socket.SOCK_STREAM)
        self.addCleanup(listener.close)
        listener.bind(("127.0.0.1",0))
        host,port=listener.getsockname()
        guard=api["GuardLink"](f"{host}:{port}")
        await guard.start()
        self.addAsyncCleanup(guard.close)
        guard.recovering=True
        reader,writer=await asyncio.open_connection("127.0.0.1",guard.server.sockets[0].getsockname()[1])
        try:
            writer.write(b"CONNECT "+guard.endpoint+b" HTTP/1.0\r\nProxy-Authorization: "+guard.header+b"\r\n\r\n")
            with self.assertRaises(asyncio.TimeoutError):
                await asyncio.wait_for(reader.read(1),.08)
            self.assertEqual(guard.connecting,1)
            async def echo(r,w):
                try:
                    w.write(await r.readexactly(4))
                    await w.drain()
                finally:
                    w.close()
            listener.listen()
            async with await asyncio.start_server(echo,sock=listener):
                self.assertIn(b"200",await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"),3))
                writer.write(b"live")
                self.assertEqual(await asyncio.wait_for(reader.readexactly(4),2),b"live")
        finally:
            writer.close()
            await writer.wait_closed()

    async def test_retries_only_pending_tor_request_after_outage(self):
        guard=api["GuardLink"]("192.0.2.1:443")
        owner=asyncio.StreamReader()
        pair=(Mock(),Mock())
        dial=AsyncMock(side_effect=[ConnectionRefusedError(),pair])
        guard.recovering=True
        with patch.object(asyncio,"open_connection",dial),patch.object(asyncio,"sleep",AsyncMock()):
            self.assertEqual(await guard.connect(owner),pair)
            self.assertEqual(dial.await_count,2)
            self.assertTrue(all(c.args==guard.target for c in dial.await_args_list))
            owner.feed_eof()
            with self.assertRaises(ConnectionError):
                await guard.connect(owner)
            self.assertEqual(dial.await_count,2)
            self.assertEqual(guard.connecting,0)

    def test_retirement_requires_silence_and_kernel_backoff(self):
        guard=api["GuardLink"]("192.0.2.1:443")
        for ago,backoff,expected in [(20,4,True),(0,5,False),(20,0,False)]:
            with self.subTest(ago=ago,backoff=backoff):
                writer=Mock()
                writer.get_extra_info.return_value.getsockopt.return_value=bytes([0,0,0,0,backoff])+bytes(27)
                guard.links={writer:time.monotonic()-ago}
                guard.retire_stalled()
                self.assertEqual(writer.transport.abort.called,expected)


class RelayLease(unittest.IsolatedAsyncioTestCase):
    def test_live_sibling_and_other_destinations_survive_withdrawal(self):
        cls=runpy.run_path(str(Path(api["HERE"])/"onion_proxy.py"))["OnionProxy"]
        proxy=cls([])
        stale,active,other=Mock(),Mock(),Mock()
        proxy.active_hosts={stale:b"first",active:b"first",other:b"elsewhere"}
        proxy.last_receive={stale:5,active:20,other:4}
        self.assertEqual(proxy.received_on(b"first"),20)
        proxy.retire_stale(b"first",10)
        stale.cancel.assert_called_once()
        active.cancel.assert_not_called()
        other.cancel.assert_not_called()

    async def test_departed_caller_releases_pending_tor_dial(self):
        async def pending(host, tag, connection):
            connection.close()
            self.assertEqual((host,tag),(HOST.encode(),b"a"*48))
            started.set()
            try:
                await asyncio.Future()
            finally:
                cancelled.set()

        started,cancelled=asyncio.Event(),asyncio.Event()
        clients=set()
        with tempfile.TemporaryDirectory() as tmp, socket.socket(socket.AF_UNIX) as marker:
            root=Path(tmp)
            marker.bind(str(root/"socks"))
            handler=api["relay"]
            with patch.dict(handler.__globals__,tor_stream=pending):
                async with await asyncio.start_unix_server(
                        lambda r,w:handler(r,w,HOST.encode(),root,os.geteuid(),clients),root/"lease"):
                    _,writer=await asyncio.open_unix_connection(root/"lease")
                    try:
                        writer.write(bytes([48])+b"a"*48)
                        await writer.drain()
                        await asyncio.wait_for(started.wait(),2)
                    finally:
                        writer.close()
                        await writer.wait_closed()
                    await asyncio.wait_for(cancelled.wait(),2)
                    await asyncio.gather(*clients)
                    self.assertFalse(clients)


if __name__=="__main__":
    unittest.main()
