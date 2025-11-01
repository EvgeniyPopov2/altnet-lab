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

log "done."
