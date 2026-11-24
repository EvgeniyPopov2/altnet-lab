#!/usr/bin/env python3
"""Проверка раздачи CAR с поддельным локальным контроллером Tor, без сети."""
import base64
import hashlib
import http.client
import json
from pathlib import Path
import socketserver
import sys
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from site_share import Share
from bridge_client import LocalUI
from http.server import ThreadingHTTPServer


def onion():
    key = bytes(range(32))
    checksum = hashlib.sha3_256(b".onion checksum" + key + b"\x03").digest()[:2]
    return base64.b32encode(key + checksum + b"\x03").decode().lower() + ".onion"


CID = "b" + base64.b32encode(b"\x01\x71\x12\x20" + bytes(range(32))).decode().lower().rstrip("=")


class Controller(socketserver.StreamRequestHandler):
    def handle(self):
        auth = self.rfile.readline().decode("ascii").strip()
        self.server.auth = auth
        self.wfile.write(b"250 OK\r\n")
        request = self.rfile.readline().decode("ascii").strip()
        self.server.command = request
        self.wfile.write(("250-ServiceID=" + onion()[:-6] + "\r\n250 OK\r\n").encode())
        self.rfile.read()
        self.server.closed.set()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


class ShareTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="altnet-share-test-")
        self.addCleanup(self.temp.cleanup)
        directory = Path(self.temp.name)
        (directory / "control.cookie").write_bytes(bytes(range(32)))
        self.control = Server(("127.0.0.1", 0), Controller)
        self.control.closed = threading.Event()
        self.thread = threading.Thread(target=self.control.serve_forever, daemon=True)
        self.thread.start()
        self.instance = SimpleNamespace(control=self.control.server_address[1], directory=directory)
        self.manager = SimpleNamespace(active=self.instance, active_port=777, paused=False,
                                       lock=threading.RLock(), stop=threading.Event())
        self.share = Share(self.manager)

    def tearDown(self):
        self.share.stop()
        self.control.shutdown()
        self.control.server_close()
        self.thread.join()

    def get(self, path, host):
        conn = http.client.HTTPConnection("127.0.0.1", self.share.server.server_port, timeout=3)
        try:
            conn.request("GET", path, headers={"Host": host})
            resp = conn.getresponse()
            return resp.status, resp.read()
        finally:
            conn.close()

    def test_only_cid_path_is_served_and_control_is_ephemeral(self):
        state = self.share.start(CID, b"test-car")
        self.assertEqual(state, {"active": True, "onion": onion(), "cid": CID, "reachability": "unverified"})
        self.assertEqual(self.control.auth, "AUTHENTICATE " + bytes(range(32)).hex())
        self.assertIn("ADD_ONION NEW:ED25519-V3 Flags=DiscardPK MaxStreams=8 Port=80,127.0.0.1:", self.control.command)
        self.assertEqual(self.get(f"/ipfs/{CID}?format=car", onion()), (200, b"test-car"))
        self.assertEqual(self.get("/", onion())[0], 404)
        self.assertEqual(self.get(f"/ipfs/{CID}?format=car", "example.com")[0], 404)
        with self.assertRaises(ValueError):
            self.share.start(CID, b"other")
        self.share.stop()
        self.assertTrue(self.control.closed.wait(3))
        self.assertFalse(self.share.status()["active"])

    def test_tor_pause_or_change_stops_sharing(self):
        for change in ("pause", "replace", "loss"):
            with self.subTest(change=change):
                self.control.closed.clear()
                self.manager.active, self.manager.active_port, self.manager.paused = self.instance, 777, False
                self.share.start(CID, b"car")
                with self.manager.lock:
                    if change == "pause":
                        self.manager.paused = True
                    elif change == "replace":
                        self.manager.active = object()
                    else:
                        self.manager.active_port = 0
                self.assertFalse(self.share.status()["active"])
                self.assertTrue(self.control.closed.wait(3))
                deadline = time.monotonic() + 3
                while self.share.server is not None and time.monotonic() < deadline:
                    time.sleep(.02)
                self.assertIsNone(self.share.server)

    def test_fail_closed_without_route_or_for_bad_input(self):
        self.manager.active_port = 0
        with self.assertRaises(ValueError):
            self.share.start(CID, b"car")
        self.assertIsNone(self.share.server)

    def test_local_api_requires_session_origin_and_explicit_stop(self):
        with ThreadingHTTPServer(("127.0.0.1", 0), LocalUI) as ui:
            ui.authority = f"127.0.0.1:{ui.server_port}"
            ui.token, ui.site_share = "test-session", self.share
            ui.site_publish = threading.BoundedSemaphore(1)
            worker = threading.Thread(target=ui.serve_forever, daemon=True)
            worker.start()
            try:
                def request(method, path, body, headers):
                    conn = http.client.HTTPConnection("127.0.0.1", ui.server_port, timeout=5)
                    try:
                        conn.request(method, path, body=body, headers=headers)
                        response = conn.getresponse()
                        return response.status, response.read()
                    finally:
                        conn.close()
                headers = {"Host": ui.authority, "Origin": "http://" + ui.authority,
                           "X-AltNet-Session": ui.token, "X-AltNet-Site-CID": CID,
                           "Content-Type": "application/vnd.ipld.car"}
                for field, value in (("Origin", "http://evil.example"), ("X-AltNet-Session", "wrong")):
                    try:
                        status = request("POST", "/api/sites/share", b"car", {**headers, field: value})[0]
                    except ConnectionResetError:
                        status = None
                    self.assertIn(status, (403, None))
                    self.assertFalse(self.share.status()["active"])
                for field, value, expected in (("Content-Type", "text/html", 400), ("X-AltNet-Site-CID", "../bad", 503)):
                    try:
                        status = request("POST", "/api/sites/share", b"car", {**headers, field: value})[0]
                    except ConnectionResetError:
                        status = None
                    self.assertIn(status, (expected, None))
                    self.assertFalse(self.share.status()["active"])
                ui.site_publish.acquire()
                try:
                    try:
                        status = request("POST", "/api/sites/share", b"car", headers)[0]
                    except ConnectionResetError:
                        status = None
                    self.assertIn(status, (429, None))
                finally:
                    ui.site_publish.release()
                code, body = request("POST", "/api/sites/share", b"car", headers)
                self.assertEqual(code, 202)
                self.assertEqual(json.loads(body)["onion"], onion())
                status_headers = {"Host": ui.authority, "X-AltNet-Session": ui.token}
                code, body = request("GET", "/api/sites/share", None, status_headers)
                self.assertEqual(code, 200)
                self.assertTrue(json.loads(body)["active"])
                stop_headers = {**status_headers, "Origin": "http://" + ui.authority, "Content-Type": "application/json"}
                code, body = request("POST", "/api/sites/share-stop", "{}", stop_headers)
                self.assertEqual(code, 200)
                self.assertFalse(json.loads(body)["active"])
            finally:
                ui.shutdown()
                worker.join()
        self.manager.active_port = 777
        for cid, car in (("bad", b"car"), (CID, b"")):
            with self.assertRaises(ValueError):
                self.share.start(cid, car)
        self.assertIsNone(self.share.server)


if __name__ == "__main__":
    unittest.main()
