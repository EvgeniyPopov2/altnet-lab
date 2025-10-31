#!/usr/bin/env bash
set -Eeuo pipefail

TOPIC="altnet/releases"
BASE="/opt/altnet/modules"
QUAR="/opt/altnet/quarantine"
IPFS_USER="vagrant"

log(){ echo "[watcher] $(date -u +%F_%T) $*"; }
trap 'rc=$?; log "exit $rc at line $LINENO"; exit $rc' ERR

mkdir -p "$BASE" "$QUAR"

# sanity checks
command -v jq >/dev/null 2>&1 || { log "jq not found"; exit 1; }
if ! sudo -u "$IPFS_USER" -H ipfs id >/dev/null 2>&1; then
  log "ipfs not responding"; exit 1
fi

# подписка на PubSub (линейная буферизация важна под systemd)
sudo -u "$IPFS_USER" -H stdbuf -oL -eL ipfs pubsub sub "$TOPIC" | \
while IFS= read -r msg; do
  [[ -n "$msg" ]] || continue
  log "got message: $msg"

  name=$(jq -r '.name // empty' <<<"$msg")
  ver=$(jq -r '.version // empty' <<<"$msg")
  cid=$(jq -r '.cid // empty' <<<"$msg")
  sha=$(jq -r '.sha256 // empty' <<<"$msg")
  fname=$(jq -r '.filename // empty' <<<"$msg")

  if [[ -z "$name" || -z "$ver" || -z "$cid" ]]; then
    log "skip invalid msg"; continue
  fi
  [[ -z "$fname" ]] && fname="${name}-${ver}.tgz"

  dest="$BASE/$name/$ver"
  mkdir -p "$dest"
  printf '%s' "$msg" > "$dest/manifest.json"

  out="$dest/$fname"
  tmp="$out.part"
  rm -f "$tmp"

  log "fetching $name@$ver cid=$cid -> $out"

  # сначала пытаемся cat (файл по CID)
  if sudo -u "$IPFS_USER" -H ipfs cat "$cid" > "$tmp" 2>/dev/null; then
    :
  else
    # fallback: ipfs get в tmp-dir
    log "ipfs cat failed, trying ipfs get ..."
    tdir=$(mktemp -d)
    if sudo -u "$IPFS_USER" -H ipfs get -o "$tdir" "$cid" 2>/dev/null; then
      cand=$(find "$tdir" -maxdepth 1 -type f -print -quit)
      [[ -n "$cand" ]] && mv -f "$cand" "$tmp"
    fi
    rm -rf "$tdir"
  fi

  # Проверка: файл получен и не пустой
  if [[ ! -s "$tmp" ]]; then
    log "fetch failed or empty for $name@$ver (cid=$cid)"
    rm -f "$tmp"
    continue
  fi

  # Проверка sha256, если прислали
  if [[ -n "$sha" ]]; then
    calc=$(sha256sum "$tmp" | awk '{print $1}')
    if [[ "$calc" != "$sha" ]]; then
      log "SHA256 mismatch: expected $sha got $calc -> quarantine"
      qdir="$QUAR/$name/$ver-$(date -u +%Y%m%d%H%M%S)"
      mkdir -p "$qdir"
      cp -a "$dest/manifest.json" "$qdir/manifest.json"
      mv -f "$tmp" "$qdir/$fname"
      continue
    fi
  fi

  # публикуем атомарно
  mv -f "$tmp" "$out"
  date -u +%F_%T > "$dest/.fetched"
  log "fetched OK: $out"
done
