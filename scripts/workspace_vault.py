"""Личное хранилище записей приложения в Windows. До переключения исходного профиля импорт доступен только для чтения."""
import base64
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import tempfile

import win32crypt

DATABASES = {"altnet-ipfs-site-cache", "altnet-published-sites", "altnet-sitebuilder-drafts"}
SCHEMA = 1
LOCAL = "localStorage"


def canonical(value):
    return json.dumps(value, ensure_ascii=True, allow_nan=False, separators=(",", ":")).encode("ascii")


def record_id(bucket, key):
    return hashlib.sha256(canonical([bucket, key])).digest()


def protect(data):
    return win32crypt.CryptProtectData(data, "AltNet workspace", None, None, None, 1)


def reveal(data):
    return win32crypt.CryptUnprotectData(data, None, None, None, 1)[1]


def entries(snapshot):
    if set(snapshot) != {"version", "local", "databases"} or type(snapshot["version"]) is not int or snapshot["version"] != 1:
        raise ValueError("Неизвестный формат снимка")
    names = set()
    for key, value in snapshot["local"]:
        if not isinstance(key, str) or not key.startswith("altnet.") or not isinstance(value, str):
            raise ValueError("Неизвестная локальная запись")
        yield LOCAL, key, value
    for db in snapshot["databases"]:
        name = db["name"]
        if set(db) != {"name", "records"} or name not in DATABASES or name in names:
            raise ValueError("Неизвестная база снимка")
        names.add(name)
        for key, value in db["records"]:
            if not isinstance(key, str) or len(key) > 2048 or not isinstance(value, dict) or set(value) != {"kind", "value"}:
                raise ValueError("Неизвестная запись снимка")
            if value["kind"] == "bytes":
                if not isinstance(value["value"], str):
                    raise ValueError("Неизвестные бинарные данные")
                base64.b64decode(value["value"], validate=True)
            elif value["kind"] != "json":
                raise ValueError("Неизвестное значение снимка")
            yield name, key, value


def check(db, snapshot, fingerprint):
    if db.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
        raise ValueError("Файл хранилища повреждён")
    header = db.execute("SELECT sealed FROM migration WHERE id=1").fetchone()
    names = [d["name"] for d in snapshot["databases"]]
    if not header or json.loads(reveal(header[0])) != [SCHEMA, "staged", fingerprint, names]:
        raise ValueError("Хранилище содержит другой снимок")
    count = 0
    for bucket, key, value in entries(snapshot):
        row = db.execute("SELECT sealed FROM records WHERE id=?", (record_id(bucket, key),)).fetchone()
        if not row or reveal(row[0]) != canonical([bucket, key, value]):
            raise ValueError("Проверка записи после импорта не прошла")
        count += 1
    if db.execute("SELECT count(*) FROM records").fetchone()[0] != count:
        raise ValueError("Число записей не совпало")
    return count


def verify(path, snapshot, fingerprint):
    with closing(sqlite3.connect(path.resolve(strict=True).as_uri() + "?mode=ro", uri=True)) as db:
        return check(db, snapshot, fingerprint)


def stage(path, snapshot, fingerprint):
    """Ранее существующее хранилище только сверяется. Новый файл появляется целиком."""
    path = Path(path)
    if path.parent.resolve(strict=True).drive.upper() != "H:":
        raise ValueError("Хранилище должно находиться на H:")
    if path.exists():
        return verify(path, snapshot, fingerprint)
    fd, name = tempfile.mkstemp(prefix=".altnet-stage-", suffix=".sqlite", dir=path.parent)
    os.close(fd)
    pending = Path(name)
    try:
        db = sqlite3.connect(pending)
        try:
            db.execute("PRAGMA synchronous=FULL")
            with db:
                db.execute("CREATE TABLE records(id BLOB PRIMARY KEY, sealed BLOB NOT NULL) WITHOUT ROWID")
                db.execute("CREATE TABLE migration(id INTEGER PRIMARY KEY CHECK(id=1), sealed BLOB NOT NULL)")
                names = [d["name"] for d in snapshot["databases"]]
                for bucket, key, value in entries(snapshot):
                    db.execute("INSERT INTO records VALUES (?,?)", (record_id(bucket, key), protect(canonical([bucket, key, value]))))
                db.execute("INSERT INTO migration VALUES (1,?)", (protect(canonical([SCHEMA, "staged", fingerprint, names])),))
        finally:
            db.close()
        count = verify(pending, snapshot, fingerprint)
        # В Windows rename на занятое имя завершается ошибкой и сохраняет чужую копию.
        try:
            pending.rename(path)
        except FileExistsError:
            return verify(path, snapshot, fingerprint)
        return count
    finally:
        pending.unlink(missing_ok=True)
