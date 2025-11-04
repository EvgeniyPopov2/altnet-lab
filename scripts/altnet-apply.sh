#!/usr/bin/env bash
set -Eeuo pipefail

exec 9>/run/altnet-apply.lock
flock -n 9 || { echo "[apply] another instance running, exit"; exit 0; }

BASE="/opt/altnet/modules"
APPS="/opt/altnet/apps"
CUR="/opt/altnet/current"

log(){ echo "[apply] $*"; }

mkdir -p "$APPS" "$CUR"
shopt -s nullglob

for m in "$BASE"/*/*; do
  [ -d "$m" ] || continue

  manifest="$m/manifest.json"
  if [ ! -f "$manifest" ]; then
    log "no manifest in $m"
    continue
  fi

  name=$(jq -r '.name // empty' "$manifest")
  ver=$(jq -r '.version // empty' "$manifest")
  file=$(jq -r '.filename // empty' "$manifest")

  [ -n "$name" ] && [ -n "$ver" ] || { log "bad manifest fields in $m"; continue; }

  # уже применено? подчистим .fetched, чтобы .path не триггерился
  if [ -f "$m/.applied" ]; then
    [ -f "$m/.fetched" ] && rm -f "$m/.fetched" || true
    log "skip $name@$ver"
    continue
  fi

  tgz="$m/$file"
  if [ -z "$file" ] || [ ! -f "$tgz" ]; then
    tgz=$(ls "$m"/*.tgz 2>/dev/null | head -n1 || true)
  fi
  if [ ! -f "$tgz" ]; then
    log "no archive for $name@$ver"
    continue
  fi

  tmpdir=$(mktemp -d)
  log "unpack $tgz -> $tmpdir"
  if ! tar -C "$tmpdir" -xzf "$tgz"; then
    log "bad archive $tgz"
    rm -rf "$tmpdir"
    continue
  fi

  # ищем инсталлер: 'install' или 'install.sh'
  inst=$(find "$tmpdir" -maxdepth 2 -type f \( -name install -o -name install.sh \) | head -n1 || true)
  if [ -z "$inst" ]; then
    log "no install script for $name@$ver"
    rm -rf "$tmpdir"
    continue
  fi
  chmod +x "$inst" || true

  # запускаем в его директории
  if ( cd "$(dirname "$inst")" && "./$(basename "$inst")" ); then
    : > "$m/.applied"
    rm -f "$m/.fetched" || true
    ln -sfn "/opt/altnet/apps/$name/$ver" "$CUR/$name"
    log "set current/$name -> $ver"
    log "applied $name@$ver"
  else
    log "install failed for $name@$ver"
  fi

  rm -rf "$tmpdir"
done

log "done"
exit 0
