#!/usr/bin/env bash
set -euo pipefail
LIST=/etc/tor/bridges.list
OUT=/etc/tor/torrc.d/bridges.conf

rotate() {
  mapfile -t L < <(grep -vE '^\s*#|^\s*$' "$LIST" || true)
  [ ${#L[@]} -gt 0 ] || { echo "no bridges in $LIST"; exit 1; }
  for ((i=0; i<${#L[@]}; i++)); do
    BR=("${L[@]:i:3}")
    {
      echo "UseBridges 1"
      echo "ClientTransportPlugin obfs4 exec /usr/bin/obfs4proxy"
      for b in "${BR[@]}"; do [ -n "${b:-}" ] && echo "$b"; done
    } | sudo tee "$OUT" >/dev/null
    sudo systemctl restart tor
    # ждём Bootstrap 100%
    if timeout 60 journalctl -u tor -f -o cat | grep -m1 "Bootstrapped 100%"; then
      echo "bridges OK"
      exit 0
    fi
  done
  echo "no working bridges"
  exit 2
}

rotate
