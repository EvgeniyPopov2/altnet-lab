import json, pathlib, re, runpy, socket, subprocess, sys
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
        if sys.argv[2:] == ["--guards"]:
            # Сопоставить только первый релей цепочек проверяемого onion.
            guards={parts[2].split(",")[0][1:41] for row in circuits if len(parts:=row.split())>=4
                    and parts[0] in ids and parts[1]=="BUILT" and parts[2].startswith("$")}
            endpoints=set()
            for guard in guards:
                if not re.fullmatch("[A-Fa-f0-9]{40}",guard):
                    continue
                try:
                    descriptor=control(stream,b"GETINFO ns/id/"+guard.encode())
                except RuntimeError:
                    # Мост может отсутствовать в публичном консенсусе.
                    continue
                for row in descriptor.decode().splitlines():
                    fields=row.split()
                    if fields[:1]==["r"] and len(fields)>=8:
                        endpoints.add(fields[-3]+":"+fields[-2])
                    elif fields[:1]==["a"] and len(fields)==2:
                        endpoints.add(fields[1])
            listing=subprocess.check_output(["ss","-Htnep","state","established"],text=True)
            sockets=[int(m[1]) for row in listing.splitlines() if len(row.split())>=4 and row.split()[3] in endpoints
                     and '("tor",' in row and (m:=re.search(r"\bino:(\d+)",row))]
            print(json.dumps(dict(guards=len(guards),inodes=sockets)))
            sys.exit(0)
pinned_workers=0
for path in {row.split()[-1] for row in pathlib.Path("/proc/net/unix").read_text().splitlines()}:
    if "/altnet-invite-" not in path or not path.endswith("/admin.sock"):continue
    proc=subprocess.run(["yggdrasilctl","-endpoint=unix://"+path,"-json","getpeers"],capture_output=True,timeout=3)
    if proc.returncode:continue
    peers=json.loads(proc.stdout)["peers"]
    pinned_workers += any(p.get("key")==pin and p.get("remote","").split("?")[0].endswith("/"+authority)
                   for p in peers.values())
if sys.argv[2:]==["--counts"]:
    succeeded=[p for row in streams if len(p:=row.split())>=4 and p[1]=="SUCCEEDED" and p[3]==authority]
    print(json.dumps(dict(streams=len(succeeded),circuits=len(ids),pinnedWorkers=pinned_workers)))
else:
    print(json.dumps(dict(torStream=tor,rendezvous=rendezvous,pinnedYggdrasilPeer=bool(pinned_workers))))
