#!/usr/bin/env python3
"""Проверки запуска заранее настроенного браузера через локальный клиент."""
import http.client
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from bridge_client import LocalUI


class StandaloneLaunchTests(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), LocalUI)
        self.server.authority = f"127.0.0.1:{self.server.server_port}"
        self.server.token = "test-only-token"
        self.server.standalone_browser = Path("/fixed/browser/firefox")
        self.server.browser_launch_lock = threading.Lock()
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()

    def request(self, method="POST", body=b"{}", *, origin=None, token=None, host=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        headers = {"Host": host if host is not None else self.server.authority,
                   "Origin": origin if origin is not None else "http://" + self.server.authority,
                   "X-AltNet-Session": token if token is not None else self.server.token,
                   "Content-Type": "application/json"}
        try:
            conn.request(method, "/api/browser/standalone", body if method == "POST" else None, headers)
            response = conn.getresponse()
            return response.status, response.read()
        except ConnectionResetError:
            # Windows may reset after the server rejects a request with an unread body.
            return 403, b""
        finally:
            conn.close()

    @patch("bridge_client.subprocess.Popen")
    def test_fixed_executable_no_page_controlled_url_or_arguments(self, spawn):
        self.assertEqual(self.request()[0], 202)
        spawn.assert_called_once_with([str(self.server.standalone_browser)], cwd=str(self.server.standalone_browser.parent), close_fds=True)
        for body in (b'{"url":"https://example.invalid"}', b'{"path":"evil"}', b'{"profile":"fast"}', b'[]'):
            self.assertEqual(self.request(body=body)[0], 400)
        spawn.assert_called_once()

    @patch("bridge_client.subprocess.Popen")
    def test_requires_session_host_and_same_origin(self, spawn):
        for kwargs in ({"token": "wrong"}, {"origin": "https://example.invalid"}, {"host": "evil.invalid"}):
            self.assertEqual(self.request(**kwargs)[0], 403)
        self.assertEqual(self.request(method="GET", token="wrong")[0], 403)
        spawn.assert_not_called()

    @patch("bridge_client.subprocess.Popen")
    def test_disabled_and_process_start_failure_are_reported(self, spawn):
        self.server.standalone_browser = None
        status, data = self.request(method="GET")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(data), {"available": False})
        self.assertEqual(self.request()[0], 503)
        spawn.assert_not_called()
        self.server.standalone_browser = Path("/missing/firefox")
        spawn.side_effect = OSError("unavailable")
        self.assertEqual(self.request()[0], 503)

    @unittest.skipUnless(os.name == "nt" and os.environ.get("ALTNET_NATIVE_TEST_BROWSER"), "Изолированная сборка Windows-браузера не указана")
    def test_actual_gecko_process_in_an_isolated_copy(self):
        # Не используем и не изменяем профиль пользователя и не запускаем настоящий Tor.
        source = Path(os.environ["ALTNET_NATIVE_TEST_BROWSER"])
        with tempfile.TemporaryDirectory(prefix="altnet-launch-", dir=os.environ.get("TEMP")) as tmp:
            root = Path(tmp)
            shutil.copytree(source.parent, root / "Browser")
            (root / "appdata").mkdir()
            (root / "localappdata").mkdir()
            self.server.standalone_browser = root / "Browser" / source.name
            real_popen = subprocess.Popen
            spawned = []
            def record(*args, **kwargs):
                process = real_popen(*args, **kwargs)
                spawned.append(process)
                return process
            env = {"APPDATA": str(root / "appdata"), "LOCALAPPDATA": str(root / "localappdata"),
                   "TEMP": str(root), "TMP": str(root), "MOZ_HEADLESS": "1",
                   "MOZ_DISABLE_NONLOCAL_CONNECTIONS": "1", "TOR_SKIP_LAUNCH": "1", "TOR_SKIP_CONTROLPORTTEST": "1"}
            try:
                with patch.dict(os.environ, env), patch("bridge_client.subprocess.Popen", side_effect=record):
                    self.assertEqual(self.request()[0], 202)
                    self.assertEqual(len(spawned), 1)
                    time.sleep(5)
                    self.assertIsNone(spawned[0].poll(), "Gecko завершился сразу после запуска")
            finally:
                for process in spawned:
                    if process.poll() is None:
                        subprocess.run(["taskkill.exe", "/PID", str(process.pid), "/T", "/F"],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20, check=False)
                        process.wait(timeout=10)


if __name__ == "__main__":
    unittest.main()
