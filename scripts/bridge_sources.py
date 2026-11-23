"""Obtain a signed public bridge pool for this installation. Only vendor archives are mirrored."""
import importlib
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import time
from urllib.parse import urlsplit
from bridge_route import through_tor

catalog = importlib.import_module("tor-bridge-catalog")
INDEX = "https://download.torproject.org/tor/"
BUNDLE = re.compile(r'https://dist\.torproject\.org/torbrowser/([0-9]+(?:\.[0-9]+){1,3})/tor-expert-bundle-linux-x86_64-\1\.tar\.gz')
MAX_BUNDLE = 96 << 20


def atomic_json(path, value):
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as f:
        temp = Path(f.name)
        try:
            json.dump(value, f)
            f.flush()
            os.fsync(f.fileno())
        except BaseException:
            f.close()
            temp.unlink(missing_ok=True)
            raise
    try:
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def fetch(url, dest, limit, cancelled, socks_port):
    address = urlsplit(url)
    if (address.scheme != "https" or address.hostname not in ("download.torproject.org", "dist.torproject.org")
            or address.port not in (None, 443) or address.username or address.password or address.fragment):
        raise ValueError("Недопустимый источник каталога")
    if not socks_port:
        raise ConnectionError("Нет подтверждённого маршрута Tor")
    deadline = time.monotonic() + 60
    if cancelled():
        raise InterruptedError()
    connection = http.client.HTTPSConnection(address.hostname, timeout=6)
    connection._create_connection = lambda *args, **kwargs: through_tor(socks_port, address.hostname)
    try:
        connection.request("GET", address.path or "/")
        response = connection.getresponse()
        if response.status != 200:
            raise OSError("Источник каталога недоступен")
        with dest.open("wb") as out:
            total = 0
            while True:
                if cancelled() or time.monotonic() > deadline:
                    raise InterruptedError()
                data = response.read(65536)
                if not data:
                    return
                total += len(data)
                if total > limit:
                    raise ValueError("Слишком большой ответ источника")
                out.write(data)
    finally:
        connection.close()


def peer_address(url):
    address = urlsplit(url)
    if (address.scheme not in ("http", "https") or not address.hostname or address.username is not None
            or address.password is not None or address.query or address.fragment or address.path not in ("", "/")):
        raise ValueError("Укажите адрес службы обмена соседа")
    return url.rstrip("/")


class Sources:
    def __init__(self, root, keyring, verifier, peers=(), official=True, lan=False, route=None):
        self.root, self.keyring, self.verifier = root, keyring, verifier
        self.peers = [peer_address(p) for p in peers]
        self.official = official
        self.lan = lan
        self.route = route or (lambda: 0)
        root.mkdir(exist_ok=True)
        self.index = root / "current.json"
        self.current = None
        self.status = "unchecked"

    def accept(self, bundle, sig, *, install=True, expected=None):
        verified = catalog.load_catalog(bundle, sig, self.keyring, self.verifier)
        if expected and verified["sha256"] != expected:
            raise ValueError("Некорректный ответ соседа")
        if install:
            folder = self.root / verified["sha256"]
            folder.mkdir(exist_ok=True)
            # Both files are immutable for this digest. Replace any damaged copy atomically.
            for source, name in ((bundle, "bundle"), (sig, "signature")):
                if source.resolve() != (folder / name).resolve():
                    shutil.copyfile(source, folder / (name + ".tmp"))
                    os.replace(folder / (name + ".tmp"), folder / name)
            catalog.publish(verified, self.index)
        self.current = verified
        return verified

    def bootstrap(self, seed):
        if self.index.exists():
            try:
                digest = json.loads(self.index.read_text())["sha256"]
                if not re.fullmatch("[0-9a-f]{64}", digest):
                    raise ValueError()
                folder = self.root / digest
                # Reverify signature and compare signed data rather than trusting cached bridge strings.
                verified = self.accept(folder / "bundle", folder / "signature", install=False)
                if verified["sha256"] != digest:
                    raise ValueError()
                self.status = "cache"
                return
            except Exception:
                self.current = None
        if seed:
            for bundle in sorted(seed.glob("tor-expert-bundle-linux-x86_64-*.tar.gz"), reverse=True):
                try:
                    self.accept(bundle, Path(str(bundle) + ".asc"))
                    self.status = "seed"
                    return
                except (ValueError, OSError):
                    continue

    def refresh(self, cancelled, seek_newer=False):
        if not self.route():
            self.status = "waiting_tor"
            return False
        for base in ([INDEX] if self.official else []):
            if cancelled():
                return False
            self.status = "checking_official"
            try:
                with tempfile.TemporaryDirectory(dir=self.root) as tmp:
                    folder = Path(tmp)
                    listing, bundle, sig = [folder / x for x in ("index", "bundle", "signature")]
                    fetch(base, listing, 2 << 20, cancelled, self.route())
                    matches = list(BUNDLE.finditer(listing.read_text(encoding="utf-8")))
                    if not matches:
                        raise ValueError("Поставка отсутствует в официальном указателе")
                    url = max(matches, key=lambda m: tuple(map(int, m[1].split(".")))).group()
                    signature_url = url + ".asc"
                    fetch(signature_url, sig, 65536, cancelled, self.route())
                    if self.current and (self.root / self.current["sha256"] / "signature").read_bytes() == sig.read_bytes():
                        self.status = "official"
                        return True
                    fetch(url, bundle, MAX_BUNDLE, cancelled, self.route())
                    if cancelled():
                        return False
                    self.accept(bundle, sig)
                    self.status = "official"
                    return True
            except Exception:
                if cancelled():
                    return False
        self.status = "unavailable"
        return False

    def mirror_file(self, path):
        current = self.current
        if not current:
            return None
        if path == "/v1/catalog":
            return current["sha256"].encode()
        for name in ("bundle", "signature"):
            if path == f"/v1/{current['sha256']}/{name}":
                return self.root / current["sha256"] / name
        return None

