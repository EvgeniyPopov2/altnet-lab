#!/usr/bin/env python3
"""Проверка синхронизации переносимых архивов без реального состояния клиента."""
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
import zipfile

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "sync-client-ui-archives.py"


class SyncArchivesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.dist = self.root / "dist"
        self.dist.mkdir()
        (self.dist / "index.html").write_text("новый интерфейс", encoding="utf-8")
        (self.dist / "assets").mkdir()
        (self.dist / "assets" / "new.js").write_text("new script", encoding="utf-8")
        self.win, self.linux = self.root / "old.zip", self.root / "old.tar.gz"
        with zipfile.ZipFile(self.win, "w") as archive:
            archive.writestr("AltNet/ui/index.html", "old")
            archive.writestr("AltNet/scripts/client.py", "trusted base")
        with tarfile.open(self.linux, "w:gz") as archive:
            for name, content in (("AltNet/ui/index.html", b"old"), ("AltNet/scripts/client.py", b"trusted base")):
                info = tarfile.TarInfo(name)
                info.size = len(content)
                archive.addfile(info, io.BytesIO(content))
        self.output = self.root / "result"

    def run_sync(self, *extra):
        return subprocess.run([sys.executable, "-B", str(SCRIPT), "--windows", str(self.win), "--linux", str(self.linux), "--dist", str(self.dist), "--output", str(self.output), *extra], capture_output=True)

    def test_replaces_ui_and_preserves_base_in_both_formats(self):
        result = self.run_sync()
        self.assertEqual(result.returncode, 0, result.stderr)
        with zipfile.ZipFile(self.output / "AltNet-Client-windows-x86_64.zip") as archive:
            self.assertEqual(archive.read("AltNet/ui/index.html"), "новый интерфейс".encode())
            self.assertEqual(archive.read("AltNet/scripts/client.py"), b"trusted base")
            self.assertIn("AltNet/ui/assets/new.js", archive.namelist())
        with tarfile.open(self.output / "AltNet-Client-linux-x86_64.tar.gz") as archive:
            self.assertEqual(archive.extractfile("AltNet/ui/index.html").read(), "новый интерфейс".encode())
            self.assertEqual(archive.extractfile("AltNet/scripts/client.py").read(), b"trusted base")
        self.assertIn("ui_index_sha256", json.loads((self.output / "SHA256.json").read_text(encoding="utf-8")))
        self.assertNotEqual(self.run_sync().returncode, 0)

    def test_refuses_private_state_without_producing_output(self):
        with zipfile.ZipFile(self.win, "a") as archive:
            archive.writestr("AltNet/state/private.json", "private")
        self.assertNotEqual(self.run_sync().returncode, 0)
        self.assertFalse(self.output.exists())

    def test_includes_site_transport_without_changing_other_files(self):
        scripts = self.root / "scripts"
        scripts.mkdir()
        for name in ("bridge_client.py", "site_onion.py", "site_share.py"):
            (scripts / name).write_text("new " + name, encoding="utf-8")
        result = self.run_sync("--site-transport-dir", str(scripts))
        self.assertEqual(result.returncode, 0, result.stderr)
        with zipfile.ZipFile(self.output / "AltNet-Client-windows-x86_64.zip") as archive:
            self.assertEqual(archive.read("AltNet/scripts/site_onion.py"), b"new site_onion.py")
            self.assertEqual(archive.read("AltNet/scripts/bridge_client.py"), b"new bridge_client.py")
            self.assertEqual(archive.read("AltNet/scripts/site_share.py"), b"new site_share.py")
            self.assertEqual(archive.read("AltNet/scripts/client.py"), b"trusted base")
        with tarfile.open(self.output / "AltNet-Client-linux-x86_64.tar.gz") as archive:
            self.assertEqual(archive.extractfile("AltNet/scripts/site_onion.py").read(), b"new site_onion.py")
            self.assertEqual(archive.extractfile("AltNet/scripts/bridge_client.py").read(), b"new bridge_client.py")
            self.assertEqual(archive.extractfile("AltNet/scripts/site_share.py").read(), b"new site_share.py")
        manifest = json.loads((self.output / "SHA256.json").read_text(encoding="utf-8"))
        self.assertEqual(len(manifest["replaced_scripts"]), 3)

    def test_updates_catalog_verifier_in_both_formats(self):
        catalog = self.root / "tor-bridge-catalog.py"
        catalog.write_text("verified catalog", encoding="utf-8")
        result = self.run_sync("--bridge-catalog", str(catalog))
        self.assertEqual(result.returncode, 0, result.stderr)
        with zipfile.ZipFile(self.output / "AltNet-Client-windows-x86_64.zip") as archive:
            self.assertEqual(archive.read("AltNet/scripts/tor-bridge-catalog.py"), b"verified catalog")
            self.assertEqual(archive.read("AltNet/scripts/client.py"), b"trusted base")
        with tarfile.open(self.output / "AltNet-Client-linux-x86_64.tar.gz") as archive:
            self.assertEqual(archive.extractfile("AltNet/scripts/tor-bridge-catalog.py").read(), b"verified catalog")
        self.assertIn("AltNet/scripts/tor-bridge-catalog.py", json.loads((self.output / "SHA256.json").read_text(encoding="utf-8"))["replaced_scripts"])


if __name__ == "__main__":
    unittest.main()
