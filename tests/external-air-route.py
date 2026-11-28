import json, pathlib, re, runpy, select, socket, subprocess, sys, time
uri=sys.argv[1]
authority,pin=uri.removeprefix("onion://").split("?key=")
control=runpy.run_path("/opt/altnet-browser/Browser/altnet-linux/bridge_tor.py")["command"]
def sample(root,watch=False):
    with socket.socket(socket.AF_UNIX) as sock:
        sock.settimeout(3)
        sock.connect(str(root/"control"))
        with sock.makefile("rwb",buffering=0) as stream:
            cookie=(root/"control.authcookie").read_bytes()
            control(stream,b"AUTHENTICATE "+cookie.hex().encode())
            streams=control(stream,b"GETINFO stream-status").decode().splitlines()
            circuits=control(stream,b"GETINFO circuit-status").decode().splitlines()
            ids={parts[2] for row in streams if len(parts:=row.split())>=4
                 and parts[1]=="SUCCEEDED" and parts[3]==authority}
            tor=bool(ids)
            rendezvous=any(len(parts:=row.split())>=4 and parts[0] in ids and parts[1]=="BUILT"
                           and "PURPOSE=HS_CLIENT_REND" in parts for row in circuits)
            standby_circuits={row.split()[0] for row in circuits if row.split() and row.split()[0] in ids
                              and re.search(r'\bSOCKS_USERNAME="?air-standby-[0-9a-f]{48}"?(?: |$)',row)}
            standby_streams={p[0] for row in streams if len(p:=row.split())>=4 and p[1]=="SUCCEEDED"
                             and p[2] in standby_circuits and p[3]==authority}
            if watch:
                # Subscribe locally before the cut. Only a stream parked before it can
                # count here. Its single-byte G/R exchange is too small to pass.
                control(stream,b"SETEVENTS STREAM_BW")
                print(len(standby_streams),flush=True)
                traffic={s:[0,0] for s in standby_streams}
                forwarded=False
                if standby_streams:
                    deadline=time.monotonic()+220
                    while time.monotonic()<deadline:
                        ready,_,_=select.select([sock,sys.stdin.buffer],[],[],2)
                        if sys.stdin.buffer in ready:
                            break
                        if sock not in ready:
                            continue
                        line=stream.readline(8192)
                        if not line:
                            break
                        p=line.split()
                        if len(p)>=5 and p[:2]==[b"650",b"STREAM_BW"] and p[2].decode() in standby_streams:
                            counts=traffic[p[2].decode()]
                            counts[0]+=int(p[3])
                            counts[1]+=int(p[4])
                            if max(counts)>=256:
                                forwarded=True
                                break
                print(json.dumps({"forwarded":forwarded,"bytesWritten":sum(v[0] for v in traffic.values()),
                                  "bytesRead":sum(v[1] for v in traffic.values())}),flush=True)
                sys.exit(0)
            pid=control(stream,b"GETINFO process/pid").decode().splitlines()[0].split("=")[1]
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
            endpoints_by_process=pid
            proxied=False
            rows=[(row.split(),row) for row in listing.splitlines() if len(row.split())>=4]
            if root!=pathlib.Path("/run/tor") and pid.isdigit():
                proxy=control(stream,b"GETCONF HTTPSProxy").decode().splitlines()[0]
                port=re.fullmatch(r"HTTPSProxy=(127\.0\.0\.1:\d+)",proxy)
                if port:
                    parent=re.search(r"^PPid:\s*(\d+)",pathlib.Path("/proc",pid,"status").read_text(),re.M)[1]
                    cmd=pathlib.Path("/proc",parent,"cmdline").read_bytes().strip(b"\0").split(b"\0")
                    tor_ends={fields[2] for fields,row in rows if fields[3].replace("[::ffff:127.0.0.1]", "127.0.0.1")==port[1] and ('("tor",pid='+pid+',') in row}
                    pair=any(fields[2].replace("[::ffff:127.0.0.1]", "127.0.0.1")==port[1] and fields[3] in tor_ends and ('pid='+parent+',') in row for fields,row in rows)
                    if cmd[-1:]==[b"/opt/altnet-browser/Browser/altnet-linux/air_tor.py"] and pair:
                        endpoints_by_process=parent
                        proxied=True
                    else:
                        endpoints=set()
            sockets=[int(m[1]) for fields,row in rows if fields[3] in endpoints
                     and ('pid='+endpoints_by_process+',') in row and (m:=re.search(r"\bino:(\d+)",row))]
            bootstrap=control(stream,b"GETINFO status/bootstrap-phase")
            progress=re.search(rb"\bPROGRESS=(\d+)\b",bootstrap)
            guards_up=control(stream,b"GETINFO orconn-status")
            return dict(pid=pid,guards=guards,inodes=sockets,streams=sum(1 for l in streams if len(p:=l.split())>=4 and p[1]=="SUCCEEDED" and p[3]==authority),
                        circuits=len(ids),standbys=len(standby_streams),rend=rendezvous,
                        proxiedGuard=proxied,progress=int(progress[1]) if progress else 0,
                        orConnected=sum(row.split()[-1:]==[b"CONNECTED"] for row in guards_up.splitlines()))
peer_io = {}
for path in {row.split()[-1] for row in pathlib.Path("/proc/net/unix").read_text().splitlines()}:
    if "/altnet-invite-" not in path or not path.endswith("/admin.sock"):continue
    try:
        worker = pathlib.Path(path).stat().st_ino
    except FileNotFoundError:
        continue
    try:
        proc=subprocess.run(["yggdrasilctl","-endpoint=unix://"+path,"-json","getpeers"],capture_output=True,timeout=2)
        if proc.returncode:continue
        peers=json.loads(proc.stdout)["peers"]
    except (subprocess.TimeoutExpired, ValueError, KeyError):
        # An ephemeral worker can disappear between the socket listing and its reply.
        continue
    for p in peers.values():
        if p.get("key")==pin and p.get("remote","").split("?")[0].endswith("/"+authority):
            peer_io[str(worker)] = [p["bytes_recvd"], p["uptime"]]
            break
if sys.argv[2:]==["--peer-io"]:
    print(json.dumps(peer_io))
    sys.exit(0)
system=pathlib.Path("/run/tor")
others=sorted(p for p in pathlib.Path("/run").glob("altnet-air-tor-*") if (p/"control").is_socket())
snapshots=[]
private=[]
for root in [system,*others]:
    try:
        m=sample(root)
        if root!=system:
            private.append(m)
        if m["rend"]:
            snapshots.append((root,m))
    except (OSError,RuntimeError,ValueError):
        pass
if sys.argv[2:]==["--watch-standby"]:
    for root,m in reversed(snapshots):
        if m["standbys"]:
            try:
                sample(root,watch=True)
            except (OSError,RuntimeError):
                pass
            break
    else:
        print("0",flush=True)
    sys.exit(0)
storage=[m for _,m in snapshots]
connected=[m for m in storage if m["inodes"]]
inodes={ino for m in storage for ino in m["inodes"]}
guards={g for m in storage for g in m["guards"]}
independent=(any(p==system and m["inodes"] for p,m in snapshots) and
             any(p!=system and m["inodes"] for p,m in snapshots) and
             len({m["pid"] for m in connected})>=2 and len(inodes)>=2)
if sys.argv[2:]==["--guards"]:
    print(json.dumps(dict(guards=len(guards),inodes=sorted(inodes))))
elif sys.argv[2:]==["--counts"]:
    print(json.dumps(dict(streams=sum(m["streams"] for m in storage),circuits=sum(m["circuits"] for m in storage),
                          pinnedWorkers=len(peer_io),standbyOnionStreams=sum(m["standbys"] for m in storage),
                          independentTor=bool(independent),torProcesses=len(connected),guardRelays=len(guards),
                          privateGuardTunnels=sum(1 for m in private if m["proxiedGuard"] and m["inodes"]),privateInstances=len(others),privateBootstrap=max((m["progress"] for m in private),default=0),
                          privateOrConnections=sum(m["orConnected"] for m in private))))
else:
    print(json.dumps(dict(torStream=bool(storage),rendezvous=bool(storage),pinnedYggdrasilPeer=bool(peer_io))))
