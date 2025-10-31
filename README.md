# AltNet Lab (Yggdrasil + Tor + IPFS + discovery)

Мини-репозиторий для стенда из 3 нод (Vagrant): systemd-юниты, env-конфиги (/etc/default), Tor-конфиги, служебные скрипты и правила коммита.

## Что тут хранится
- `systemd/` — шаблоны юнитов и drop-in (`*.service`, `*/override.conf.example`).
- `etc-default/` — шаблоны env-файлов (`*.example`). Живые файлы НЕ коммитим.
- `tor/` — `torrc`, `torrc.d/*.conf` (мосты только как `bridges.conf.example`).
- `scripts/` — служебные скрипты деплоя/мониторинга.
- `_sync_check/` — проверка синхронизации Vagrant.
- `.gitignore` — отсекает живые peers/bridges/onion-override.

## Политика чувствительных данных
- НЕ коммитим: `etc-default/discovery*` (живые), `systemd/onion-fwd@*/override.conf`, `tor/torrc.d/bridges.conf`, `var/lib/tor/**`.
- Коммитим только `*.example` рядом. На нодах копируем `.example` → рабочий файл вручную.

## Как работать (кратко)
1) Правим файлы на нодах в `/vagrant/altnet/...` (через `nano`).
2) На хосте: `git add … && git commit -m "..."`.
3) Деплой на ноды делает скрипт `altnet-apply.sh` (позже добавим точные инструкции).

## Статус
- Репозиторий локальный, GitHub ещё не подключён (запланировано).
- Список нод: node1/node2/node3 (Vagrant).
