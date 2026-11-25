#!/usr/bin/env python3
"""Create an isolated, unsigned browser copy for the bundled workspace test only."""
import argparse
import os
from pathlib import Path
import shutil
import tempfile
import zipfile

import bridge_native

ROOT = Path(__file__).resolve().parents[1]
PREFIX = "altnet-workspace-client/"
MODULES = ("NativeWorkspaceShell.sys.mjs", "NativeSessionChannel.sys.mjs")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser", required=True, type=Path, help="Исполняемый файл отдельной тестовой сборки")
    parser.add_argument("--dist", type=Path, default=ROOT / "ui/altnet-ui/dist")
    parser.add_argument("--temp", required=True, type=Path, help="Каталог временных данных на H:")
    args = parser.parse_args()
    browser = args.browser.resolve(strict=True)
    source = browser.parent
    dist = args.dist.resolve(strict=True)
    parent = args.temp.resolve(strict=True)
    if any(path.drive.upper() != "H:" for path in (browser, dist, parent)):
        raise ValueError("Тестовые данные должны находиться на H:")
    if not browser.is_file() or browser.name.lower() != "firefox.exe" or not (source / "omni.ja").is_file():
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
        shutil.copytree(source, target, ignore=ignore, symlinks=False)
        archive = target / "omni.ja"
        replacement = created / "workspace-omni.new"
        modules = {"moz-src/browser/components/abouttor/" + name: (ROOT / "browser/tor-browser/native" / name).read_bytes() for name in MODULES}
        with zipfile.ZipFile(archive, "r") as old, zipfile.ZipFile(replacement, "w") as new:
            names = old.namelist()
            if any(names.count(name) != 1 for name in modules) or any(name.startswith(PREFIX) for name in names):
                raise ValueError("Нужна исходная тестовая сборка с нативными модулями")
            for entry in old.infolist():
                new.writestr(entry, modules[entry.filename] if entry.filename in modules else old.read(entry.filename))
            for file, name in assets:
                new.write(file, name, compress_type=zipfile.ZIP_DEFLATED)
        replacement.replace(archive)
    except BaseException:
        print("Тестовая копия сохранена для диагностики:", created)
        raise
    print("Создана неподписанная тестовая копия:", target / browser.name)
    print("Она не предназначена для установки и не содержит пользовательский профиль Tor Browser.")
    print("Проверка: python tests/tor-native-ui.py --browser", target / browser.name, "--native-bundled-workspace")


if __name__ == "__main__":
    main()
