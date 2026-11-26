"""Сохранить проверяемую зашифрованную копию данных AltNet из Edge текущего пользователя."""
import argparse
import base64
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import tempfile
import time
import urllib.request

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import win32crypt

ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / "ui/altnet-ui"
ORIGIN = "http://127.0.0.1:5174"
LIMIT = 180 * 1024 * 1024
PAGE = """<!doctype html><html lang="ru"><meta charset="utf-8">
<meta name="referrer" content="no-referrer"><title>Перенос данных AltNet</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'nonce-NONCE';
connect-src 'self' DEST; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<style>body{font:16px/1.55 system-ui;max-width:38em;margin:12vh auto;padding:20px;color-scheme:light dark}</style>
<h1>Копия данных AltNet</h1><p id="status" role="status">Проверяем хранилища и шифруем копию…</p>
<script type="module" nonce="NONCE">
const target=DEST_JSON + PATH_JSON, status=document.querySelector('#status');
let key;
try {
  if (location.origin !== 'http://127.0.0.1:5174' || window !== window.top) throw Error();
  const {encryptStableBrowserSnapshot}=await import('/src/core/migration/browserSnapshot.ts');
  const {newTransferKey}=await import('/src/core/migration/encryptedTransfer.ts');
  key=newTransferKey();
  const envelope=await encryptStableBrowserSnapshot(key);
  const spki=Uint8Array.from(atob(PUBLIC_JSON), c=>c.charCodeAt(0));
  const recipient=await crypto.subtle.importKey('spki',spki,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
  const wrapped=await crypto.subtle.encrypt({name:'RSA-OAEP'},recipient,key);
  const wrappedKey=btoa(String.fromCharCode(...new Uint8Array(wrapped)));
  const r=await fetch(target,{method:'POST',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({envelope,wrappedKey})});
  if(!r.ok) throw Error();
  status.textContent='Зашифрованная копия сохранена и проверена на диске H. Можно закрыть эту вкладку.';
} catch {
  status.textContent='Сохранение не подтверждено. Исходные данные доступны в прежнем окне.';
  await fetch(target,{method:'POST',credentials:'omit',redirect:'error',headers:{'Content-Type':'application/json'},
    body:'{"failed":true}'}).catch(()=>{});
} finally { key?.fill(0); }
</script></html>"""


def decoded_snapshot(envelope, key):
    if not isinstance(envelope, str) or len(envelope) > LIMIT:
        raise ValueError("Неизвестный контейнер")
    def decode(value):
        if not re.fullmatch(r"[A-Za-z0-9_-]+", value):
            raise ValueError("Некорректное поле JWE")
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    header, wrapped, iv, cipher, tag = envelope.split(".")
    if wrapped or json.loads(decode(header)) != {"alg": "dir", "enc": "A256GCM", "typ": "altnet-transfer+jwe"}:
        raise ValueError("Неизвестный формат JWE")
    nonce, mac = decode(iv), decode(tag)
    if len(nonce) != 12 or len(mac) != 16:
        raise ValueError("Некорректный контейнер")
    plain = AESGCM(key).decrypt(nonce, decode(cipher) + mac, header.encode("ascii"))
    data = json.loads(plain)
    if set(data) != {"version", "local", "databases"} or data["version"] != 1:
        raise ValueError("Неизвестная версия снимка")
    return hashlib.sha256(plain).digest(), data


def unpack(envelope, key):
    fingerprint, data = decoded_snapshot(envelope, key)
    return fingerprint, len(data["local"]), sum(len(db["records"]) for db in data["databases"])


def load_backup(path):
    if path.stat().st_size > LIMIT:
        raise ValueError("Слишком большой файл")
    backup = json.loads(path.read_bytes())
    if set(backup) != {"version", "origin", "protectedKey", "envelope"} or backup["version"] != 1 or backup["origin"] != ORIGIN:
        raise ValueError("Неизвестный формат копии")
    _, key = win32crypt.CryptUnprotectData(base64.b64decode(backup["protectedKey"], validate=True), None, None, None, 1)
    return backup["envelope"], key


def verify(path):
    return unpack(*load_backup(path))


def store(directory, envelope, key):
    expected = unpack(envelope, key)
    sealed = win32crypt.CryptProtectData(key, "AltNet Edge migration", None, None, None, 1)
    document = {"version": 1, "origin": ORIGIN, "protectedKey": base64.b64encode(sealed).decode(), "envelope": envelope}
    pending = directory / "pending.json"
    with pending.open("x", encoding="ascii") as stream:
        json.dump(document, stream, separators=(",", ":"))
        stream.flush()
        os.fsync(stream.fileno())
    if verify(pending) != expected:
        raise ValueError("Проверка записи не прошла")
    destination = directory / "edge-5174.altnet-backup"
    pending.rename(destination)
    return destination, expected[1:]


def export(parent, edge, profile):
    if parent.drive.upper() != "H:" or parent != parent.resolve(strict=True) or not parent.is_dir():
        raise ValueError("Для копии нужен существующий каталог на H:")
    if not re.fullmatch(r"Default|Profile [1-9][0-9]*", profile):
        raise ValueError("Нужен локальный профиль Edge")
    # Не доверяем настройкам HTTP-прокси Windows при проверке локального Vite.
    local = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    if local.open(ORIGIN + "/@vite/client", timeout=4).status != 200:
        raise ValueError("Сервер разработки недоступен")
    private = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    public = private.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    nonce = secrets.token_urlsafe(24)
    path = "/" + secrets.token_urlsafe(32)
    result = []

    class Receiver(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(30)

        def log_message(self, *args):
            pass

        def allowed(self):
            return self.path == path and self.headers.get_all("Host") == [authority] and self.headers.get_all("Origin") == [ORIGIN]

        def finish_request(self, status):
            self.send_response(status)
            if self.allowed():
                self.send_header("Access-Control-Allow-Origin", ORIGIN)
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
                self.send_header("Access-Control-Allow-Methods", "POST")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_OPTIONS(self):
            self.finish_request(204 if self.allowed() else 403)

        def do_POST(self):
            if not self.allowed() or self.headers.get_content_type() != "application/json" or self.headers.get("Transfer-Encoding"):
                return self.finish_request(403)
            try:
                lengths = self.headers.get_all("Content-Length") or []
                if len(lengths) != 1 or not 0 < int(lengths[0]) <= LIMIT:
                    return self.finish_request(413)
                msg = json.loads(self.rfile.read(int(lengths[0])))
                if msg == {"failed": True}:
                    result.append(None)
                    return self.finish_request(204)
                if set(msg) != {"envelope", "wrappedKey"}:
                    return self.finish_request(400)
                key = private.decrypt(base64.b64decode(msg["wrappedKey"], validate=True), padding.OAEP(
                    mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
                if len(key) != 32:
                    return self.finish_request(400)
                result.append(store(directory, msg["envelope"], key))
                self.finish_request(200)
            except Exception:
                result.append(None)
                self.finish_request(400)

    directory = Path(tempfile.mkdtemp(prefix="edge-5174-", dir=parent))
    with HTTPServer(("127.0.0.1", 0), Receiver) as server:
        server.timeout = 1
        authority = f"127.0.0.1:{server.server_port}"
        dest = "http://" + authority
        html = PAGE.replace("DEST_JSON", json.dumps(dest)).replace("PATH_JSON", json.dumps(path)).replace(
            "PUBLIC_JSON", json.dumps(base64.b64encode(public).decode())).replace("NONCE", nonce).replace("DEST", dest)
        # Временная страница содержит только открытый ключ и адрес локального приёмника.
        # Она создаётся без замены файлов. Входящие данные никогда не пишутся в репозиторий.
        name = "altnet-transfer-" + secrets.token_hex(16) + ".html"
        page = UI / "public" / name
        with page.open("x", encoding="utf-8", newline="\n") as stream:
            stream.write(html)
        try:
            url = ORIGIN + "/" + name
            expected = html.encode("utf-8")
            until = time.monotonic() + 5
            while time.monotonic() < until:
                with local.open(url, timeout=4) as res:
                    if res.url == url and res.read(len(expected) + 1) == expected:
                        break
                time.sleep(0.1)
            else:
                raise ValueError("Адрес 5174 не отдал подготовленную страницу")
            subprocess.Popen([str(edge), "--profile-directory=" + profile, url], close_fds=True)
            end = time.monotonic() + 120
            while not result and time.monotonic() < end:
                server.handle_request()
        finally:
            page.unlink()
    if not result or not result[0]:
        raise RuntimeError("Зашифрованная копия не была подтверждена. Источник не переключён.")
    destination, counts = result[0]
    print(f"Копия проверена: {destination}\nЛокальных записей: {counts[0]}, записей IndexedDB: {counts[1]}")
    print("Ключ привязан к текущей учётной записи Windows. Источник остаётся доступен для записи.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--verify", type=Path)
    ap.add_argument("--stage-vault", type=Path, help="Подготовить постоянное хранилище из проверенной копии без активации идентичности")
    ap.add_argument("--directory", type=Path)
    ap.add_argument("--edge", type=Path)
    ap.add_argument("--profile", default="Default")
    a = ap.parse_args()
    if a.verify and a.stage_vault:
        from workspace_vault import stage
        fingerprint, data = decoded_snapshot(*load_backup(a.verify))
        count = stage(a.stage_vault, data, fingerprint.hex())
        print(f"Подготовлено и проверено записей: {count}. Исходный профиль остаётся активен.")
    elif a.verify:
        _, local_count, records = verify(a.verify)
        print(f"Копия расшифрована и проверена. Локальных записей: {local_count}, записей IndexedDB: {records}")
    elif a.directory and a.edge:
        export(a.directory, a.edge.resolve(strict=True), a.profile)
    else:
        ap.error("Нужны --directory и --edge или --verify")
