# TESTS — чек-листы стенда AltNet (lab)

Цель — быстро подтвердить, что профили **fast** и **anon** работают на всех трёх нодах (node1/2/3), Tor-форварды живы, а IPFS не ломает сеть.

> Все команды выполняем от **root**: `sudo -i`

> Примечание: реальные списки пиров и мосты Tor — **не в репозитории**. На нодах лежат живые файлы:  
> - `/etc/default/discovery.peers*`  
> - `systemd/onion-fwd@*/override.conf`  
> - `/etc/tor/torrc.d/bridges.conf`  
> В репо — только `.example`.

---

## 0) Предварительные проверки (на каждой ноде)

```bash
hostname
ip -6 addr show
systemctl --version
tor --version
Службы должны быть установлены:

systemctl list-unit-files | grep -E 'discovery@|onion-fwd@|tor@default|ipfs'

1) Профиль FAST (локальная сеть, без Tor)

1.1 Включить fast и убедиться, что порт 4005 слушает на всех интерфейсах

systemctl stop discovery@anon || true
systemctl restart discovery@fast
systemctl status --no-pager discovery@fast
ss -lntp | grep ':4005'
Ожидаем: LISTEN на 0.0.0.0:4005 и [::]:4005.

1.2 Проверить параметры env и аргументы процесса

cat /etc/default/discovery.fast
cat /etc/default/discovery.common || true
ps -ef | grep '[d]iscovery'
Ожидаем: -profile=fast, -mdns=true, -dht=off, -http=127.0.0.1:18080 (если задан).

1.3 Проверить пиры fast

cat /etc/default/discovery.peers.fast
journalctl -u discovery@fast -n 100 --no-pager
Ожидаем: соединения с LAN-пирами (192.168.56.x / ваши адреса).

2) Профиль ANON (через Tor + форварды socat)
2.1 Форварды к onion-пирам должны быть активны

systemctl status --no-pager onion-fwd@5002
systemctl status --no-pager onion-fwd@5003
ss -lntp | grep '127.0.0.1:5002'
ss -lntp | grep '127.0.0.1:5003'
Ожидаем: активные юниты onion-fwd@..., на 127.0.0.1:5002/5003 слушает socat.

2.2 Включить anon и проверить, что порт 4005 слушает только loopback

systemctl stop discovery@fast || true
systemctl restart discovery@anon
systemctl status --no-pager discovery@anon
ss -lntp | grep ':4005'
Ожидаем: LISTEN только на 127.0.0.1:4005 и ::1:4005.

2.3 Проверить env и логи соединений к onion-пирам

cat /etc/default/discovery.anon
cat /etc/default/discovery.peers.anon
journalctl -u discovery@anon -n 150 --no-pager
Ожидаем: -mdns=false, -dht=off; подключения к локальным адресам /ip4/127.0.0.1/tcp/5002 (и 5003), которые проксируются через Tor на .onion.

2.4 Проверить адрес скрытого сервиса (опционально)

# Только если нода публикует свой HiddenService:
sudo cat /var/lib/tor/altnet-discovery/hostname
Ожидаем: строка вида xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.onion.

3) Переключение профилей (идемпотентность)

systemctl restart discovery@fast
systemctl restart discovery@anon
systemctl stop discovery@fast
systemctl restart discovery@anon
Ожидаем: без ошибок; в каждый момент активен нужный профиль.

4) Быстрые проверки IPFS (опционально)
Статус сервиса:

systemctl status --no-pager ipfs
Базовая функциональность (под тем пользователем, под которым запущен сервис):

su - vagrant -c 'ipfs id -f="<id>\n"'
su - vagrant -c 'echo hi > /tmp/hi.txt && ipfs add -q /tmp/hi.txt'
Ожидаем: корректный PeerID и CID.

Если в проде используем отдельного пользователя ipfs, то актуален override: systemd/ipfs.service.d/override.conf (в репо — .example).

5) Диагностика (частые кейсы)

Нет соединений в fast:

cat /etc/default/discovery.peers.fast
ping -c1 <LAN-peer>
journalctl -u discovery@fast -n 200 --no-pager

Нет соединений в anon:

systemctl status onion-fwd@5002
journalctl -u onion-fwd@5002 -n 50 --no-pager
journalctl -u discovery@anon -n 200 --no-pager
tor --version
Порт 4005 виден снаружи в anon → ошибка LISTEN:

ss -lntp | grep ':4005'
cat /etc/default/discovery.anon


6) Матрица «что проверить» по нодам

| Тест                           | node1 | node2 | node3 | 
|------------------------------- | :---: | :---: | :---: |
|                                |       |       |       | 
| 1.1 LISTEN 0.0.0.0:4005 (fast) |   ☐   |   ☐   |   ☐   |
| 2.1 onion-fwd@5002/5003        |   ☐   |   ☐   |   ☐   |
| 2.2 LISTEN только loopback     |   ☐   |   ☐   |   ☐   |
| 4 IPFS id/Add                  |   ☐   |   ☐   |   ☐   |

Заполняем галочки при прогоне.

IPFS: авто-бут и резерв порта 5001
Важно: порт 5001 занят RPC API IPFS. Его нельзя занимать под onion-fwd.
Если после ребута IPFS не стартует и в журнале ошибка bind: 127.0.0.1:5001 already in use, проверь, не висит ли onion-fwd@5001.

Проверка:

ss -lntp | grep 5001 || echo "free"
journalctl -u ipfs -b -n 30 --no-pager
Если слушает socat (onion-fwd@5001) — отключаем навсегда и перезапускаем IPFS:

systemctl disable --now onion-fwd@5001
systemctl mask onion-fwd@5001
systemctl restart ipfs
Автозапуск IPFS:

systemctl enable --now ipfs
systemctl is-enabled ipfs
Мини-настройка автобута в изолированной лабе (пример, подставить свои ID/адреса):

ipfs config --json Peering.Peers '[{"ID":"<PEER_ID_NODE1>","Addrs":["/ip4/192.168.56.10/tcp/4001"]},{"ID":"<PEER_ID_NODE2>","Addrs":["/ip4/192.168.56.11/tcp/4001"]},{"ID":"<PEER_ID_NODE3>","Addrs":["/ip4/192.168.56.12/tcp/4001"]}]'
ipfs config --json Bootstrap '["/ip4/192.168.56.10/tcp/4001/p2p/<PEER_ID_NODE1>","/ip4/192.168.56.11/tcp/4001/p2p/<PEER_ID_NODE2>","/ip4/192.168.56.12/tcp/4001/p2p/<PEER_ID_NODE3>"]'
ipfs config Routing.Type none
ipfs config --json Discovery.MDNS.Enabled true
systemctl restart ipfs
Проверка после ребута (каждая нода):

systemctl is-active ipfs
ipfs swarm peers

# по желанию:

ipfs pubsub sub altnet-chat   # на другой ноде:

echo 'ping' | ipfs pubsub pub altnet-chat
---

## 7) Переключатель профилей (altnet-profile.sh)

### 7.1 FAST → слушает 0.0.0.0/:: на 4005
sudo /vagrant/altnet/scripts/altnet-profile.sh fast
ss -lntp | grep ':4005'

Ожидаем: строки LISTEN на `0.0.0.0:4005` и `[::]:4005`.  
Полезно: `journalctl -u discovery@fast -n 50 --no-pager`

### 7.2 ANON → слушает только loopback, форварды активны
sudo /vagrant/altnet/scripts/altnet-profile.sh anon
ss -lntp | grep ':4005'
systemctl is-active onion-fwd@5002
systemctl is-active onion-fwd@5003

Ожидаем: LISTEN **только** на `127.0.0.1:4005` и `::1:4005`, оба форварда — `active`.  
Полезно: `journalctl -u discovery@anon -n 50 --no-pager`

### 7.3 (опц.) Проверка после ребута
sudo reboot
# после входа:
systemctl is-active discovery@anon
ss -lntp | grep ':4005'

Ожидаем: профиль и слушатели соответствуют последнему переключению.

### Матрица — добавить строку:
| Тест                               | node1 | node2 | node3 |
|------------------------------------|:-----:|:-----:|:-----:|
| 7 Переключение FAST↔ANON ок        |   ☐  |   ☐  |   ☐   |
