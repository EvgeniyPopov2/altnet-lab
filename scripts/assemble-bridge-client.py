#!/usr/bin/env python3
"""Assemble a clean independent installation from signed archives and the built UI."""
import argparse
from pathlib import Path
import shutil
import tarfile
import tempfile
import zipfile

from bridge_sources import catalog


def unpack(bundle, signature, verifier, keyring, destination, expected):
    catalog.load_catalog(bundle, signature, keyring, verifier)
    with tarfile.open(bundle, "r:gz") as archive:
        archive.getmember(expected)
        for member in archive:
            parts = Path(member.name).parts
            if (member.name.startswith(("/", "\\")) or ":" in member.name or "\\" in member.name or ".." in parts
                    or not (member.isdir() or member.isfile())):
                raise ValueError("Unsupported archive member")
            target = destination / member.name
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open("xb") as out, archive.extractfile(member) as source:
                    shutil.copyfileobj(source, out)
                target.chmod(member.mode & 0o755)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("linux", "windows", "dist", "keyring", "output"):
        parser.add_argument("--" + name, required=True, type=Path)
    parser.add_argument("--gpgv", default="gpgv")
    parser.add_argument("--archives", type=Path, help="Emit platform-specific archives from the clean staging tree")
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Choose a new delivery directory")
    scripts = Path(__file__).resolve().parent
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=args.output.parent) as tmp:
        root = Path(tmp) / "AltNet"
        root.mkdir()
        for src, target, expected in [(args.linux, "runtime-linux", "tor/tor"), (args.windows, "runtime", "tor/tor.exe")]:
            if not src.name.startswith("tor-expert-bundle-") or not src.name.endswith(".tar.gz"):
                raise ValueError("Expected a Tor Expert Bundle")
            seed = root / "seed" if target == "runtime-linux" else Path(tmp) / "stage"
            seed.mkdir()
            local = seed / src.name
            sig = Path(str(local) + ".asc")
            shutil.copyfile(src, local)
            shutil.copyfile(Path(str(src) + ".asc"), sig)
            unpack(local, sig, args.gpgv, args.keyring, root / target, expected)
        (root / "scripts").mkdir()
        for file in [*scripts.glob("bridge_*.py"), scripts / "tor-bridge-catalog.py", scripts / "site_onion.py", scripts / "site_share.py", scripts / "site_mesh.py"]:
            shutil.copy2(file, root / "scripts" / file.name)
        for name in ("Start-AltNet.sh", "Start-AltNet.ps1", "AltNet.cmd"):
            shutil.copy2(scripts / name, root / name)
        (root / "Start-AltNet.sh").chmod(0o755)
        shutil.copyfile(args.keyring, root / "trusted.gpg")
        if not (args.dist / "index.html").is_file():
            raise ValueError("Build the AltNet UI first")
        shutil.copytree(args.dist, root / "ui")
        shutil.copyfile(scripts.parent / "docs/wiki/mosty-tor.md", root / "README-RU.md")
        if args.archives:
            args.archives.mkdir(parents=True, exist_ok=True)
            linux = Path(tmp) / "AltNet-Client-linux-x86_64.tar.gz"
            windows = Path(tmp) / "AltNet-Client-windows-x86_64.zip"
            with tarfile.open(linux, "w:gz", compresslevel=3) as tar, zipfile.ZipFile(
                    windows, "w", zipfile.ZIP_DEFLATED, compresslevel=3) as archive:
                for file in sorted(root.rglob("*")):
                    if not file.is_file():
                        continue
                    rel = file.relative_to(root)
                    name = "AltNet/" + rel.as_posix()
                    if rel.parts[0] not in ("runtime", "Start-AltNet.ps1", "AltNet.cmd"):
                        entry = tar.gettarinfo(str(file), arcname=name)
                        entry.mode = 0o755 if rel.name in ("Start-AltNet.sh", "tor", "lyrebird", "tor-gencert", "conjure-client") else 0o644
                        with file.open("rb") as stream:
                            tar.addfile(entry, stream)
                    if rel.parts[0] not in ("runtime-linux", "Start-AltNet.sh"):
                        archive.write(file, arcname=name)
            for package in (linux, windows):
                shutil.copyfile(package, args.archives / (package.name + ".tmp"))
                (args.archives / (package.name + ".tmp")).replace(args.archives / package.name)
        root.rename(args.output)


if __name__ == "__main__":
    main()

