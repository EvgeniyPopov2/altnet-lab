#!/usr/bin/env bash
set -euo pipefail
umask 022

SRC=/etc/default/altnet-peers-fast.sources
OUT=/etc/default/discovery.peers.fast
TMP="$(mktemp)"

[ -s "$SRC" ] || exit 0

> "$TMP.peers"
while read -r line; do
  url="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [ -z "$url" ] && continue
  case "$url" in \#*) continue;; esac

  case "$url" in
    https://*|http://*)
      curl -fsSL -m 20 --retry 2 --retry-delay 2 "$url" >> "$TMP.peers" || true
      ;;
    dnsaddr:*)
      d="${url#dnsaddr:}"
      dig +short TXT "_dnsaddr.$d" | sed 's/^"//;s/"$//' | sed -n 's/^dnsaddr=\(.*\)$/\1/p' >> "$TMP.peers" || true
      ;;
    *)
      # допускаем прямые multiaddr строкой
      echo "$url" >> "$TMP.peers"
      ;;
  esac
done < "$SRC"

PEERS_CSV="$(grep -E '^/(dns4|dns6|ip4|ip6|onion3|dnsaddr)/' "$TMP.peers" | tr -d '\r' | sed 's/[[:space:]]\+$//' | awk 'length>0' | tr '\n' ',' | sed 's/,$//')"
[ -n "$PEERS_CSV" ] || exit 0

echo "PEERS=\"$PEERS_CSV\"" > "$TMP"

if [ ! -f "$OUT" ] || ! cmp -s "$TMP" "$OUT"; then
  install -m 0644 "$TMP" "$OUT"
  systemctl try-reload-or-restart discovery@fast.service || true
fi

rm -f "$TMP" "$TMP.peers" 2>/dev/null || true
