"""Проверки границы между системным и резервным Tor."""
import asyncio
import os
from pathlib import Path
import runpy
import socket
import tempfile
import unittest
from unittest.mock import Mock, patch


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
