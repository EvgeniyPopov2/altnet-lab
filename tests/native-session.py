#!/usr/bin/env python3
"""Офлайн-проверки подтверждения дочернего сеанса на 127.0.0.1."""
import base64
import hashlib
import hmac
import http.client
import io
import json
import os
from pathlib import Path
import queue
import secrets
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import bridge_native
from bridge_client import LocalUI, serve_native_parent


def token(data):
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


class NativeSessionTests(unittest.TestCase):
    def setUp(self):
        self.secret = secrets.token_bytes(32)
        self.challenge = token(secrets.token_bytes(32))

    def test_bootstrap_is_bounded_canonical_and_does_not_echo_secret(self):
        good = {"protocol": bridge_native.PROTOCOL, "secret": token(self.secret)}
        self.assertEqual(bridge_native.read_bootstrap(io.BytesIO(json.dumps(good).encode() + b"\n")), self.secret)
        invalid = [b"{}\n", b"{" + b"x" * 300 + b"}\n", json.dumps(good).encode(),
                   b'{"protocol":"altnet-native-v1","secret":"bad","secret":"bad"}\n',
                   json.dumps({**good, "extra": 1}).encode() + b"\n"]
        for message in invalid:
            with self.subTest(size=len(message)), self.assertRaises(ValueError) as error:
                bridge_native.read_bootstrap(io.BytesIO(message))
            self.assertNotIn(token(self.secret), str(error.exception))
        for value in ("", "A" * 42, "A" * 43 + "\n", "A" * 42 + "B"):
            with self.assertRaises(ValueError):
                bridge_native.decode_token(value)

    def test_proof_binds_nonce_and_loopback_authority(self):
        authority = "127.0.0.1:17231"
        tag = bridge_native.proof(self.secret, authority, self.challenge)
        expected = hmac.new(self.secret, b"altnet-native-v1\0" + authority.encode() + b"\0" + bridge_native.decode_token(self.challenge), hashlib.sha256).digest()
        self.assertTrue(hmac.compare_digest(bridge_native.decode_token(tag), expected))
        self.assertNotEqual(tag, bridge_native.proof(self.secret, "127.0.0.1:17232", self.challenge))
        self.assertNotEqual(tag, bridge_native.proof(self.secret, authority, token(secrets.token_bytes(32))))
        for bad in ("localhost:17231", "127.0.0.1:0", "127.0.0.1:65536", "127.0.0.1:17231\n"):
            with self.assertRaises(ValueError):
                bridge_native.proof(self.secret, bad, self.challenge)

    def test_loopback_endpoint_is_opt_in_and_rejects_spoofing(self):
        with ThreadingHTTPServer(("127.0.0.1", 0), LocalUI) as server:
            server.authority = f"127.0.0.1:{server.server_port}"
            thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
            def get(path, hosts):
                conn = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=3)
                try:
                    conn.putrequest("GET", path, skip_host=True)
                    for host in hosts: conn.putheader("Host", host)
                    conn.endheaders(); response = conn.getresponse()
                    return response.status, response.read(), dict(response.getheaders())
                finally: conn.close()
            path = "/api/native/attest?challenge=" + self.challenge
            try:
                self.assertEqual(get(path, [server.authority])[0], 404)
                server.native_secret = self.secret
                status, raw, headers = get(path, [server.authority])
                self.assertEqual(status, 200)
                self.assertEqual(headers.get("Cache-Control"), "no-store")
                self.assertNotIn(token(self.secret).encode(), raw)
                value = json.loads(raw)
                self.assertEqual(value, {"protocol": bridge_native.PROTOCOL, "proof": bridge_native.proof(self.secret, server.authority, self.challenge)})
                self.assertEqual(get(path, ["evil.invalid"])[0], 403)
                self.assertEqual(get(path, [server.authority, "evil.invalid"])[0], 403)
                for suffix in ("", "bad", self.challenge + "&challenge=" + self.challenge, self.challenge + "#fragment"):
                    self.assertEqual(get("/api/native/attest?challenge=" + suffix, [server.authority])[0], 400)
            finally:
                server.shutdown(); thread.join()

    def test_duplicate_security_headers_are_rejected(self):
        with ThreadingHTTPServer(("127.0.0.1", 0), LocalUI) as server:
            server.authority = f"127.0.0.1:{server.server_port}"; server.token = "fixture-token"
            thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
            try:
                for duplicate in ("Host", "Origin", "X-AltNet-Session"):
                    headers = [("Host", server.authority), ("Origin", "http://" + server.authority),
                               ("X-AltNet-Session", server.token), ("Content-Type", "application/json"), ("Content-Length", "2")]
                    headers.append((duplicate, next(value for key, value in headers if key == duplicate)))
                    conn = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=3)
                    try:
                        conn.putrequest("POST", "/api/sites/onion-car", skip_host=True)
                        for key, value in headers: conn.putheader(key, value)
                        conn.endheaders(b"{}"); response = conn.getresponse()
                        self.assertEqual(response.status, 403); response.read()
                    except ConnectionResetError:
                        # Windows may reset a connection with an unread rejected body.
                        pass
                    finally: conn.close()
            finally:
                server.shutdown(); thread.join()

    def test_parent_eof_or_unexpected_input_stops_the_session(self):
        for data in (b"", b"x"):
            stopped = threading.Event()
            server = type("Server", (), {"shutdown": lambda self: stopped.set()})()
            serve_native_parent(io.BytesIO(data), io.StringIO(), server, None)
            self.assertTrue(stopped.is_set())

    def test_pipe_allows_only_bounded_status_without_private_fields(self):
        for raw in (b'{}\n', b'{"id":true,"method":"status"}\n', b'{"id":1,"method":"switch"}\n',
                    b'{"id":1,"id":2,"method":"status"}\n', b'x' * 1025, b'{"id":1,"method":"status"}'):
            with self.assertRaises(ValueError):
                bridge_native.read_request(io.BytesIO(raw))
        status = {"phase": "ready", "progress": 100, "connected": True, "internet": "verified", "secret": "bridge-string"}
        manager = type("Manager", (), {"public_status": lambda self: status})()
        server = type("Server", (), {"shutdown": lambda self: None})()
        output = io.StringIO()
        serve_native_parent(io.BytesIO(b'{"id":7,"method":"status"}\n'), output, server, manager)
        response = json.loads(output.getvalue())
        self.assertEqual(response["id"], 7)
        self.assertTrue(response["status"]["torConnected"])
        self.assertFalse(response["status"]["fastAvailable"])
        self.assertNotIn("bridge-string", output.getvalue())
        status["internet"] = "checking"
        self.assertEqual(bridge_native.public_route_status(manager)["internet"], "checking")
        status["internet"] = "unexpected"
        output = io.StringIO()
        serve_native_parent(io.BytesIO(b'{"id":8,"method":"status"}\n'), output, server, manager)
        self.assertEqual(json.loads(output.getvalue()), {"id": 8, "ok": False, "error": "status_unavailable"})

    def test_entrypoint_rejects_invalid_bootstrap_before_writing_or_binding(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get("TEMP")) as tmp:
            root = Path(tmp)
            command = [sys.executable, "-B", str(ROOT / "scripts/bridge_client.py"), "--state", str(root / "state"),
                       "--dist", str(root / "ui"), "--tor", str(root / "tor"), "--transport", str(root / "transport"),
                       "--keyring", str(root / "keyring"), "--port", "0", "--socks-port", "0", "--native-stdio", "--native-http-proof"]
            bad = json.dumps({"protocol": bridge_native.PROTOCOL, "secret": token(self.secret), "extra": 1}) + "\n"
            result = subprocess.run(command, input=bad, text=True, capture_output=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((root / "state").exists())
            self.assertNotIn(token(self.secret), result.stdout + result.stderr)
            default_port = command.copy(); default_port[default_port.index("--port") + 1] = "17860"
            result = subprocess.run(default_port, input="", text=True, capture_output=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((root / "state").exists())
            without_stdio = [item for item in command if item != "--native-stdio"]
            result = subprocess.run(without_stdio, input="", text=True, capture_output=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((root / "state").exists())
            abbreviated = ["--native-http-pr" if item == "--native-http-proof" else item for item in command]
            result = subprocess.run(abbreviated, input="", text=True, capture_output=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((root / "state").exists())

    def test_browser_verifier_matches_python_and_rejects_tampering(self):
        authority = "127.0.0.1:12345"
        payload = {"secret": token(self.secret), "challenge": self.challenge, "authority": authority,
                   "response": {"protocol": bridge_native.PROTOCOL, "proof": bridge_native.proof(self.secret, authority, self.challenge)}}
        module = (ROOT / "browser/tor-browser/native/NativeSessionProof.sys.mjs").as_uri()
        js = r'''const {verifyNativeProof, createNativeChallenge} = await import(process.argv[1]);
const vm = await import('node:vm');
let input = ''; for await (const c of process.stdin) input += c;
const p = JSON.parse(input), decode = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='), c => c.charCodeAt(0));
const s = decode(p.secret); if (!await verifyNativeProof(s,p.authority,p.challenge,p.response)) throw Error('valid proof rejected');
const other = vm.runInNewContext('new Uint8Array(' + JSON.stringify(Array.from(s)) + ')');
if (!await verifyNativeProof(other,p.authority,p.challenge,p.response)) throw Error('cross-realm key rejected');
const wrong = s.slice(); wrong[0] ^= 1;
if (await verifyNativeProof(wrong,p.authority,p.challenge,p.response)) throw Error('wrong secret accepted');
for (const [a,c,r] of [[p.authority+'0',p.challenge,p.response],[p.authority,createNativeChallenge(),p.response],
 [p.authority,p.challenge,{...p.response,proof:'A'.repeat(43)}],[p.authority,p.challenge,{...p.response,extra:1}]]) {
 if (await verifyNativeProof(s,a,c,r)) throw Error('invalid proof accepted'); }
'''
        result = subprocess.run(["node", "--input-type=module", "-e", js, module], input=json.dumps(payload),
                                text=True, capture_output=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_next_browser_overlay_contains_the_tested_modules(self):
        patch = (ROOT / "browser/tor-browser/patches/0001-about-altnet.patch").read_text(encoding="utf-8")
        for filename in ("NativeSessionProof.sys.mjs", "NativeSessionChannel.sys.mjs"):
            name = "browser/components/abouttor/" + filename
            header = f"diff --git a/{name} b/{name}\n"
            self.assertEqual(patch.count(header), 1)
            block = patch.split(header, 1)[1].split("\ndiff --git ", 1)[0]
            added = [line[1:] for line in block.splitlines() if line.startswith("+") and not line.startswith("+++")]
            module = (ROOT / "browser/tor-browser/native" / filename).read_text(encoding="utf-8")
            self.assertEqual("\n".join(added) + "\n", module)
            self.assertIn(f'+    "{filename}",', patch)

    def test_real_entrypoint_reports_only_via_child_pipe(self):
        # Mock the transport manager: no Tor, multicast or external network is used.
        shim = r'''import contextlib,sys,threading
sys.path.insert(0,sys.argv[1]); import bridge_client
class Source:
 def __init__(self,*a,**kw): pass
 def bootstrap(self,*a): pass
class Manager:
 def __init__(self,*a,**kw):
  self.stop=threading.Event();self.fetch=threading.Event();self.wake=threading.Event();self.lock=threading.RLock();self.paused=False;self.active_port=0
 def run(self): self.stop.wait()
 def public_status(self): return {'phase':'starting','progress':0,'connected':False,'internet':'unchecked'}
class Share:
 def __init__(self,*a): pass
 def stop(self): pass
bridge_client.Sources=Source;bridge_client.Manager=Manager;bridge_client.Share=Share
bridge_client.catalog.catalog_lock=lambda *a:contextlib.nullcontext()
sys.argv=['bridge_client.py']+sys.argv[2:];bridge_client.main()
'''
        with tempfile.TemporaryDirectory(dir=os.environ.get("TEMP")) as tmp:
            root = Path(tmp); dist = root / "ui"; dist.mkdir(); (dist / "index.html").write_text("<html><head></head></html>")
            for name in ("tor", "transport", "keyring"): (root / name).write_bytes(b"fixture")
            command = [sys.executable, "-u", "-c", shim, str(ROOT / "scripts"), "--state", str(root / "state"),
                       "--dist", str(dist), "--tor", str(root / "tor"), "--transport", str(root / "transport"),
                       "--keyring", str(root / "keyring"), "--port", "0", "--socks-port", "0", "--native-stdio", "--native-http-proof"]
            proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            try:
                proc.stdin.write(json.dumps({"protocol": bridge_native.PROTOCOL, "secret": token(self.secret)}).encode() + b"\n"); proc.stdin.flush()
                lines = queue.Queue()
                threading.Thread(target=lambda: lines.put(proc.stdout.readline()), daemon=True).start()
                ready = json.loads(lines.get(timeout=15))
                self.assertEqual(set(ready), {"protocol", "authority"})
                self.assertEqual(ready["protocol"], bridge_native.PROTOCOL)
                self.assertNotIn(token(self.secret), json.dumps(ready))
                port = int(ready["authority"].split(":")[1])
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
                try:
                    conn.request("GET", "/api/native/attest?challenge=" + self.challenge, headers={"Host": ready["authority"]})
                    response = conn.getresponse(); body = json.loads(response.read()); self.assertEqual(response.status, 200)
                finally: conn.close()
                self.assertEqual(body["proof"], bridge_native.proof(self.secret, ready["authority"], self.challenge))
                proc.stdin.write(b'{"id":1,"method":"status"}\n'); proc.stdin.flush()
                status = json.loads(proc.stdout.readline())
                self.assertEqual(status["id"], 1)
                self.assertFalse(status["status"]["torConnected"])
                self.assertFalse(status["status"]["fastAvailable"])
                self.assertNotIn(token(self.secret), json.dumps(status))
                browser = os.environ.get("ALTNET_NATIVE_TEST_BROWSER")
                if browser:
                    command = [sys.executable, "-B", str(ROOT / "tests/tor-native-ui.py"), "--browser", browser,
                               "--theme", "dark", "--expect-no-updater", "--test-native-proof-module", "--native-proof-live-from-stdin"]
                    result = subprocess.run(command, input=json.dumps({"secret": list(self.secret), "authority": ready["authority"]}),
                                            text=True, capture_output=True, timeout=90)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertIn("PASS: Gecko verifies the live child response and rejects replay", result.stdout)
                proc.stdin.close()
                self.assertEqual(proc.wait(timeout=15), 0, "Child must stop after its parent closes the private pipe")
            finally:
                if proc.poll() is None:
                    proc.terminate(); proc.wait(timeout=10)
                for stream in (proc.stdin, proc.stdout, proc.stderr):
                    if stream: stream.close()

    def test_unmocked_client_starts_and_stops_without_external_sources(self):
        browser = os.environ.get("ALTNET_NATIVE_TEST_BROWSER")
        if not browser:
            self.skipTest("Set ALTNET_NATIVE_TEST_BROWSER to an isolated experimental browser")
        browser_path = Path(browser).resolve(strict=True)
        tor_dir = browser_path.parent / "TorBrowser/Tor"
        tor, transport = tor_dir / "tor.exe", tor_dir / "PluggableTransports/lyrebird.exe"
        if not tor.is_file() or not transport.is_file():
            self.skipTest("The isolated browser copy lacks the bundled Tor binaries")
        with tempfile.TemporaryDirectory(dir=os.environ.get("TEMP")) as tmp:
            root = Path(tmp); dist = root / "ui"; dist.mkdir(); (dist / "index.html").write_text("<html><head></head></html>")
            keyring = root / "keyring"; keyring.write_bytes(b"empty test keyring")
            command = [sys.executable, "-u", "-B", str(ROOT / "scripts/bridge_client.py"), "--state", str(root / "state"),
                       "--dist", str(dist), "--tor", str(tor), "--transport", str(transport), "--keyring", str(keyring),
                       "--port", "0", "--socks-port", "0", "--no-official", "--no-lan", "--native-stdio", "--native-http-proof"]
            normal_pipe_command = command[:-1]
            proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            try:
                proc.stdin.write(json.dumps({"protocol": bridge_native.PROTOCOL, "secret": token(self.secret)}).encode() + b"\n"); proc.stdin.flush()
                lines = queue.Queue(); threading.Thread(target=lambda: lines.put(proc.stdout.readline()), daemon=True).start()
                ready = json.loads(lines.get(timeout=20))
                self.assertEqual(ready["protocol"], bridge_native.PROTOCOL)
                proc.stdin.write(b'{"id":1,"method":"status"}\n'); proc.stdin.flush()
                lines = queue.Queue(); threading.Thread(target=lambda: lines.put(proc.stdout.readline()), daemon=True).start()
                status = json.loads(lines.get(timeout=10))
                self.assertEqual(status["id"], 1)
                self.assertFalse(status["status"]["torConnected"])
                self.assertFalse(status["status"]["fastAvailable"])
                command = [sys.executable, "-B", str(ROOT / "tests/tor-native-ui.py"), "--browser", str(browser_path),
                           "--theme", "light", "--expect-no-updater", "--test-native-proof-module", "--native-proof-live-from-stdin"]
                result = subprocess.run(command, input=json.dumps({"secret": list(self.secret), "authority": ready["authority"]}),
                                        text=True, capture_output=True, timeout=90)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("PASS: Gecko verifies the live child response and rejects replay", result.stdout)
                proc.stdin.close()
                self.assertEqual(proc.wait(timeout=20), 0)
            finally:
                if proc.poll() is None:
                    proc.terminate(); proc.wait(timeout=10)
                for stream in (proc.stdin, proc.stdout, proc.stderr):
                    if stream: stream.close()
            # The preferred pipe mode does not expose the optional HTTP proof endpoint.
            proc = subprocess.Popen(normal_pipe_command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            try:
                proc.stdin.write(json.dumps({"protocol": bridge_native.PROTOCOL, "secret": token(self.secret)}).encode() + b"\n"); proc.stdin.flush()
                lines = queue.Queue(); threading.Thread(target=lambda: lines.put(proc.stdout.readline()), daemon=True).start()
                ready = json.loads(lines.get(timeout=20)); port = int(ready["authority"].split(":")[1])
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
                try:
                    conn.request("GET", "/api/native/attest?challenge=" + self.challenge, headers={"Host": ready["authority"]})
                    response = conn.getresponse(); self.assertEqual(response.status, 404); response.read()
                finally: conn.close()
                proc.stdin.close(); self.assertEqual(proc.wait(timeout=20), 0)
            finally:
                if proc.poll() is None:
                    proc.terminate(); proc.wait(timeout=10)
                for stream in (proc.stdin, proc.stdout, proc.stderr):
                    if stream: stream.close()

    def test_gecko_spawns_and_controls_the_unmocked_client_over_pipes(self):
        browser = os.environ.get("ALTNET_NATIVE_TEST_BROWSER")
        if not browser:
            self.skipTest("Set ALTNET_NATIVE_TEST_BROWSER to an isolated browser with the test modules")
        browser_path = Path(browser).resolve(strict=True); tor_dir = browser_path.parent / "TorBrowser/Tor"
        tor, transport = tor_dir / "tor.exe", tor_dir / "PluggableTransports/lyrebird.exe"
        if not tor.is_file() or not transport.is_file():
            self.skipTest("The isolated browser copy lacks the bundled Tor binaries")
        with tempfile.TemporaryDirectory(dir=os.environ.get("TEMP")) as tmp:
            root = Path(tmp); dist = root / "ui"; dist.mkdir(); (dist / "index.html").write_text("<html><head></head></html>")
            keyring = root / "keyring"; keyring.write_bytes(b"empty test keyring")
            args = [str(ROOT / "scripts/bridge_client.py"), "--state", str(root / "state"), "--dist", str(dist),
                    "--tor", str(tor), "--transport", str(transport), "--keyring", str(keyring), "--no-official", "--no-lan"]
            fake_header = "import os,sys,time\nfrom pathlib import Path\nPath(sys.argv[1]).write_text(str(os.getpid()))\nsys.stdin.buffer.readline()\n"
            fixtures = {
                "bad-ready": fake_header + "print('{\"protocol\":\"altnet-native-v1\",\"protocol\":\"altnet-native-v1\",\"authority\":\"127.0.0.1:1\"}',flush=True)\ntime.sleep(60)\n",
                "bad-status": fake_header + "print('{\"protocol\":\"altnet-native-v1\",\"authority\":\"127.0.0.1:1\"}',flush=True)\nsys.stdin.buffer.readline()\nprint('{\"id\":1,\"ok\":true,\"status\":{\"phase\":\"ready\",\"progress\":100,\"torConnected\":true,\"internet\":\"verified\",\"fastAvailable\":true}}',flush=True)\ntime.sleep(60)\n",
                "hung": fake_header + "time.sleep(60)\n",
                "checking": fake_header + "print('{\"protocol\":\"altnet-native-v1\",\"authority\":\"127.0.0.1:1\"}',flush=True)\nsys.stdin.buffer.readline()\nprint('{\"id\":1,\"ok\":true,\"status\":{\"phase\":\"ready\",\"progress\":100,\"torConnected\":true,\"internet\":\"checking\",\"fastAvailable\":false}}',flush=True)\nsys.stdin.buffer.read()\n",
            }
            fake_args = {}
            for name, source in fixtures.items():
                script = root / (name + ".py"); script.write_text(source, encoding="utf-8")
                fake_args[name] = [str(script), str(root / (name + ".pid"))]
            command = [sys.executable, "-B", str(ROOT / "tests/tor-native-ui.py"), "--browser", str(browser_path),
                       "--theme", "dark", "--expect-no-updater", "--native-channel-from-stdin"]
            config = {"command": sys.executable, "args": args, "badReadyArgs": fake_args["bad-ready"],
                      "badStatusArgs": fake_args["bad-status"], "hangArgs": fake_args["hung"], "checkingArgs": fake_args["checking"]}
            result = subprocess.run(command, input=json.dumps(config),
                                    text=True, capture_output=True, timeout=90)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("PASS: Gecko starts a verified-test child, reads bounded status over pipes and closes it", result.stdout)
            if os.name == "nt":
                import ctypes
                kernel = ctypes.WinDLL("kernel32", use_last_error=True)
                kernel.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
                kernel.OpenProcess.restype = ctypes.c_void_p
                kernel.GetExitCodeProcess.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong)]
                kernel.CloseHandle.argtypes = [ctypes.c_void_p]
                for name in fixtures:
                    pid = int((root / (name + ".pid")).read_text())
                    handle = kernel.OpenProcess(0x1000, 0, pid)
                    if handle:
                        code = ctypes.c_ulong()
                        try:
                            self.assertTrue(kernel.GetExitCodeProcess(handle, ctypes.byref(code)))
                            self.assertNotEqual(code.value, 259, f"Test child {name} was not stopped")
                        finally: kernel.CloseHandle(handle)


if __name__ == "__main__":
    unittest.main()
