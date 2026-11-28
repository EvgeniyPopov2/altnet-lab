#!/bin/sh
# Устанавливает уже проверенный архив AltNet Browser. Профили находятся в домашних каталогах.
set -eu
[ "$(id -u)" = 0 ] && { [ "$#" = 2 ] || [ "$#" = 4 ]; } || { echo "sudo sh install-ubuntu-browser.sh АРХИВ SHA256 [ФАЙЛ_РЕГИСТРАЦИИ ГРУППА]"; exit 2; }
if [ "$#" = 4 ]; then
    test -r "$3"
    getent group "$4" >/dev/null
fi
case "$2" in *[!0-9a-f]*|'') exit 2;; esac
[ "${#2}" = 64 ]
exec 9>/run/lock/altnet-browser-install.lock
flock -x 9
stage=
unit_tmp=
cleanup() {
    [ -z "$unit_tmp" ] || rm -f -- "$unit_tmp"
    if [ -n "$stage" ]; then
        # Этот каталог создан mktemp текущего запуска; до обмена он содержит только новую сборку.
        rm -rf -- "$stage"
    fi
}
trap cleanup EXIT
release=/opt/altnet-browser
if [ ! -L "$release" ] && [ -f "$release/BUILD-SHA256" ] && [ "$(cat "$release/BUILD-SHA256")" = "$2" ]; then
    printf '%s  %s\n' "$2" "$1" | sha256sum -c -
else
    stage=$(mktemp -d /opt/.altnet-release.XXXXXXXX)
    cp -- "$1" "$stage/build.tar.gz"
    printf '%s  %s\n' "$2" "$stage/build.tar.gz" | sha256sum -c -
    tar --extract --gzip --no-same-owner -f "$stage/build.tar.gz" -C "$stage"
    rm -- "$stage/build.tar.gz"
    release=$stage/altnet-browser
fi
test -f "$release/Browser/altnet-linux/site_transport.py"
test -f "$release/Browser/altnet-linux/voice_transport.py"
test -f "$release/Browser/altnet-linux/contact_air.py"
test -f "$release/Browser/altnet-linux/contact_sync.py"
test -f "$release/Browser/altnet-linux/join_link.py"
test -f "$release/Browser/altnet-linux/meeting_directory.py"
test -f "$release/Browser/altnet-linux/meeting_catalog.py"
test -x "$release/altnet-browser"
test -f "$release/Browser/altnet-linux/meeting-enrollment.py"
test -f "$release/Browser/altnet-linux/check_transport.py"
install_missing() {
    missing=
    for pkg do
        if [ "$(dpkg-query -W -f='${db:Status-Status}' "$pkg" 2>/dev/null || true)" != installed ]; then
            missing="$missing $pkg"
        fi
    done
    [ -n "$missing" ] || return 0
    # Имена фиксированы установщиком. Один повтор обновляет устаревший индекс Ubuntu.
    DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=120 install -y --no-upgrade --no-install-recommends $missing || {
        apt-get -o Acquire::Retries=2 -o Acquire::Languages=none -o Acquire::GzipIndexes=true update &&
        DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=120 install -y --no-upgrade --no-install-recommends $missing
    }
}
test -f "$release/Browser/altnet-linux/transport_peers.py"
test -f "$release/Browser/altnet-linux/invite_transport.py"
if [ -f "$release/network/transport-peers.json" ]; then
    /usr/bin/python3 -IB "$release/Browser/altnet-linux/transport_peers.py" "$release/network/transport-peers.json"
fi
# Apply the overlay filter before activating the public transport.
install_missing nftables
/bin/sh "$release/network/install-fast-ingress.sh"
install_missing tor yggdrasil desktop-file-utils python3-cryptography openssl iproute2 \
    libopus0 pulseaudio-utils libgtk-3-0 libdbus-glib-1-2 libx11-xcb1
# В Jammy пакет может установить службу без конфигурации и без генератора systemd.
# Привязка ссылки создаёт первый ключ только если файл всё ещё отсутствует.
conf=/etc/yggdrasil/yggdrasil.conf
if [ ! -e "$conf" ] && [ ! -L "$conf" ]; then
    install -d -m750 -o root -g yggdrasil /etc/yggdrasil
    unit_tmp=$(mktemp /etc/yggdrasil/.altnet-first-key.XXXXXXXX)
    /usr/sbin/yggdrasil -genconf > "$unit_tmp"
    /usr/sbin/yggdrasil -useconffile "$unit_tmp" -address > /dev/null
    chgrp yggdrasil "$unit_tmp"
    chmod 0640 "$unit_tmp"
    ln -- "$unit_tmp" "$conf" || [ -s "$conf" ]
    rm -- "$unit_tmp"
    unit_tmp=
fi
systemctl enable --now tor.service
systemctl start tor@default.service
systemctl is-active --quiet tor@default.service
/usr/bin/python3 -IB "$release/Browser/altnet-linux/check_transport.py" tor
if [ -n "$stage" ]; then
    chmod -R a+rX,go-w "$release"
    printf '%s\n' "$2" > "$release/BUILD-SHA256"
    # После обмена этот путь может содержать резервную копию прежней установки.
    previous=$stage
    stage=
    python3 - "$release" <<'PY'
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
    if [ -d "$previous/altnet-browser" ]; then
        echo "Предыдущая сборка: $previous/altnet-browser"
    else
        rmdir "$previous"
    fi
fi
install -D -m644 /opt/altnet-browser/altnet-browser.desktop /usr/local/share/applications/altnet-browser.desktop
update-desktop-database /usr/local/share/applications
if [ -f /opt/altnet-browser/network/altnet-onion-entry.service ]; then
    install -m644 /opt/altnet-browser/network/altnet-onion-entry.service /etc/systemd/system/altnet-onion-entry.service
    if [ -f /opt/altnet-browser/network/altnet-entry-control.socket ]; then
        getent group altnet-entry >/dev/null || groupadd --system altnet-entry
        for unit in altnet-entry-control.socket altnet-entry-control@.service; do
            install -m644 "/opt/altnet-browser/network/$unit" "/etc/systemd/system/$unit"
        done
        owner_conf=/etc/systemd/system/altnet-entry-control.socket.d/40-install-owner.conf
        case ${SUDO_UID:-} in
            ''|*[!0-9]*) ;;
            *) if [ ! -e "$owner_conf" ] && [ "$SUDO_UID" -ge 1000 ] && [ "$SUDO_UID" -ne 65534 ] && getent passwd "$SUDO_UID" >/dev/null; then
                   install -d -m755 "${owner_conf%/*}"
                   printf '[Socket]\nSocketUser=%s\n' "$SUDO_UID" > "$owner_conf"
               fi ;;
        esac
    fi
    if [ -f /opt/altnet-browser/network/altnet-air-tor.socket ]; then
        for unit in altnet-air-tor.socket altnet-air-tor@.service; do
            install -m644 "/opt/altnet-browser/network/$unit" "/etc/systemd/system/$unit"
        done
        if [ -f "$owner_conf" ]; then
            install -D -m644 "$owner_conf" /etc/systemd/system/altnet-air-tor.socket.d/40-install-owner.conf
        fi
    fi
    systemctl daemon-reload
    if [ -f /opt/altnet-browser/network/altnet-entry-control.socket ]; then
        systemctl enable --now altnet-entry-control.socket
        if [ -f /opt/altnet-browser/network/altnet-air-tor.socket ]; then systemctl enable --now altnet-air-tor.socket; fi
    fi
fi
peers=/opt/altnet-browser/network/transport-peers.json
restart_transport=false
entries=/etc/altnet-transport/peers.json
drop=/etc/systemd/system/yggdrasil.service.d/60-altnet-entry.conf
if [ -f "$peers" ] && ! cmp -s "$peers" "$entries"; then
    install -D -m644 "$peers" "$entries"
    restart_transport=true
fi
unit_tmp=$(mktemp)
cat > "$unit_tmp" <<'UNIT'
[Service]
RuntimeDirectory=yggdrasil
ExecStartPre=/usr/bin/python3 -IB /opt/altnet-browser/Browser/altnet-linux/transport_peers.py /etc/altnet-transport/peers.json /etc/yggdrasil/yggdrasil.conf /run/yggdrasil/altnet-effective.json /run/yggdrasil/altnet-loopback.uri
ExecStart=
ExecStart=/usr/sbin/yggdrasil -useconffile /run/yggdrasil/altnet-effective.json
UNIT
if ! cmp -s "$unit_tmp" "$drop"; then
    install -D -m644 "$unit_tmp" "$drop"
    systemctl daemon-reload
    restart_transport=true
fi
if "$restart_transport" && systemctl is-active --quiet yggdrasil.service; then
    systemctl restart yggdrasil.service
fi
if systemctl is-failed --quiet yggdrasil.service; then
    systemctl reset-failed yggdrasil.service
fi
systemctl enable --now yggdrasil.service
systemctl is-active --quiet yggdrasil.service
/usr/bin/python3 -IB /opt/altnet-browser/Browser/altnet-linux/check_transport.py yggdrasil
name=/usr/local/bin/altnet-browser
[ "$(readlink "$name" || true)" = /opt/altnet-browser/altnet-browser ] || ln -s /opt/altnet-browser/altnet-browser "$name"
if [ "$#" = 4 ]; then
    /usr/bin/python3 -IB /opt/altnet-browser/Browser/altnet-linux/meeting-enrollment.py join "$3" --group "$4"
fi
