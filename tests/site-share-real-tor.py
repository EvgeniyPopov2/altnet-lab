#!/usr/bin/env python3
"""Проверка ADD_ONION настоящим Tor в режиме DisableNetwork, без подключения к сети."""
import argparse
import base64
import http.client
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import threading
import time
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from site_share import Share

parser = argparse.ArgumentParser()
parser.add_argument("--tor", type=Path, required=True)
parser.add_argument("--temp", type=Path, required=True)
args = parser.parse_args()
cid = "b" + base64.b32encode(b"\x01\x71\x12\x20" + bytes(range(32))).decode().lower().rstrip("=")
with tempfile.TemporaryDirectory(prefix="altnet-tor-offline-", dir=args.temp) as tmp:
    root = Path(tmp)
    command = [str(args.tor.resolve()), "--DataDirectory", str(root / "data"), "--DisableNetwork", "1",
               "--ClientOnly", "1", "--SocksPort", "0", "--ControlPort", "auto", "--CookieAuthentication", "1",
               "--ControlPortWriteToFile", str(root / "control.addr"), "--CookieAuthFile", str(root / "control.cookie")]
    proc = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    share = None
    try:
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline and (not (root / "control.addr").is_file() or not (root / "control.cookie").is_file()):
            if proc.poll() is not None:
                raise RuntimeError("Tor terminated before opening the offline control port")
            time.sleep(.1)
        match = re.fullmatch(r"PORT=127\.0\.0\.1:(\d+)", (root / "control.addr").read_text().strip())
        if not match:
            raise RuntimeError("Unexpected control address")
        instance = SimpleNamespace(control=int(match[1]), directory=root)
        manager = SimpleNamespace(active=instance, active_port=1, paused=False, stop=threading.Event(), lock=threading.RLock())
        share = Share(manager)
        state = share.start(cid, b"offline-fixture")
        connection = http.client.HTTPConnection("127.0.0.1", share.server.server_port, timeout=3)
        connection.request("GET", f"/ipfs/{cid}?format=car", headers={"Host": state["onion"]})
        response = connection.getresponse()
        assert response.status == 200 and response.read() == b"offline-fixture"
        connection.close()
        share.stop()
        second = share.start(cid, b"offline-fixture")
        assert second["onion"] != state["onion"]
        proc.terminate()
        proc.wait(timeout=5)
        deadline = time.monotonic() + 5
        while share.status()["active"] and time.monotonic() < deadline:
            time.sleep(.05)
        assert not share.status()["active"]
        print("PASS: real offline Tor created ephemeral onions; CAR served; Tor exit stopped sharing; no network exchange")
    finally:
        if share:
            share.stop()
        if proc.poll() is None:
            proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
