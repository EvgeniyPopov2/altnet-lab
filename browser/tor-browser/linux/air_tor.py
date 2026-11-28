"""Отдельный Tor для одного уже открытого onion-пира. Владение привязано к Unix-соединению."""
import asyncio
from contextlib import contextmanager
import ipaddress
import os
from pathlib import Path
import re
import runpy
import secrets
import shutil
import socket
import struct
import sys
import time


HERE = Path(__file__).resolve().parent
command = runpy.run_path(str(HERE/"bridge_tor.py"))["command"]
tor_stream = runpy.run_path(str(HERE/"onion_proxy.py"))["tor_stream"]
SYSTEM = Path("/run/tor")


def event(message):
    print("AltNet-Air-Tor " + message, file=sys.stderr, flush=True)


@contextmanager
def controller(root):
    with socket.socket(socket.AF_UNIX) as sock:
        sock.settimeout(3)
        sock.connect(str(root/"control"))
        with sock.makefile("rwb",buffering=0) as stream:
            command(stream,b"AUTHENTICATE "+(root/"control.authcookie").read_bytes().hex().encode())
            yield sock, stream


def policy(stream, host):
    # Любая неизвестная настройка маршрута, прокси или транспорта оставляет
    # звонок на системном Tor. Настройки входящей onion-службы ему не нужны.
    text = command(stream,b"GETINFO config-text").decode().splitlines()
    settings = {}
    for row in text:
        if row in ("config-text=", "OK", ""):
            continue
        key, sep, value = row.partition(" ")
        if not sep or key not in {"Bridge","ClientTransportPlugin","UseBridges","RunAsDaemon",
                                  "HiddenServiceDir","HiddenServicePort","HiddenServiceVersion"}:
            raise ValueError("Неподдерживаемая политика Tor")
        settings.setdefault(key, []).append(value)
    streams = command(stream,b"GETINFO stream-status").decode().splitlines()
    ids = {p[2] for row in streams if len(p:=row.split())>=4 and p[1]=="SUCCEEDED" and p[3]==host+":17907"}
    if not ids:
        raise ValueError("Нет активного подписанного входа")
    if settings.get("UseBridges") == ["1"]:
        plugins = settings.get("ClientTransportPlugin",[])
        bridges = settings.get("Bridge",[])
        if (plugins != ["obfs4 exec /usr/bin/obfs4proxy"] or not bridges or
                not all(re.fullmatch(r"obfs4 [^\s]+ [a-fA-F0-9]{40} cert=[A-Za-z0-9+/=]+ iat-mode=[012]",b) for b in bridges)):
            raise ValueError("Неподдерживаемый транспорт моста")
        return ["UseBridges 1","ClientTransportPlugin "+plugins[0],*("Bridge "+b for b in bridges)]
    if settings.get("UseBridges",["0"])!=["0"] or "Bridge" in settings or "ClientTransportPlugin" in settings:
        raise ValueError("Неоднозначная политика Tor")
    active, other = set(),set()
    for row in command(stream,b"GETINFO circuit-status").decode().splitlines():
        p=row.split()
        if (len(p)>=4 and p[1]=="BUILT" and "," in p[2] and "ONEHOP_TUNNEL" not in row
                and (p[0] in ids or {"PURPOSE=GENERAL","PURPOSE=CONFLUX_LINKED","PURPOSE=HS_CLIENT_REND"}.intersection(p))
                and re.match(r"^\$[a-fA-F0-9]{40}(?:[=~,]|$)",p[2])):
            (active if p[0] in ids else other).add(p[2][1:41])
    if not active:
        raise ValueError("Не подтверждён входной узел Tor")
    # Если системный Tor уже использует другой guard, резерв предпочитает его.
    for identity in sorted(other-active) + sorted(active):
        try:
            desc=command(stream,b"GETINFO ns/id/"+identity.encode()).decode().splitlines()
        except RuntimeError:
            continue
        if not any({"s","Guard","Running","Valid"}.issubset(row.split()) for row in desc):
            continue
        for row in desc:
            p=row.split()
            if p[:1]==["r"] and len(p)>=8:
                addr=ipaddress.IPv4Address(p[-3])
                port=int(p[-2])
                if addr.is_global and 0<port<=65535:
                    return ["EntryNodes $"+identity, "StrictNodes 1", "FascistFirewall 1",
                            f"ReachableAddresses accept {addr}:{port}, reject *:*", "ClientUseIPv6 0"]
    raise ValueError("Нет разрешённого входного узла")


def prepare(root, options):
    data=root/"data"
    data.mkdir(mode=0o700)
    if not options[0].startswith("UseBridges"):
        for name in ("cached-certs","cached-microdesc-consensus","cached-microdescs","cached-microdescs.new"):
            src=Path("/var/lib/tor")/name
            if src.is_file():
                shutil.copyfile(src,data/name)
    lines=["ClientOnly 1","SafeLogging 1","AvoidDiskWrites 1","Log err stderr",
           f"DataDirectory {data}",f"SocksPort unix:{root}/socks IsolateSOCKSAuth OnionTrafficOnly",
           f"ControlSocket {root}/control","CookieAuthentication 1",f"CookieAuthFile {root}/control.authcookie",
           f"__OwningControllerProcess {os.getpid()}",*options]
    (root/"torrc").write_text("\n".join(lines)+"\n",encoding="ascii")


def guard_repair(root, reset):
    with controller(root) as (_,stream):
        if reset:
            command(stream,b"SETCONF DisableNetwork=1")
            command(stream,b"SETCONF DisableNetwork=0")
            return False
        rows=command(stream,b"GETINFO orconn-status").splitlines()
        return any(row.split()[-1:]==[b"CONNECTED"] for row in rows)


async def repair(root):
    # Короткий сбой может пережить старая цепочка. Длинный убирает накопленный
    # TCP backoff только в резервном процессе. Живую новую OR-связь сохраняем.
    await asyncio.sleep(12)
    until=time.monotonic()+90
    reset=True
    while time.monotonic()<until:
        try:
            if await asyncio.to_thread(guard_repair,root,reset):
                return
        except (OSError,RuntimeError):
            pass
        await asyncio.sleep(6)
        try:
            if await asyncio.to_thread(guard_repair,root,False):
                return
        except (OSError,RuntimeError):
            pass
        reset=True


async def relay(reader,writer,host,root,uid,clients):
    task=asyncio.current_task()
    foreign=writer.get_extra_info("socket").getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12)
    remote=None
    pumps=[]
    try:
        if struct.unpack("3i",foreign)[1]!=uid or len(clients)>=12:
            return
        clients.add(task)
        size=(await asyncio.wait_for(reader.readexactly(1),3))[0]
        tag=await asyncio.wait_for(reader.readexactly(size),3)
        if not re.fullmatch(rb"(?:air-standby-)?[0-9a-f]{48}",tag):
            return
        async def dial():
            while not (root/"socks").is_socket():
                await asyncio.sleep(.1)
            return await tor_stream(host,tag,asyncio.open_unix_connection(str(root/"socks")))
        # The caller sends no application bytes before the acknowledgement.
        # Stop a pending Tor SOCKS handshake immediately if its caller left.
        connecting=asyncio.create_task(dial())
        disconnected=asyncio.create_task(reader.read(1))
        try:
            done,_=await asyncio.wait([connecting,disconnected],timeout=95,return_when=asyncio.FIRST_COMPLETED)
        finally:
            for pending in (connecting,disconnected):
                if not pending.done():
                    pending.cancel()
            result,_=await asyncio.gather(connecting,disconnected,return_exceptions=True)
            if isinstance(result,tuple):
                source,remote=result
        if disconnected in done or remote is None:
            return
        writer.write(b"+")
        await writer.drain()
        async def forward(src,dst):
            while chunk:=await src.read(65536):
                dst.write(chunk)
                await dst.drain()
        pumps=[asyncio.create_task(forward(reader,remote)),asyncio.create_task(forward(source,writer))]
        await asyncio.wait(pumps,return_when=asyncio.FIRST_COMPLETED)
    except (OSError,asyncio.TimeoutError,asyncio.IncompleteReadError):
        pass
    finally:
        clients.discard(task)
        writer.close()
        if remote:
            remote.close()
        for t in pumps:
            t.cancel()
        await asyncio.gather(*pumps,return_exceptions=True)


async def serve():
    master=socket.socket(fileno=os.dup(0))
    uid=struct.unpack("3i",master.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))[1]
    master.setblocking(False)
    reader,writer=await asyncio.open_unix_connection(sock=master,limit=256)
    child=server=repairing=None
    clients=set()
    waits=[]
    loop=asyncio.get_running_loop()
    root=Path(os.environ["RUNTIME_DIRECTORY"])
    try:
        host=(await asyncio.wait_for(reader.readline(),4)).strip()
        if not re.fullmatch(rb"[a-z2-7]{56}\.onion",host):
            return
        with controller(SYSTEM) as (sock,stream):
            command(stream,b"SETEVENTS CONF_CHANGED")
            options=policy(stream,host.decode("ascii"))
            prepare(root,options)
            event("bridge policy accepted" if options[0].startswith("UseBridges") else "guard policy accepted")
            revoked=loop.create_future()
            def changed():
                if not revoked.done():
                    revoked.set_result(True)
            loop.add_reader(sock.fileno(),changed)
            try:
                child=await asyncio.create_subprocess_exec("/usr/bin/tor","--defaults-torrc","/dev/null","-f",str(root/"torrc"),
                    stdin=asyncio.subprocess.DEVNULL,stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.DEVNULL)
                name="altnet-air-"+secrets.token_hex(24)
                server=await asyncio.start_unix_server(lambda r,w:relay(r,w,host,root,uid,clients),path="\0"+name)
                writer.write(name.encode()+b"\n")
                await writer.drain()
                died=asyncio.create_task(child.wait())
                waits.append(died)
                while True:
                    message=asyncio.create_task(reader.read(1))
                    waits.append(message)
                    done,_=await asyncio.wait([message,died,revoked],return_when=asyncio.FIRST_COMPLETED)
                    if revoked in done or died in done or message.result() not in (b"D",b"U"):
                        if died in done:
                            event("Tor exited " + str(child.returncode))
                        break
                    waits.remove(message)
                    if repairing:
                        repairing.cancel()
                        await asyncio.gather(repairing,return_exceptions=True)
                        repairing=None
                    if message.result()==b"D":
                        repairing=asyncio.create_task(repair(root))
            finally:
                loop.remove_reader(sock.fileno())
    finally:
        if server:
            server.close()
            await server.wait_closed()
        pending=waits+list(clients)+([repairing] if repairing else [])
        for t in pending:
            t.cancel()
        await asyncio.gather(*pending,return_exceptions=True)
        if child and child.returncode is None:
            child.terminate()
            try:
                await asyncio.wait_for(child.wait(),3)
            except asyncio.TimeoutError:
                child.kill()
                await child.wait()
        writer.close()


if __name__=="__main__":
    try:
        asyncio.run(serve())
    except (OSError,ValueError,RuntimeError,asyncio.TimeoutError) as exc:
        # Emit the type only. Tor configuration can contain private bridge data.
        event("unavailable " + type(exc).__name__)
