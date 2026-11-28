#!/usr/bin/env python3
"""Linux regression test. Two isolated processes use real TLS, Opus and synthetic PCM pipes."""
import array
import asyncio
from contextlib import ExitStack
import json
import math
import os
from pathlib import Path
import select
import signal
import socket
import ssl
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "browser/tor-browser/linux"))
import voice_transport as voice


def isolated_endpoint(config_file):
    # Only the test harness accepts a local IPv6 loopback and synthetic sound devices.
    config = json.loads(Path(config_file).read_text())
    voice.load_room = lambda: None
    voice.load_route = lambda: config
    voice.pulse_device = lambda kind: "test-output"
    def pipe_device(program, *, recording, sink):
        kind = "microphone" if recording else "speaker"
        args = [sys.executable, "-B", __file__, "--device", kind, config["cert"]]
        return voice.start_audio(args, recording)
    voice.audio_process = pipe_device
    asyncio.run(voice.serve())


def device(kind, cert):
    path = Path(cert).with_suffix("." + kind)
    with path.open("a") as f:
        print(os.getpid(), file=f, flush=True)
    if kind == "microphone":
        # Distinct signals allow each side to check what its speaker actually received.
        frequency = 400 if Path(cert).stem == "alice" else 800
        sample = array.array("h", (int(10000 * math.sin(2 * math.pi * frequency * i / voice.RATE))
                                  for i in range(voice.SAMPLES))).tobytes()
        while True:
            sys.stdout.buffer.write(sample)
            sys.stdout.buffer.flush()
            time.sleep(.020)
    else:
        with path.with_suffix(".decoded").open("wb", buffering=0) as out:
            while frame := sys.stdin.buffer.read(voice.SAMPLES * 2):
                out.write(frame)


class Endpoint:
    def __init__(self, config):
        self.config = config
        self.p = subprocess.Popen([sys.executable, "-B", __file__, "--endpoint", str(config)],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.n = 0

    def cmd(self, op, **kwargs):
        self.n += 1
        self.p.stdin.write((json.dumps({"id": self.n, "op": op, **kwargs}) + "\n").encode())
        self.p.stdin.flush()
        if not select.select([self.p.stdout], [], [], 3)[0]:
            raise AssertionError(f"Voice request timed out ({op})")
        line = self.p.stdout.readline()
        if not line:
            raise AssertionError(self.p.stderr.read().decode())
        result = json.loads(line)
        assert result["id"] == self.n and set(result) == {"id", "state"}
        return result["state"]

    def close(self):
        if not self.p.stdin.closed:
            self.p.stdin.close()
        try:
            self.p.wait(timeout=2)
        except subprocess.TimeoutExpired:
            self.p.kill()
            self.p.wait()
            raise
        finally:
            self.p.stdout.close()
            self.p.stderr.close()


def until(check, timeout=5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if value := check():
            return value
        time.sleep(.025)
    raise AssertionError("Timed out waiting for " + repr(check))


def not_running(pid):
    proc_stat = Path("/proc") / str(pid) / "stat"
    try:
        return proc_stat.read_text().rsplit(")", 1)[1].strip().split()[0] == "Z"
    except FileNotFoundError:
        return True


class CaptureSelectionTests(unittest.TestCase):
    devices = ("Source #0\n\tName: auto_null.monitor\n\tMonitor of Sink: auto_null\n"
               "Source #1\n\tName: mic.monitor\n\tMonitor of Sink: mic\n"
               "Source #2\n\tName: alsa_input.usb\n\tMonitor of Sink: n/a\n"
               "Source #3\n\tName: renamed_output_tap\n\tMonitor of Sink: speakers\n")

    def test_missing_microphone_and_monitor_alias_never_start_recorder(self):
        for requested in ("", "@DEFAULT_MONITOR@", "unknown", "renamed_output_tap", "speakers.monitor"):
            with self.subTest(requested=requested), patch.dict(os.environ, {"PULSE_SOURCE": requested}, clear=True), \
                    patch.object(voice, "pactl", side_effect=lambda *args: "auto_null.monitor" if len(args)==1 else self.devices), \
                    patch.object(voice, "start_audio") as start:
                with self.assertRaisesRegex(voice.VoiceError, "(?i)микрофон"):
                    voice.audio_process("/usr/bin/parec", recording=True, sink="speakers")
                start.assert_not_called()

    def test_physical_source_and_output_are_pinned_by_name(self):
        def responses(*args):
            return {("get-default-source",): "alsa_input.usb", ("get-default-sink",): "speakers",
                    ("list", "sources"): self.devices}[args]
        with patch.dict(os.environ, {}, clear=True), patch.object(voice, "pactl", side_effect=responses), \
                patch.object(voice, "start_audio") as start:
            devices = voice.Pulse()
            self.assertIn("--device=speakers", start.call_args.args[0])
            voice.audio_process("/usr/bin/parec", recording=True, sink=devices.sink)
            self.assertIn("--device=alsa_input.usb", start.call_args.args[0])

    def test_explicit_private_source_must_be_separate_from_playback(self):
        # Linux tmpfs supports AF_UNIX even when the project's TMPDIR is a Windows shared drive.
        with tempfile.TemporaryDirectory(dir="/dev/shm") as root, socket.socket(socket.AF_UNIX) as sock:
            path = Path(root) / "pa"
            sock.bind(str(path))
            with patch.dict(os.environ, {"PULSE_SOURCE": "mic.monitor", "PULSE_SINK": "speakers",
                                        "PULSE_SERVER": "unix:" + str(path)}, clear=True), \
                    patch.object(voice, "pactl", return_value=self.devices):
                self.assertEqual(voice.microphone_for("speakers"), "mic.monitor")
                with self.assertRaises(voice.VoiceError):
                    voice.microphone_for("mic")
                os.environ["PULSE_SERVER"] = "tcp:localhost"
                with self.assertRaises(voice.VoiceError):
                    voice.microphone_for("speakers")


class VoiceTests(unittest.TestCase):
    def setUp(self):
        self.scope = ExitStack()
        self.addCleanup(self.scope.close)
        self.dir = Path(self.scope.enter_context(tempfile.TemporaryDirectory()))
        for who in ("alice", "bob", "third"):
            subprocess.run(["openssl", "req", "-x509", "-newkey", "ed25519", "-nodes", "-days", "1",
                            "-subj", "/CN=" + who, "-addext", "basicConstraints=critical,CA:FALSE",
                            "-addext", "keyUsage=critical,digitalSignature", "-addext", "extendedKeyUsage=serverAuth,clientAuth",
                            "-keyout", str(self.dir / (who + ".key")), "-out", str(self.dir / (who + ".crt"))],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        with socket.socket(socket.AF_INET6) as probe:
            probe.bind(("::1", 0))
            self.port = probe.getsockname()[1]

    def fields(self, who):
        peer = "bob" if who == "alice" else "alice"
        return {"interface": "lo", "source": "::1", "peer": "::1", "port": self.port,
                "mode": "listen" if who == "alice" else "connect", "selfName": who, "peerName": peer,
                "cert": str(self.dir / (who + ".crt")), "key": str(self.dir / (who + ".key")),
                "peerCert": str(self.dir / (peer + ".crt"))}

    def start(self, who, **updates):
        config = self.dir / (who + ".json")
        config.write_text(json.dumps({**self.fields(who), **updates}))
        endpoint = Endpoint(config)
        self.scope.callback(endpoint.close)
        return endpoint

    def children(self, who, kind):
        p = self.dir / (who + "." + kind)
        return [int(v) for v in p.read_text().splitlines()] if p.exists() else []

    def pair(self):
        a, b = self.start("alice"), self.start("bob")
        self.assertEqual(a.cmd("join")["phase"], "waiting")
        self.assertEqual(b.cmd("join")["phase"], "waiting")
        for side in (a, b):
            until(lambda: side.cmd("status")["remoteSpeaking"])
        return a, b

    def test_room_listener_accepts_while_earlier_tls_or_commit_is_stalled(self):
        async def check(stall_before_tls):
            alice, bob = self.fields("alice"), self.fields("bob")
            server, server_pin = voice.credentials(alice)
            client, client_pin = voice.credentials(bob)
            for context in (server, client):
                context.set_alpn_protocols([voice.RoomChannels.protocol])
            room = b"accepted room test"
            serving = asyncio.create_task(voice.accept_committed_stream(alice, server, server_pin, room))
            writers = []
            try:
                await asyncio.sleep(0)
                if stall_before_tls:
                    _, stalled = await asyncio.open_connection("::1", self.port)
                else:
                    _, stalled = await voice.routed_stream(bob, client, client_pin, room)
                writers.append(stalled)
                async def connect():
                    receive, selected = await voice.routed_stream(bob, client, client_pin, room)
                    writers.append(selected)
                    selected.write(b"C")
                    await selected.drain()
                    _, peer = await serving
                    writers.append(peer)
                    peer.write(b"A")
                    await peer.drain()
                    self.assertEqual(await receive.readexactly(1), b"A")
                await asyncio.wait_for(connect(), 2)
            finally:
                serving.cancel()
                await asyncio.gather(serving, return_exceptions=True)
                for writer in writers:
                    writer.transport.abort()
        for before_tls in (True, False):
            with self.subTest(stall_before_tls=before_tls):
                asyncio.run(check(before_tls))

    def test_room_requires_distinct_peers_and_binds_handshake_to_membership(self):
        pair = self.fields("alice")
        data = {k:pair[k] for k in ("interface", "source", "selfName", "cert", "key")}
        data["source"] = "201::1"
        bob = dict(peer="201::2", port=17887, mode="listen", peerName="bob", peerCert=str(self.dir/"bob.crt"))
        third = dict(peer="201::3", port=17888, mode="listen", peerName="third", peerCert=str(self.dir/"third.crt"))
        def roster(peers):
            (self.dir/"voice-room.json").write_text(json.dumps({**data, "peers":peers}))
            return voice.load_room()
        with patch.object(voice, "CONFIG", self.dir/"voice.json"), patch.object(voice, "trusted_file"):
            self.assertIsNone(voice.load_room())
            edges, preface = roster([bob, third])
            self.assertEqual(len(edges), 2)
            self.assertEqual(preface, roster([third, bob])[1])
            self.assertNotEqual(preface, roster([bob])[1])
            self.assertNotEqual(preface, voice.PREFACE)
            for changes in ({"peer":bob["peer"]}, {"peerCert":bob["peerCert"]}, {"port":bob["port"]},
                            {"peerName":"alice"}, {"peer":"::1"}, {"key":pair["key"]}):
                with self.subTest(changes=changes), self.assertRaises(voice.VoiceError):
                    roster([bob, {**third, **changes}])

    def test_frame_codec_and_meter(self):
        silence = bytes(voice.SAMPLES * 2)
        self.assertEqual(voice.RATE, 48000)
        self.assertEqual(voice.SAMPLES * 1000 // voice.RATE, 20)
        codec, meter = voice.Opus(), voice.Meter()
        self.addCleanup(codec.close)
        signal_pcm = array.array("h", (int(14000 * math.sin(i * .12)) for i in range(voice.SAMPLES))).tobytes()
        for _ in range(5):
            opus = codec.encode(signal_pcm)
            self.assertLess(len(opus), len(signal_pcm))
            decoded = codec.decode(opus)
            self.assertEqual(len(decoded), len(signal_pcm))
            meter.feed(decoded)
        self.assertTrue(meter.snapshot()[1])
        meter.reset()
        meter.feed(silence)
        self.assertEqual(meter.snapshot(), (0, False))
        with self.assertRaises(voice.VoiceError):
            codec.decode(b"x" * 1276)

    def test_account_handshake_waits_for_proofs_and_explicit_consent(self):
        caller, callee = self.start("alice"), self.start("bob")
        caller.cmd("dial", **voice.voice_identity(self.fields("alice")))
        callee.cmd("listen", **voice.voice_identity(self.fields("bob")))
        def phase(endpoint, expected):
            return until(lambda: (s if (s := endpoint.cmd("status"))["phase"] == expected else None))
        first, second = phase(caller, "proving"), phase(callee, "proving")
        self.assertNotEqual(first["nonce"], first["peerNonce"])
        self.assertEqual(first["nonce"], second["peerNonce"])
        self.assertEqual(second["nonce"], first["peerNonce"])
        self.assertIn("error", callee.cmd("accept"))
        # The client verifies the actual Ed25519 signatures. This layer treats each JWS as opaque.
        caller.cmd("prove", proof="a.caller.z")
        callee.cmd("prove", proof="a.callee.z")
        self.assertEqual(phase(caller, "checking")["peerProof"], "a.callee.z")
        self.assertEqual(phase(callee, "checking")["peerProof"], "a.caller.z")
        caller.cmd("verified")
        callee.cmd("verified")
        phase(caller, "ringing")
        phase(callee, "incoming")
        for who in ("alice", "bob"):
            for kind in ("microphone", "speaker"):
                self.assertEqual(self.children(who, kind), [])
        callee.cmd("accept")
        for side in (caller, callee):
            until(lambda: side.cmd("status")["remoteSpeaking"])

    def test_legacy_and_account_connections_cannot_mix(self):
        caller, callee = self.start("alice"), self.start("bob")
        caller.cmd("dial", **voice.voice_identity(self.fields("alice")))
        callee.cmd("join")
        for side in (caller, callee):
            until(lambda: side.cmd("status")["phase"] == "error")
        for who in ("alice", "bob"):
            self.assertEqual(self.children(who, "microphone"), [])

    def test_duplex_mute_resume_and_leave(self):
        a, b = self.pair()
        for who, expected in (("alice", 800), ("bob", 400)):
            out = self.dir / (who + ".decoded")
            until(lambda: out.exists() and out.stat().st_size >= voice.SAMPLES * 12)
            pcm = array.array("h", out.read_bytes()[-voice.SAMPLES * 2:])
            crossings = sum(left <= 0 < right for left, right in zip(pcm, pcm[1:]))
            self.assertLess(abs(crossings * voice.RATE / len(pcm) - expected), 110)
        mic = self.children("alice", "microphone")[-1]
        self.assertTrue(a.cmd("mute", muted=True)["muted"])
        until(lambda: not_running(mic))
        until(lambda: b.cmd("status")["remoteLevel"] == 0 and not b.cmd("status")["remoteSpeaking"])
        self.assertEqual(a.cmd("status")["localLevel"], 0)
        self.assertTrue(a.cmd("status")["remoteSpeaking"])
        a.cmd("mute", muted=False)
        until(lambda: b.cmd("status")["remoteSpeaking"])
        self.assertNotEqual(self.children("alice", "microphone")[-1], mic)
        self.assertEqual(a.cmd("leave")["phase"], "idle")
        until(lambda: b.cmd("status")["phase"] == "error")
        for who in ("alice", "bob"):
            for kind in ("microphone", "speaker"):
                self.assertTrue(all(not_running(pid) for pid in self.children(who, kind)))
        self.assertEqual(a.cmd("leave")["phase"], "idle")

    def test_certificate_mismatch_never_starts_capture(self):
        a = self.start("alice", peerCert=str(self.dir / "third.crt"))
        b = self.start("bob")
        a.cmd("join")
        b.cmd("join")
        for side in (a, b):
            until(lambda: side.cmd("status")["phase"] == "error")
        for who in ("alice", "bob"):
            self.assertFalse(self.children(who, "microphone"))
            self.assertFalse(self.children(who, "speaker"))

    def test_signed_leaf_is_rejected_if_exact_peer_pin_differs(self):
        # A chain-only verifier would accept Bob as an ordinary leaf of the approved CA.
        ca = self.dir / "ca.crt"
        quiet = {"check": True, "stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
        subprocess.run(["openssl", "req", "-x509", "-newkey", "ed25519", "-nodes", "-days", "1",
                        "-subj", "/CN=CA", "-addext", "basicConstraints=critical,CA:TRUE",
                        "-keyout", str(self.dir / "ca.key"), "-out", str(ca)], **quiet)
        subprocess.run(["openssl", "req", "-new", "-key", str(self.dir / "bob.key"), "-subj", "/CN=bob",
                        "-out", str(self.dir / "bob.csr")], **quiet)
        subprocess.run(["openssl", "x509", "-req", "-in", str(self.dir / "bob.csr"), "-CA", str(ca),
                        "-CAkey", str(self.dir / "ca.key"), "-set_serial", "1234", "-days", "1",
                        "-out", str(self.dir / "bob.crt")], **quiet)
        subprocess.run(["openssl", "verify", "-purpose", "sslclient", "-CAfile", str(ca), str(self.dir / "bob.crt")], **quiet)
        a, b = self.start("alice", peerCert=str(ca)), self.start("bob")
        a.cmd("join")
        b.cmd("join")
        until(lambda: a.cmd("status").get("error") == "Сертификат собеседника не совпадает.")
        until(lambda: b.cmd("status")["phase"] == "error")
        for who in ("alice", "bob"):
            self.assertFalse(self.children(who, "microphone") or self.children(who, "speaker"))

    def test_trusted_config_rejects_browser_routes_and_bad_key_permissions(self):
        path = self.dir / "voice.json"
        fields = {**self.fields("alice"), "interface": "tun0", "source": "201::1", "peer": "201::2"}
        # A regular unprivileged test runner cannot chown test fixtures to root.
        with patch.object(voice, "CONFIG", path), patch.object(voice, "trusted_file"):
            path.write_text(json.dumps(fields))
            self.assertEqual(voice.load_route()["source"], "201::1")
            for key, value in (("peer", "::1"), ("source", "1.1.1.1"), ("peer", "201::1"),
                               ("peer", "201::2%lo"), ("interface", "a/b"), ("port", True), ("mode", "relay"),
                               ("selfName", "\nA"), ("cert", "relative"), ("device", "custom")):
                path.write_text(json.dumps({**fields, key: value}))
                with self.subTest(key=key, value=value), self.assertRaises((ValueError, voice.VoiceError)):
                    voice.load_route()
        path.chmod(0o666)
        with self.assertRaises(voice.VoiceError):
            voice.trusted_file(path, private=True)
        ctx, pin = voice.credentials(fields)
        self.assertEqual(ctx.minimum_version, ssl.TLSVersion.TLSv1_3)
        self.assertEqual(ctx.maximum_version, ssl.TLSVersion.TLSv1_3)
        self.assertEqual(ctx.verify_mode, ssl.CERT_REQUIRED)
        self.assertEqual(len(ctx.get_ca_certs(binary_form=True)), 0)  # The explicitly trusted non-CA leaf is pinned below.
        self.assertEqual(pin, ssl.PEM_cert_to_DER_cert(Path(fields["peerCert"]).read_text()))

    def test_no_microphone_while_waiting_and_stdin_eof(self):
        b = self.start("bob")
        self.assertIn("error", b.cmd("join", peer="::1"))
        self.assertEqual(b.cmd("status")["phase"], "idle")
        self.assertEqual(b.cmd("join", muted=True)["phase"], "waiting")
        time.sleep(.2)
        self.assertFalse(self.children("bob", "microphone"))
        b.p.stdin.close()
        self.assertEqual(b.p.wait(timeout=2), 0)

    def test_eof_closes_audio_during_call(self):
        a, b = self.pair()
        a.p.stdin.close()
        self.assertEqual(a.p.wait(timeout=2), 0)
        until(lambda: b.cmd("status")["phase"] == "error")
        self.assertTrue(all(not_running(pid) for pid in self.children("alice", "speaker") + self.children("alice", "microphone")))

    def test_parent_signals_stop_connected_audio(self):
        for sig in (signal.SIGTERM, signal.SIGKILL):
            with self.subTest(signal=sig):
                a, b = self.pair()
                ids = self.children("alice", "microphone") + self.children("alice", "speaker")
                a.p.send_signal(sig)
                a.p.wait(timeout=2)
                until(lambda: all(not_running(pid) for pid in ids))
                until(lambda: b.cmd("status")["phase"] == "error")
                b.cmd("leave")

    def test_termination_while_waiting(self):
        for who in ("alice", "bob"):
            side = self.start(who)
            side.cmd("join")
            time.sleep(.10)
            side.p.terminate()
            self.assertEqual(side.p.wait(timeout=2), 0)


if __name__ == "__main__":
    if sys.argv[1:2] == ["--endpoint"]:
        isolated_endpoint(sys.argv[2])
    elif sys.argv[1:2] == ["--device"]:
        device(*sys.argv[2:])
    else:
        unittest.main()

