#!/usr/bin/env bash
# Запускается через sudo на свободном от публикаций узле после установки или перезагрузки.
set -euo pipefail
systemctl is-active --quiet tor@default.service
pid=$(systemctl show tor@default.service -p MainPID --value)
grep -Fxq 'system_tor (enforce)' "/proc/$pid/attr/current"
aa-exec -p system_tor -- /usr/bin/tor --defaults-torrc /usr/share/tor/tor-service-defaults-torrc \
  -f /etc/tor/torrc --verify-config >/dev/null
ss -H -lnt 'sport = :9050' | grep -Fq '127.0.0.1:9050'
systemctl is-active --quiet altnet-apply.path
systemctl is-active --quiet altnet-apply.timer
systemctl cat altnet-apply.service | grep -Fxq 'ConditionPathExistsGlob=/opt/altnet/modules/*/*/.fetched'
shopt -s nullglob
pending=(/opt/altnet/modules/*/*/.fetched)
(( ${#pending[@]} == 0 )) || { echo 'Есть ожидающие публикации. Повторите проверку после их обработки.' >&2; exit 2; }
start=$(journalctl -n 0 --show-cursor --no-pager | sed -n 's/^-- cursor: //p')
test -n "$start"
sleep 65
# SD_MESSAGE_UNIT_STARTING учитывает и неудачный запуск. Пропуск по Condition имеет другой ID.
starts=$(journalctl -q -u altnet-apply.service --after-cursor="$start" --no-pager \
  MESSAGE_ID=7d4958e842da4a758f6c1cdc7b36dcc5 -o json | wc -l)
test "$starts" -eq 0 || { echo "За 65 с зафиксировано обработок: $starts. Проверьте публикации и журнал." >&2; exit 1; }
systemctl is-active --quiet tor@default.service
echo 'PASS tor@default, AppArmor, SOCKS, altnet-apply idle 65s'
