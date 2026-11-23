#!/usr/bin/env python3
"""Cold install with an unreachable official site and one opt-in local catalog peer, then a real HTTPS request."""
import argparse
from http.server import ThreadingHTTPServer
from pathlib import Path
import sys
import tempfile
import threading
import time
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from bridge_client import Mirror
from bridge_manager import Manager
from bridge_neighbors import announce, discover
from bridge_sources import Sources


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("seed", type=Path)
    p.add_argument("keyring", type=Path)
    args = p.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp)
        sender = Sources(home / "sender", args.keyring, "gpgv")
        sender.bootstrap(args.seed)
        if not sender.current:
            raise ValueError("Supply a signed vendor seed and matching keyring")
        stop = threading.Event()
        with ThreadingHTTPServer(("127.0.0.1", 17862), Mirror) as http:
            http.sources = sender
            mirror = threading.Thread(target=http.serve_forever)
            advert = threading.Thread(target=announce, args=("127.0.0.1", lambda: True, stop))
            mirror.start()
            advert.start()
            receiver = Sources(home / "receiver", args.keyring, "gpgv", lan=True)
            manager = Manager(home, receiver, "/usr/bin/tor", "/usr/bin/obfs4proxy")
            task = threading.Thread(target=manager.run)
            try:
                with patch("bridge_sources.INDEX", "http://127.0.0.1:17862/site-blocked"), \
                     patch("bridge_sources.discover", lambda cancelled: discover(cancelled, "127.0.0.1")):
                    task.start()
                    deadline = time.monotonic() + 420
                    while time.monotonic() < deadline:
                        status = manager.public_status()
                        if status["connected"] and status["internet"] in ("verified", "https"):
                            if receiver.status != "peer" or receiver.current != sender.current:
                                raise AssertionError("Expected the catalog from the discovered peer")
                            print("PASS cold client discovered peer, verified signed bundle and HTTPS via Tor", flush=True)
                            return
                        time.sleep(2)
                    raise TimeoutError("No confirmed external HTTPS connection via peer-supplied bridges")
            finally:
                manager.stop.set()
                manager.wake.set()
                manager.fetch.set()
                manager.route_event.set()
                stop.set()
                task.join()
                advert.join()
                http.shutdown()
                mirror.join()


if __name__ == "__main__":
    main()

