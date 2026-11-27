"""Установка и голосовой звонок со стороны одноразовой Ubuntu в GitHub Actions."""
from contextlib import ExitStack
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import secrets
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlparse
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
BROWSER = "/opt/altnet-browser/altnet-browser"
LINUX = Path(BROWSER).parent / "Browser/altnet-linux"
DIGEST = "eb78aae8c2dc7e665c83de6d041f2df554d2d5bb50192805feb3aeaaf37bad09"


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
        assert digest.hexdigest() == DIGEST
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
    cmd = ["curl","-q","--noproxy","","--socks5-hostname","127.0.0.1:9050","--max-time","15","--silent","--fail","--config","-"]
    if value is not None:
        opts += "data = "+json.dumps(json.dumps(value,separators=(",",":")))+"\n"
    until=time.monotonic()+timeout
    while time.monotonic()<until:
        reply=subprocess.run(cmd,input=opts,text=True,capture_output=True)
        if reply.returncode==0 and reply.stdout:
            return json.loads(reply.stdout)
        time.sleep(2)
    raise RuntimeError("Timed out at "+slot)


def wait(fn, accept, name, seconds=90):
    until=time.monotonic()+seconds
    while time.monotonic()<until:
        value=fn()
        if accept(value):
            return value
        time.sleep(.4)
    raise RuntimeError("Timed out: "+name)


def measure_call(ui, cfg, address, suffix):
    wait(lambda:ui("airview"),lambda s:s["phase"]=="connected" and len(s["people"])==2,"joining Air",160)
    routes=ui("air_routes")
    assert "17911" in routes
    assert any(("["+address+"]") in row and ":17911" in row for row in run("ss","-Ht6n","state","established").splitlines())
    ui("record")
    exchange(cfg,"recording"+suffix,True)
    exchange(cfg,"play"+suffix)
    ui("play_room")
    wait(lambda:ui("airview"),lambda s:any(p["name"]=="Эфир Маяк" and p["speaking"] for p in s["people"]),"node1 speaking",65)
    time.sleep(2)
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
            if "ok" not in reply:raise RuntimeError("UI did not complete "+op)
            return reply["ok"]
        assert ui("network_storage")==dict(issuers=[],localMemberships=0,adminConfiguration=False)
        stage("Native browser ready; requesting a new invitation from node1")
        exchange(cfg,"ready",True)
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
        wait(lambda:ui("link_state"),lambda s:s.get("joined"),"host approval",300)
        membership=ui("network_storage")
        assert membership["localMemberships"]==1
        evidence=json.loads(run("sudo","-n","/usr/bin/python3","-IB",str(HERE/"external-air-route.py"),peer))
        assert evidence==dict(torStream=True,rendezvous=True,pinnedYggdrasilPeer=True)
        stage("Admitted by node1; signed invitation, Tor rendezvous and live Yggdrasil peer verified")
        ui("airclick",selector="[data-network-call]")
        first_rx,first_tx,first_socket=measure_call(ui,cfg,address,"")
        assert ui("has_capture") and ui("airview")["phase"]=="connected"
        exchange(cfg,"armed",True)
        exchange(cfg,"cut")
        stage("Interrupting all non-loopback traffic during the established call")
        with runpy.run_path(str(HERE/"external-air-outage.py"))["disconnected"]() as counters:
            until=time.monotonic()+30
            lost=wait(lambda:ui("airview"),lambda s:s["phase"]=="waiting" and len(s["people"])==1 and not s["people"][0]["speaking"],"peer loss",40)
            wait(lambda:ui("has_capture"),lambda active:not active,"offline microphone release",8)
            lost_at=counters()["seconds"]
            time.sleep(max(0,until-time.monotonic()))
            outage=counters()
            assert outage["seconds"]>=29 and outage["droppedPackets"]["output"]>0 and outage["droppedPackets"]["input"]>0
            assert ui("airview")["phase"]=="waiting" and not ui("has_capture")
        outage.update(detectedAfterSeconds=lost_at,phase=lost["phase"],microphoneReleased=True)
        stage("Network restored; restarting the native client with its existing profile")
        exchange(cfg,"restored",True)
        ui("restart")
        assert ui("is_locked") and ui("browser_pid")!=first_pid
        assert ui("unlock",password=password)==identity
        assert ui("network_storage")==membership
        ui("contact_home")
        saved=wait(lambda:ui("contact_labels"),lambda v:"Эфир Маяк" in v.get(inviter_id,""),"saved inviter")
        saved_id,=saved
        assert saved_id==inviter_id
        wait(lambda:json.loads(run("sudo","-n","/usr/bin/python3","-IB",str(HERE/"external-air-route.py"),peer)),
             lambda route:all(route.values()),"restored authenticated route",300)
        exchange(cfg,"redial")
        ui("air_server")
        if saved_id not in ui("airview")["selected"]:
            ui("airclick",selector='[data-air-contact="'+saved_id+'"]')
        assert ui("airview")["selected"]==[saved_id]
        assert not ui("has_capture")
        ui("airclick",selector='[data-air-action="create"]')
        measured,verdict,new_socket=measure_call(ui,cfg,address,"2")
        assert new_socket!=first_socket
        if ui("airview")["phase"]!="closed":
            ui("airclick",selector='[data-air-action="leave"]')
        wait(lambda:ui("has_capture"),lambda active:not active,"release microphone")
        exchange(cfg,"left",True)
        data={"node1_to_actions":measured,"actions_to_node1":verdict,"installedArchiveSHA256":DIGEST,
              "initialAudio":{"node1_to_actions":first_rx,"actions_to_node1":first_tx},"outage":outage,
              "freshMediaSocket":True,"sameAccount":True,"sameMembership":True,"redialFromSavedContact":True,
              "zeroInitialPeers":True,"desktopInvitation":True,"torRendezvous":True,
              "pinnedYggdrasilPeer":True,"speakerIndicatorsAtBothEnds":True}
        stage(json.dumps(data))
        with open(os.environ["GITHUB_STEP_SUMMARY"],"a") as out:
            print("### AltNet · external Ubuntu 22.04\n\n```json\n"+json.dumps(data,indent=2)+"\n```",file=out)


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
        sys.exit(f"QA failed at {Path(frame.filename).name}:{frame.lineno}: {safe}")

