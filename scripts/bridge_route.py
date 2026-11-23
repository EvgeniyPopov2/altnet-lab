"""End-to-end connectivity over an already confirmed local Tor SOCKS listener."""
import http.client
import json
import socket
import struct


def read_exact(sock, length):
    parts = bytearray()
    while len(parts) < length:
        chunk = sock.recv(length - len(parts))
        if not chunk:
            raise OSError("SOCKS closed the connection")
        parts.extend(chunk)
    return bytes(parts)


def through_tor(port, host):
    sock = socket.create_connection(("127.0.0.1", port), 4)
    try:
        sock.settimeout(12)
        sock.sendall(b"\x05\x01\x00")
        if read_exact(sock, 2) != b"\x05\x00":
            raise OSError("SOCKS negotiation failed")
        name = host.encode("ascii")
        sock.sendall(b"\x05\x01\x00\x03" + bytes([len(name)]) + name + struct.pack("!H", 443))
        version, result, _, family = read_exact(sock, 4)
        if version != 5 or result != 0:
            raise OSError("SOCKS destination unavailable")
        if family == 3:
            size = read_exact(sock, 1)[0]
        elif family in (1, 4):
            size = 4 if family == 1 else 16
        else:
            raise OSError("Invalid SOCKS reply")
        read_exact(sock, size + 2)
        return sock
    except BaseException:
        sock.close()
        raise


def check(port):
    for host, path in (("check.torproject.org", "/api/ip"), ("www.torproject.org", "/")):
        conn = http.client.HTTPSConnection(host, timeout=12)
        conn._create_connection = lambda *args, **kwargs: through_tor(port, host)
        try:
            conn.request("GET" if path == "/api/ip" else "HEAD", path)
            response = conn.getresponse()
            if path == "/api/ip" and response.status == 200:
                if json.loads(response.read(4096)).get("IsTor") is True:
                    return "verified"
            elif path == "/" and 200 <= response.status < 400:
                return "https"
        except (OSError, ValueError, http.client.HTTPException):
            pass
        finally:
            conn.close()
    return "unreachable"

