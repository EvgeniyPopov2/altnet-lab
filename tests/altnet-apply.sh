#!/usr/bin/env bash
# Автономный тест очереди. Все файлы модулей и блокировка находятся во временном каталоге.
set -euo pipefail
script="$(cd "$(dirname "$0")/.." && pwd)/scripts/altnet-apply.sh"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
export ALTNET_ROOT="$work/lab" ALTNET_APPLY_LOCK="$work/lock"
mkdir -p "$ALTNET_ROOT/modules" "$work/package"
cat > "$work/package/install.sh" <<'INSTALL'
#!/bin/sh
echo installed >> "$ALTNET_ROOT/calls"
INSTALL
tar -czf "$work/valid.tgz" -C "$work/package" install.sh
mkdir "$work/empty"
tar -czf "$work/empty.tgz" -C "$work/empty" .
for name in good malformed absent noarchive corrupt noinstaller failed duplicate unpublished; do
  dir="$ALTNET_ROOT/modules/$name/1"
  mkdir -p "$dir"
  printf '{"name":"%s","version":"1","filename":"bundle.tgz"}\n' "$name" > "$dir/manifest.json"
  cp "$work/valid.tgz" "$dir/bundle.tgz"
  case "$name" in
    malformed) echo '{' > "$dir/manifest.json" ;;
    absent) rm "$dir/manifest.json" ;;
    noarchive) rm "$dir/bundle.tgz" ;;
    corrupt) echo invalid > "$dir/bundle.tgz" ;;
    noinstaller) cp "$work/empty.tgz" "$dir/bundle.tgz" ;;
    failed)
      printf '#!/bin/sh\nexit 1\n' > "$work/package/install.sh"
      tar -czf "$dir/bundle.tgz" -C "$work/package" install.sh ;;
    duplicate) touch "$dir/.applied" ;;
    unpublished) continue ;;
  esac
  touch "$dir/.fetched"
done
bash "$script" >"$work/first.log" 2>&1
for name in malformed absent noarchive corrupt noinstaller failed; do
  dir="$ALTNET_ROOT/modules/$name/1"
  test -f "$dir/.apply-attempted" && test ! -e "$dir/.applied" || exit 1
done
test -z "$(find "$ALTNET_ROOT/modules" -name .fetched -print -quit)"
test -f "$ALTNET_ROOT/modules/good/1/.applied"
test "$(readlink "$ALTNET_ROOT/current/good")" = "$ALTNET_ROOT/apps/good/1"
test ! -e "$ALTNET_ROOT/modules/unpublished/1/.applied"
test ! -e "$ALTNET_ROOT/modules/duplicate/1/.apply-attempted"
bash "$script" >"$work/idle.log" 2>&1
test "$(cat "$work/idle.log")" = '[apply] done'
test "$(wc -l < "$ALTNET_ROOT/calls")" -eq 1

# Исправленная публикация создаёт новое событие и обрабатывается ровно один раз.
dir="$ALTNET_ROOT/modules/noinstaller/1"
cp "$work/valid.tgz" "$dir/bundle.tgz"
touch "$dir/.fetched"
bash "$script" > /dev/null & first=$!
bash "$script" > /dev/null & second=$!
wait "$first"; wait "$second"
test -f "$dir/.applied"
test ! -e "$dir/.apply-attempted"
test "$(wc -l < "$ALTNET_ROOT/calls")" -eq 2
echo 'PASS altnet-apply'
