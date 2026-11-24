#!/usr/bin/env python3
"""Create new portable archives with the built UI and verify unchanged contents."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import tarfile
import tempfile
import zipfile

PREFIX = "AltNet/ui/"


def digest(stream):
    result = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        result.update(chunk)
    return result.hexdigest()


def file_digest(path):
    with path.open("rb") as stream:
        return digest(stream)


def safe_name(name):
    parts = PurePosixPath(name).parts
    return bool(parts and parts[0] == "AltNet" and ".." not in parts and "\\" not in name and ":" not in name)


def validate_names(names):
    if len(names) != len(set(names)):
        raise ValueError("Duplicate archive member")
    for name in names:
        if not safe_name(name) or name.startswith("AltNet/state/") or name == "AltNet/network.json":
            raise ValueError("Unexpected or private archive member: " + name)


def collect_ui(dist):
    if not (dist / "index.html").is_file():
        raise ValueError("Built UI index is missing")
    result = {}
    for path in sorted(dist.rglob("*")):
        if path.is_symlink():
            raise ValueError("Symlinks are not supported in the UI")
        if path.is_file():
            result[PREFIX + path.relative_to(dist).as_posix()] = path
    return result


def zip_hashes(archive):
    with zipfile.ZipFile(archive) as source:
        entries = [entry for entry in source.infolist() if not entry.is_dir()]
        validate_names([entry.filename for entry in entries])
        result = {}
        for entry in entries:
            with source.open(entry) as stream:
                result[entry.filename] = digest(stream)
        return result


def tar_hashes(archive):
    with tarfile.open(archive, "r:gz") as source:
        entries = source.getmembers()
        if any(not item.isfile() for item in entries):
            raise ValueError("Only regular files are supported in the source tar")
        validate_names([entry.name for entry in entries])
        result = {}
        for entry in entries:
            with source.extractfile(entry) as stream:
                result[entry.name] = digest(stream)
        return result


def make_zip(source_path, target_path, ui, replacements):
    with zipfile.ZipFile(source_path) as source, zipfile.ZipFile(target_path, "w", zipfile.ZIP_DEFLATED, compresslevel=3) as target:
        for entry in source.infolist():
            if entry.is_dir() or entry.filename.startswith(PREFIX) or entry.filename in replacements:
                continue
            with source.open(entry) as reader, target.open(entry, "w") as writer:
                shutil.copyfileobj(reader, writer, 1024 * 1024)
        for name, path in ui.items():
            target.write(path, name, compress_type=zipfile.ZIP_DEFLATED, compresslevel=3)
        for name, path in replacements.items():
            target.write(path, name, compress_type=zipfile.ZIP_DEFLATED, compresslevel=3)


def make_tar(source_path, target_path, ui, replacements):
    with tarfile.open(source_path, "r:gz") as source, tarfile.open(target_path, "w:gz", compresslevel=3) as target:
        for entry in source:
            if not entry.name.startswith(PREFIX) and entry.name not in replacements:
                with source.extractfile(entry) as reader:
                    target.addfile(entry, reader)
        for name, path in (ui | replacements).items():
            info = target.gettarinfo(str(path), arcname=name)
            info.mode = 0o644
            with path.open("rb") as reader:
                target.addfile(info, reader)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("windows", "linux", "dist", "output"):
        parser.add_argument("--" + name, required=True, type=Path)
    parser.add_argument("--site-transport-dir", type=Path, help="Replace site transport scripts as well as the UI")
    parser.add_argument("--bridge-catalog", type=Path, help="Replace the Tor bridge catalog verifier")
    parser.add_argument("--bridge-tor", type=Path, help="Replace the managed Tor launcher")
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output directory already exists")
    ui = collect_ui(args.dist)
    replacements = {}
    if args.site_transport_dir:
        for name in ("bridge_client.py", "site_onion.py", "site_share.py"):
            path = args.site_transport_dir / name
            if path.is_symlink() or not path.is_file():
                raise ValueError("Missing site transport script: " + name)
            replacements["AltNet/scripts/" + name] = path
    if args.bridge_catalog:
        if args.bridge_catalog.is_symlink() or not args.bridge_catalog.is_file() or args.bridge_catalog.name != "tor-bridge-catalog.py":
            raise ValueError("Expected the Tor bridge catalog verifier")
        replacements["AltNet/scripts/tor-bridge-catalog.py"] = args.bridge_catalog
    if args.bridge_tor:
        if args.bridge_tor.is_symlink() or not args.bridge_tor.is_file() or args.bridge_tor.name != "bridge_tor.py":
            raise ValueError("Expected the managed Tor launcher")
        replacements["AltNet/scripts/bridge_tor.py"] = args.bridge_tor
    expected_ui = {name: file_digest(path) for name, path in ui.items()}
    expected_replacements = {name: file_digest(path) for name, path in replacements.items()}
    original = {"windows": zip_hashes(args.windows), "linux": tar_hashes(args.linux)}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="altnet-ui-sync-", dir=args.output.parent) as temporary:
        stage = Path(temporary) / "delivery"
        stage.mkdir()
        win_out = stage / "AltNet-Client-windows-x86_64.zip"
        linux_out = stage / "AltNet-Client-linux-x86_64.tar.gz"
        make_zip(args.windows, win_out, ui, replacements)
        make_tar(args.linux, linux_out, ui, replacements)
        for platform, actual in (("windows", zip_hashes(win_out)), ("linux", tar_hashes(linux_out))):
            expected = {name: sha for name, sha in original[platform].items() if not name.startswith(PREFIX) and name not in replacements} | expected_ui | expected_replacements
            if actual != expected:
                raise ValueError("Verification failed for " + platform)
        manifest = {"description": "Experimental portable archives; UI and listed scripts replaced, other files verified unchanged", "ui_index_sha256": expected_ui[PREFIX + "index.html"], "replaced_scripts": expected_replacements, "base_archives": {}, "archives": {}}
        for label, source, result in (("windows", args.windows, win_out), ("linux", args.linux, linux_out)):
            with source.open("rb") as stream:
                manifest["base_archives"][label] = digest(stream)
            with result.open("rb") as stream:
                manifest["archives"][result.name] = digest(stream)
        (stage / "SHA256.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        stage.rename(args.output)
    print("Verified archives:", args.output)


if __name__ == "__main__":
    main()
