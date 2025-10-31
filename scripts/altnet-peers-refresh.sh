#!/usr/bin/env bash
set -euo pipefail
umask 022

SRC=/etc/default/altnet-peers.sources
OUT=/etc/default/discovery.peers.anon
TMP="$(mktemp)"

[ -s "$SRC" ] || exit 0

SUCCESS=0
while read -r url; do
  url="$(echo "$url" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [ -z "$url" ] && continue
  case "$url" in \#*) continue;; esac
  if torsocks -i curl -fsSL -m 20 --retry 2 --retry-delay 2 "$url" -o "$TMP.peers"; then
    SUCCESS=1
    break
  fi
done < "$SRC"

[ "$SUCCESS" -eq 1 ] || exit 0

PEERS_CSV="$(grep -E '^/(dns4|dns6|ip4|ip6|onion3)/' "$TMP.peers" | tr -d '\r' | tr '\n' ',' | sed 's/,$//')"
[ -n "$PEERS_CSV" ] || exit 0

echo "PEERS=\"$PEERS_CSV\"" > "$TMP"

if [ ! -f "$OUT" ] || ! cmp -s "$TMP" "$OUT"; then
  install -m 0644 "$TMP" "$OUT"
  systemctl try-reload-or-restart discovery@anon.service || true
fi

rm -f "$TMP" "$TMP.peers" 2>/dev/null || true
