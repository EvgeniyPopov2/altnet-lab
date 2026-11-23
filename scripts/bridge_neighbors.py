"""One link-local multicast query for installations explicitly sharing a public catalog."""
import ipaddress
import secrets
import socket
import time

GROUP = "239.255.178.62"
PORT = 17863
PREFIX = b"altnet-public-catalog/1 "


def discover(cancelled, interface=None):
    nonce = secrets.token_hex(12).encode()
    answers = []
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 1)
        if interface:
            sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(interface))
        sock.settimeout(.25)
        sock.sendto(PREFIX + nonce, (GROUP, PORT))
        deadline = time.monotonic() + 1.5
        while not cancelled() and time.monotonic() < deadline and len(answers) < 4:
            try:
                data, (host, _) = sock.recvfrom(128)
            except socket.timeout:
                continue
            ip = ipaddress.ip_address(host)
            if (data == PREFIX + nonce + b" share" and ip.is_private and not ip.is_multicast
                    and not ip.is_unspecified and not ip.is_reserved):
                url = f"http://{host}:17862"
                if url not in answers:
                    answers.append(url)
    return answers


def announce(interface, available, stop):
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("", PORT))
        membership = socket.inet_aton(GROUP) + socket.inet_aton(interface)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, membership)
        sock.settimeout(.5)
        while not stop.is_set():
            try:
                data, addr = sock.recvfrom(128)
            except socket.timeout:
                continue
            nonce = data[len(PREFIX):]
            if (available() and data.startswith(PREFIX) and len(nonce) == 24
                    and all(c in b"0123456789abcdef" for c in nonce) and ipaddress.ip_address(addr[0]).is_private):
                sock.sendto(data + b" share", addr)

