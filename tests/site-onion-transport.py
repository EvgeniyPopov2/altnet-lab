#!/usr/bin/env python3
"""Изолированные проверки границ onion-транспорта; публичная сеть не используется."""
import base64
import hashlib
import http.client
import io
import json
import socket
import socketserver
import sys
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import site_onion
from bridge_client import LocalUI, serve_native_parent
from bridge_route import read_exact
from http.server import ThreadingHTTPServer


def onion():
    key = bytes(range(32))
    checksum = hashlib.sha3_256(b".onion checksum" + key + b"\x03").digest()[:2]
    return base64.b32encode(key + checksum + b"\x03").decode().lower() + ".onion"


CID = "b" + base64.b32encode(b"\x01\x71\x12\x20" + bytes(range(32))).decode().lower().rstrip("=")


class FakeSocks(socketserver.BaseRequestHandler):
    def handle(self):
        s = self.request
        s.settimeout(2)
        if read_exact(s, 3) != b"\x05\x01\x02":
            return
        s.sendall(self.server.method_reply)
        if self.server.method_reply != b"\x05\x02":
            return
        version, name_len = read_exact(s, 2)
        name = read_exact(s, name_len)
        password_len = read_exact(s, 1)[0]
        password = read_exact(s, password_len)
        self.server.credentials.append((version, name, password))
        s.sendall(self.server.auth_reply)
        if self.server.auth_reply != b"\x01\x00":
            return
        header = read_exact(s, 5)
        name = read_exact(s, header[4])
        port = read_exact(s, 2)
        self.server.destination = (header[:4], name, port)
        result = self.server.connect_results.pop(0) if self.server.connect_results else self.server.connect_result
        s.sendall(bytes((5, result, 0, 1)) + b"\x7f\x00\x00\x01\x00\x50")
        if result:
            return
        request = bytearray()
        try:
            while not request.endswith(b"\r\n\r\n"):
                request.extend(read_exact(s, 1))
        except OSError:
            return
        self.server.request_data = bytes(request)
        s.sendall(self.server.response)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


class TransportTest(unittest.TestCase):
    def setUp(self):
        self.server = Server(("127.0.0.1", 0), FakeSocks)
        self.server.method_reply = b"\x05\x02"
        self.server.auth_reply = b"\x01\x00"
        self.server.connect_result = 0
        self.server.connect_results = []
        self.server.credentials = []
        self.server.response = b"HTTP/1.1 200 OK\r\nContent-Type: application/vnd.ipld.car\r\nContent-Length: 4\r\n\r\ncar!"
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join()

    def fetch(self, host=None, cid=CID, ready=lambda: True):
        return site_onion.fetch_car(self.server.server_address[1], host or onion(), cid, ready)

    def test_native_channel_uses_socks_and_streams_received_car(self):
        manager = SimpleNamespace(lock=threading.RLock(), active_port=1, paused=False, stop=threading.Event())
        server = SimpleNamespace(socks_port=self.server.server_address[1], site_fetch=threading.BoundedSemaphore(1), shutdown=lambda: None)
        commands = [{"id": 1, "method": "site_open", "onion": onion(), "cid": CID, "profile": "anon"},
                    {"id": 2, "method": "site_read", "offset": 0}, {"id": 3, "method": "site_close"}]
        output = io.StringIO()
        serve_native_parent(io.BytesIO(b"".join(json.dumps(c).encode() + b"\n" for c in commands)), output, server, manager)
        result = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(result[0]["total"], 4)
        self.assertEqual(base64.b64decode(result[1]["data"]), b"car!")
        self.assertTrue(result[2]["ok"])
        self.assertEqual(self.server.destination[1], onion().encode("ascii"))
        self.assertEqual(self.server.destination[2], b"\x00\x50")
        self.assertEqual(len(self.server.credentials), 1)

    def test_socks_domain_only_and_ipfs_path(self):
        self.assertEqual(self.fetch(), b"car!")
        self.assertEqual(self.server.destination, (b"\x05\x01\x00\x03", onion().encode(), b"\x00\x50"))
        self.assertIn(("GET /ipfs/" + CID + "?format=car HTTP/1.1\r\n").encode(), self.server.request_data)
        self.assertIn(("Host: " + onion() + "\r\n").encode(), self.server.request_data)

    def test_unixfs_cids_use_the_same_tor_only_path(self):
        for codec in (0x55, 0x70):
            cid = "b" + base64.b32encode(bytes((1, codec, 0x12, 0x20)) + bytes(range(32))).decode().lower().rstrip("=")
            with self.subTest(codec=codec):
                self.assertEqual(self.fetch(cid=cid), b"car!")
                self.assertIn(("GET /ipfs/" + cid + "?format=car HTTP/1.1\r\n").encode(), self.server.request_data)

    def test_each_fetch_uses_a_new_socks_isolation_token(self):
        self.assertEqual(self.fetch(), b"car!")
        self.assertEqual(self.fetch(), b"car!")
        first, second = self.server.credentials
        self.assertEqual((first[0], first[2]), (1, b"x"))
        self.assertEqual(len(first[1]), 64)
        self.assertNotEqual(first[1], second[1])

    def test_reject_proxy_without_isolation_and_failed_auth(self):
        for method, auth in ((b"\x05\x00", b"\x01\x00"), (b"\x05\x02", b"\x01\x01")):
            with self.subTest(method=method, auth=auth):
                self.server.method_reply, self.server.auth_reply = method, auth
                with self.assertRaises(OSError):
                    self.fetch()

    def test_reject_untrusted_address_before_connect(self):
        invalid = ["example.com", "127.0.0.1", "http://" + onion(), onion() + "/", "a" * 56 + ".onion", onion().upper(), onion() + ":80"]
        with patch("site_onion.socket.create_connection", side_effect=AssertionError("unexpected connection")):
            for host in invalid:
                with self.subTest(host=host), self.assertRaises(ValueError):
                    self.fetch(host)
            for cid in ("../../private", CID.upper(), CID[:-1] + "b", "bafy"):
                with self.subTest(cid=cid), self.assertRaises(ValueError):
                    self.fetch(cid=cid)
            with self.assertRaises(OSError):
                self.fetch(ready=lambda: False)

    def test_no_fallback_on_failure(self):
        with patch("site_onion.socket.create_connection", side_effect=OSError("unavailable")) as connect:
            with self.assertRaises(OSError):
                self.fetch()
            connect.assert_called_once_with(("127.0.0.1", self.server.server_address[1]), 5)

    def test_transient_onion_failure_retries_only_through_the_same_tor_socks(self):
        real = site_onion.connect_onion
        attempts = []
        def flaky(port, host):
            attempts.append((port, host))
            if len(attempts) < 3: raise site_onion.OnionUnavailable("temporary")
            return real(port, host)
        with patch("site_onion.connect_onion", side_effect=flaky), patch("site_onion.time.sleep"):
            self.assertEqual(self.fetch(), b"car!")
        self.assertEqual(attempts, [(self.server.server_address[1], onion())] * 3)
        self.assertEqual(len(self.server.credentials), 1)

    def test_retries_use_fresh_tor_isolation_credentials(self):
        self.server.connect_results = [4, 6, 0]
        with patch("site_onion.time.sleep"):
            self.assertEqual(self.fetch(), b"car!")
        names = [item[1] for item in self.server.credentials]
        self.assertEqual(len(names), site_onion.CONNECT_ATTEMPTS)
        self.assertEqual(len(set(names)), site_onion.CONNECT_ATTEMPTS)

    def test_retries_are_bounded_and_stop_when_route_is_lost(self):
        with patch("site_onion.connect_onion", side_effect=site_onion.OnionUnavailable("unavailable")) as connect, patch("site_onion.time.sleep"):
            with self.assertRaises(site_onion.OnionUnavailable): self.fetch()
            self.assertEqual(connect.call_count, site_onion.CONNECT_ATTEMPTS)
        active = True
        def disconnected(*_):
            nonlocal active
            active = False
            raise site_onion.OnionUnavailable("route lost")
        with patch("site_onion.connect_onion", side_effect=disconnected) as connect, patch("site_onion.time.sleep"):
            with self.assertRaises(site_onion.OnionUnavailable): self.fetch(ready=lambda: active)
            connect.assert_called_once()

    def test_protocol_errors_do_not_retry(self):
        with patch("site_onion.connect_onion", side_effect=OSError("invalid protocol")) as connect, patch("site_onion.time.sleep") as sleep:
            with self.assertRaises(OSError): self.fetch()
            connect.assert_called_once()
            sleep.assert_not_called()
        self.server.connect_result = 2  # Правила SOCKS отклонили соединение.
        with patch("site_onion.time.sleep") as sleep:
            with self.assertRaisesRegex(OSError, "rejected"): self.fetch()
            self.assertEqual(len(self.server.credentials), 1)
            sleep.assert_not_called()

    def test_reject_redirect_oversize_wrong_type_and_truncation(self):
        for response in (
            b"HTTP/1.1 302 Found\r\nLocation: http://example.com\r\nContent-Length: 0\r\n\r\n",
            b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 4\r\n\r\ncar!",
            b"HTTP/1.1 200 OK\r\nContent-Type: application/vnd.ipld.car\r\nContent-Length: 999999999\r\n\r\n",
            b"HTTP/1.1 200 OK\r\nContent-Type: application/vnd.ipld.car\r\nContent-Length: 5\r\n\r\ncar!",
            b"HTTP/1.1 200 OK\r\nContent-Type: application/vnd.ipld.car\r\nContent-Encoding: gzip\r\nContent-Length: 4\r\n\r\ncar!",
        ):
            self.server.response = response
            with self.subTest(response=response), self.assertRaises((OSError, site_onion.http.client.HTTPException)):
                self.fetch()

    def test_invalid_gateway_response_is_not_retried(self):
        self.server.response = b"HTTP/1.1 302 Found\r\nLocation: http://example.invalid\r\nContent-Length: 0\r\n\r\n"
        with patch("site_onion.connect_onion", wraps=site_onion.connect_onion) as connect, patch("site_onion.time.sleep") as sleep:
            with self.assertRaises(OSError): self.fetch()
            connect.assert_called_once()
            sleep.assert_not_called()

    def test_route_lost_after_connect(self):
        counter = iter((True, False))
        with self.assertRaises(OSError):
            self.fetch(ready=lambda: next(counter))

    def test_streaming_size_limit_without_content_length(self):
        self.server.response = b"HTTP/1.1 200 OK\r\nContent-Type: application/vnd.ipld.car\r\n\r\n12345"
        with patch("site_onion.MAX_CAR", 4), self.assertRaises(OSError):
            self.fetch()

    def test_local_api_authentication_and_fail_closed(self):
        manager = SimpleNamespace(active_port=1, paused=False, stop=threading.Event(), lock=threading.RLock())
        with ThreadingHTTPServer(("127.0.0.1", 0), LocalUI) as ui:
            ui.authority = f"127.0.0.1:{ui.server_port}"
            ui.token = "test-session"
            ui.manager = manager
            ui.socks_port = self.server.server_address[1]
            ui.site_fetch = threading.BoundedSemaphore(1)
            worker = threading.Thread(target=ui.serve_forever, daemon=True)
            worker.start()
            try:
                def post(headers, body=None):
                    conn = http.client.HTTPConnection("127.0.0.1", ui.server_port, timeout=3)
                    try:
                        conn.request("POST", "/api/sites/onion-car", json.dumps(body if body is not None else {"onion": onion(), "cid": CID, "profile": "anon"}), headers)
                        response = conn.getresponse()
                        return response.status, response.read()
                    finally:
                        conn.close()
                headers = {"Host": ui.authority, "Origin": "http://" + ui.authority,
                           "X-AltNet-Session": ui.token, "Content-Type": "application/json"}
                for field, value in (("Host", "evil.example"), ("Origin", "http://evil.example"), ("X-AltNet-Session", "bad")):
                    try:
                        status = post({**headers, field: value})[0]
                    except ConnectionResetError:
                        # На Windows сервер может закрыть соединение с непрочитанным телом.
                        status = None
                    self.assertIn(status, (403, None))
                self.assertEqual(post(headers), (200, b"car!"))
                with patch("bridge_client.fetch_car", side_effect=AssertionError("unexpected network request")):
                    self.assertEqual(post(headers, {"onion": onion(), "cid": CID, "profile": "fast"})[0], 409)
                    self.assertEqual(post(headers, {"onion": onion(), "cid": CID})[0], 400)
                    self.assertEqual(post(headers, {"onion": onion(), "cid": CID, "profile": "unknown"})[0], 400)
                    conn = http.client.HTTPConnection("127.0.0.1", ui.server_port, timeout=3)
                    try:
                        conn.putrequest("POST", "/api/sites/onion-car", skip_host=True)
                        for key, value in headers.items(): conn.putheader(key, value)
                        conn.putheader("Content-Length", "2"); conn.putheader("Content-Length", "2")
                        conn.endheaders(b"{}")
                        try: self.assertEqual(conn.getresponse().status, 400)
                        except ConnectionResetError: pass  # Сервер мог закрыть непрочитанное тело.
                    finally: conn.close()
                manager.paused = True
                self.assertEqual(post(headers)[0], 502)
                manager.paused, manager.active_port = False, 0
                self.assertEqual(post(headers)[0], 502)
                ui.site_fetch.acquire()
                try:
                    self.assertEqual(post(headers)[0], 429)
                finally:
                    ui.site_fetch.release()
            finally:
                ui.shutdown()
                worker.join()


if __name__ == "__main__":
    unittest.main()
