"""Изолированные проверки подписи, номера версии и неизменности байтов поставки."""
import base64
import hashlib
import json
import os
from pathlib import Path
import runpy
import tempfile
import unittest

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

delivery = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts/verify-browser-delivery.py"))


class DeliveryTests(unittest.TestCase):
    def test_only_expected_signed_bytes_reach_staging(self):
        with tempfile.TemporaryDirectory(dir=os.environ["TEMP"]) as tmp:
            root = Path(tmp)
            archive, manifest, signature, public = [root / n for n in ("archive", "manifest", "signature", "public")]
            data = b"synthetic package"
            archive.write_bytes(data)
            key = Ed25519PrivateKey.generate()
            public.write_bytes(key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
            manifest.write_bytes(json.dumps(dict(product=delivery["PRODUCT"],build=7,size=len(data),sha256=hashlib.sha256(data).hexdigest())).encode())
            def sign(k):
                signature.write_bytes(base64.b64encode(k.sign(manifest.read_bytes())))
            def verify(build=7):
                return delivery["verified_copy"](archive,manifest,signature,[public],build,root)
            sign(key)
            verified = verify()
            self.assertEqual(verified.read_bytes(),data)
            with self.assertRaises(ValueError):
                verify(8)
            sign(Ed25519PrivateKey.generate())
            with self.assertRaises(ValueError):
                verify()
            sign(key)
            for package in (data[:-1], data+b"x", b"X"+data[1:]):
                archive.write_bytes(package)
                with self.assertRaises(ValueError):
                    verify()
            self.assertEqual(list(root.rglob("AltNet-Browser.zip")),[verified])
            self.assertEqual(verified.read_bytes(),data)


if __name__ == "__main__":
    unittest.main()
