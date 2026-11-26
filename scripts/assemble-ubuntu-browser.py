"""Собрать Linux-клиент из проверенной поставки Tor Browser 16.0.3 и сборки AltNet."""
import argparse
import copy
import hashlib
import io
from pathlib import Path, PurePosixPath
import re
import subprocess
import runpy
import tarfile
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TOR_SHA256 = "b039d69954c941c3e36fb8139418acad9bc19c11018a9eb6cfcabb5a62fddabe"
shared = runpy.run_path(str(ROOT / "scripts/prepare-native-workspace-test.py"))


def modify_omni(raw, chrome, dist):
    out = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(raw)) as src, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=2) as dst:
        names = src.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Повторяющийся ресурс Firefox")
        if chrome and not set(shared["CHROME"]).issubset(names):
            raise ValueError("Неизвестная версия адресной строки")
        for name in names:
            data = src.read(name)
            if chrome and name in shared["CHROME"]:
                text = data.decode()
                for old, new in shared["chrome_hunks"](shared["CHROME"][name]):
                    if not old or text.count(old) != 1:
                        raise ValueError("Расхождение с исходным кодом браузера")
                    text = text.replace(old, new)
                data = text.encode()
            if name.endswith("/branding/brand.ftl"):
                data = re.sub(rb"(?m)^(-brand-(?:shorter|short|full|product)-name =) [^\r\n]+",rb"\1 AltNet Browser",data)
            dst.writestr(name, data)
        if not chrome:
            ui = ROOT / "ui/altnet-ui"
            opts = "require('esbuild').buildSync({stdin:{contents:require('fs').readFileSync(process.argv[1],'utf8'),resolveDir:process.cwd()},bundle:true,format:'esm',write:false,legalComments:'inline'}).outputFiles[0].contents"
            cipher = subprocess.check_output(["node","-e","process.stdout.write("+opts+")",str(ROOT / "browser/tor-browser/linux/workspace-cipher.mjs")],cwd=ui)
            dst.writestr("moz-src/browser/components/abouttor/LinuxWorkspaceCipher.sys.mjs", cipher)
            dst.write(ui / "node_modules/@noble/ciphers/LICENSE", "altnet-native/licenses/noble-ciphers.txt")
            for name in shared["MODULES"]:
                dst.write(ROOT / "browser/tor-browser/native" / name, "moz-src/browser/components/abouttor/" + name)
            if not (dist / "index.html").is_file():
                raise ValueError("Отсутствует собранный интерфейс AltNet")
            for path in sorted(dist.rglob("*")):
                if path.is_symlink():
                    raise ValueError("Ссылки в ресурсах клиента запрещены")
                if path.is_file():
                    rel = path.relative_to(dist).as_posix()
                    if not shared["bridge_native"]._ASSET.fullmatch(rel) or path.stat().st_size > shared["bridge_native"].ASSET_LIMIT:
                        raise ValueError("Недопустимый ресурс панели")
                    if rel == "index.html":
                        html = path.read_text(encoding="utf-8")
                        if html.count("<head>") != 1: raise ValueError("Неизвестный документ приложения")
                        dst.writestr(shared["PREFIX"] + rel, html.replace("<head>", '<head><meta name="altnet-native-storage" content="1">').encode())
                    else:
                        dst.write(path, shared["PREFIX"] + rel)
    return out.getvalue()


def add(out, name, data, mode):
    info = tarfile.TarInfo("altnet-browser/" + name)
    info.mode, info.size = mode, len(data)
    out.addfile(info, io.BytesIO(data))


def build(source, target, dist):
    with source.open("rb") as stream:
        digest = hashlib.sha256()
        for part in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(part)
        if digest.hexdigest() != TOR_SHA256:
            raise ValueError("SHA-256 не совпадает с проверенным подписанным архивом Tor Browser")
        stream.seek(0)
        with tarfile.open(fileobj=stream, mode="r|xz") as old, tarfile.open(target, "w:gz", compresslevel=1) as out:
            seen = set()
            for entry in old:
                parts = PurePosixPath(entry.name).parts
                if not parts or parts[0] != "tor-browser" or ".." in parts:
                    raise ValueError("Недопустимый путь в архиве")
                rel = "/".join(parts[1:])
                if entry.islnk() or (entry.issym() and (entry.linkname.startswith("/") or ".." in PurePosixPath(entry.linkname).parts)):
                    raise ValueError("Неожиданная ссылка в архиве")
                info = copy.copy(entry)
                info.name = "altnet-browser" + ("/" + rel if rel else "")
                src = old.extractfile(entry) if entry.isfile() else None
                if rel in ("Browser/omni.ja", "Browser/browser/omni.ja"):
                    data = modify_omni(src.read(), rel == "Browser/browser/omni.ja", dist)
                    info.size = len(data)
                    src = io.BytesIO(data)
                    seen.add(rel)
                out.addfile(info, src)
            if len(seen) != 2:
                raise ValueError("Отсутствуют ресурсы браузера")
            linux = ROOT / "browser/tor-browser/linux"
            add(out,"Browser/defaults/pref/altnet-locale.js",b'pref("intl.locale.requested","ru");\n',0o644)
            add(out,"altnet-logo.png",(dist / "altnet-logo.png").read_bytes(),0o644)
            for name in ("altnet-browser", "altnet-browser.desktop", "start-console"):
                add(out, name, (linux / name).read_bytes().replace(b"\r\n", b"\n"), 0o644 if name.endswith(".desktop") else 0o755)
            for name in ("site_transport.py", "site_mesh.py", "site_onion.py", "bridge_route.py"):
                path = linux / name if name == "site_transport.py" else ROOT / "scripts" / name
                add(out, "Browser/altnet-linux/" + name, path.read_bytes(), 0o644)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--dist", type=Path, default=ROOT / "ui/altnet-ui/dist")
    args = ap.parse_args()
    with tempfile.NamedTemporaryFile(dir=args.output.parent, delete=False) as tmp:
        stage = Path(tmp.name)
    try:
        build(args.source, stage, args.dist)
        stage.replace(args.output)
    finally:
        stage.unlink(missing_ok=True)
