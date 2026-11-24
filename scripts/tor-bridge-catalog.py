#!/usr/bin/env python3
"""Проверить подписанный Tor Expert Bundle и сформировать локальный каталог публичных obfs4-мостов."""
import argparse
import base64
from contextlib import contextmanager
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile


SIGNER = "EF6E286DDA85EA2A4BA7DE684E2C6E8793298290"
CONFIG = "tor/pluggable_transports/pt_config.json"


def canonical_bridge(line):
    if not isinstance(line, str) or len(line) > 512 or not line.isascii() or not line.isprintable():
        raise ValueError("Недопустимая строка моста")
    fields = line.split()
    if len(fields) != 5 or fields[0] != "obfs4" or not re.fullmatch(r"[0-9a-fA-F]{40}", fields[2]):
        raise ValueError("Некорректный транспорт или отпечаток")
    host, sep, port = fields[1].rpartition(":")
    if host.startswith("[") != host.endswith("]") or "%" in host:
        raise ValueError("Некорректный адрес моста")
    address = ipaddress.ip_address(host.removeprefix("[").removesuffix("]"))
    if not address.is_global or address.is_multicast or not sep or not port.isdecimal() or not 0 < int(port) < 65536:
        raise ValueError("Некорректный адрес моста")
    params = dict(field.split("=", 1) for field in fields[3:])
    if set(params) != {"cert", "iat-mode"} or params["iat-mode"] not in {"0", "1", "2"}:
        raise ValueError("Некорректные параметры obfs4")
    cert = params["cert"].rstrip("=")
    if len(base64.b64decode(cert + "=" * (-len(cert) % 4), validate=True)) != 52:
        raise ValueError("Некорректный сертификат obfs4")
    endpoint = f"[{address}]:{int(port)}" if address.version == 6 else f"{address}:{int(port)}"
    return f"obfs4 {endpoint} {fields[2].upper()} cert={cert} iat-mode={params['iat-mode']}"


def load_catalog(bundle, signature, keyring, verifier="gpgv"):
    # Подпись и tar должны проверяться на одних и тех же байтах даже при смене опубликованного файла.
    with tempfile.TemporaryDirectory() as private:
        copy = Path(private) / "bundle"
        digest = hashlib.sha256()
        with bundle.open("rb") as src, copy.open("wb") as dst:
            while chunk := src.read(1024 * 1024):
                dst.write(chunk)
                digest.update(chunk)
        shutil.copyfile(keyring, Path(private) / "trusted.gpg")
        shutil.copyfile(signature, Path(private) / "bundle.asc")
        result = subprocess.run([verifier, "--homedir", ".", "--status-fd", "1", "--keyring",
                                 "./trusted.gpg", "./bundle.asc", "./bundle"], cwd=private,
                                stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=90)
        signatures = [line.split() for line in result.stdout.splitlines() if line.startswith("[GNUPG:] VALIDSIG ")]
        rejected = re.search(r"^\[GNUPG:\] (BADSIG|ERRSIG|REVKEYSIG|EXPKEYSIG|EXPSIG) ", result.stdout, re.M)
        if result.returncode or rejected or len(signatures) != 1 or SIGNER not in (signatures[0][2], signatures[0][-1]):
            raise ValueError("Подпись Tor Browser Developers не подтверждена")
        with tarfile.open(copy, "r:gz") as archive:
            entry = archive.getmember(CONFIG)
            if not entry.isfile() or entry.size > 1024 * 1024:
                raise ValueError("Некорректный файл конфигурации в архиве")
            profiles = json.load(archive.extractfile(entry))["bridges"]
            lines = profiles["obfs4"]
        if not isinstance(lines, list) or not 1 <= len(lines) <= 256:
            raise ValueError("Некорректный размер публичного списка")
        bridges = list(dict.fromkeys(canonical_bridge(line) for line in lines))
        snowflake = profiles.get("snowflake", [])
        if not isinstance(snowflake, list) or len(snowflake) > 16 or any(
                not isinstance(x, str) or len(x) > 4096 or not x.isascii() or not x.isprintable()
                or not re.fullmatch(r"snowflake [^ ]+ [a-fA-F0-9]{40} .+", x) for x in snowflake):
            raise ValueError("Некорректные параметры подписанного резерва Snowflake")
        return {"source": "tor-expert-bundle", "signed_at": int(signatures[0][4]),
                "sha256": digest.hexdigest(), "bridges": bridges, "snowflake": snowflake}


@contextmanager
def catalog_lock(output):
    with output.with_name(output.name + ".lock").open("a+b") as lock:
        if os.name == "nt":
            import msvcrt
            if not lock.tell():
                lock.write(b"\0")
                lock.flush()
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        yield


def publish(catalog, output):
    output.parent.mkdir(parents=True, exist_ok=True)
    with catalog_lock(output):
        replace_catalog(catalog, output)


def replace_catalog(catalog, output):
    if output.exists():
        previous = json.loads(output.read_text(encoding="utf-8"))
        if catalog["signed_at"] < previous["signed_at"]:
            raise ValueError("Отклонена предыдущая версия каталога")
        if catalog["signed_at"] == previous["signed_at"] and catalog["sha256"] != previous["sha256"]:
            raise ValueError("Две разные версии имеют одинаковое время подписи")
    with tempfile.NamedTemporaryFile(dir=output.parent, delete=False, mode="w", encoding="utf-8") as temp:
        path = Path(temp.name)
        try:
            json.dump(catalog, temp, ensure_ascii=True)
            temp.flush()
            os.fsync(temp.fileno())
        except BaseException:
            temp.close()
            path.unlink(missing_ok=True)
            raise
    try:
        os.replace(path, output)
    finally:
        path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("signature", type=Path)
    parser.add_argument("keyring", type=Path, help="Доверенное хранилище ключей администратора")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    catalog = load_catalog(args.bundle, args.signature, args.keyring)
    publish(catalog, args.output)
    print(f"Проверено публичных мостов: {len(catalog['bridges'])}")


if __name__ == "__main__":
    main()
