#!/usr/bin/env python3
"""Create an isolated, unsigned browser copy for the bundled workspace test only."""
import argparse
import hashlib
import json
import subprocess
import sys
import os
from pathlib import Path
import shutil
import tempfile
import zipfile

import bridge_native

ROOT = Path(__file__).resolve().parents[1]
PREFIX = "altnet-workspace-client/"
# Исходная Windows-сборка зафиксирована в docs/wiki/brauzer-alt.md.
ARCHIVE_SHA256 = "abb5c96ca5b3a9c1751de1a321b73dbc748ac4dc03479bead1dbc659f030cf7e"
MODULES = ("NativeWorkspaceShell.sys.mjs", "NativeSessionChannel.sys.mjs", "WorkspaceRecords.sys.mjs", "WorkspaceRecordsFrame.js")


# Эти два элемента browser/omni.ja в эталонной сборке содержат обычный JS.
# Применяем те же фрагменты, что и при сборке из исходников. Расхождение
# с исходным контекстом останавливает упаковку до замены копии архива.
CHROME = {
    "chrome/browser/content/browser/browser-init.js": "browser/base/content/browser-init.js",
    "chrome/browser/content/browser/urlbar/UrlbarInput.mjs": "browser/components/urlbar/content/UrlbarInput.mjs",
}


def chrome_hunks(path):
    patch = (ROOT / "browser/tor-browser/patches/0001-about-altnet.patch").read_text(encoding="utf-8")
    header = f"diff --git a/{path} b/{path}\n"
    if patch.count(header) != 1:
        raise ValueError("Отсутствует однозначный патч для рабочего окна")
    section = patch.split(header, 1)[1].split("\ndiff --git ", 1)[0]
    hunks = []
    for line in section.splitlines(keepends=True):
        if line.startswith("@@ "):
            hunks.append(([], []))
        elif hunks:
            if line == "\n":
                line = " \n"
            if line.startswith((" ", "-")):
                hunks[-1][0].append(line[1:])
            if line.startswith((" ", "+")):
                hunks[-1][1].append(line[1:])
    if not hunks:
        raise ValueError("Пустой патч для рабочего окна")
    return [("".join(old), "".join(new)) for old, new in hunks]


def bundle_chrome(target, work):
    archive = target / "browser/omni.ja"
    replacement = work / "browser-omni.new"
    with zipfile.ZipFile(archive) as old, zipfile.ZipFile(replacement, "w") as new:
        names = old.namelist()
        if any(names.count(entry) != 1 for entry in CHROME):
            raise ValueError("Неизвестная структура браузера")
        for entry in old.infolist():
            data = old.read(entry)
            if entry.filename in CHROME:
                source = data.decode("utf-8")
                for before, after in chrome_hunks(CHROME[entry.filename]):
                    if not before or source.count(before) != 1:
                        raise ValueError(f"Версия браузера расходится с патчем: {entry.filename}")
                    source = source.replace(before, after, 1)
                data = source.encode("utf-8")
            new.writestr(entry, data)
    replacement.replace(archive)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    inputs = parser.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--archive", type=Path, help="Чистый исходный NSIS-пакет с закреплённым SHA-256")
    inputs.add_argument("--browser", type=Path, help="Исполняемый файл отдельной тестовой сборки")
    parser.add_argument("--dist", type=Path, default=ROOT / "ui/altnet-ui/dist")
    parser.add_argument("--temp", required=True, type=Path, help="Каталог временных данных на H:")
    parser.add_argument("--installed-client", type=Path, help="Привязать панель к уже работающей установке Windows")
    args = parser.parse_args()
    active = {}
    if args.installed_client:
        root = args.installed_client.resolve(strict=True)
        if os.name != "nt" or not (root / "scripts/bridge_client.py").is_file() or not (root / "state/client.lock").is_file():
            raise ValueError("Нужна существующая установка локального клиента Windows")
        interpreter = Path(sys.executable).resolve(strict=True)
        with interpreter.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        active["altnet-native/installed.json"] = json.dumps({"command": str(interpreter), "root": str(root),
            "sha256": digest}, ensure_ascii=True).encode("ascii")
        active["altnet-native/attach.py"] = (ROOT / "browser/tor-browser/native/attach_windows.py").read_bytes()
    dist = args.dist.resolve(strict=True)
    parent = args.temp.resolve(strict=True)
    original = (args.archive or args.browser).resolve(strict=True)
    if any(path.drive.upper() != "H:" for path in (original, dist, parent)):
        raise ValueError("Тестовые данные должны находиться на H:")
    if args.browser and (original.name.lower() != "firefox.exe" or not (original.parent / "omni.ja").is_file()):
        raise ValueError("Нужна отдельная тестовая сборка Gecko")
    if not (dist / "index.html").is_file():
        raise ValueError("Сначала соберите интерфейс клиента")
    assets = []
    for file in dist.rglob("*"):
        if file.is_symlink() or (hasattr(file, "is_junction") and file.is_junction()):
            raise ValueError("Ссылки в тестовой сборке интерфейса запрещены")
        if not file.is_file():
            continue
        name = file.relative_to(dist).as_posix()
        if not bridge_native._ASSET.fullmatch(name) or file.stat().st_size > bridge_native.ASSET_LIMIT:
            raise ValueError("Неизвестный или слишком большой ресурс интерфейса")
        assets.append((file, PREFIX + name))
    if len(assets) > 1000:
        raise ValueError("Слишком много ресурсов интерфейса")
    created = Path(tempfile.mkdtemp(prefix="altnet-bundled-workspace-", dir=parent)).resolve(strict=True)
    if created.parent != parent or not created.name.startswith("altnet-bundled-workspace-"):
        raise RuntimeError("Небезопасный тестовый путь")

    # The browser's persistent profile and Tor state are not needed by this
    # isolated test; the test runner supplies a fresh profile separately.
    def ignore(folder, names):
        return {name for name in names if name.casefold() == "data"} if Path(folder).name.casefold() == "torbrowser" else set()

    target = created / "Browser"
    if args.archive:
        if shutil.disk_usage(parent).free < 2 * 1024**3:
            raise OSError("Недостаточно места на диске H:")
        staged = created / "source.nsis"
        with original.open("rb") as src, staged.open("xb") as dst:
            shutil.copyfileobj(src, dst)
        with staged.open("rb") as src:
            if hashlib.file_digest(src, "sha256").hexdigest() != ARCHIVE_SHA256:
                raise ValueError("Исходный пакет отличается от закреплённой сборки")
        seven = Path(os.environ["ProgramFiles"]) / "7-Zip/7z.exe"
        subprocess.run([str(seven), "x", str(staged), "-o" + str(created), "Browser/*", "-y", "-bso0", "-bsp0"], check=True)
        factory = target / "TorBrowser/Data/Browser/profile.default/extensions/{73a6fe31-595d-460b-a920-fcc0f8843232}.xpi"
        if not factory.is_file() or not (target / "firefox.exe").is_file():
            raise ValueError("Неполная исходная поставка")
    source = target if args.archive else original.parent
    try:
        total = 0
        for folder, directories, files in os.walk(source, followlinks=False):
            omitted = ignore(folder, directories)
            directories[:] = [name for name in directories if name not in omitted]
            for name in directories + files:
                item = Path(folder) / name
                if item.is_symlink() or (hasattr(item, "is_junction") and item.is_junction()):
                    raise ValueError("Ссылки в исходной тестовой сборке запрещены")
                if item.is_file():
                    total += item.stat().st_size
        if shutil.disk_usage(parent).free < total + 256 * 1024 * 1024:
            raise OSError("На диске H: недостаточно места для изолированной копии")
        if not args.archive:
            shutil.copytree(source, target, ignore=ignore, symlinks=False)
        archive = target / "omni.ja"
        replacement = created / "workspace-omni.new"
        modules = {"moz-src/browser/components/abouttor/" + name: (ROOT / "browser/tor-browser/native" / name).read_bytes() for name in MODULES}
        with zipfile.ZipFile(archive, "r") as old, zipfile.ZipFile(replacement, "w") as new:
            names = old.namelist()
            if any(names.count(name) > 1 or (not args.archive and name.endswith("/NativeWorkspaceShell.sys.mjs") and name not in names) for name in modules) or any(name.startswith((PREFIX, "altnet-native/")) for name in names):
                raise ValueError("Нужна исходная тестовая сборка с нативными модулями")
            for entry in old.infolist():
                new.writestr(entry, modules[entry.filename] if entry.filename in modules else old.read(entry.filename))
            for name, data in modules.items():
                if name not in names:
                    new.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)
            for name, data in active.items():
                new.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)
            for file, name in assets:
                new.write(file, name, compress_type=zipfile.ZIP_DEFLATED)
        replacement.replace(archive)
        bundle_chrome(target, created)
    except BaseException:
        print("Тестовая копия сохранена для диагностики:", created)
        raise
    print("Создана неподписанная тестовая копия:", target / "firefox.exe")
    print("Она не предназначена для установки и не содержит пользовательский профиль Tor Browser.")
    print("Проверка: python tests/tor-native-ui.py --browser", target / "firefox.exe", "--native-bundled-workspace")


if __name__ == "__main__":
    main()
