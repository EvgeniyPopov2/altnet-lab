#!/usr/bin/env bash
set -Eeuo pipefail

exec 9>"${ALTNET_APPLY_LOCK:-/run/altnet-apply.lock}"
flock 9

ROOT="${ALTNET_ROOT:-/opt/altnet}"
BASE="$ROOT/modules"
APPS="$ROOT/apps"
CUR="$ROOT/current"

log(){ echo "[apply] $*"; }

mkdir -p "$APPS" "$CUR"
shopt -s nullglob

for pending in "$BASE"/*/*/.fetched; do
  [ -f "$pending" ] || continue
  m=${pending%/.fetched}
  attempted="$m/.apply-attempted"
  # Забираем событие до проверки пакета. Новая публикация создаст отдельный .fetched.
  mv -fT -- "$pending" "$attempted"
  if [ -f "$m/.applied" ]; then
    rm -f -- "$attempted"
    continue
  fi

  manifest="$m/manifest.json"
  if [ ! -f "$manifest" ]; then
    log "no manifest in $m"
    continue
  fi

  if ! name=$(jq -er '.name | strings | select(length > 0)' "$manifest") ||
     ! ver=$(jq -er '.version | strings | select(length > 0)' "$manifest") ||
     ! file=$(jq -r '.filename // empty' "$manifest"); then
    log "bad manifest in $m"
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
    ln -sfn "$APPS/$name/$ver" "$CUR/$name"
    : > "$m/.applied"
    rm -f -- "$attempted"
    log "set current/$name -> $ver"
    log "applied $name@$ver"
  else
    log "install failed for $name@$ver"
  fi

  rm -rf "$tmpdir"
done

log "done"
exit 0
