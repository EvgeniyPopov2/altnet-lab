"""Invitations between verified fast contacts on their Yggdrasil interfaces."""
import asyncio
import base64
from contextlib import suppress
import fcntl
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import runpy
import signal
import socket
import sqlite3
import ssl
from collections import Counter
import subprocess
import sys
import tempfile
import time

SIGNAL_PORT, MEDIA_PORT = 17910, 17911
LIMIT = 192 * 1024
NETWORK = ipaddress.IPv6Network("200::/8")
entry_control = runpy.run_path(str(Path(__file__).with_name("entry_control.py")))


def require(condition, message="Некорректное приглашение в Эфир."):
    if not condition:
        raise ValueError(message)


def tunnel(name):
    # Yggdrasil on Linux assigns its address to a layer-three TUN device.
    if not re.fullmatch("[A-Za-z0-9_.-]{1,15}",name):return False
    try:
        return int((Path("/sys/class/net")/name/"tun_flags").read_text().strip(),16) & 3 == 1
    except (OSError,ValueError):
        return False


def mesh_address():
    rows = json.loads(subprocess.check_output(["/usr/sbin/ip", "-j", "-6", "address", "show", "up"], timeout=3))
    choices = [(row["ifname"], str(ipaddress.IPv6Address(a["local"]))) for row in rows for a in row["addr_info"]
               if ipaddress.IPv6Address(a["local"]) in NETWORK and a["scope"] == "global"
               and tunnel(row["ifname"])]
    require(len(choices) == 1, "Для Эфира нужен активный интерфейс Yggdrasil с однозначным адресом.")
    return choices[0]


def identity(device):
    require(isinstance(device,str) and re.fullmatch("[0-9a-f]{64}", device))
    base = Path(os.environ.get("XDG_DATA_HOME") or Path.home()/".local/share")/"altnet"/"air-devices"/device
    base.mkdir(mode=0o700,parents=True,exist_ok=True)
    require(base.is_dir() and not base.is_symlink() and base.stat().st_uid == os.geteuid() and not base.stat().st_mode & 0o077)
    pair = base/"tls"
    with (base/".lock").open("a") as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        if not pair.exists():
            with tempfile.TemporaryDirectory(dir=base) as tmp:
                stage = Path(tmp)/"tls"
                stage.mkdir(mode=0o700)
                subprocess.run(["/usr/bin/openssl","req","-x509","-newkey","ed25519","-nodes","-days","730",
                    "-subj","/CN=AltNet Air","-addext","basicConstraints=critical,CA:FALSE",
                    "-addext","keyUsage=critical,digitalSignature","-addext","extendedKeyUsage=serverAuth,clientAuth",
                    "-keyout",str(stage/"key"),"-out",str(stage/"cert")],check=True,timeout=5,capture_output=True)
                stage.rename(pair)
        elif subprocess.run(["/usr/bin/openssl","x509","-in",str(pair/"cert"),"-checkend","604800","-noout"],
                            capture_output=True,timeout=3).returncode:
            with tempfile.TemporaryDirectory(dir=base) as tmp:
                renewed=Path(tmp)/"cert"
                subprocess.run(["/usr/bin/openssl","req","-x509","-key",str(pair/"key"),"-days","730",
                    "-subj","/CN=AltNet Air","-addext","basicConstraints=critical,CA:FALSE",
                    "-addext","keyUsage=critical,digitalSignature","-addext","extendedKeyUsage=serverAuth,clientAuth",
                    "-out",str(renewed)],check=True,timeout=5,capture_output=True)
                os.replace(renewed,pair/"cert")
    der = ssl.PEM_cert_to_DER_cert((pair/"cert").read_text(encoding="ascii"))
    interface,address = mesh_address()
    return pair,interface,{"device":device,"address":address,"certificate":base64.b64encode(der).decode("ascii")}


def member(value):
    require(isinstance(value,dict) and set(value)=={"id","device","address","certificate","name"})
    for k in ("id","device"):
        require(isinstance(value[k],str) and re.fullmatch("[a-f0-9]{64}",value[k]))
    require(isinstance(value["name"],str) and value["name"].strip() and value["name"].isprintable() and len(value["name"])<=64)
    address=ipaddress.IPv6Address(value["address"])
    require(address in NETWORK and "%" not in value["address"])
    require(isinstance(value["certificate"],str) and len(value["certificate"])<=2048)
    der=base64.b64decode(value["certificate"],validate=True)
    require(128<=len(der)<=1400)
    return {**value,"address":str(address)},der


def tls(pair, server, certs):
    ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER if server else ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname=False
    ctx.minimum_version=ctx.maximum_version=ssl.TLSVersion.TLSv1_3
    ctx.verify_mode=ssl.CERT_REQUIRED
    ctx.verify_flags |= getattr(ssl,"VERIFY_X509_PARTIAL_CHAIN",0)
    if certs: ctx.load_verify_locations(cadata="".join(ssl.DER_cert_to_PEM_cert(d) for d in certs))
    ctx.load_cert_chain(pair/"cert",pair/"key")
    if server: ctx.num_tickets=0
    return ctx


async def read_packet(reader):
    length=int.from_bytes(await reader.readexactly(4),"big")
    require(0<length<=LIMIT)
    return json.loads(await reader.readexactly(length))


async def write_packet(writer,obj):
    body=json.dumps(obj,ensure_ascii=False,separators=(",",":")).encode()
    require(len(body)<=LIMIT,"Карточки участников слишком велики для приглашения.")
    writer.write(len(body).to_bytes(4,"big")+body)
    await writer.drain()


class Lobby:
    def __init__(self,voice):
        self.voice=voice
        self.session=voice.Session()
        self.device=self.pair=self.interface=self.endpoint=self.me=self.server=None
        self.check_route_at=0
        self.watch_route=None
        self.next_cert_check=0
        self.cert_stamp=None
        self.known={}
        self.pending={}
        self.seen={}
        self.delivery={}
        self.jobs=set()
        self.guests=set()
        self.sync=None
        self.links=None
        self.wakes={}
        self.room=self.host=None
        self.last_connected_room=None
        self.roster=[]

    def address(self,device):
        if self.device!=device:
            require(self.device is None)
            self.pair,self.interface,self.endpoint=identity(device)
            self.device=device
            self.cert_stamp=(self.pair/"cert").stat().st_mtime_ns
            self.next_cert_check=time.monotonic()+86400
            try:
                self.watch_route=socket.socket(socket.AF_NETLINK,socket.SOCK_RAW,socket.NETLINK_ROUTE)
                self.watch_route.bind((0,0x101))  # RTMGRP_LINK | RTMGRP_IPV6_IFADDR
                self.watch_route.setblocking(False)
            except OSError:
                if self.watch_route:self.watch_route.close()
                self.watch_route=None
        return self.endpoint

    def route_current(self):
        if not self.endpoint:return True
        now=time.monotonic()
        if now<self.check_route_at:return True
        self.check_route_at=now+3 if self.watch_route else now+30
        changed=not self.watch_route
        if self.watch_route:
            with suppress(BlockingIOError):
                for _ in range(32):
                    self.watch_route.recv(65536)
                    changed=True
        stamp=(self.pair/"cert").stat().st_mtime_ns
        if not changed and stamp==self.cert_stamp and now<self.next_cert_check:return True
        _,interface,endpoint=identity(self.device)
        self.next_cert_check=now+86400
        self.cert_stamp=(self.pair/"cert").stat().st_mtime_ns
        return interface==self.interface and endpoint==self.endpoint

    def bound(self,peer,port,listen=False):
        return self.voice.bound_socket({"interface":self.interface,"source":self.endpoint["address"],"peer":peer,"port":port},listen)

    async def configure(self,me,contacts,settings,own_card,versions):
        own,_=member(me)
        require(self.address(own["device"])=={k:own[k] for k in self.endpoint})
        require(isinstance(contacts,list) and len(contacts)<=256)
        people=[]
        for contact in contacts:
            try:
                peer,der=member(contact)
                probe=ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
                probe.load_verify_locations(cadata=ssl.DER_cert_to_PEM_cert(der))
                people.append((peer,der))
            except (ValueError,TypeError,KeyError,ssl.SSLError):
                continue
        keys=("id","certificate","address")
        counts={k:Counter([own[k]]+[v[k] for v,_ in people]) for k in keys}
        people=[(v,d) for v,d in people if all(counts[k][v[k]]==1 for k in keys)]
        await self.shutdown()
        self.me=own
        self.known={v["id"]:(v,d) for v,d in people}
        if people:
            sock=self.bound(None,SIGNAL_PORT,True)
            try:
                self.server=await asyncio.start_server(self.receive,sock=sock,ssl=tls(self.pair,True,[d for _,d in people]),
                                                       ssl_handshake_timeout=3,limit=LIMIT+4,backlog=8)
            except BaseException:
                sock.close()
                raise

        module=runpy.run_path(str(Path(__file__).with_name("contact_sync.py")))
        self.sync=module["Sync"](self)
        await self.sync.start(settings,own_card,versions)
        links=runpy.run_path(str(Path(__file__).with_name("join_link.py")))
        self.links=links["Links"](self.sync,read_packet,write_packet)
        await self.links.listen()

    def wake_delivery(self,person):
        if person in self.wakes:self.wakes[person].set()

    def expire(self):
        now=time.monotonic()
        self.pending={i:v for i,v in self.pending.items() if v[0]>now}
        self.seen={i:t for i,t in self.seen.items() if t>now}

    async def receive(self,reader,writer):
        this=asyncio.current_task()
        offer=disconnected=decision=None
        try:
            if len(self.guests)>=12: return
            self.guests.add(this)
            cert=writer.get_extra_info("ssl_object").getpeercert(binary_form=True)
            address=writer.get_extra_info("peername")[0]
            sender,=[v for v,d in self.known.values() if d==cert and v["address"]==address]
            packet=await asyncio.wait_for(read_packet(reader),4)
            self.expire()
            require(set(packet)=={"room","offer","cards","until"} and isinstance(packet["room"],str)
                    and re.fullmatch("[a-f0-9]{64}",packet["room"]) and type(packet["until"]) is int and 0<packet["until"]-time.time()<=125)
            room,offer=packet["room"],packet["offer"]
            require(isinstance(offer,str) and re.fullmatch("[a-f0-9]{64}",offer))
            require(isinstance(packet["cards"],list) and 2<=len(packet["cards"])<=8 and all(isinstance(c,str) for c in packet["cards"]))
            if ((self.room and (room!=self.room or sender["id"]!=self.host)) or offer in self.seen
                    or len(self.pending)>=8 or len(self.seen)>=256):
                await write_packet(writer,{"delivered":False})
                return
            self.seen[offer]=time.monotonic()+130
            decision=asyncio.get_running_loop().create_future()
            ttl=min(120,packet["until"]-time.time())
            self.pending[offer]=(time.monotonic()+ttl,sender["id"],packet["cards"],decision,room)
            await write_packet(writer,{"delivered":True})
            disconnected=asyncio.create_task(reader.read(1))
            done,_=await asyncio.wait([decision,disconnected],timeout=ttl,return_when=asyncio.FIRST_COMPLETED)
            if decision in done:
                await write_packet(writer,{"answer":decision.result()})
        except (ValueError,TypeError,KeyError,OSError,asyncio.TimeoutError,asyncio.IncompleteReadError):
            pass
        finally:
            if disconnected:
                disconnected.cancel()
                await asyncio.gather(disconnected,return_exceptions=True)
            if decision is not None and self.pending.get(offer,(None,None,None,None))[3] is decision:
                self.pending.pop(offer,None)
            self.guests.discard(this)
            writer.close()

    async def send(self,peer,der,packet):
        writer=None
        sock=self.bound(peer["address"],SIGNAL_PORT)
        try:
            await asyncio.wait_for(asyncio.get_running_loop().sock_connect(sock,(peer["address"],SIGNAL_PORT)),5)
            reader,writer=await asyncio.open_connection(sock=sock,ssl=tls(self.pair,False,[der]),server_hostname="",
                                                         ssl_handshake_timeout=3,limit=2048)
            require(writer.get_extra_info("ssl_object").getpeercert(binary_form=True)==der)
            await write_packet(writer,packet)
            reply=await asyncio.wait_for(read_packet(reader),5)
            if reply!={"delivered":True}:return "unavailable"
            self.delivery[peer["id"]]="delivered"
            answer=await asyncio.wait_for(read_packet(reader),125)
            return "accepted" if answer=={"answer":True} else "declined"
        finally:
            if writer: writer.close()
            else: sock.close()

    async def deliver(self,peer,der,packet):
        who=peer["id"]
        wake=self.wakes[who]=asyncio.Event()
        delay=2
        try:
            while time.time()<packet["until"]:
                wake.clear()
                try:
                    status=await self.send(peer,der,packet)
                    if status in ("accepted","declined"):
                        self.delivery[who]=status
                        return
                except (ValueError,OSError,asyncio.TimeoutError,asyncio.IncompleteReadError):
                    pass
                self.delivery[who]="queued"
                with suppress(asyncio.TimeoutError):
                    await asyncio.wait_for(wake.wait(),max(.1,min(delay,packet["until"]-time.time())))
                delay=min(delay*2,20)
            self.delivery[who]="queued"
        finally:
            self.wakes.pop(who,None)

    def start(self,room,members,host):
        require(self.me and self.room in (None,room) and isinstance(members,list) and 2<=len(members)<=8)
        people=[member(v) for v in members]
        require(people[0][0]["id"]==host)
        entries=[v for v,_ in people]
        require(not self.room or (self.host==host and entries[:len(self.roster)]==self.roster and len(entries)>len(self.roster)))
        for k in ("id","device","address","certificate"):
            require(len({v[k] for v,_ in people})==len(people))
        own=self.me["id"]
        require(any(v==self.me for v,d in people))
        routes=[]
        # Appending people keeps every existing port and TLS stream in place.
        edges=[(people[j][0],people[k][0]) for k in range(len(people)) for j in range(k)]
        existing={v["id"] for v in self.roster}
        for i,(a,b) in enumerate(edges):
            if a["id"] in existing and b["id"] in existing:continue
            if own not in (a["id"],b["id"]):continue
            server=a["id"]==own
            peer=b if server else a
            der=base64.b64decode(peer["certificate"])
            route={"interface":self.interface,"source":self.endpoint["address"],"peer":peer["address"],"port":MEDIA_PORT+i,
                   "selfName":self.me["name"],"peerName":peer["name"],"mode":"listen" if server else "connect"}
            context = tls(self.pair,server,[der])
            context.set_alpn_protocols([self.voice.RoomChannels.protocol])
            routes.append((route,context,der,peer["id"]))
        if self.room:
            require(self.session.phase=="connected" and self.session.room)
            self.session.room.extend(routes)
        else:
            self.session.dynamic=(routes,b"ALTNET-CONTACT-AIR\x02"+bytes.fromhex(room))
            self.session.join(False)
        self.room,self.host,self.roster=room,host,entries

    async def end(self):
        for job in self.jobs: job.cancel()
        if self.jobs: await asyncio.gather(*list(self.jobs),return_exceptions=True)
        await self.session.leave()
        self.session.dynamic=None
        self.session.room=None
        self.room=self.host=None
        self.roster=[]
        self.delivery.clear()

    async def shutdown(self):
        if self.links:
            await self.links.close()
            self.links=None
        if self.sync:
            await self.sync.close()
            self.sync=None
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            self.server=None
        guests=list(self.guests)
        for task in guests: task.cancel()
        await asyncio.gather(*guests,return_exceptions=True)
        await self.end()
        self.pending.clear()
        self.known.clear()
        self.me=None

    async def command(self,op,arg):
        self.expire()
        if op=="airEndpoint":return self.address(arg["device"])
        if op=="airEnable":
            await self.configure(arg["me"],arg["contacts"],arg["sync"],arg["own"],arg["versions"])
            return {"available":list(self.known)}
        elif op in ("airCreate","airAdd"):
            contacts=arg["contacts"]
            require(isinstance(contacts,list) and 1<=len(contacts)<=7 and len(set(contacts))==len(contacts))
            peers=[self.known[i] for i in contacts]
            if op=="airAdd":
                require(self.room and self.host==self.me["id"])
                require(all(self.delivery.get(v["id"])=="accepted" for v in self.roster[1:]))
            else:require(self.room is None)
            room=self.room or secrets.token_hex(32)
            packet={"room":room,"offer":secrets.token_hex(32),"cards":arg["cards"],"until":int(time.time())+120}
            require(len(packet["cards"])==len(peers)+1 and len(json.dumps(packet).encode())<LIMIT)
            self.start(room,[self.me]+[v for v,d in peers],self.me["id"])
            try:
                self.sync.notify(contacts,packet["offer"])
            except Exception:
                await self.end()
                raise
            for v,d in peers:
                self.delivery[v["id"]]="sending"
                t=asyncio.create_task(self.deliver(v,d,packet))
                self.jobs.add(t); t.add_done_callback(self.jobs.discard)
        elif (op.startswith("airLink") or op.startswith("airEntry")) and not self.links:
            raise ValueError("Для Эфира дождитесь подключения быстрого профиля.")
        elif op in ("airEntryStatus", "airEntryStart", "airEntryStop"):
            require(arg == {})
            if op != "airEntryStatus":
                await asyncio.to_thread(entry_control["change"], "start" if op == "airEntryStart" else "stop")
            return await asyncio.to_thread(entry_control["status"], self.links.transport_api)
        elif op=="airLinkCreate":
            generation = arg.get("generation")
            require(generation is None or isinstance(generation, str) and re.fullmatch("[a-f0-9]{64}", generation))
            return await self.links.create(generation)
        elif op=="airLinkRedeem":
            self.links.redeem(arg["link"])
        elif op=="airLinkApprove":
            self.links.approve(arg["pin"],arg["owner"])
        elif op=="airLinkCancel":
            self.links.cancel(arg["side"])
        elif op=="airNetworkInvite":
            require(self.sync and arg["contact"] in self.known)
            dev=self.known[arg["contact"]][0]["device"]
            self.sync.network.issue(self.sync.peers[dev])
        elif op in ("airNetworkJoin","airNetworkDecline"):
            require(self.sync is not None)
            self.sync.network.decide(arg["offer"],op=="airNetworkJoin")
            if op=="airNetworkJoin":await self.sync.refresh_directory()
        elif op=="airSkipUpdate":
            self.sync.skip(arg["device"],arg["hash"],arg.get("defer") is True and bool(self.room))
        elif op=="airPresented":
            offer=arg["offer"]
            require(offer in self.pending)
            self.sync.seen(offer)
        elif op=="airReadMissed":
            offer=arg["offer"]
            require(any(m["offer"]==offer for m in self.sync.missed()))
            self.sync.seen(offer)
        elif op=="airAccept":
            entry=self.pending[arg["room"]]
            known=self.known[entry[1]][0]
            require(any(all(v[k]==known[k] for k in ("id","address","certificate","device")) for v in arg["members"]))
            self.start(entry[4],arg["members"],entry[1])
            for key,other in list(self.pending.items()):
                if not other[3].done():other[3].set_result(key==arg["room"])
                self.pending.pop(key,None)
        elif op=="airDecline":
            entry=self.pending.pop(arg["room"],None)
            if entry and not entry[3].done():entry[3].set_result(False)
        elif op=="airLeave":await self.end()
        elif op=="airMute":
            require(type(arg.get("muted")) is bool and self.room)
            self.session.mute(arg["muted"])
        elif op=="airPoll":
            if not self.route_current():
                await self.shutdown()
                raise ValueError("Локальный маршрут изменился.")
        else:raise ValueError("Неизвестное действие.")
        state=self.session.state()
        if state["phase"] == "connected" or not self.room:
            self.last_connected_room = self.room
        if self.links:
            waiting = bool(self.room and self.room == self.last_connected_room and state["phase"] == "waiting")
            await self.links.transport.recover_call(waiting, connected=bool(self.room and state["phase"] == "connected"))
            if self.session.room:
                self.session.room.route_received(self.links.transport.last_incoming())
        inv=next(iter(self.pending.items()),None)
        update=self.sync.next_update() if self.sync else None
        return {"links":await self.links.status() if self.links else {}, "room":self.room,"host":self.host,"roster":[v["id"] for v in self.roster],"state":state,"delivery":self.delivery,
                "update":update,"missed":self.sync.missed() if self.sync else [],
                "networkInvites":self.sync.network.pending() if self.sync else [],
                "invite":({"room":inv[0],"group":inv[1][4],"sender":inv[1][1],"cards":inv[1][2]} if inv else None)}


async def serve(voice):
    lobby=Lobby(voice)
    loop=asyncio.get_running_loop()
    reader=asyncio.StreamReader(limit=512*1024)
    pipe,_=await loop.connect_read_pipe(lambda:asyncio.StreamReaderProtocol(reader),sys.stdin.buffer)
    task=asyncio.current_task()
    for sig in (signal.SIGINT,signal.SIGTERM):loop.add_signal_handler(sig,task.cancel)
    try:
        while line:=await reader.readline():
            try:
                cmd=json.loads(line)
                value=await lobby.command(cmd["op"],cmd["arg"])
                result={"value":value}
            except (KeyError,ValueError,TypeError,OSError,sqlite3.Error,subprocess.SubprocessError,voice.VoiceError) as exc:
                result={"error":str(exc)[:160] if isinstance(exc,ValueError) and str(exc).startswith(("Для приглашения","Это устройство уже подключено","Приглашение больше недоступно","Для Эфира","Несколько контактов","Карточки участников")) else "Не удалось выполнить действие. Проверьте быстрый профиль и подключение к Yggdrasil."}
            print(json.dumps(result,ensure_ascii=True),flush=True)
    finally:
        pipe.close()
        await lobby.shutdown()
        if lobby.watch_route:lobby.watch_route.close()
