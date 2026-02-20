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

# --- install altnet-* units ---
install -m 0644 /vagrant/altnet/systemd/altnet-apply.service                /etc/systemd/system/altnet-apply.service
install -m 0644 /vagrant/altnet/systemd/altnet-apply.timer                  /etc/systemd/system/altnet-apply.timer
install -m 0644 /vagrant/altnet/systemd/altnet-peers-http.service           /etc/systemd/system/altnet-peers-http.service
install -m 0644 /vagrant/altnet/systemd/altnet-peers-refresh.service        /etc/systemd/system/altnet-peers-refresh.service
install -m 0644 /vagrant/altnet/systemd/altnet-peers-refresh.timer          /etc/systemd/system/altnet-peers-refresh.timer
install -m 0644 /vagrant/altnet/systemd/altnet-peers-refresh-fast.service   /etc/systemd/system/altnet-peers-refresh-fast.service
install -m 0644 /vagrant/altnet/systemd/altnet-peers-refresh-fast.timer     /etc/systemd/system/altnet-peers-refresh-fast.timer
install -m 0644 /vagrant/altnet/systemd/altnet-watcher.service              /etc/systemd/system/altnet-watcher.service
install -m 0644 /vagrant/altnet/systemd/altnet-profile-anon.target          /etc/systemd/system/altnet-profile-anon.target
install -m 0644 /vagrant/altnet/systemd/altnet-profile-fast.target          /etc/systemd/system/altnet-profile-fast.target
echo "[deploy] installed: altnet-* units"

# reload после установки пачки юнитов
systemctl daemon-reload

# timers & helpers: enable
systemctl enable --now altnet-apply.timer
systemctl enable --now altnet-peers-refresh.timer
systemctl enable --now altnet-peers-refresh-fast.timer
systemctl enable --now altnet-peers-http.service
systemctl enable --now altnet-watcher.service
echo "[deploy] enabled: altnet timers/services (apply, peers-refresh*, peers-http, watcher)"


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
