"""Проверка шифрованной копии на синтетических данных под текущим пользователем Windows."""
import base64
import json
import os
from pathlib import Path
import runpy
import sqlite3
from contextlib import closing
import tempfile
import unittest

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

module = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts/stage-edge-transfer.py"))


class TransferTests(unittest.TestCase):
    def test_backup_verifies_after_reopening_and_rejects_changes(self):
        key = AESGCM.generate_key(bit_length=256)
        nonce = os.urandom(12)
        def b64(data):
            return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")
        header = b64(b'{"alg":"dir","enc":"A256GCM","typ":"altnet-transfer+jwe"}')
        plain = b'{"version":1,"local":[["altnet.synthetic","synthetic-value"]],"databases":[]}'
        encrypted = AESGCM(key).encrypt(nonce, plain, header.encode())
        envelope = ".".join([header, "", b64(nonce), b64(encrypted[:-16]), b64(encrypted[-16:])])
        with tempfile.TemporaryDirectory(dir=os.environ["TEMP"]) as tmp:
            destination, counts = module["store"](Path(tmp), envelope, key)
            self.assertEqual(counts, (1, 0))
            self.assertEqual(module["verify"](destination)[1:], (1, 0))
            raw = destination.read_bytes()
            self.assertNotIn(b"synthetic-value", raw)
            self.assertNotIn(base64.b64encode(key), raw)
            doc = json.loads(raw)
            doc["envelope"] = doc["envelope"].replace(b64(nonce), b64(bytes(12)), 1)
            destination.write_text(json.dumps(doc))
            with self.assertRaises(Exception):
                module["verify"](destination)

    def test_staged_vault_reopens_and_never_overwrites_other_or_corrupt_data(self):
        vault = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts/workspace_vault.py"))
        snap = {"version":1, "local":[["altnet.draft","synthetic private text"]], "databases":[
            {"name":"altnet-ipfs-site-cache","records":[["test",{"kind":"bytes","value":"AP8="}]]},
            {"name":"altnet-sitebuilder-drafts","records":[]}]}
        with tempfile.TemporaryDirectory(dir=os.environ["TEMP"]) as tmp:
            dest = Path(tmp) / "workspace.sqlite"
            self.assertEqual(vault["stage"](dest,snap,"one"),2)
            original = dest.read_bytes()
            self.assertNotIn(b"synthetic private text",original)
            self.assertEqual(vault["stage"](dest,snap,"one"),2)
            with self.assertRaises(ValueError):
                vault["stage"](dest,snap,"two")
            self.assertEqual(dest.read_bytes(),original)
            with closing(sqlite3.connect(dest)) as db, db:
                db.execute("DELETE FROM records")
            with self.assertRaises(ValueError):
                vault["verify"](dest,snap,"one")
            dup = {"version":1,"local":[["altnet.a","a"],["altnet.a","b"]],"databases":[]}
            fresh = Path(tmp) / "other.sqlite"
            with self.assertRaises(sqlite3.IntegrityError):
                vault["stage"](fresh,dup,"duplicate")
            self.assertFalse(fresh.exists())


if __name__ == "__main__":
    unittest.main()
