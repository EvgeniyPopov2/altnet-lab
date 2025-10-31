#!/usr/bin/env bash
set -Eeuo pipefail

BASE="/opt/altnet/modules"
APPS="/opt/altnet/apps"
CUR="/opt/altnet/current"

log(){ echo "[apply] $*"; }

mkdir -p "$APPS" "$CUR"
shopt -s nullglob

for m in "$BASE"/*/*; do
  [ -d "$m" ] || continue
  [ -f "$m/.applied" ] && { log "skip $(basename "$(dirname "$m")")@$(basename "$m")"; continue; }

  manifest="$m/manifest.json"
  [ -f "$manifest" ] || { log "no manifest in $m"; continue; }

  name=$(jq -r '.name // empty' "$manifest")
  ver=$(jq -r '.version // empty' "$manifest")
  file=$(jq -r '.filename // empty' "$manifest")

  tgz="$m/$file"
  if [ -z "$file" ] || [ ! -f "$tgz" ]; then
    tgz=$(ls "$m"/*.tgz 2>/dev/null | head -n1 || true)
  fi
  [ -f "$tgz" ] || { log "no archive for $name@$ver"; continue; }

  tmpdir=$(mktemp -d)
  log "unpack $tgz -> $tmpdir"
  if ! tar -C "$tmpdir" -xzf "$tgz"; then
    log "bad archive $tgz"; rm -rf "$tmpdir"; continue
  fi

  inst=$(find "$tmpdir" -maxdepth 2 -type f -name install | head -n1 || true)
  if [ -z "$inst" ]; then
    log "no install script for $name@$ver"; rm -rf "$tmpdir"; continue
  fi
  chmod +x "$inst" || true

  if ( cd "$(dirname "$inst")" && ./install ); then
    : > "$m/.applied"
    log "applied $name@$ver"
  else
    log "install failed for $name@$ver"
  fi

  rm -rf "$tmpdir"
done

log "done"
exit 0
