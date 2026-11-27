import json, pathlib, runpy, socket, subprocess, sys
uri=sys.argv[1]
authority,pin=uri.removeprefix("onion://").split("?key=")
control=runpy.run_path("/opt/altnet-browser/Browser/altnet-linux/bridge_tor.py")["command"]
with socket.socket(socket.AF_UNIX) as sock:
    sock.settimeout(3)
    sock.connect("/run/tor/control")
    with sock.makefile("rwb",buffering=0) as stream:
        cookie=pathlib.Path("/run/tor/control.authcookie").read_bytes()
        control(stream,b"AUTHENTICATE "+cookie.hex().encode())
        streams=control(stream,b"GETINFO stream-status").decode().splitlines()
        circuits=control(stream,b"GETINFO circuit-status").decode().splitlines()
        ids={parts[2] for row in streams if len(parts:=row.split())>=4
             and parts[1]=="SUCCEEDED" and parts[3]==authority}
        tor=bool(ids)
        rendezvous=any(len(parts:=row.split())>=4 and parts[0] in ids and parts[1]=="BUILT"
                       and "PURPOSE=HS_CLIENT_REND" in parts for row in circuits)
matched=False
for row in pathlib.Path("/proc/net/unix").read_text().splitlines():
    path=row.split()[-1]
    if "/altnet-invite-" not in path or not path.endswith("/admin.sock"):continue
    proc=subprocess.run(["yggdrasilctl","-endpoint=unix://"+path,"-json","getpeers"],capture_output=True,timeout=3)
    if proc.returncode:continue
    peers=json.loads(proc.stdout)["peers"]
    matched |= any(p.get("key")==pin and p.get("remote","").split("?")[0].endswith("/"+authority)
                   for p in peers.values())
print(json.dumps(dict(torStream=tor,rendezvous=rendezvous,pinnedYggdrasilPeer=matched)))
