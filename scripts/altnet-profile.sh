#!/usr/bin/env bash
# AltNet profile switcher: fast <-> anon
# Использование:
#   sudo /vagrant/altnet/scripts/altnet-profile.sh fast
#   sudo /vagrant/altnet/scripts/altnet-profile.sh anon

set -Eeuo pipefail

# --- настройки ---
FWD_PORTS=(5002 5003)   # форварды к onion-пирам (5001 — занят IPFS, НЕ трогаем)
DISC_FAST="discovery@fast.service"
DISC_ANON="discovery@anon.service"
TOR_UNIT="tor@default.service"

# если запущено не от root — будем использовать sudo
SUDO=""
if [[ $(id -u) -ne 0 ]]; then
  SUDO="sudo"
fi

log(){ echo "[profile] $*"; }

start_fwd(){
  for p in "${FWD_PORTS[@]}"; do
    ${SUDO} systemctl enable --now "onion-fwd@${p}.service" >/dev/null 2>&1 || true
  done
}

stop_fwd(){
  for p in "${FWD_PORTS[@]}"; do
    ${SUDO} systemctl disable --now "onion-fwd@${p}.service" >/dev/null 2>&1 || true
  done
}

# сбрасываем "failed", чтобы сводка была чистой после переключений
reset_failed_fwd(){
  for p in "${FWD_PORTS[@]}"; do
    ${SUDO} systemctl reset-failed "onion-fwd@${p}.service" >/dev/null 2>&1 || true
  done
}

# ожидание слушателя TCP-порта (до timeout сек)
wait_port(){
  local port="$1"; local timeout="${2:-5}"
  local start_ts now
  start_ts=$(date +%s)
  while ! ss -lntp 2>/dev/null | grep -q ":$port"; do
    now=$(date +%s)
    (( now - start_ts >= timeout )) && return 1
    sleep 0.1
  done
  return 0
}

# ожидание локального форварда (127.0.0.1:PORT)
wait_fwd(){
  local port="$1"; local timeout="${2:-5}"
  local start_ts now
  start_ts=$(date +%s)
  while ! ss -lntp 2>/dev/null | grep -q "127\.0\.0\.1:$port"; do
    now=$(date +%s)
    (( now - start_ts >= timeout )) && return 1
    sleep 0.1
  done
  return 0
}

# аккуратно читаем состояние юнита
unit_state(){
  ${SUDO} systemctl is-active "$1" 2>/dev/null || true
}

check_listen(){
  local p="$1"
  if ss -lntp 2>/dev/null | grep -q ":$p"; then
    ss -lntp | grep ":$p" || true
  else
    echo "no-listen"
  fi
}

print_summary(){
  echo "[profile] summary:"
  printf -- "- %-16s %s\n" "discovery@fast:" "$(unit_state "$DISC_FAST")"
  printf -- "- %-16s %s\n" "discovery@anon:" "$(unit_state "$DISC_ANON")"
  for p in "${FWD_PORTS[@]}"; do
    printf -- "- %-16s %s\n" "onion-fwd@${p}:" "$(unit_state "onion-fwd@${p}.service")"
  done
  echo -n "- listen :4005:    "
  check_listen 4005
}

usage(){ echo "Usage: $0 {fast|anon}"; exit 1; }
[[ $# -ge 1 ]] || usage
mode="$1"

case "$mode" in
  fast)
    log "switch -> FAST"
    ${SUDO} systemctl stop "$DISC_ANON" || true
    stop_fwd || true
    reset_failed_fwd || true
    ${SUDO} systemctl restart "$DISC_FAST"
    # ждём, пока discovery поднимет :4005
    wait_port 4005 5 || log "WARN: :4005 не успел подняться (FAST)"
    ;;
  anon)
    log "switch -> ANON"
    ${SUDO} systemctl stop "$DISC_FAST" || true
    # Tor нужен форвардам; возможные ворнинги игнорируем
    ${SUDO} systemctl start "$TOR_UNIT" >/dev/null 2>&1 || true
    start_fwd || true
    reset_failed_fwd || true
    # ждём локальные форварды
    for p in "${FWD_PORTS[@]}"; do
      wait_fwd "$p" 5 || log "WARN: форвард $p не слушает 127.0.0.1:$p"
    done
    ${SUDO} systemctl restart "$DISC_ANON"
    wait_port 4005 5 || log "WARN: :4005 не успел подняться (ANON)"
    ;;
  *)
    usage
    ;;
esac

print_summary
