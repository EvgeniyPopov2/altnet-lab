#!/usr/bin/env python3
"""Apply the AltNet source overlay to the pinned Tor Browser build recipe."""
import argparse
from pathlib import Path
import subprocess

BUILD_COMMIT = "39daa983dc1326f50905bca856ab273a4bb0c7ca"
PATCH = Path(__file__).resolve().parents[1] / "browser/tor-browser/patches/0001-about-altnet.patch"
PATCH_NAME = "altnet-about-page.patch"


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args])


def prepare(root):
    root = root.resolve(strict=True)
    if git(root, "rev-parse", "HEAD").decode().strip() != BUILD_COMMIT:
        raise ValueError("Нужен сборочный рецепт Tor Browser 16.0.3 с ожидаемым коммитом.")
    changes = {
        "projects/firefox/config": (
            b"input_files:\n  - project: container-image\n",
            b"input_files:\n  - filename: altnet-about-page.patch\n  - project: container-image\n",
        ),
        "projects/firefox/build": (
            b'cd /var/tmp/build/[% project %]-[% c("version") %]\ncp $rootdir/mozconfig ./\n',
            b'cd /var/tmp/build/[% project %]-[% c("version") %]\n'
            b'patch -p1 --batch --forward < "$rootdir/altnet-about-page.patch"\n'
            b'cp $rootdir/mozconfig ./\n',
        ),
    }
    replacements = []
    for relative, (before, after) in changes.items():
        path = root / relative
        original = git(root, "show", f"HEAD:{relative}")
        if original.count(before) != 1:
            raise ValueError(f"Неожиданная структура исходного рецепта: {relative}")
        prepared = original.replace(before, after, 1)
        current = path.read_bytes()
        if current not in (original, prepared):
            raise ValueError(f"Файл содержит другие изменения: {relative}")
        replacements.append((path, prepared))
    patch = PATCH.read_bytes()
    destination = root / "projects/firefox" / PATCH_NAME
    if destination.exists() and destination.read_bytes() != patch:
        raise ValueError("Существующий патч отличается; изменения не выполнены.")
    destination.write_bytes(patch)
    for path, content in replacements:
        path.write_bytes(content)
    print("Рецепт подготовлен; исходная метка Tor остаётся неизменной, патч применяется при сборке.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("build_root", type=Path)
    args = parser.parse_args()
    prepare(args.build_root)


if __name__ == "__main__":
    main()
