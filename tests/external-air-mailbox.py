"""Одноразовый почтовый ящик стенда. Передаёт этапы теста, приглашение и результаты, живёт до EOF."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac
import json
from pathlib import Path
import re
import runpy
import secrets
import socket
import sys
import threading
import time

INCOMING = {"ready", "claim", "recording", "result", "left", "armed", "restored", "recording2", "result2", "recordingResume", "resultResume", "heardBoth"}
OUTGOING = {"invite", "play", "done", "cut", "redial", "play2", "done2", "playResume", "doneResume", "clock", "node1Heard"}
INCOMING.update(name+"Again" for name in ("armed","heardBoth","recordingResume","resultResume"))
OUTGOING.update(name+"Again" for name in ("cut","node1Heard","playResume","doneResume"))
state = {}
lock = threading.Lock()
token = secrets.token_urlsafe(32)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def setup(self):
        super().setup()
        self.connection.settimeout(12)

    def request_slot(self, accepted):
        key = self.path.removeprefix("/")
        authorized = hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + token)
        if not authorized or key not in accepted:
            self.send_error(404)
            return None
        return key

    def reply(self, status, data=b""):
        self.send_response(status)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        key = self.request_slot(OUTGOING)
        if key:
            with lock:
                data = time.time() if key == "clock" else state.get(key)
            self.reply(204 if data is None else 200, b"" if data is None else json.dumps(data).encode())

    def do_POST(self):
        key = self.request_slot(INCOMING)
        if not key:
            return
        try:
            length = int(self.headers["Content-Length"])
            if not 0 < length <= 2048:
                raise ValueError
            value = json.loads(self.rfile.read(length))
            if key == "claim":
                valid = isinstance(value, str) and re.fullmatch(r"[0-9]{6}",value)
            elif key in ("result","result2","resultResume","resultResumeAgain"):
                valid = isinstance(value, dict) and set(value)=={"Hz440","Hz880","Hz1220","samples"} and all(type(n) is int and 0<=n<=20000000 for n in value.values())
            else:
                valid = value is True
            if not valid:
                raise ValueError
        except (ValueError,TypeError):
            return self.reply(400)
        with lock:
            if key in state and state[key]!=value:
                return self.reply(409)
            state[key]=value
        self.reply(200,b"true")


def main():
    cmd = runpy.run_path("/opt/altnet-browser/Browser/altnet-linux/bridge_tor.py")["command"]
    with ThreadingHTTPServer(("127.0.0.1",0), Handler) as server, socket.socket(socket.AF_UNIX) as sock:
        sock.settimeout(12)
        sock.connect("/run/tor/control")
        with sock.makefile("rwb",buffering=0) as stream:
            cookie = Path("/run/tor/control.authcookie").read_bytes()
            cmd(stream,b"AUTHENTICATE "+cookie.hex().encode())
            endpoint = f"80,127.0.0.1:{server.server_port}".encode()
            answer = cmd(stream,b"ADD_ONION NEW:ED25519-V3 Flags=DiscardPK MaxStreams=8 Port="+endpoint)
            match = re.search(rb"(?m)^ServiceID=([a-z2-7]{56})$",answer)
            if not match:
                raise RuntimeError("Tor не создал ящик испытания")
            threading.Thread(target=server.serve_forever,daemon=True).start()
            print(json.dumps(dict(onion=match[1].decode()+".onion",token=token)),flush=True)
            for line in sys.stdin:
                request=json.loads(line)
                key=request["slot"]
                with lock:
                    if "value" in request:
                        assert key in OUTGOING
                        state[key]=request["value"]
                    assert key in OUTGOING|INCOMING
                    print(json.dumps(state.get(key)),flush=True)
            server.shutdown()


if __name__=="__main__":
    main()

