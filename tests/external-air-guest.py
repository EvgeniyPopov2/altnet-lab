"""Установка и голосовой звонок со стороны одноразовой Ubuntu в GitHub Actions."""
from contextlib import ExitStack
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import secrets
import socket
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import urlparse
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
BROWSER = "/opt/altnet-browser/altnet-browser"
LINUX = Path(BROWSER).parent / "Browser/altnet-linux"
DIGEST = "402ce51fec0ff5f8d8b602f2dde01ebc338359370b9c69127f281c83317ac2c0"


def stage(name):
    print(name, flush=True)


def run(*cmd):
    return subprocess.check_output(cmd, text=True).strip()


def install(cfg):
    assert not Path(BROWSER).exists()
    for package in ("tor","yggdrasil"):
        check = subprocess.run(["dpkg-query","-W","-f=${db:Status-Status}",package],capture_output=True)
        assert check.stdout != b"installed", "Transport already installed"
    stage("Ubuntu 22.04: fresh AltNet, Tor and Yggdrasil")
    assert run("lsb_release","-rs") == "22.04"
    url = cfg["asset"]
    assert urlparse(url).scheme == "https" and urlparse(url).hostname=="release-assets.githubusercontent.com"
    with tempfile.TemporaryDirectory() as tmp:
        file = Path(tmp)/"browser.tar.gz"
        digest = hashlib.sha256()
        with urlopen(url,timeout=90) as remote, file.open("wb") as out:
            while data := remote.read(1024*1024):
                digest.update(data)
                out.write(data)
        builder = runpy.run_path(str(HERE/"external-air-build.py"))
        assert digest.hexdigest() == builder["BASE_SHA256"]
        candidate = Path(tmp)/"candidate.tar.gz"
        assert builder["build"](file, candidate, HERE.parent/"browser/tor-browser/linux",
                                HERE.parent/"systemd/altnet-onion-entry.service") == DIGEST
        file = candidate
        subprocess.run(["sudo","-n","sh",str(HERE.parent/"scripts/install-ubuntu-browser.sh"),str(file),DIGEST],check=True)
    assert Path("/opt/altnet-browser/BUILD-SHA256").read_text().strip() == DIGEST
    for unit in ("tor@default","yggdrasil","altnet-fast-ingress","altnet-entry-control.socket"):
        assert run("systemctl","is-active",unit)=="active"
    assert not json.loads(run("sudo","-n","yggdrasilctl","-json","getpeers"))["peers"]
    stage("Installed verified archive; system transports active; zero initial peers")


def exchange(cfg, slot, value=None, timeout=180):
    assert re.fullmatch(r"[a-z2-7]{56}\.onion",cfg["onion"]) and re.fullmatch(r"[A-Za-z0-9_-]{40,50}",cfg["token"])
    # Передаём заголовок и адрес только на stdin curl. Никаких приглашений в журнале Actions.
    opts = 'url = "http://'+cfg["onion"]+'/'+slot+'"\nheader = "Authorization: Bearer '+cfg["token"]+'"\n'
    port=cfg.get("control_port",9050)
    cmd = ["curl","-q","--noproxy","","--socks5-hostname",f"127.0.0.1:{port}","--silent","--fail","--config","-"]
    if value is not None:
        opts += "data = "+json.dumps(json.dumps(value,separators=(",",":")))+"\n"
    until=time.monotonic()+timeout
    failures=0
    codes={}
    coordinated="coordinator" in cfg
    while time.monotonic()<until:
        options=opts
        if coordinated:
            isolation=cfg.setdefault("control_isolation",secrets.token_hex(12))
            options+='proxy-user = "'+isolation+':x"\n'
        budget=25 if coordinated and failures%3==2 else 15
        reply=subprocess.run([*cmd[:-2],"--max-time",str(budget),*cmd[-2:]],
                             input=options,text=True,capture_output=True)
        codes[reply.returncode]=codes.get(reply.returncode,0)+1
        if reply.returncode==0 and reply.stdout:
            return json.loads(reply.stdout)
        if reply.returncode:
            failures+=1
            cfg["control_isolation"]=secrets.token_hex(12)
            if failures%2==0 and "coordinator" in cfg:
                cfg["coordinator"].stdin.write("R")
                cfg["coordinator"].stdin.flush()
        time.sleep(2)
    stage("QA control timeout "+slot+" curl exit codes "+json.dumps(codes))
    raise RuntimeError("Timed out at "+slot)


def wait(fn, accept, name, seconds=90):
    until=time.monotonic()+seconds
    while time.monotonic()<until:
        value=fn()
        if accept(value):
            return value
        time.sleep(.4)
    raise RuntimeError("Timed out: "+name)


def clock_offset(cfg):
    intervals = []
    for _ in range(6):
        start = time.time()
        remote = exchange(cfg,"clock")
        end = time.time()
        intervals.append((remote-end,remote-start))
    lower, upper = max(a for a,b in intervals), min(b for a,b in intervals)
    assert lower <= upper
    return (lower+upper)/2, (upper-lower)/2


def private_peer_workers():
    return set(run("pgrep","-u",str(os.getuid()),"-x","yggdrasil").splitlines())


def guard_counters(inodes):
    lines=run("sudo","-n","ss","-Htinope","state","established").splitlines()
    result={}
    for row,info in zip(lines,lines[1:]):
        inode=re.search(r"\bino:(\d+)",row)
        if not inode or int(inode[1]) not in inodes:
            continue
        values={k:int(v) for k,v in re.findall(r"\b(bytes_received|bytes_acked|backoff|rto|unacked|lost|segs_in|segs_out|bytes_retrans):(\d+)",info)}
        timer=re.search(r"timer:\(on,([\d.]+)(ms|sec|min),",row)
        if timer:
            values["retryDueMs"]=round(float(timer[1])*{"ms":1,"sec":1000,"min":60000}[timer[2]])
        result[int(inode[1])] = values
    return result


def pinned_peer_io(peer):
    return json.loads(run("sudo","-n","/usr/bin/python3","-IB",str(HERE/"external-air-route.py"),peer,"--peer-io"))


def media_counters(address):
    lines=run("ss","-Ht6ine","state","established","( sport = :17911 or dport = :17911 )").splitlines()
    sockets={}
    for row,info in zip(lines,lines[1:]):
        inode=re.search(r"\bino:(\d+)",row)
        if inode and "["+address+"]" in row:
            received=re.search(r"\bbytes_received:(\d+)",info)
            sockets[inode[1]]=int(received[1]) if received else 0
    return sockets


def trace_route(address, peer, restored, workers, old_guards, old_peer_io, old_media, markers):
    results = {}
    finished = threading.Event()
    def sample(label, probe):
        start = time.monotonic()
        while not finished.is_set() and time.monotonic()-start < 140:
            try:
                probe()
                results[label] = round(time.monotonic()-restored,2)
                return
            except (OSError, RuntimeError, subprocess.SubprocessError):
                finished.wait(.4)
    def observe_media():
        previous=set()
        timeline=results["authenticatedMediaChanges"]=[]
        while not finished.is_set() and len(timeline)<25:
            current={path.name for path in markers.iterdir() if path.name.isdecimal()}
            if previous!=current:
                timeline.append({"seconds":round(time.monotonic()-restored,2),"active":len(current)})
                previous=current
            finished.wait(.15)
    threading.Thread(target=observe_media,daemon=True).start()
    def observe_guard():
        start = time.monotonic()
        results["guardSocketsObserved"]=len(old_guards)
        if not old_guards:
            return
        results["guardBackoffBeforeRestore"]=max(s.get("backoff",0) for s in old_guards.values())
        results["guardRtoMsBeforeRestore"]=max(s.get("rto",0) for s in old_guards.values())
        # Stable per-test labels only. Relay addresses, fingerprints and socket IDs
        # must stay out of public logs. Track ACKs and payload on the *same* socket.
        traces={ino:{key:old[key] for key in ("rto","backoff","retryDueMs","unacked","lost") if key in old}
                for ino,old in old_guards.items()}
        results["guardTimeline"]=list(traces.values())
        while not finished.is_set() and time.monotonic()-start < 120:
            current = guard_counters(old_guards)
            elapsed = round(time.monotonic()-restored,2)
            if not current:
                results["guardSocketsClosed"]=elapsed
                return
            for key,label in (("bytes_received","firstGuardPayload"),("bytes_acked","firstGuardAck")):
                for ino,fields in current.items():
                    if fields.get(key,0)>old_guards[ino].get(key,0):
                        results.setdefault(label,elapsed)
                        traces[ino].setdefault(label,elapsed)
            if all("firstGuardAck" in item and "firstGuardPayload" in item for item in traces.values()):
                return
            time.sleep(.2)
    threading.Thread(target=observe_guard,daemon=True).start()
    def media_bytes():
        if not any(n > old_media.get(inode,0) for inode,n in media_counters(address).items()):
            raise RuntimeError("Waiting for incoming bytes on a media socket")
    def pinned():
        counts=json.loads(run("sudo","-n","/usr/bin/python3","-IB",str(HERE/"external-air-route.py"),peer,"--counts"))
        elapsed=round(time.monotonic()-restored,2)
        if counts["privateOrConnections"]:
            results.setdefault("privateOrListed",elapsed)
        if counts["privateGuardTunnels"]:
            results.setdefault("privateGuardTunnelObserved",elapsed)
        if not counts["streams"] or not counts["pinnedWorkers"]:
            raise RuntimeError("Waiting for the pinned peer")
    def inbound_mesh_bytes():
        elapsed = time.monotonic() - restored
        for key, (received, uptime) in pinned_peer_io(peer).items():
            previous = old_peer_io.get(key)
            if received and (previous is None or received > previous[0] or uptime + 1 < previous[1] + elapsed):
                return
        raise RuntimeError("Waiting for new bytes on the pinned Yggdrasil link")
    def worker_changed():
        current=set(subprocess.run(["pgrep","-u",str(os.getuid()),"-x","yggdrasil"],capture_output=True,text=True).stdout.split())
        if not current-workers:
            raise RuntimeError("Waiting for renewed mesh worker")
    # Purely local observations: a test probe must not wake up Tor or prime
    # Yggdrasil route discovery on behalf of the application.
    for label, probe in (("meshWorkerLaunched", worker_changed),
                         ("pinnedPeerObserved", pinned), ("firstPinnedPeerPayload", inbound_mesh_bytes),
                         ("mediaPortBytes", media_bytes)):
        threading.Thread(target=sample,args=(label,probe),daemon=True).start()
    return results, finished


def measure_call(ui, cfg, address, suffix):
    try:
        wait(lambda:ui("airview"),lambda s:s["phase"]=="connected" and len(s["people"])==2,"joining Air",160)
    except RuntimeError:
        stage("Call status "+json.dumps(ui("air_health")))
        raise
    assert any(("["+address+"]") in row and ":17911" in row for row in run("ss","-Ht6n","state","established").splitlines())
    ui("record")
    exchange(cfg,"recording"+suffix,True)
    exchange(cfg,"play"+suffix)
    ui("play_duplex")
    wait(lambda:ui("airview"),lambda s:any(p["name"]=="Эфир Маяк" and p["speaking"] for p in s["people"]),"node1 speaking",65)
    wait(lambda:ui("marker",hz=440),lambda level:level>700,"remote speech marker on the runner speaker",65)
    routes=ui("air_routes",peer=address)
    measured=ui("measure")
    assert measured["samples"]>=16000 and measured["Hz440"]>700 and measured["Hz440"]>5*measured["Hz880"]
    exchange(cfg,"result"+suffix,measured)
    verdict=exchange(cfg,"done"+suffix)
    assert isinstance(verdict,dict) and verdict["Hz880"]>700 and verdict["Hz880"]>5*verdict["Hz440"] and verdict["samples"]>=16000
    ui("stop")
    return measured, verdict, routes["17911"]["inode"]


def call(cfg):
    with tempfile.TemporaryDirectory(prefix="alt-air-") as tmp, ExitStack() as stack:
        proc=subprocess.Popen(["dbus-run-session","--","xvfb-run","-a","-s","-screen 0 1440x1000x24 -nolisten tcp",
            "/usr/bin/python3","-Bu",str(HERE/"ubuntu-identity-guest.py"),"node2",tmp+"/audio","--browser",BROWSER],
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
        def close():
            proc.stdin.close()
            try:proc.wait(timeout=30)
            except subprocess.TimeoutExpired:
                proc.terminate()
                proc.wait(timeout=10)
        stack.callback(close)
        assert json.loads(proc.stdout.readline())=={"ready":"node2"}
        def ui(op,**data):
            print(json.dumps(dict(op=op,**data)),file=proc.stdin,flush=True)
            reply=json.loads(proc.stdout.readline())
            if "ok" not in reply:
                if op == "air_routes" and str(reply.get("error","")).startswith("Не найден единственный активный голосовой поток"):
                    raise RuntimeError("UI did not complete air_routes: active media socket ambiguous")
                raise RuntimeError("UI did not complete "+op)
            return reply["ok"]
        assert ui("network_storage")==dict(issuers=[],localMemberships=0,adminConfiguration=False)
        stage("Native browser ready; requesting a new invitation from node1")
        exchange(cfg,"ready",True,timeout=330)
        link=exchange(cfg,"invite")
        assert isinstance(link,str) and link.startswith("alt://join/v3/")
        address,_,inviter_id,_,_,peers=runpy.run_path(str(LINUX/"join_link.py"))["decode"](link)
        peer,=peers
        assert peer.startswith("onion://")
        assert ui("before_register",link=link,desktop=True)
        password=secrets.token_urlsafe(24)
        first_pid=ui("browser_pid")
        identity=ui("register",name="Гость Стриж",callsign="Гость Стриж",fastName="Стриж",fastCallsign="Эфир Стриж",
           deviceName="Ubuntu GitHub",password=password)
        del link
        ui("open_join",pending=True)
        claim=wait(lambda:ui("link_state"),lambda s:bool(s.get("code")),"guest confirmation",180)
        exchange(cfg,"claim",claim["code"])
        # The host can spend up to 420 s receiving the initial signed request
        # through a cold onion service. Approval must still be received here.
        wait(lambda:ui("link_state"),lambda s:s.get("joined"),"host approval",540)
        membership=ui("network_storage")
        assert membership["localMemberships"]==1
        evidence=json.loads(run("sudo","-n","/usr/bin/python3","-IB",str(HERE/"external-air-route.py"),peer))
        assert evidence==dict(torStream=True,rendezvous=True,pinnedYggdrasilPeer=True)
        stage("Admitted by node1; signed invitation, Tor rendezvous and live Yggdrasil peer verified")
        coordinator=subprocess.Popen(["sudo","-n","-u","debian-tor","/usr/bin/python3","-IBu","-c",
                          (HERE/"external-air-control.py").read_text()],stdin=subprocess.PIPE,stdout=subprocess.PIPE,
                          stderr=subprocess.DEVNULL,text=True)
        def stop_coordinator():
            coordinator.stdin.close()
            coordinator.wait(timeout=12)
        stack.callback(stop_coordinator)
        coordinator.stdin.write(urlparse(peer).hostname+"\n")
        coordinator.stdin.flush()
        cfg["control_port"]=int(coordinator.stdout.readline())
        assert 0<cfg["control_port"]<=65535 and cfg["control_port"]!=9050
        cfg["coordinator"]=coordinator
        ui("airclick",selector="[data-network-call]")
        first_rx,first_tx,first_socket=measure_call(ui,cfg,address,"")
        original_room=ui("air_room")
        original_worker,=ui("air_workers")
        assert ui("has_capture") and ui("airview")["phase"]=="connected"
        previous_duplex = None
        stage("Runner TCP capabilities "+json.dumps({"kernel":os.uname().release,
              "perNetnsRtoMax":Path("/proc/sys/net/ipv4/tcp_rto_max_ms").is_file()}))
        def interrupt(suffix,prior_socket,seconds):
            nonlocal previous_duplex
            offset, clock_error = clock_offset(cfg)
            def route_counts():
                return json.loads(run("sudo","-n","/usr/bin/python3","-IB",str(HERE/"external-air-route.py"),peer,"--counts"))
            # Prove both authenticated paths before the first cut. Subsequent
            # cuts use whatever path the client rebuilt in ordinary operation.
            before_cut=route_counts()
            if not suffix:
                try:
                    before_cut=wait(route_counts, lambda v:v["pinnedWorkers"]==2 and v["independentTor"] and v["privateGuardTunnels"]>=1,
                                    "two independent authenticated Tor processes", 140)
                except RuntimeError:
                    stage("Reserve readiness " + json.dumps(route_counts()))
                    events=run("sudo","-n","journalctl","-b","--no-pager","-o","cat","-g","^AltNet-Air-Tor ")
                    for reason in sorted(set(events.splitlines())):
                        if re.fullmatch(r"AltNet-Air-Tor (?:bridge policy accepted|guard policy accepted|Tor exited -?\d+|unavailable [A-Za-z]{2,30})",reason):
                            stage(reason)
                    raise
            peer_workers = private_peer_workers()
            assert 1 <= len(peer_workers) <= 2
            guards=json.loads(run("sudo","-n","/usr/bin/python3","-IB",str(HERE/"external-air-route.py"),peer,"--guards"))
            before_cut["guardRelays"] = guards["guards"]
            assert ui("air_routes",peer=address)["17911"]["inode"] == prior_socket
            before_cut.update(route_counts())
            watcher=subprocess.Popen(["sudo","-n","/usr/bin/python3","-IBu",str(HERE/"external-air-route.py"),peer,"--watch-standby"],
                                     stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
            stack.callback(watcher.stdin.close)
            before_cut["observedStandbys"]=int(watcher.stdout.readline().strip() or "0")
            standby_inodes=set(media_counters(address)) - {prior_socket}
            if previous_duplex is not None:
                before_cut["secondsSincePreviousDuplex"]=round(time.monotonic()-previous_duplex,2)
            stage("Pre-cut transport "+json.dumps(before_cut))
            stage("Interrupting all non-loopback traffic during the established call")
            with runpy.run_path(str(HERE/"external-air-outage.py"))["disconnected"]() as counters:
                until=time.monotonic()+seconds
                lost=wait(lambda:ui("airview"),lambda s:s["phase"]=="waiting" and len(s["people"])==1 and not s["people"][0]["speaking"],"peer loss",40)
                wait(lambda:ui("has_capture"),lambda active:not active,"offline microphone release",8)
                assert prior_socket not in ui("air_media_inodes"), "Previous media socket still present on runner while offline"
                lost_at=counters()["seconds"]
                ui("recovery_audio_start")
                time.sleep(max(0,until-time.monotonic()))
                outage=counters()
                assert outage["seconds"]>=seconds-.2 and outage["droppedPackets"]["output"]>0 and outage["droppedPackets"]["input"]>0
                assert ui("airview")["phase"]=="waiting" and not ui("has_capture") and ui("recovery_heard") is None
                old_media = media_counters(address)
                old_peer_io = pinned_peer_io(peer)
                old_guards = guard_counters(guards["inodes"])
            outage.update(detectedAfterSeconds=lost_at,phase=lost["phase"],microphoneReleased=True)
            restore = counters.restoration
            outage["seconds"] = restore["blackoutSeconds"]
            restored_at = restore["mono"]
            stages, stop_trace = trace_route(address,peer,restored_at,peer_workers,old_guards,old_peer_io,old_media,Path(tmp)/"audio/active-media")
            stage("Network restored; waiting for the existing room without user interaction")
            wait(lambda:ui("airview"),lambda s:s["phase"]=="connected" and len(s["people"])==2,"automatic reconnection",120)
            reconnect_seconds=round(time.monotonic()-restored_at,1)
            assert ui("browser_pid")==first_pid and ui("air_room")==original_room
            wait(lambda:ui("has_capture"),bool,"automatic capture resume",10)
            route=json.loads(run("sudo","-n","/usr/bin/python3","-IB",str(HERE/"external-air-route.py"),peer))
            assert route==dict(torStream=True,rendezvous=True,pinnedYggdrasilPeer=True)
            local_heard = wait(lambda:ui("recovery_heard"),bool,"resumed PCM on runner",60)
            acknowledged = wait(lambda:ui("recovery_peer_heard"),bool,"node1 audio acknowledgement at runner",60)
            stage("Duplex proved in the audio channel "+json.dumps({
                "runnerFirstPCM":round(local_heard-restore["epoch"],2),
                "node1ClockAtRestore":round(restore["epoch"]+offset,4),
                "clockError":round(clock_error+restore["uncertainty"]+.05,2),
                "remoteAudioAcknowledgement":round(acknowledged-restore["epoch"],2)}))
            remote_heard = exchange(cfg,"node1Heard"+suffix)
            pcm = {"node1_to_actions":round(local_heard-restore["epoch"],2),
                   "actions_to_node1":round(remote_heard-offset-restore["epoch"],2)}
            previous_duplex = restored_at + max(pcm.values())
            try:
                output,_=watcher.communicate(timeout=5)
                counter=json.loads(output) if watcher.returncode==0 else {}
                stages["preCutStandbyForwarded"]=counter.get("forwarded")
                stages["preCutStandbyBytes"]=[counter.get("bytesWritten"),counter.get("bytesRead")]
            except (ValueError, subprocess.TimeoutExpired):
                # This read-only observer has its own deadline. Keep both measured
                # PCM times when optional relay accounting is unavailable.
                stages["preCutStandbyForwarded"]=None
            stop_trace.set()
            after=json.loads(run("sudo","-n","/usr/bin/python3","-IB",str(HERE/"external-air-route.py"),peer,"--guards"))
            stages["retainedGuardSockets"] = len(set(guards["inodes"]) & set(after["inodes"]))
            stages["entryBeforeCut"] = before_cut
            after_workers = private_peer_workers()
            stages["privatePeerRenewed"] = after_workers != peer_workers
            stages["survivingPrivateWorkers"] = len(after_workers & peer_workers)
            error = round(clock_error+restore["uncertainty"]+.05,2)
            assert min(pcm.values()) >= -error
            exchange(cfg,"heardBoth"+suffix,True)
            ui("recovery_audio_stop")
            stage("Resumed speaker PCM "+json.dumps(dict(seconds=pcm,node1TimingError=error,stages=stages,ui=reconnect_seconds)))
            resumed_rx,resumed_tx,resumed_socket=measure_call(ui,cfg,address,"Resume"+suffix)
            assert prior_socket!=resumed_socket
            stages.update(mediaStandbysBeforeCut=len(standby_inodes),usedWarmMedia=resumed_socket in standby_inodes)
            stage("Automatic resume: "+json.dumps({"secondsAfterRestore":reconnect_seconds,"signalAtNode1":resumed_tx["Hz880"],
                                                "signalAtRunner":resumed_rx["Hz440"]}))
            return ({"node1_to_actions":resumed_rx,"actions_to_node1":resumed_tx,
                     "secondsAfterRestore":reconnect_seconds,"firstSpeakerPCM":pcm,"node1TimingError":error,
                     "withinTenSeconds":max(pcm["node1_to_actions"]+.1,pcm["actions_to_node1"]+error)<=10,
                     "routeTiming":stages,"sameRoom":True,"sameProcess":True,"freshMediaSocket":True,
                     "verifiedRoute":route},outage,resumed_socket)
        automatic, outage, resumed_socket = interrupt("",first_socket,42)
        repeated, repeated_outage, second_socket = interrupt("Again",resumed_socket,54)
        third, third_outage, third_socket = interrupt("Third",second_socket,66)
        assert len({first_socket,resumed_socket,second_socket,third_socket}) == 4
        stage("Existing room recovery results "+json.dumps([
            {"blackout":fault["seconds"], "duplex":row["firstSpeakerPCM"], "withinTenSeconds":row["withinTenSeconds"]}
            for row,fault in ((automatic,outage),(repeated,repeated_outage),(third,third_outage))]))
        stage("Duplex audio resumed in the same room; verifying separate restart/redial scenario")
        exchange(cfg,"restored",True)
        ui("restart")
        assert ui("is_locked") and ui("browser_pid")!=first_pid
        wait(lambda:ui("air_workers"),lambda ids:original_worker not in ids,"previous voice process exited",6)
        assert ui("unlock",password=password)==identity
        assert ui("network_storage")==membership
        ui("contact_home")
        saved=wait(lambda:ui("contact_labels"),lambda v:"Эфир Маяк" in v.get(inviter_id,""),"saved inviter")
        saved_id,=saved
        assert saved_id==inviter_id
        wait(lambda:json.loads(run("sudo","-n","/usr/bin/python3","-IB",str(HERE/"external-air-route.py"),peer)),
             lambda route:all(route.values()),"restored authenticated route",300)
        exchange(cfg,"redial")
        # После полного перезапуска локальный пир может подняться раньше, чем построится
        # сквозной маршрут до службы звонков собеседника. Проверка не передаёт приглашение.
        def signalling_ready():
            try:
                with socket.create_connection((address,17910),timeout=2):
                    return True
            except OSError:
                return False
        wait(signalling_ready,bool,"node1 signalling service after restarting both apps",200)
        stage("Saved route reaches node1 signalling service after restart")
        ui("air_server")
        if saved_id not in ui("airview")["selected"]:
            ui("airclick",selector='[data-air-contact="'+saved_id+'"]')
        assert ui("airview")["selected"]==[saved_id]
        assert not ui("has_capture")
        exchange(cfg,"readyToRedial",True)
        ui("airclick",selector='[data-air-action="create"]')
        measured,verdict,new_socket=measure_call(ui,cfg,address,"2")
        assert len({new_socket,third_socket,second_socket,resumed_socket,first_socket})==5
        if ui("airview")["phase"]!="closed":
            ui("airclick",selector='[data-air-action="leave"]')
        wait(lambda:ui("has_capture"),lambda active:not active,"release microphone")
        exchange(cfg,"left",True)
        data={"node1_to_actions":measured,"actions_to_node1":verdict,"installedArchiveSHA256":DIGEST,
              "automaticResume":automatic,"secondAutomaticResume":repeated,"secondOutage":repeated_outage,
              "thirdAutomaticResume":third,"thirdOutage":third_outage,
              "initialAudio":{"node1_to_actions":first_rx,"actions_to_node1":first_tx},"outage":outage,
              "freshMediaSocket":True,"sameAccount":True,"sameMembership":True,"redialFromSavedContact":True,
              "zeroInitialPeers":True,"desktopInvitation":True,"torRendezvous":True,
              "pinnedYggdrasilPeer":True,"speakerIndicatorsAtBothEnds":True}
        rounds = (automatic,repeated,third)
        data["tenSecondTarget"] = {"met":sum(row["withinTenSeconds"] for row in rounds),"tested":len(rounds)}
        reserve_ready = all(row["routeTiming"]["entryBeforeCut"]["pinnedWorkers"]==2
                            and row["routeTiming"]["entryBeforeCut"]["independentTor"]
                            and row["routeTiming"]["entryBeforeCut"]["privateGuardTunnels"]>=1 for row in rounds)
        data["reserveReadyAtEveryCut"] = reserve_ready
        stage(json.dumps(data))
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf8") as out:
            print("ten_seconds=" + str(reserve_ready and all(row["withinTenSeconds"] for row in rounds)).lower(), file=out)
        with open(os.environ["GITHUB_STEP_SUMMARY"],"a") as out:
            print("| Обрыв, с | Звук на node1, с | Звук на Ubuntu, с | Проверенные пиры до обрыва | Использован запасной TLS | В пределах 10 с с учётом погрешности |",file=out)
            print("|---:|---:|---:|---:|:---:|:---:|",file=out)
            for fault, row in zip((outage,repeated_outage,third_outage),rounds):
                audio=row["firstSpeakerPCM"]
                print(f'| {fault["seconds"]} | {audio["actions_to_node1"]} | {audio["node1_to_actions"]} | {row["routeTiming"]["entryBeforeCut"]["pinnedWorkers"]} | {row["routeTiming"]["usedWarmMedia"]} | {row["withinTenSeconds"]} |',file=out)
            print("### AltNet · external Ubuntu 22.04\n\n```json\n"+json.dumps(data,indent=2)+"\n```",file=out)
        assert all(max(row["firstSpeakerPCM"].values())+row["node1TimingError"]<60 for row in rounds), "Audio recovery exceeded one minute"


if __name__=="__main__":
    cfg=json.loads(os.environ.pop("QA_TRANSFER"))
    try:
        if sys.argv[1]=="install": install(cfg)
        elif sys.argv[1]=="call":call(cfg)
        else:raise ValueError("Unknown stage")
    except Exception as exc:
        # Контекст сетевой ошибки может содержать временный URL или персональную ссылку.
        import traceback
        frame=traceback.extract_tb(exc.__traceback__)[-1]
        safe=str(exc) if type(exc) is RuntimeError and str(exc).startswith(("UI did not complete ","Timed out")) else type(exc).__name__
        trace=" ".join(f"{Path(f.filename).name}:{f.lineno}" for f in traceback.extract_tb(exc.__traceback__)
                       if Path(f.filename).parent==HERE)
        sys.exit(f"QA failed at {Path(frame.filename).name}:{frame.lineno}: {safe} [{trace}]")

