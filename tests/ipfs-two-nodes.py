import argparse
import json
import os
from pathlib import Path
import subprocess
import time
import socket

parser = argparse.ArgumentParser(description="Два Kubo в изолированном сетевом пространстве Linux")
parser.add_argument("--workspace", type=Path, required=True)
parser.add_argument("--ipfs", type=Path, required=True)
args = parser.parse_args()
root = args.workspace.resolve(strict=True)
ipfs_path = args.ipfs.resolve(strict=True)
if not root.is_dir() or not ipfs_path.is_file(): raise ValueError("Нужны каталог теста и исполняемый Kubo")
if (root / "received.car").exists(): raise FileExistsError("Файл received.car уже существует")
ipfs = str(ipfs_path)
root_cid = (root / 'root.txt').read_text().strip()
if not root_cid.startswith('bafy'): raise ValueError('Некорректный CID тестового сайта')
links = subprocess.check_output(['ip', '-o', 'link', 'show'], text=True)
if len(links.strip().splitlines()) != 1 or ': lo:' not in links:
    raise RuntimeError('Тест допускается только в сетевом пространстве с одним loopback-интерфейсом')
subprocess.run(['ip', 'link', 'set', 'lo', 'up'], check=True)
tmp = root / 'tmp'
tmp.mkdir(exist_ok=True)
run_dir = root / ('run-' + str(time.time_ns()))
run_dir.mkdir()
nodes = []
processes = []
logs = []
def call(env, *args, timeout=40, data=None):
    return subprocess.run([ipfs, *args], env=env, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, check=True).stdout
def config(env, name, value):
    call(env, 'config', '--json', name, json.dumps(value, separators=(',', ':')))

try:
    for i in (1, 2):
        repo = run_dir / f'node-{i}'
        if repo.exists(): raise RuntimeError('Refusing to overwrite an existing test repository')
        env = dict(os.environ, IPFS_PATH=str(repo), TMPDIR=str(tmp))
        call(env, 'init', '--profile=test', timeout=90)
        config(env, 'Addresses.API', f'/ip4/127.0.0.1/tcp/{15000+i}')
        config(env, 'Addresses.Gateway', [])
        config(env, 'Addresses.Swarm', [f'/ip4/127.0.0.1/tcp/{14000+i}'])
        config(env, 'Bootstrap', [])
        config(env, 'Routing.Type', 'none')
        config(env, 'Discovery.MDNS.Enabled', False)
        config(env, 'Swarm.DisableRelay', True)
        logs.append((run_dir / f'node-{i}.log').open('wb'))
        processes.append(subprocess.Popen([ipfs, 'daemon', '--routing=none'], env=env, stdout=logs[-1], stderr=subprocess.STDOUT))
        nodes.append(env)
        for attempt in range(80):
            if processes[-1].poll() is not None: raise RuntimeError(f'Node {i} stopped during startup')
            try:
                with socket.create_connection(('127.0.0.1', 15000+i), timeout=.2): break
            except OSError: pass
            time.sleep(.25)
        else: raise RuntimeError(f'Node {i} did not start')
        if (json.loads(call(env, 'config', '--json', 'Bootstrap')) != [] or
            json.loads(call(env, 'config', '--json', 'Discovery.MDNS.Enabled')) is not False or
            call(env, 'config', 'Routing.Type').decode().strip() != 'none' or
            json.loads(call(env, 'config', '--json', 'Swarm.DisableRelay')) is not True or
            json.loads(call(env, 'config', '--json', 'Addresses.Swarm')) != [f'/ip4/127.0.0.1/tcp/{14000+i}']):
            raise RuntimeError('Тестовый узел не соответствует ограничениям сети')
    ident1 = call(nodes[0], 'id', '--format=<id>').decode().strip()
    ident2 = call(nodes[1], 'id', '--format=<id>').decode().strip()
    if ident1 == ident2: raise RuntimeError('Узлы имеют одинаковую идентичность')
    call(nodes[1], 'swarm', 'connect', f'/ip4/127.0.0.1/tcp/14001/p2p/{ident1}')
    imported = call(nodes[0], 'dag', 'import', '--pin-roots=true', str(root / 'site.car')).decode()
    if root_cid not in imported: raise RuntimeError('Импорт не подтвердил корень сайта')
    if not call(nodes[0], 'pin', 'ls', '--type=recursive', root_cid).decode().strip().startswith(root_cid):
        raise RuntimeError('Пакет не закреплён на первом узле')
    received = call(nodes[1], 'dag', 'export', root_cid, timeout=90)
    with (root / 'received.car').open('xb') as stream: stream.write(received)
    peers1 = call(nodes[0], 'swarm', 'peers').decode().strip().splitlines()
    peers2 = call(nodes[1], 'swarm', 'peers').decode().strip().splitlines()
    if not peers1 or not peers2 or not all('/ip4/127.0.0.1/' in x for x in peers1 + peers2):
        raise RuntimeError('Обнаружены недопустимые соединения тестовых узлов')
    print('PASS: two isolated Kubo nodes exchanged a pinned IPLD site over loopback')
    print('PASS: only loopback interface, bootstrap disabled, DHT off, mDNS off, relay off')
    print('Root:', root_cid, 'received bytes:', len(received))
finally:
    for process in processes: process.terminate()
    for process in processes:
        try: process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)
    for log in logs: log.close()
