#!/usr/bin/env python3
"""Only synthetic files in a fresh temporary directory on H:."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/prepare-native-workspace-test.py"


class BundledWorkspacePackageTests(unittest.TestCase):
    def test_test_copy_preserves_source_and_excludes_user_profile(self):
        with tempfile.TemporaryDirectory(prefix="altnet-package-test-", dir=os.environ.get("TEMP")) as tmp:
            root = Path(tmp); browser = root / "original" / "Browser"; browser.mkdir(parents=True)
            (browser / "firefox.exe").write_bytes(b"synthetic executable")
            archive = browser / "omni.ja"
            with zipfile.ZipFile(archive, "w") as out:
                for name in ("NativeWorkspaceShell.sys.mjs", "NativeSessionChannel.sys.mjs"):
                    out.writestr("moz-src/browser/components/abouttor/" + name, b"old synthetic module")
            original = archive.read_bytes()
            private = browser / "TorBrowser/Data/Browser/profile.default/private.txt"
            private.parent.mkdir(parents=True); private.write_text("synthetic private data", encoding="utf-8")
            dist = root / "dist"; (dist / "assets").mkdir(parents=True)
            (dist / "index.html").write_text("<title>synthetic</title>", encoding="utf-8")
            (dist / "assets/app-test.js").write_text("synthetic", encoding="utf-8")
            work = root / "work"; work.mkdir()
            command = [sys.executable, "-B", str(SCRIPT), "--browser", str(browser / "firefox.exe"), "--dist", str(dist), "--temp", str(work)]
            env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
            result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", env=env, timeout=30)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            copies = list(work.glob("altnet-bundled-workspace-*")); self.assertEqual(len(copies), 1)
            copy = copies[0] / "Browser"
            self.assertFalse((copy / "TorBrowser/Data").exists())
            self.assertEqual(private.read_text(encoding="utf-8"), "synthetic private data")
            self.assertEqual(archive.read_bytes(), original)
            with zipfile.ZipFile(copy / "omni.ja") as bundled:
                self.assertEqual(bundled.read("altnet-workspace-client/index.html"), b"<title>synthetic</title>")
                self.assertEqual(bundled.read("altnet-workspace-client/assets/app-test.js"), b"synthetic")
                for name in ("NativeWorkspaceShell.sys.mjs", "NativeSessionChannel.sys.mjs"):
                    self.assertEqual(bundled.read("moz-src/browser/components/abouttor/" + name), (ROOT / "browser/tor-browser/native" / name).read_bytes())

    def test_unknown_assets_are_rejected_before_copy(self):
        with tempfile.TemporaryDirectory(prefix="altnet-package-test-", dir=os.environ.get("TEMP")) as tmp:
            root = Path(tmp); browser = root / "Browser"; browser.mkdir()
            (browser / "firefox.exe").write_bytes(b"test"); (browser / "omni.ja").write_bytes(b"test")
            dist = root / "dist"; dist.mkdir(); (dist / "index.html").write_text("test"); (dist / "private.json").write_text("test")
            work = root / "work"; work.mkdir()
            result = subprocess.run([sys.executable, "-B", str(SCRIPT), "--browser", str(browser / "firefox.exe"),
                                     "--dist", str(dist), "--temp", str(work)], capture_output=True, timeout=30)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(list(work.iterdir()), [])
            self.assertEqual((browser / "omni.ja").read_bytes(), b"test")


if __name__ == "__main__":
    unittest.main()
