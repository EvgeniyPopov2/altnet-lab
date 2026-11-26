#!/bin/sh
# Устанавливает уже проверенный архив AltNet Browser. Профили находятся в домашних каталогах.
set -eu
[ "$(id -u)" = 0 ] && [ "$#" = 2 ] || { echo "sudo sh install-ubuntu-browser.sh АРХИВ ОЖИДАЕМЫЙ_SHA256"; exit 2; }
case "$2" in *[!0-9a-f]*|'') exit 2;; esac
[ "${#2}" = 64 ]
exec 9>/run/lock/altnet-browser-install.lock
flock -x 9
stage=$(mktemp -d /opt/.altnet-release.XXXXXXXX)
cp -- "$1" "$stage/build.tar.gz"
printf '%s  %s\n' "$2" "$stage/build.tar.gz" | sha256sum -c -
tar --extract --gzip --no-same-owner -f "$stage/build.tar.gz" -C "$stage"
test -f "$stage/altnet-browser/Browser/altnet-linux/site_transport.py"
test -x "$stage/altnet-browser/altnet-browser"
chmod -R a+rX,go-w "$stage/altnet-browser"
printf '%s\n' "$2" > "$stage/altnet-browser/BUILD-SHA256"
python3 - "$stage/altnet-browser" <<'PY'
import ctypes, os, sys
from pathlib import Path
dst=Path("/opt/altnet-browser")
if dst.exists():
    if dst.is_symlink() or not (dst/"BUILD-SHA256").is_file(): raise SystemExit("Каталог занимает другая установка")
    libc=ctypes.CDLL(None,use_errno=True)
    if libc.renameat2(-100,os.fsencode(sys.argv[1]),-100,os.fsencode(dst),2): raise OSError(ctypes.get_errno(),"renameat2")
else:
    os.rename(sys.argv[1],dst)
PY
rm -- "$stage/build.tar.gz"
[ -d "$stage/altnet-browser" ] && echo "Предыдущая сборка: $stage/altnet-browser" || rmdir "$stage"
install -D -m644 /opt/altnet-browser/altnet-browser.desktop /usr/local/share/applications/altnet-browser.desktop
name=/usr/local/bin/altnet-browser
[ "$(readlink "$name" || true)" = /opt/altnet-browser/altnet-browser ] || ln -s /opt/altnet-browser/altnet-browser "$name"
