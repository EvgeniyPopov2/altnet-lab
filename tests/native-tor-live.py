#!/usr/bin/env python3
"""Проверка настоящего Tor-клиента, запущенного тестовым Gecko по приватным каналам.

Используются только синтетический профиль и публичный каталог мостов. Проверка
подлинности исполняемых файлов в Gecko заменена тестовой заглушкой.
"""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]


def copy_public_catalog(source, state):
    metadata = json.loads((source / "current.json").read_text(encoding="utf-8"))
    digest = metadata.get("sha256")
    if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise ValueError("Некорректный публичный каталог")
    target = state / "public"; (target / digest).mkdir(parents=True)
    for name in ("bundle", "signature"):
        shutil.copyfile(source / digest / name, target / digest / name)
    shutil.copyfile(source / "current.json", target / "current.json")


def owned_tor_count(root):
    if os.name != "nt":
        raise RuntimeError("Проверка завершения процессов пока доступна только в Windows")
    script = r'''$testRoot = $env:ALTNET_NATIVE_TEST_ROOT
$items = Get-CimInstance Win32_Process | Where-Object { $_.Name -ieq 'tor.exe' -and $_.CommandLine -and $_.CommandLine.Contains($testRoot) }
@($items).Count'''
    env = {**os.environ, "ALTNET_NATIVE_TEST_ROOT": str(root)}
    result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
                            env=env, capture_output=True, text=True, timeout=20, check=True)
    return int(result.stdout.strip())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("browser", "public-cache", "keyring", "gpgv", "dist", "temp"):
        parser.add_argument("--" + name, required=True, type=Path)
    parser.add_argument("--last-good", type=Path)
    args = parser.parse_args()
    browser = args.browser.resolve(strict=True)
    tor_dir = browser.parent / "TorBrowser/Tor"
    tor, transport = tor_dir / "tor.exe", tor_dir / "PluggableTransports/lyrebird.exe"
    if not tor.is_file() or not transport.is_file():
        raise ValueError("В экспериментальном комплекте нет Tor или транспорта")
    parent = args.temp.resolve(strict=True)
    root = Path(tempfile.mkdtemp(prefix="altnet-native-tor-live-", dir=parent)).resolve()
    if root.parent != parent or not root.name.startswith("altnet-native-tor-live-"):
        raise RuntimeError("Небезопасный временный каталог")
    passed = False
    try:
        state = root / "state"; state.mkdir()
        copy_public_catalog(args.public_cache.resolve(strict=True), state)
        if args.last_good:
            saved = json.loads(args.last_good.read_text(encoding="utf-8"))
            fingerprints = saved.get("lastGood", [])
            if not isinstance(fingerprints, list) or len(fingerprints) > 16 or not all(isinstance(x, str) and re.fullmatch(r"[0-9A-F]{40}", x) for x in fingerprints):
                raise ValueError("Некорректное состояние публичных мостов")
            (state / "connection.json").write_text(json.dumps({"lastGood": fingerprints}), encoding="utf-8")
        child_args = [str(ROOT / "scripts/bridge_client.py"), "--state", str(state), "--dist", str(args.dist.resolve(strict=True)),
                      "--tor", str(tor), "--transport", str(transport), "--snowflake", str(transport),
                      "--keyring", str(args.keyring.resolve(strict=True)), "--gpgv", str(args.gpgv.resolve(strict=True)),
                      "--no-official", "--no-lan"]
        command = [sys.executable, "-B", str(ROOT / "tests/tor-native-ui.py"), "--browser", str(browser),
                   "--theme", "dark", "--expect-no-updater", "--native-tor-live-from-stdin"]
        # Test-only verifier in Gecko: matching command/arguments is not supply-chain authentication.
        data = json.dumps({"command": sys.executable, "args": child_args, "timeout": 420})
        proc = subprocess.Popen(command, stdin=subprocess.PIPE, text=True,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        try:
            proc.communicate(input=data, timeout=540)
        except subprocess.TimeoutExpired:
            if proc.poll() is None:
                subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True, check=False, timeout=20)
            proc.wait(timeout=20)
            raise TimeoutError("Тестовая группа браузера не завершилась вовремя") from None
        if proc.returncode:
            raise RuntimeError("Проверка дочернего Tor-клиента не завершилась успешно")
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline and owned_tor_count(root):
            time.sleep(1)
        if owned_tor_count(root):
            raise RuntimeError("Тестовый Tor не завершился; данные оставлены для проверки")
        passed = True
        print("PASS: клиент, запущенный Gecko, подтвердил маршрут через Tor и завершил свой процесс", flush=True)
    finally:
        # The only deletion target is the freshly created, verified test directory.
        if passed and root.parent == parent and root.name.startswith("altnet-native-tor-live-") and not root.is_symlink():
            shutil.rmtree(root)
        elif not passed:
            try:
                remaining = owned_tor_count(root)
                if remaining:
                    print("Внимание: тестовых процессов Tor осталось:", remaining, file=sys.stderr, flush=True)
            except (OSError, ValueError, subprocess.SubprocessError):
                print("Не удалось проверить завершение тестовых процессов Tor.", file=sys.stderr, flush=True)
            print("Тестовые данные оставлены:", root, file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
