"""Separate, ephemeral Tor for QA coordination on the GitHub runner."""
from pathlib import Path
import os
import re
import runpy
import select
import subprocess
import sys
import tempfile
import time


def main():
    api=runpy.run_path("/opt/altnet-browser/Browser/altnet-linux/air_tor.py")
    peer=sys.stdin.buffer.readline(80).strip()
    if not re.fullmatch(rb"[a-z2-7]{56}\.onion",peer):
        raise ValueError
    with api["controller"](api["SYSTEM"]) as (master,stream), tempfile.TemporaryDirectory(prefix="air-qa-") as tmp:
        api["command"](stream,b"SETEVENTS CONF_CHANGED")
        options=api["policy"](stream,peer.decode("ascii"))
        root=Path(tmp)
        api["prepare"](root,options)
        path=root/"torrc"
        config=path.read_text().replace(f"SocksPort unix:{root}/socks ","SocksPort auto ")
        path.write_text(config)
        child=subprocess.Popen(["/usr/bin/tor","--defaults-torrc","/dev/null","-f",str(path)],
                               stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            deadline=time.monotonic()+20
            while child.poll() is None and time.monotonic()<deadline:
                try:
                    with api["controller"](root) as (_,ctl):
                        answer=api["command"](ctl,b"GETINFO net/listeners/socks")
                        match=re.search(rb'"127\.0\.0\.1:(\d+)"',answer)
                        if match:
                            print(int(match[1]),flush=True)
                            break
                except (OSError,RuntimeError):
                    pass
                time.sleep(.1)
            else:
                raise RuntimeError
            last_reset=0.
            while child.poll() is None:
                ready,_,_=select.select([master,sys.stdin.buffer],[],[],2)
                if master in ready:
                    return
                if sys.stdin.buffer in ready:
                    if os.read(0,1)!=b"R":
                        return
                    if time.monotonic()-last_reset>=35:
                        api["guard_repair"](root,True)
                        last_reset=time.monotonic()
        finally:
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(4)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()


if __name__=="__main__":
    try:
        main()
    except (OSError,RuntimeError,ValueError):
        sys.exit(1)
