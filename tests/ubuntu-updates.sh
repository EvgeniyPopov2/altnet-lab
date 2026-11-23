#!/usr/bin/env bash
# Приёмка узла после обновления индекса APT, пакетов и перезагрузки.
set -euo pipefail
export LC_ALL=C
audit=$(dpkg --audit)
if [[ -n "$audit" ]]; then printf '%s\n' "$audit" >&2; exit 1; fi
apt-get check >/dev/null
plan=$(apt-get -s dist-upgrade)
if ! grep -Fxq '0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.' <<<"$plan"; then
  grep -E '^([0-9]+ upgraded|Inst |Remv )' <<<"$plan" >&2
  exit 1
fi
tracking=linux-image-generic-hwe-22.04
dpkg-query -W -f='${db:Status-Abbrev}' "$tracking" | grep -q '^ii'
running=$(uname -r)
expected=$(dpkg-query -W -f='${Depends}' "$tracking" | grep -oE 'linux-image-[0-9][^ ,()]*-generic' | head -n 1)
test "$expected" = "linux-image-$running" || { echo "Running $running, expected $expected" >&2; exit 1; }
test ! -e /run/reboot-required
printf 'PASS Ubuntu packages, kernel %s\n' "$running"
