#!/usr/bin/env python3
"""State-machine regressions; optional signed peer delivery with a real vendor seed."""
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from urllib.request import urlopen
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from bridge_client import Mirror
from bridge_manager import Manager, manual_lines
from bridge_sources import Sources
from bridge_tor import Health, inspect
from bridge_power import Budget

def line(n):
    return f"obfs4 1.1.1.1:443 {n:040X} cert={'A' * 70} iat-mode=0"


class Probe:
    def __init__(self, root, tor, pt, lines):
        self.lines = lines
        self.process = SimpleNamespace(poll=lambda: None)
        self.result = Health()
        self.closed = False

    def health(self):
        return self.result

    def confirm(self):
        self.result = Health(100, frozenset([self.lines[0].split()[2]]), 1234)

    def close(self):
        self.closed = True


class ClientTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.now = 100
        self.sources = SimpleNamespace(current={"bridges": [line(1), line(2)], "sha256": "a"}, status="cache")
        self.manager = Manager(Path(self.tmp.name), self.sources, "tor", "pt", factory=Probe, clock=lambda: self.now)

    def connected(self):
        m = self.manager
        m.step()
        m.candidate.confirm()
        m.step()
        self.assertTrue(m.public_status()["connected"])
        return m.active

    def test_loss_selects_reserve_and_requires_built_circuit(self):
        old = self.connected()
        old.result = Health(100)
        self.manager.step()
        self.manager.step()
        self.assertEqual(self.manager.active_port, 0)
        self.assertTrue(old.closed)
        self.assertEqual(self.manager.candidate.lines, [line(2)])
        self.manager.candidate.confirm()
        self.manager.step()
        self.assertTrue(self.manager.public_status()["connected"])

    def test_bad_manual_rolls_back_and_duplicate_requests_coalesce(self):
        old = self.connected()
        m = self.manager
        m.request("manual", "Bridge " + line(3))
        with self.assertRaises(ValueError):
            m.request("switch")
        m.step()
        self.now += 181
        m.step()
        self.assertIs(m.active, old)
        self.assertTrue(m.active_port)
        self.assertNotIn("manual", m.saved)
        self.assertNotIn("cert=", json.dumps(m.public_status()))

    def test_switch_excludes_active_then_keeps_old_for_grace(self):
        old = self.connected()
        m = self.manager
        m.request("switch")
        m.step()
        self.assertEqual(m.candidate.lines, [line(2)])
        m.candidate.confirm()
        m.step()
        self.assertFalse(old.closed)
        self.now += 31
        m.step()
        self.assertTrue(old.closed)

    def test_switch_continues_with_signed_transport_after_bad_reserve(self):
        m = self.manager
        old = self.connected()
        m.snowflake = "pt"
        m.sources.current["snowflake"] = ["snowflake 192.0.2.1:443 " + "C"*40 + " url=opaque"]
        m.request("switch")
        m.step()
        self.now += 181
        m.step()
        m.step()
        self.assertIs(m.active, old)
        self.assertTrue(m.candidate.lines[0].startswith("snowflake "))
        m.candidate.confirm()
        m.step()
        self.assertEqual(m.phase, "ready")

    def test_manual_success_and_pause_survive_restart(self):
        self.connected()
        m = self.manager
        m.request("manual", line(3))
        m.step()
        m.candidate.confirm()
        m.step()
        self.assertEqual(m.saved["manual"], [line(3)])
        m.request("pause")
        new = Manager(Path(self.tmp.name), self.sources, "tor", "pt", factory=Probe)
        new.step()
        self.assertEqual(new.public_status()["phase"], "paused")
        self.assertIsNone(new.candidate)
        new.request("resume")
        new.step()
        self.assertEqual(new.candidate.lines, [line(3)])

    def test_stalled_bootstrap_uses_alternative_transport(self):
        m = self.manager
        m.snowflake = "snowflake"
        m.sources.current["snowflake"] = ["snowflake 192.0.2.1:443 " + "C"*40 + " url=opaque"]
        m.step()
        self.now += 86
        m.step()
        self.assertEqual(m.phase, "waiting")
        self.now = m.next_try + 1
        m.step()
        self.assertTrue(m.candidate.lines[0].startswith("snowflake "))

    def test_bootstrap_leaves_independent_reserves_and_rotates_past_dead_group(self):
        m = self.manager
        m.sources.current["bridges"] = [line(n) for n in range(1, 8)]
        m.step()
        first = set(m.candidate.lines)
        self.assertEqual(len(first), 3)
        self.now += 181
        m.step()
        self.now = m.next_try + 1
        m.step()
        self.assertTrue(first.isdisjoint(m.candidate.lines))

    def test_repeated_tls_failures_advance_without_waiting_for_stall_timeout(self):
        m = self.manager
        m.step()
        m.candidate.result = Health(10, repeated_failure=True)
        self.now += 26
        m.step()
        self.assertEqual(m.phase, "waiting")

    def test_rejects_multiple_config_directives(self):
        with self.assertRaises(ValueError):
            manual_lines(line(3) + "\nUseBridges 0")

    def test_delayed_parallel_trial_cancels_loser_and_keeps_single_route(self):
        m = self.manager
        m.budget = lambda: ("mains", 2)
        m.sources.current["bridges"] = [line(n) for n in range(1, 7)]
        m.step()
        first = m.candidate
        self.now += 11
        m.step()
        self.assertEqual(len(m.trials), 1)
        self.now += 2
        m.step()
        second = m.trials[1].instance
        self.assertTrue(set(first.lines).isdisjoint(second.lines))
        self.now += 5
        m.step()
        self.assertEqual(len(m.trials), 2)
        second.confirm()
        m.step()
        self.assertTrue(first.closed)
        self.assertIs(m.active, second)
        self.assertEqual(m.public_status()["probes"], 0)

    def test_unplug_cancels_extra_and_keeps_more_advanced_trial(self):
        m = self.manager
        m.budget = lambda: ("mains", 2)
        m.sources.current["bridges"] = [line(n) for n in range(1, 7)]
        m.step()
        self.now += 13
        m.step()
        first, other = [x.instance for x in m.trials]
        other.result = Health(25)
        m.step()
        m.budget = lambda: ("battery", 1)
        m.step()
        self.assertTrue(first.closed)
        self.assertIs(m.candidate, other)
        self.now += 14
        m.step()
        self.assertEqual(len(m.trials), 1)

    def test_power_cpu_and_user_limit(self):
        with patch("bridge_power.power_source", return_value="mains"), \
             patch("bridge_power.cpu_times", side_effect=[(100, 20), (200, 30), (300, 120)]), \
             patch("bridge_power.time.monotonic", side_effect=[0, 10, 20]):
            budget = Budget()
            self.assertEqual([budget(), budget(), budget()], [("sampling", 1), ("cpu", 1), ("mains", 2)])
        for source in ("battery", "saver", "unknown"):
            with patch("bridge_power.power_source", return_value=source), patch("bridge_power.cpu_times", return_value=(100,20)):
                self.assertEqual(Budget()(), (source, 1))
        with patch("bridge_power.power_source", return_value="mains"), \
             patch("bridge_power.cpu_times", side_effect=[(100, 20), (200, 115)]), \
             patch("bridge_power.time.monotonic", side_effect=[0, 10]):
            limited = Budget(1)
            limited()
            self.assertEqual(limited(), ("mains", 1))

    def test_linked_conflux_counts_but_padding_and_unlinked_circuits_do_not(self):
        for purpose, expected in (("GENERAL", True), ("CONFLUX_LINKED", True), ("CONFLUX_UNLINKED", False), ("CIRCUIT_PADDING", False)):
            fp = line(1).split()[2]
            replies = [b"UseBridges=1", b"status/bootstrap-phase=NOTICE PROGRESS=100\nstatus/circuit-established=1",
                       ("Bridge=" + line(1)).encode(), f"8 BUILT ${fp}~test,${fp}~exit PURPOSE={purpose}".encode()]
            with patch("bridge_tor.command", side_effect=replies):
                self.assertEqual(inspect(None).ready, expected)


@unittest.skipUnless(all(os.environ.get(k) for k in ("ALTNET_SEED", "ALTNET_KEYRING")), "provide signed vendor fixture")
class PeerTests(unittest.TestCase):
    def test_verified_cache_works_with_no_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            key = Path(os.environ["ALTNET_KEYRING"])
            gpgv = os.environ.get("ALTNET_GPGV", "gpgv")
            first = Sources(root / "one", key, gpgv)
            first.bootstrap(Path(os.environ["ALTNET_SEED"]))
            self.assertIsNotNone(first.current)
            second = Sources(root / "one", key, gpgv, ["http://127.0.0.1:12345"], lan=True)
            with patch("bridge_sources.fetch", side_effect=AssertionError("unexpected network request")):
                second.bootstrap(None)
                self.assertFalse(second.refresh(lambda: False))
            self.assertEqual(second.status, "waiting_tor")
            self.assertEqual(second.current, first.current)


class SourcePolicyTests(unittest.TestCase):
    def test_no_tor_means_no_source_connection_or_discovery(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Sources(Path(tmp) / "public", Path(tmp) / "key", "gpgv",
                             ["http://127.0.0.1:17862"], lan=True)
            with patch("socket.create_connection", side_effect=AssertionError("direct connection")), \
                 patch("socket.socket", side_effect=AssertionError("discovery")):
                self.assertFalse(source.refresh(lambda: False))
            self.assertEqual(source.status, "waiting_tor")

    def test_catalog_requests_use_tor_and_never_neighbors(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Sources(Path(tmp) / "public", Path(tmp) / "key", "gpgv",
                             ["http://127.0.0.1:17862"], lan=True, route=lambda: 9150)
            def fail(url, dest, limit, cancelled, port):
                self.assertEqual(url, "https://download.torproject.org/tor/")
                self.assertEqual(port, 9150)
                raise OSError("Tor unavailable")
            with patch("bridge_sources.fetch", side_effect=fail) as fetch:
                self.assertFalse(source.refresh(lambda: False))
                fetch.assert_called_once()
            self.assertEqual(source.status, "unavailable")

    def test_direct_http_and_arbitrary_hosts_are_rejected(self):
        from bridge_sources import fetch
        with tempfile.TemporaryDirectory() as tmp:
            for url in ("http://127.0.0.1:17862/v1/catalog", "https://example.com/", "https://download.torproject.org:444/"):
                with self.subTest(url=url), self.assertRaises(ValueError), \
                     patch("socket.create_connection", side_effect=AssertionError("unexpected network")):
                    fetch(url, Path(tmp) / "download", 100, lambda: False, 9150)


if __name__ == "__main__":
    unittest.main()

