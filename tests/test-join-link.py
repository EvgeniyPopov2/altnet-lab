"""The network key is released only to the bound and approved device."""
import base64
import asyncio
import datetime
import hashlib
import ipaddress
import os
from pathlib import Path
import runpy
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch

from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

linux=Path(__file__).resolve().parents[1]/"browser/tor-browser/linux"
api=runpy.run_path(str(linux/"join_link.py"))
Mailbox=runpy.run_path(str(linux/"contact_sync.py"))["Mailbox"]
Links=api["Links"]


def identity():
    key=Ed25519PrivateKey.generate()
    name=x509.Name([x509.NameAttribute(x509.oid.NameOID.COMMON_NAME,"QA")])
    now=datetime.datetime.now(datetime.timezone.utc)
    cert=(x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
          .serial_number(x509.random_serial_number()).not_valid_before(now-datetime.timedelta(minutes=1))
          .not_valid_after(now+datetime.timedelta(days=1)).sign(key,None))
    return key,cert.public_bytes(serialization.Encoding.DER)


class LinkTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        path=Path(temp.name)
        key,_=identity()
        (path/"key").write_bytes(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
        mail=Mailbox(path/"mail",os.urandom(32))
        self.addCleanup(mail.db.close)
        self.host=SimpleNamespace(pair=path,known={})
        sync=SimpleNamespace(lobby=self.host,mail=mail,own="owner card",local_pin="aa"*32,me=dict(id="ba"*32,address="201::1"))
        self.links=Links(sync,None,None)
        self.links.offer=lambda:{"config":"authenticated network"}
        self.secret=os.urandom(32)
        self.links.save(api["HOST"],dict(until=int(time.time())+800,token=api["digest"](self.secret)))
        self.card="alt://contact/v1/test"
        self.owner="ab"*32
        self.guest=identity()

    async def exchange(self,device,secret=None,wrong_key=False):
        replies=[]
        async def capture(_writer,value):
            replies.append(value)
        async def request(_reader):
            key,der=device
            challenge=bytes.fromhex(replies[-1]["challenge"])
            value=self.secret if secret is None else secret
            signer=Ed25519PrivateKey.generate() if wrong_key else key
            return dict(token=value.hex(),card=self.card,cert=base64.b64encode(der).decode(),
                        signature=signer.sign(api["transcript"](challenge,value,self.card)).hex())
        self.links.write,self.links.read=capture,request
        writer=SimpleNamespace(get_extra_info=lambda _:("202::2",12345))
        await self.links.serve(None,writer)
        return replies[-1]

    async def test_only_approved_card_and_live_certificate_receive_membership(self):
        self.assertEqual(await self.exchange(self.guest),{"wait":True})
        key,der=self.guest
        self.links.approve(api["digest"](der),self.owner)
        self.assertEqual(await self.exchange(self.guest),{"wait":True})
        self.host.known[self.owner]=({"address":"202::2"},der)
        self.assertIn("config",await self.exchange(self.guest))
        self.assertIn("config",await self.exchange(self.guest))  # Same claimant can retry after lost response.
        with self.assertRaises(ValueError):await self.exchange(identity())
        self.links.cancel("host")
        with self.assertRaises(ValueError):await self.exchange(self.guest)

    async def test_invalid_proof_or_secret_does_not_bind_offer(self):
        with self.assertRaises(InvalidSignature):await self.exchange(self.guest,wrong_key=True)
        with self.assertRaises(ValueError):await self.exchange(self.guest,secret=os.urandom(32))
        self.assertNotIn("candidate",self.links.mail.get(api["HOST"],"current"))
        self.assertEqual(await self.exchange(self.guest),{"wait":True})

    def test_scope_expiry_self_and_lengths(self):
        def link(addr="203::3",owner="cd"*32,remaining=60):
            raw=ipaddress.IPv6Address(addr).packed+bytes.fromhex("ee"*32+owner)+self.secret+(int(time.time())+remaining).to_bytes(8,"big")
            return api["PREFIX"]+api["pack"](raw)
        for invalid in (link("::1"),link(remaining=-1),link(remaining=6000),link()[:-1],link()+"/",link(owner="ba"*32)):
            with self.assertRaises(ValueError):self.links.redeem(invalid)
        self.links.redeem(link())
        self.assertEqual(len(self.links.mail.get(api["GUEST"],"current")["code"]),6)

    def test_transport_distribution_accepts_only_pinned_endpoints(self):
        import json
        parse=runpy.run_path(str(linux/"transport_peers.py"))["peers"]
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/"entries"
            good="tls://192.0.2.2:17907?key="+"af"*32
            for item in (good.split("?")[0],good.replace("tls:","tcp:"),good.replace("192.0.2.2","127.0.0.1"),good+"/"):
                path.write_text(json.dumps([item]))
                with self.assertRaises(ValueError):parse(path)
            path.write_text(json.dumps([good,good]))
            self.assertEqual(parse(path),[good])

    async def test_signed_entries_round_trip_and_tampering(self):
        cert_key, der = identity()
        self.links.key = cert_key
        self.links.sync.local_pin = api["digest"](der)
        self.links.sync.me["certificate"] = base64.b64encode(der).decode()
        peers = ["tls://1.1.1.1:17907?key="+"ab"*32, "tls://[2606:4700:4700::1111]:17907?key="+"cd"*32]
        self.links.listen = AsyncMock()
        with patch.dict(api["bootstrap"], shareable=lambda learned, generation: peers):
            invitation = await self.links.create()
        link = invitation["link"]
        self.assertTrue(link.startswith(api["V2"]))
        self.assertEqual(api["decode"](link)[-1], peers)
        raw = base64.urlsafe_b64decode(link[len(api["V2"]):]+"===")
        for pos in (0, 16, 48, 80, 112, 120, 125, -65, -1):
            corrupted = bytearray(raw)
            corrupted[pos] ^= 1
            with self.subTest(pos=pos), self.assertRaises(ValueError):
                api["decode"](api["V2"]+api["pack"](corrupted))
        with self.assertRaises(ValueError):
            self.links.redeem(link)

    def test_invitation_peers_are_bounded_public_pinned_and_unique(self):
        transport = api["bootstrap"]
        key = "7f"*32
        for ip in ("127.0.0.1", "100.64.0.1", "192.168.1.1", "224.0.0.1",
                   "[::ffff:127.0.0.1]", "[2002:7f00:1::]", "[2001:db8::1]", "[201::1]"):
            with self.subTest(ip=ip), self.assertRaises(ValueError):
                transport["peer"](f"tls://{ip}:17907?key={key}")
        candidate = f"tls://1.1.1.1:17907?key={key}"
        body = transport["pack_peers"]([candidate])
        for bad in (body * 2, body[:-1], body+b"x", b"", b"\x05"+body[1:]):
            with self.assertRaises(ValueError):
                transport["unpack_peers"](bad)
        for uri in (candidate.replace("17907","22"),candidate.split("?")[0],candidate.replace("tls:", "tcp:")):
            with self.assertRaises(ValueError):
                transport["peer"](uri)

    async def test_signed_onion_entry_cannot_be_opened_as_direct_invitation(self):
        transport = api["bootstrap"]
        host = "pg6mmjiyjmcrsslvykfwnntlaru7p5svn6y2ymmju6nubxndf4pscryd.onion"
        entry = f"onion://{host}:17907?key=" + "91"*32
        for wrong in (entry.replace("pg6m", "ag6m"), entry.replace(":17907", ":80"),
                      entry.replace("onion://", "tls://"), entry.replace(host, "127.0.0.1")):
            with self.assertRaises(ValueError):
                transport["peer"](wrong)
        material = transport["pack_peers"]([entry])
        self.assertEqual(transport["unpack_peers"](material, onion=True), [entry])
        with self.assertRaises(ValueError):
            transport["unpack_peers"](material)
        route = transport["Transport"]()
        route.onion = runpy.run_path(str(linux/"onion_proxy.py"))["OnionProxy"]([entry])
        route.proxy_port = await route.onion.start()
        self.addAsyncCleanup(route.close)
        dial = route.destination(entry, authenticated=True)
        self.assertRegex(dial, rf"^socks://[0-9a-f]{{48}}:x@127\.0\.0\.1:{route.proxy_port}/")
        self.assertTrue(dial.endswith(entry.split("://")[1]))
        self.links.key, cert = identity()
        self.links.sync.local_pin = api["digest"](cert)
        self.links.sync.me["certificate"] = base64.b64encode(cert).decode()
        self.links.listen = AsyncMock()
        with patch.dict(transport, shareable=lambda learned, generation: [entry]):
            link = (await self.links.create())["link"]
        self.assertTrue(link.startswith(api["V3"]))
        self.assertEqual(api["decode"](link)[-1], [entry])
        with self.assertRaises(ValueError):
            api["decode"](link.replace("/v3/", "/v2/"))

    async def test_rotated_or_closed_entry_preserves_existing_invitation(self):
        module = self.links.transport_api
        address = "onion://" + module["onion_host"](bytes(32)) + ":17907?key=" + "ab"*32
        generation = module["entry_generation"](address)
        previous = self.links.mail.get(api["HOST"], "current")
        for new in (None, address.replace("ab"*32, "cd"*32)):
            with patch.dict(module["shareable"].__globals__, local_entry=lambda: new):
                with self.assertRaisesRegex(ValueError, "Точка входа сменилась"):
                    await self.links.create(generation)
                self.assertEqual(previous, self.links.mail.get(api["HOST"], "current"))
        with patch.dict(module["shareable"].__globals__, local_entry=lambda: address):
            self.assertEqual(module["shareable"]([], generation), [address])

    async def test_relearn_live_pins_after_local_transport_restarts(self):
        primary="tls://1.1.1.1:17907?key="+"fa"*32
        backup="tls://1.0.0.1:17907?key="+"bc"*32
        stored=dict(entries=[primary,backup], verified=[], until=2**62)
        self.links.save(api["CACHE"],stored)
        self.links.transport.connected=AsyncMock(return_value=[backup])
        await self.links.refresh_peers(stored)
        self.assertEqual(self.links.mail.get(api["CACHE"],"current")["verified"],[backup])

    async def test_slow_onion_circuit_survives_yggdrasil_retry(self):
        host = b"pg6mmjiyjmcrsslvykfwnntlaru7p5svn6y2ymmju6nubxndf4pscryd.onion"
        entry = f"onion://{host.decode()}:17907?key=" + "91"*32
        proxy = runpy.run_path(str(linux/"onion_proxy.py"))["OnionProxy"]([entry])
        port = await proxy.start()
        self.addAsyncCleanup(proxy.close)
        async def echo(reader,writer):
            try:
                writer.write(await reader.readexactly(4))
                await writer.drain()
            finally:
                writer.close()
        server = await asyncio.start_server(echo,"127.0.0.1",0)
        self.addCleanup(server.close)
        ready = asyncio.Event()
        async def dial(destination):
            self.assertEqual(destination,host)
            await ready.wait()
            return await asyncio.open_connection("127.0.0.1",server.sockets[0].getsockname()[1])
        proxy.dial = AsyncMock(side_effect=dial)
        async def request(destination, username):
            reader, writer = await asyncio.open_connection("127.0.0.1",port)
            self.addCleanup(writer.close)
            writer.write(b"\x05\x01\x02")
            self.assertEqual(await reader.readexactly(2),b"\x05\x02")
            writer.write(b"\x01"+bytes([len(username)])+username+b"\x01x")
            if username == proxy.user:
                self.assertEqual(await reader.readexactly(2),b"\x01\x00")
                writer.write(b"\x05\x01\x00\x03"+bytes([len(destination)])+destination+(17907).to_bytes(2,"big"))
            return reader,writer
        for address,user in ((host,b"other"),(b"localhost",proxy.user)):
            reader,_ = await request(address,user)
            self.assertEqual(await asyncio.wait_for(reader.read(1),2),b"")
        proxy.dial.assert_not_awaited()
        reader,_ = await request(host,proxy.user)
        self.assertEqual(await asyncio.wait_for(reader.read(1),5),b"")
        self.assertFalse(proxy.pending[host].cancelled())
        ready.set()
        reader,writer = await request(host,proxy.user)
        self.assertEqual((await reader.readexactly(10))[:2],b"\x05\x00")
        writer.write(b"test")
        self.assertEqual(await reader.readexactly(4),b"test")
        proxy.dial.assert_awaited_once()

    def recovering_transport(self):
        api_transport = api["bootstrap"]
        host = api_transport["onion_host"](b"p"*32)
        client = api_transport["Transport"]()
        client.entries = [f"onion://{host}:17907?key="+"91"*32]
        client.process = Mock()
        proxy = runpy.run_path(str(linux/"onion_proxy.py"))["OnionProxy"](client.entries)
        client.onion = proxy
        client.stop_worker = AsyncMock()
        client.launch = AsyncMock()
        stream = Mock()
        stream.is_closing.return_value = False
        reader = Mock()
        reader.at_eof.return_value = False
        proxy.dial = AsyncMock(return_value=(reader,stream))
        self.addAsyncCleanup(proxy.close)
        return client, host.encode(), stream

    async def test_waiting_room_reuses_ready_onion_before_periodic_retry(self):
        client, host, stream = self.recovering_transport()
        await client.recover_call(True)
        _, opening = client.call_probe
        await client.recover_call(True)
        await opening
        await client.recover_call(True)
        client.onion.dial.assert_awaited_once_with(host)
        client.stop_worker.assert_awaited_once()
        client.launch.assert_awaited_once()
        self.assertIs(client.onion.pending[host],opening)
        self.assertIsNone(client.call_probe)
        stream.close.assert_not_called()
        await client.recover_call(True)
        self.assertIsNone(client.call_probe)

    async def test_existing_worker_can_take_a_recovery_dial_without_a_restart(self):
        for waiting in (True, False):
            client, host, stream = self.recovering_transport()
            await client.recover_call(True, paced=True)
            opening = client.onion.pending[host]
            await opening
            # handle() removes the exact task once its authenticated local
            # SOCKS client has taken the stream, before yielding to a poll.
            self.assertIs(client.onion.pending.pop(host), opening)
            await client.recover_call(waiting, paced=True)
            self.assertIsNone(client.call_probe)
            client.stop_worker.assert_not_awaited()
            client.launch.assert_not_awaited()
            stream.close.assert_not_called()
            stream.close()

    async def test_live_socks_connection_survives_room_recovery_poll(self):
        client, host, _ = self.recovering_transport()
        proxy = client.onion
        port = await proxy.start()
        upstream_closed = asyncio.Event()

        async def echo(reader, writer):
            try:
                while data := await reader.read(1024):
                    writer.write(data)
                    await writer.drain()
            finally:
                writer.close()
                await writer.wait_closed()
                upstream_closed.set()

        async with await asyncio.start_server(echo, "127.0.0.1", 0) as upstream:
            upstream_port = upstream.sockets[0].getsockname()[1]
            proxy.dial = lambda _: asyncio.open_connection("127.0.0.1", upstream_port)
            await client.recover_call(True)
            await client.call_probe[1]
            reader, writer = await asyncio.open_connection("127.0.0.1", port)
            try:
                writer.write(b"\x05\x01\x02" + b"\x01" + bytes([len(proxy.user)]) +
                             proxy.user + b"\x01x" + b"\x05\x01\x00\x03" +
                             bytes([len(host)]) + host + (17907).to_bytes(2, "big"))
                self.assertEqual(await asyncio.wait_for(reader.readexactly(14), 2),
                                 b"\x05\x02\x01\x00\x05\x00\x00\x01" + b"\x00" * 6)
                await client.recover_call(True)
                writer.write(b"same peering")
                self.assertEqual(await asyncio.wait_for(reader.readexactly(12), 2), b"same peering")
                client.stop_worker.assert_not_awaited()
                client.launch.assert_not_awaited()
            finally:
                writer.close()
                await writer.wait_closed()
                await proxy.close()
            await asyncio.wait_for(upstream_closed.wait(), 2)

    async def test_silent_spare_retries_while_primary_keeps_its_adjacency(self):
        client, host, _ = self.recovering_transport()
        await client.recover_call(True, paced=True)
        await client.call_probe[1]
        await client.recover_call(True, paced=True)
        self.assertTrue(0 < client.call_retry_at - time.monotonic() <= 6)
        self.assertIn(host, client.onion.pending)

    async def test_healthy_or_closed_room_keeps_original_peer(self):
        for waiting in (True,False):
            client, _, stream = self.recovering_transport()
            await client.recover_call(False)
            client.onion.dial.assert_not_called()
            await client.recover_call(True)
            await client.call_probe[1]
            if waiting:
                client.onion.last_receive[object()] = time.monotonic()
            await client.recover_call(waiting)
            stream.close.assert_called_once()
            client.stop_worker.assert_not_awaited()
            client.launch.assert_not_awaited()

    async def test_unreachable_replacement_keeps_worker_and_backs_off(self):
        client, _, _ = self.recovering_transport()
        client.onion.dial.side_effect = ConnectionRefusedError()
        await client.recover_call(True)
        await asyncio.gather(client.call_probe[1],return_exceptions=True)
        await client.recover_call(True)
        await client.recover_call(True)
        self.assertIsNone(client.call_probe)
        client.stop_worker.assert_not_awaited()
        client.launch.assert_not_awaited()

    async def test_call_reserve_is_scoped_to_the_active_pinned_entry(self):
        routes = api["bootstrap"]["CallRoutes"]()
        primary = routes.current = Mock()
        primary.entries = ["first","active"]
        primary.connected = AsyncMock(return_value=["active"])
        primary.recover_call = AsyncMock()
        primary.discard_call_probe = AsyncMock()
        primary.close = AsyncMock()
        primary.onion.last_receive = {}
        spare = Mock()
        spare.priming = asyncio.get_running_loop().create_future()
        spare.update = AsyncMock()
        spare.close = AsyncMock()
        spare.recover_call = AsyncMock()
        spare.connected = AsyncMock(return_value=[])
        with patch.dict(routes.recover_call.__globals__, Transport=Mock(return_value=spare)):
            await routes.recover_call(False)
            self.assertIsNone(routes.reserve)
            await routes.recover_call(False, connected=True)
            spare.update.assert_awaited_once_with(primary.entries,warm_entry="active")
            await routes.recover_call(True)
            primary.close.assert_not_awaited()
            reader = Mock()
            reader.at_eof.return_value = False
            spare.priming.set_result((reader,Mock()))
            await routes.recover_call(False, connected=True)
            spare.update.assert_awaited_with(primary.entries)
            await routes.recover_call(True)
            self.assertIs(routes.current,primary)
            primary.close.assert_not_awaited()
            spare.connected.return_value = ["active"]
            routes.verify_after = 0
            await routes.recover_call(False,connected=True)
            self.assertIs(routes.current,primary)
            self.assertIs(routes.reserve,spare)
            primary.connected.return_value = []
            routes.verify_after = 0
            await routes.recover_call(False,connected=True)
            self.assertIs(routes.current,spare)
            self.assertIs(routes.reserve,primary)
            primary.recover_call.assert_awaited_with(True, paced=True)
            primary.close.assert_not_awaited()

    async def test_failed_reserve_launch_keeps_current_transport(self):
        routes = api["bootstrap"]["CallRoutes"]()
        primary = routes.current = Mock()
        primary.recover_call = AsyncMock()
        spare = routes.reserve = Mock()
        spare.priming = asyncio.get_running_loop().create_future()
        reader = Mock()
        reader.at_eof.return_value = False
        spare.priming.set_result((reader,Mock()))
        spare.update = AsyncMock(side_effect=OSError())
        spare.close = AsyncMock()
        await routes.recover_call(True)
        spare.close.assert_awaited_once()
        self.assertIsNone(routes.reserve)
        self.assertIs(routes.current,primary)

    async def test_authenticated_standby_can_rejoin_without_interrupting_primary(self):
        routes = api["bootstrap"]["CallRoutes"]()
        primary = routes.current = Mock()
        primary.recover_call = AsyncMock()
        primary.close = AsyncMock()
        spare = routes.reserve = Mock()
        spare.connected = AsyncMock(return_value=[])
        spare.recover_call = AsyncMock()
        spare.close = AsyncMock()
        routes.engaged = True
        await routes.recover_call(False, connected=True)
        spare.close.assert_not_awaited()
        spare.recover_call.assert_awaited_with(True, paced=True)
        routes.verify_after = 0
        await routes.recover_call(True)
        spare.recover_call.assert_awaited_with(True, paced=True)
        primary.recover_call.assert_awaited_with(False)
        self.assertIs(routes.reserve, spare)
        routes.verify_after = 0
        await routes.recover_call(False, connected=True)
        spare.close.assert_not_awaited()
        self.assertIs(routes.reserve, spare)
        spare.recover_call.assert_awaited_with(True, paced=True)
        primary.close.assert_not_awaited()

    async def test_room_leave_releases_prepared_reserve(self):
        routes = api["bootstrap"]["CallRoutes"]()
        primary = routes.current = Mock()
        primary.discard_call_probe = AsyncMock()
        spare = routes.reserve = Mock()
        spare.close = AsyncMock()
        await routes.recover_call(False)
        spare.close.assert_awaited_once()
        self.assertIsNone(routes.reserve)
        self.assertIs(routes.current,primary)

    async def test_fresh_stream_can_win_while_earlier_tor_request_is_pending(self):
        transport,host,_ = self.recovering_transport()
        proxy = transport.onion
        cancelled = asyncio.Event()
        stream = Mock()
        async def dial(destination):
            self.assertEqual(destination,host)
            if proxy.dial.await_count == 1:
                try:
                    await asyncio.Future()
                finally:
                    cancelled.set()
            return object(),stream
        proxy.dial.side_effect = dial
        reader, writer = await asyncio.wait_for(proxy.dial_for_room(host),4)
        self.assertIs(writer,stream)
        self.assertTrue(cancelled.is_set())
        stream.close.assert_not_called()

    async def test_fresh_rendezvous_has_time_to_finish_during_a_long_outage(self):
        transport, host, stream = self.recovering_transport()
        proxy = transport.onion
        attempts = 0
        active = 0
        peak = 0
        async def dial(destination):
            nonlocal attempts, active, peak
            self.assertEqual(destination, host)
            attempts += 1
            active += 1
            peak = max(peak, active)
            try:
                if attempts == 1:
                    await asyncio.Future()
                await asyncio.sleep(3.4)
                return object(), stream
            finally:
                active -= 1
        proxy.dial.side_effect = dial
        _, winner = await asyncio.wait_for(proxy.dial_for_room(host), 7)
        self.assertIs(winner, stream)
        self.assertEqual((attempts, peak, active), (2, 2, 0))

    async def test_first_ready_onion_is_reused_and_lock_closes_unused_stream(self):
        transport = api["bootstrap"]
        hosts = [transport["onion_host"](bytes([i])*32) for i in (1,2)]
        entries = [f"onion://{host}:17907?key="+"91"*32 for host in hosts]
        proxy = runpy.run_path(str(linux/"onion_proxy.py"))["OnionProxy"](entries)
        from unittest.mock import Mock
        stream = Mock()
        async def dial(host):
            if host == hosts[0].encode():
                raise ConnectionRefusedError()
            return object(),stream
        proxy.dial = AsyncMock(side_effect=dial)
        await proxy.ready()
        self.assertIs((await proxy.prepare(hosts[1].encode()))[1],stream)
        self.assertEqual(proxy.dial.await_count,2)
        await proxy.close()
        stream.close.assert_called_once()


if __name__=="__main__":unittest.main()
