#!/usr/bin/env python3
"""Transfer a synthetic CAR between two isolated clients over the real Tor network."""
import argparse
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / "ui/altnet-ui"
CLIENT = ROOT / "tests/site-share-network-client.py"


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def request(port, path, token=None, body=None, content_type="application/json", cid=None, timeout=8):
    headers = {"Host": f"127.0.0.1:{port}"}
    if token:
        headers["X-AltNet-Session"] = token
    if body is not None:
        headers.update({"Origin": f"http://127.0.0.1:{port}", "Content-Type": content_type})
        if cid:
            headers["X-AltNet-Site-CID"] = cid
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=timeout)
    try:
        connection.request("POST" if body is not None else "GET", path, body, headers)
        response = connection.getresponse()
        return response.status, response.read()
    finally:
        connection.close()


def wait_ready(proc, port, deadline):
    token = None
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            raise RuntimeError("Тестовый клиент завершился до подключения")
        try:
            if not token:
                status, html = request(port, "/")
                match = re.search(rb'<meta name="altnet-session" content="([^"]+)">', html)
                if status != 200 or not match:
                    raise OSError("UI is not ready")
                token = match.group(1).decode("ascii")
            status, data = request(port, "/api/bridges/status", token)
            if status == 200 and json.loads(data).get("connected"):
                return token
        except (OSError, ValueError, http.client.HTTPException):
            pass
        time.sleep(2)
    raise TimeoutError("Тестовые клиенты не подключились к Tor вовремя")


def copy_public_catalog(source, state):
    info = json.loads((source / "current.json").read_text(encoding="utf-8"))
    digest = info["sha256"]
    if not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise ValueError("Некорректный указатель публичного каталога")
    target = state / "public"
    (target / digest).mkdir(parents=True)
    for name in ("bundle", "signature"):
        shutil.copyfile(source / digest / name, target / digest / name)
    shutil.copyfile(source / "current.json", target / "current.json")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("tor", "transport", "public-cache", "dist", "keyring", "gpgv", "temp"):
        parser.add_argument("--" + name, required=True, type=Path)
    parser.add_argument("--last-good", type=Path, help="Use only confirmed public bridge fingerprints from a local connection state")
    parser.add_argument("--ui-browser-test", action="store_true", help="Also open the share link in an isolated browser through the real test client")
    parser.add_argument("--ui-browser", type=Path, help="Optional Chromium executable; otherwise use Playwright's installed browser")
    args = parser.parse_args()
    parent = args.temp.resolve(strict=True)
    directory = Path(tempfile.mkdtemp(prefix="altnet-real-onion-", dir=parent)).resolve()
    if directory.parent != parent or not directory.name.startswith("altnet-real-onion-"):
        raise RuntimeError("Небезопасный путь временного каталога")
    clients = []
    cleanup_ok = False
    passed = False
    try:
        fixture = directory / "fixture.mjs"
        build = "require('esbuild').buildSync({entryPoints:['../../tests/ipfs-site-fixture.ts'],bundle:true,platform:'node',format:'esm',outfile:process.argv[1]})"
        subprocess.run(["node", "-e", build, str(fixture)], cwd=UI, check=True, capture_output=True)
        subprocess.run(["node", str(fixture), "create", str(directory)], check=True, capture_output=True)
        cid = (directory / "root.txt").read_text(encoding="ascii").strip()
        car = (directory / "site.car").read_bytes()
        for name in ("author", "reader"):
            state = directory / name
            state.mkdir()
            copy_public_catalog(args.public_cache.resolve(strict=True), state)
            if args.last_good:
                saved = json.loads(args.last_good.read_text(encoding="utf-8"))
                fingerprints = saved.get("lastGood", [])
                if not isinstance(fingerprints, list) or len(fingerprints) > 16 or not all(isinstance(x, str) and re.fullmatch(r"[0-9A-F]{40}", x) for x in fingerprints):
                    raise ValueError("Некорректные отпечатки ранее подтверждённых мостов")
                (state / "connection.json").write_text(json.dumps({"lastGood": fingerprints}), encoding="utf-8")
            ui_port, socks_port = free_port(), free_port()
            command = [sys.executable, "-B", "-X", "utf8", str(CLIENT), "--state", str(state),
                       "--dist", str(args.dist.resolve()), "--tor", str(args.tor.resolve()),
                       "--transport", str(args.transport.resolve()), "--snowflake", str(args.transport.resolve()),
                       "--keyring", str(args.keyring.resolve()), "--gpgv", str(args.gpgv.resolve()),
                       "--port", str(ui_port), "--socks-port", str(socks_port), "--parallel-probes", "1",
                       "--no-official", "--no-lan"]
            log = (directory / (name + ".log")).open("wb")
            proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=log, stderr=subprocess.STDOUT,
                                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            clients.append((proc, ui_port, log))
        deadline = time.monotonic() + 420
        author_token = wait_ready(clients[0][0], clients[0][1], deadline)
        reader_token = wait_ready(clients[1][0], clients[1][1], deadline)
        print("Два изолированных клиента подключены к Tor.", flush=True)
        status, body = request(clients[0][1], "/api/sites/share", author_token, car, "application/vnd.ipld.car", cid)
        if status != 202:
            raise RuntimeError("Тестовая раздача не запустилась")
        onion = json.loads(body)["onion"]
        received = None
        while time.monotonic() < deadline:
            payload = json.dumps({"onion": onion, "cid": cid}).encode()
            try:
                status, body = request(clients[1][1], "/api/sites/onion-car", reader_token, payload, timeout=135)
                if status == 200:
                    received = body
                    break
            except (OSError, http.client.HTTPException):
                pass
            time.sleep(5)
        if received != car:
            raise RuntimeError("Тестовый CAR не получен или отличается от исходного")
        (directory / "received.car").write_bytes(received)
        subprocess.run(["node", str(fixture), "verify", str(directory)], check=True, capture_output=True)
        if args.ui_browser_test:
            browser_args = [str(args.ui_browser.resolve(strict=True))] if args.ui_browser else []
            subprocess.run(["node", "tests/onion-real-browser.mjs", str(clients[1][1]), onion, cid, *browser_args],
                           cwd=UI, check=True, timeout=360)
        status, body = request(clients[0][1], "/api/sites/share-stop", author_token, b"{}")
        if status != 200 or json.loads(body).get("active"):
            raise RuntimeError("Тестовая раздача не остановилась")
        passed = True
        print("PASS: два независимых Tor-клиента передали и проверили CAR через временный onion-сервис.")
    finally:
        for proc, _, _ in clients:
            if proc.poll() is None:
                try:
                    proc.stdin.write(b"x")
                    proc.stdin.flush()
                except OSError:
                    pass
        for proc, _, log in clients:
            try:
                proc.wait(timeout=45)
            except subprocess.TimeoutExpired:
                print("Тестовый клиент не завершился штатно; останавливаем только его процессы.", file=sys.stderr)
                if proc.poll() is None:
                    if os.name == "nt":
                        subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True, check=False)
                    else:
                        proc.terminate()
                try:
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    print("Не удалось остановить тестовый клиент; данные оставлены:", directory, file=sys.stderr)
            finally:
                log.close()
                if proc.stdin:
                    try:
                        proc.stdin.close()
                    except OSError:
                        pass
        cleanup_ok = all(proc.poll() is not None for proc, _, _ in clients)
        if cleanup_ok and passed:
            resolved = directory.resolve(strict=True)
            if resolved != directory or resolved.parent != parent or not resolved.name.startswith("altnet-real-onion-"):
                raise RuntimeError("Временный каталог изменился; автоматическая очистка отменена")
            shutil.rmtree(resolved)
        elif cleanup_ok and not passed:
            print("Диагностические данные тестовых клиентов сохранены:", directory, file=sys.stderr)


if __name__ == "__main__":
    main()
