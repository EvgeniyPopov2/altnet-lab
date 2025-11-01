#!/usr/bin/env bash
set -Eeuo pipefail

SRC="/vagrant/altnet"

log(){ echo "[deploy] $*"; }

copy_unit() {
  local src="$1" dst="$2"
  install -D -m 0644 "$src" "$dst"
  log "installed: $dst"
}

log "=== deploy systemd units from $SRC ==="

# discovery
copy_unit "$SRC/systemd/discovery@.service" "/etc/systemd/system/discovery@.service"
copy_unit "$SRC/systemd/discovery@.service.d/override.conf" "/etc/systemd/system/discovery@.service.d/override.conf"

# onion-fwd (только шаблон-юнит; override с .onion не трогаем)
copy_unit "$SRC/systemd/onion-fwd@.service" "/etc/systemd/system/onion-fwd@.service"

# tor drop-in (без bridges, только override с NoNewPrivileges)
copy_unit "$SRC/systemd/tor@default.service.d/override.conf" "/etc/systemd/system/tor@default.service.d/override.conf"

# ipfs unit (без override живого пользователя)
copy_unit "$SRC/systemd/ipfs.service" "/etc/systemd/system/ipfs.service"

log "daemon-reload..."
systemctl daemon-reload

echo "[deploy] reserve 5001 for IPFS: mask onion-fwd@5001"
systemctl disable --now onion-fwd@5001 2>/dev/null || true
systemctl mask onion-fwd@5001 2>/dev/null || true

echo "[deploy] enable & start ipfs"
systemctl enable --now ipfs
sleep 1

echo "[deploy] check ipfs (systemd + port 5001)"
systemctl is-active --quiet ipfs && echo "[deploy] ipfs is active" || (echo "[deploy] ipfs inactive"; journalctl -u ipfs -n 40 --no-pager)
ss -lntp | grep 127.0.0.1:5001 || echo "[deploy] WARN: 5001 not listening"

log "done."
