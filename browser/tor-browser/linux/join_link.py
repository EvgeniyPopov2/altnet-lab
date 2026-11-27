"""Single-use rendezvous on the fast interface. Only a confirmed request gets membership."""
import asyncio
import base64
import hashlib
import hmac
import ipaddress
import re
import runpy
import secrets
import ssl
import time
from contextlib import suppress
from pathlib import Path

from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

PORT = 17909
PREFIX = "alt://join/v1/"
V2 = "alt://join/v2/"
V3 = "alt://join/v3/"
DOMAIN = b"AltNet signed entry peers v2\0"
ONION_DOMAIN = b"AltNet signed onion entry peers v3\0"
bootstrap = runpy.run_path(str(Path(__file__).with_name("invite_transport.py")))
CACHE = "join-transport-peers"
TTL = 900
HOST, GUEST = "join-link-out", "join-link-in"


def check(ok):
    if not ok:
        raise ValueError("Приглашение больше недоступно. Попросите новую ссылку.")


def pack(raw):
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode(link):
    check(isinstance(link, str) and re.fullmatch(r"alt://join/(?:v1/[A-Za-z0-9_-]{160}|v[23]/[A-Za-z0-9_-]{260,1400})", link))
    token = link[len(PREFIX):]
    raw = base64.b64decode(token + "=" * (-len(token) % 4), altchars=b"-_", validate=True)
    check(pack(raw) == token)
    entries = []
    if link.startswith((V2, V3)):
        onion = link.startswith(V3)
        size = int.from_bytes(raw[120:122], "big")
        check(0 < size <= 600 and 122 + size + 64 < len(raw))
        der = raw[122:122+size]
        check(hmac.compare_digest(hashlib.sha256(der).digest(), raw[16:48]))
        pub = x509.load_der_x509_certificate(der).public_key()
        check(isinstance(pub, Ed25519PublicKey))
        try:
            pub.verify(raw[-64:], (ONION_DOMAIN if onion else DOMAIN) + raw[:-64])
        except InvalidSignature as exc:
            raise ValueError("Подпись точек входа не совпала.") from exc
        entries = bootstrap["unpack_peers"](raw[122+size:-64], onion=onion)
        raw = raw[:120]
    address = ipaddress.IPv6Address(raw[:16])
    expiry = int.from_bytes(raw[-8:], "big")
    check(address in ipaddress.IPv6Network("200::/8") and time.time() < expiry <= time.time()+TTL+60)
    return str(address), raw[16:48].hex(), raw[48:80].hex(), raw[80:112], expiry, entries


def digest(value):
    return hashlib.sha256(value).hexdigest()


def transcript(challenge, secret, card):
    return b"AltNet link proof v1\0" + challenge + secret + hashlib.sha256(card.encode()).digest()


def code(secret, pin):
    value = hmac.digest(secret, b"AltNet link confirmation v1\0"+bytes.fromhex(pin), "sha256")
    return "%06d" % (int.from_bytes(value[:4], "big") % 1000000)


class Links:
    transport_api = bootstrap

    def __init__(self, sync, read, write):
        self.sync = sync
        self.lobby = sync.lobby
        self.mail = sync.mail
        self.read, self.write = read, write
        self.server = self.job = None
        self.clients = set()
        self.transport = bootstrap["CallRoutes"]()
        self.check_peers_at = 0
        self.route_probe = ((), 0, False)
        self.next_try = 0
        self.retry_delay = 2
        self.key = serialization.load_pem_private_key((self.lobby.pair/"key").read_bytes(), password=None)

    def save(self, slot, item):
        with self.mail.transaction():
            self.mail.remove(slot, "current")
            self.mail.put(slot, "", "current", item, item["until"], 1)

    def offer(self):
        network = self.sync.network
        catalog = network.catalog()
        if not catalog or catalog.until <= time.time():
            raise ValueError("Для приглашения нужен действующий каталог вашей сети.")
        row = self.mail.db.execute("SELECT packet FROM directory_catalog WHERE issuer=? AND rev=?",
                                   (catalog.public, catalog.rev)).fetchone()
        check(row)
        return dict(config=dict(issuer=catalog.public.hex(), readKey=catalog.read_key.hex(), mirrors=catalog.mirrors),
                    packet=pack(row[0]))

    async def listen(self):
        if self.server or not self.mail.get(HOST, "current"):
            return
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.minimum_version = ctx.maximum_version = ssl.TLSVersion.TLSv1_3
        ctx.num_tickets = 0
        ctx.load_cert_chain(self.lobby.pair/"cert", self.lobby.pair/"key")
        sock = self.lobby.bound(None, PORT, True)
        try:
            self.server = await asyncio.start_server(self.handle, sock=sock, ssl=ctx, ssl_handshake_timeout=4, backlog=8)
        except BaseException:
            sock.close()
            raise

    async def refresh_peers(self, stored):
        matched = await self.transport.connected()
        current = self.mail.get(CACHE, "current") or {}
        if current != stored:
            return current
        known = [uri for uri in matched if uri in stored.get("entries", [])]
        if known:
            verified = list(dict.fromkeys([*known, *stored.get("verified", [])]))[:4]
            if verified != stored.get("verified", []):
                stored = dict(stored, verified=verified)
                self.save(CACHE, dict(stored, until=2**62))
        return stored

    async def create(self, generation=None):
        self.offer()
        until = int(time.time())+TTL
        secret = secrets.token_bytes(32)
        raw = (ipaddress.IPv6Address(self.sync.me["address"]).packed + bytes.fromhex(self.sync.local_pin)
               + bytes.fromhex(self.sync.me["id"]) + secret + until.to_bytes(8, "big"))
        learned = await self.refresh_peers(self.mail.get(CACHE, "current") or {})
        entries = bootstrap["shareable"](learned.get("verified", []), generation)
        link = PREFIX + pack(raw)
        if entries:
            der = base64.b64decode(self.sync.me["certificate"], validate=True)
            check(len(der) <= 600 and digest(der) == self.sync.local_pin)
            body = raw + len(der).to_bytes(2, "big") + der + bootstrap["pack_peers"](entries)
            onion = bootstrap["via_tor"](entries[0])
            link = (V3 if onion else V2) + pack(body + self.key.sign((ONION_DOMAIN if onion else DOMAIN) + body))
        self.save(HOST, dict(until=until, token=digest(secret)))
        await self.listen()
        return dict(link=link, until=until)

    def redeem(self, link):
        _, pin, owner, secret, until, entries = decode(link)
        check(owner != self.sync.me["id"] and pin != self.sync.local_pin)
        prior = self.mail.get(GUEST, "current")
        if not prior or prior.get("link") != link:
            self.save(GUEST, dict(link=link, until=until, entries=entries, code=code(secret, self.sync.local_pin)))
        self.next_try = 0
        self.retry_delay = 2

    async def handle(self, reader, writer):
        task = asyncio.current_task()
        try:
            if len(self.clients) >= 8:
                return
            self.clients.add(task)
            await asyncio.wait_for(self.serve(reader, writer), 8)
        except (OSError, ValueError, TypeError, KeyError, InvalidSignature, asyncio.IncompleteReadError, asyncio.TimeoutError):
            pass
        finally:
            self.clients.discard(task)
            writer.close()

    async def serve(self, reader, writer):
        challenge = secrets.token_bytes(32)
        await self.write(writer, dict(challenge=challenge.hex()))
        req = await self.read(reader)
        secret = bytes.fromhex(req["token"])
        item = self.mail.get(HOST, "current")
        check(item and len(secret)==32 and hmac.compare_digest(item["token"], digest(secret)))
        card, der = req["card"], base64.b64decode(req["cert"], validate=True)
        check(isinstance(card,str) and card.startswith("alt://contact/v1/") and len(card)<=150000 and len(der)<=1400)
        pub = x509.load_der_x509_certificate(der).public_key()
        check(isinstance(pub, Ed25519PublicKey))
        pub.verify(bytes.fromhex(req["signature"]), transcript(challenge, secret, card))
        pin = digest(der)
        candidate = dict(card=card, pin=pin, address=str(ipaddress.IPv6Address(writer.get_extra_info("peername")[0])))
        if "candidate" not in item:
            item.update(candidate=candidate, code=code(secret, pin))
            self.save(HOST, item)
        # The first device binds the invitation. Retries must come from this exact claimant.
        check(item["candidate"]==candidate)
        owner = item.get("approved")
        peer = self.lobby.known.get(owner)
        if peer and digest(peer[1])==pin and peer[0]["address"]==candidate["address"]:
            await self.write(writer, dict(card=self.sync.own, **self.offer()))
        else:
            await self.write(writer, dict(wait=True))

    async def exchange(self, item):
        address, pin, owner, secret, _, _ = decode(item["link"])
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE  # Explicit certificate pin before sending any identity or capability.
        ctx.minimum_version = ctx.maximum_version = ssl.TLSVersion.TLSv1_3
        sock = self.lobby.bound(address, PORT)
        writer = None
        try:
            await asyncio.get_running_loop().sock_connect(sock,(address, PORT))
            reader, writer = await asyncio.open_connection(sock=sock, ssl=ctx, server_hostname="", ssl_handshake_timeout=4)
            der = writer.get_extra_info("ssl_object").getpeercert(binary_form=True)
            check(hmac.compare_digest(pin, digest(der)))
            challenge = bytes.fromhex((await self.read(reader))["challenge"])
            check(len(challenge)==32)
            signature = self.key.sign(transcript(challenge, secret, self.sync.own)).hex()
            await self.write(writer, dict(token=secret.hex(), card=self.sync.own, cert=self.sync.me["certificate"], signature=signature))
            reply = await self.read(reader)
            if reply==dict(wait=True):
                self.retry_delay=3
                return
            check(isinstance(reply["card"],str) and len(reply["card"])<=150000)
            self.validate(reply)
            current = self.mail.get(GUEST, "current")
            if current and current.get("link")==item["link"]:
                self.save(GUEST, dict(**item, candidate=dict(card=reply["card"], pin=pin, address=address, owner=owner),
                                      network=dict(config=reply["config"], packet=reply["packet"])))
        finally:
            if writer:
                writer.close()
            else:
                sock.close()

    def validate(self, offer):
        api = self.sync.network.api
        cfg = offer["config"]
        check(isinstance(cfg,dict) and set(cfg)=={"issuer","readKey","mirrors"})
        api["mirrors"](cfg["mirrors"])
        check(isinstance(offer["packet"],str) and len(offer["packet"])<=24576)
        packet = base64.b64decode(offer["packet"]+"="*(-len(offer["packet"])%4), altchars=b"-_", validate=True)
        api["verify"](packet, api["key"](cfg["issuer"]), int(time.time()), api["key"](cfg["readKey"]))
        prior = self.sync.network.catalog()
        if prior and (prior.public.hex()!=cfg["issuer"] or prior.read_key.hex()!=cfg["readKey"]):
            raise ValueError("Это устройство уже подключено к другой сети.")
        return packet

    async def fetch(self, item):
        try:
            await asyncio.wait_for(self.exchange(item),9)
        except (OSError, ValueError, KeyError, TypeError, InvalidSignature, asyncio.IncompleteReadError, asyncio.TimeoutError):
            self.retry_delay=min(30,self.retry_delay*2)
        finally:
            self.next_try=time.monotonic()+self.retry_delay

    def approve(self, pin, owner):
        item = self.mail.get(HOST,"current")
        check(item and item.get("candidate",{}).get("pin")==pin and re.fullmatch("[0-9a-f]{64}",owner))
        item["approved"] = owner
        self.save(HOST,item)

    def cancel(self, side):
        check(side in ("host","guest"))
        self.mail.remove(HOST if side=="host" else GUEST,"current")

    async def status(self):
        host = self.mail.get(HOST,"current")
        if not host and self.server:
            self.server.close()
            await self.server.wait_closed()
            self.server=None
        guest = self.mail.get(GUEST,"current")
        stored = self.mail.get(CACHE, "current") or {}
        entries = list(dict.fromkeys([*(guest or {}).get("entries", []), *stored.get("entries", [])]))
        entries = [uri for uri in entries if bootstrap["via_tor"](uri) == bootstrap["via_tor"](entries[0])][:4]
        transport_error = False
        try:
            await self.transport.update(entries)
        except (OSError, ValueError):
            transport_error = True
        if stored and time.monotonic() >= self.check_peers_at:
            self.check_peers_at = time.monotonic() + 30
            await self.refresh_peers(stored)
        status={}
        if entries and bootstrap["via_tor"](entries[0]):
            status["entryRoute"] = "tor"
            wanted = tuple(entries)
            prior, deadline, connected = self.route_probe
            if wanted != prior or time.monotonic() >= deadline:
                connected = bool(await self.transport.connected())
                self.route_probe = (wanted, time.monotonic()+2, connected)
            status["entryConnected"] = connected and not transport_error
        else:
            self.route_probe = ((), 0, False)
        if host and host.get("candidate") and (not host.get("approved") or host["approved"] not in self.lobby.known):
            status["request"]=dict(**host["candidate"],code=host["code"])
        if not guest:
            return status
        if guest.get("joined"):
            status["joined"]=guest["joined"]
        elif "candidate" in guest:
            candidate=guest["candidate"]
            peer=self.lobby.known.get(candidate["owner"])
            if peer and digest(peer[1])==candidate["pin"] and peer[0]["address"]==candidate["address"]:
                offer=guest["network"]
                packet=self.validate(offer)
                verified = await self.transport.connected() if entries else []
                if self.mail.get(GUEST, "current") != guest:
                    return status
                with self.mail.transaction():
                    if not self.sync.network.catalog():
                        self.mail.put("network-member","","current",offer["config"],2**62,1)
                    self.sync.network.catalog().accept(packet)
                    if guest.get("entries"):
                        self.mail.remove(CACHE, "current")
                        self.mail.put(CACHE, "", "current", dict(entries=entries, verified=verified), 2**62, 1)
                    self.mail.remove(GUEST,"current")
                    self.mail.put(GUEST,"","current",dict(joined=candidate["owner"],until=guest["until"]),guest["until"],1)
                await self.sync.refresh_directory()
                status["joined"]=candidate["owner"]
            else:
                status["ready"]=candidate
        else:
            status["waiting"]=guest["code"]
            if transport_error:
                status["transportError"] = True
            if (not self.job or self.job.done()) and time.monotonic()>=self.next_try:
                self.next_try=time.monotonic()+3
                self.job=asyncio.create_task(self.fetch(guest))
        return status

    async def close(self):
        if self.server:
            self.server.close()
            await self.server.wait_closed()
        tasks=list(self.clients)
        if self.job:
            tasks.append(self.job)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)
        await self.transport.close()
