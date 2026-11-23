#!/usr/bin/env python3
"""Проверки входного формата и устойчивости локального кэша без выхода в сеть."""
import base64
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


path = Path(__file__).resolve().parents[1] / "scripts" / "tor-bridge-catalog.py"
spec = importlib.util.spec_from_file_location("bridge_catalog", path)
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)


class CatalogTests(unittest.TestCase):
    def test_validation(self):
        cert = base64.b64encode(bytes(52)).decode().rstrip("=")
        line = f"obfs4 1.1.1.1:443 {'A' * 40} cert={cert} iat-mode=0"
        self.assertEqual(catalog.canonical_bridge(line), line)
        for bad in (line.replace("1.1.1.1", "127.0.0.1"), line.replace(":443", ":66000"),
                    line.replace(cert, "invalid"), line.replace("iat-mode=0", "iat-mode=8"),
                    line + "\nUseBridges 0", line.replace("obfs4", "unknown")):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                catalog.canonical_bridge(bad)

    def test_update_and_rollback(self):
        with tempfile.TemporaryDirectory() as root:
            target = Path(root) / "cache" / "public.json"
            initial = {"signed_at": 10, "sha256": "a", "bridges": []}
            catalog.publish(initial, target)
            newer = dict(initial, signed_at=20, sha256="b")
            catalog.publish(newer, target)
            for bad in (initial, dict(newer, sha256="c")):
                with self.assertRaises(ValueError):
                    catalog.publish(bad, target)
                self.assertEqual(json.loads(target.read_text()), newer)


if __name__ == "__main__":
    unittest.main()
