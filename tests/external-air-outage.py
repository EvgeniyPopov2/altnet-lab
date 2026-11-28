"""Временно отключить сетевой трафик только на одноразовой Ubuntu в GitHub Actions."""
from contextlib import contextmanager
import json
import os
import secrets
import subprocess
import time


@contextmanager
def disconnected():
    if os.environ.get("GITHUB_ACTIONS")!="true" or os.environ.get("RUNNER_ENVIRONMENT")!="github-hosted":
        raise RuntimeError("Outage test requires an ephemeral GitHub-hosted runner")
    table = "altnet_qa_" + secrets.token_hex(6)
    unit = "altnet-air-restore-" + secrets.token_hex(6)
    nft = ["sudo", "-n", "/usr/sbin/nft"]
    remove = ["/usr/sbin/nft", "delete", "table", "inet", table]
    # Независимый таймер снимет фильтр, даже если клиент или процесс теста завершится.
    subprocess.run(["sudo","-n","systemd-run","--quiet","--on-active=100s","--unit="+unit,*remove], check=True)
    applied = False
    try:
        rules = [f"create table inet {table}"]
        for name, interface in (("input","iifname"),("output","oifname")):
            rules += [f"add chain inet {table} {name} {{ type filter hook {name} priority -250; policy accept; }}",
                      f'add rule inet {table} {name} {interface} != "lo" counter drop']
        before_apply = time.monotonic()
        subprocess.run([*nft,"-f","-"],input="\n".join(rules)+"\n",text=True,check=True)
        applied = True
        start = (before_apply + time.monotonic()) / 2
        def evidence():
            data=json.loads(subprocess.check_output([*nft,"-j","list","table","inet",table]))
            counts = {v["rule"]["chain"]:next(e["counter"]["packets"] for e in v["rule"]["expr"] if "counter" in e)
                      for v in data["nftables"] if "rule" in v}
            return dict(seconds=round(time.monotonic()-start,1),droppedPackets=counts)
        evidence.restoration = {}
        yield evidence
    finally:
        if applied:
            before = time.monotonic()
            subprocess.run(["sudo","-n",*remove], check=True)
            after = time.monotonic()
            evidence.restoration.update(mono=(before+after)/2, epoch=time.time()-(after-before)/2,
                                        uncertainty=(after-before)/2, blackoutSeconds=round((before+after)/2-start,2))
        subprocess.run(["sudo","-n","systemctl","stop",unit+".timer"],check=False)

