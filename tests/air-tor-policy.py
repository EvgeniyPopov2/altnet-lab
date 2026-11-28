"""Проверки границы между системным и резервным Tor."""
from pathlib import Path
import runpy
import unittest
from unittest.mock import patch


api=runpy.run_path(str(Path(__file__).resolve().parents[1]/"browser/tor-browser/linux/air_tor.py"))
A,B="A"*40,"B"*40
HOST="a"*56+".onion"


class Policy(unittest.TestCase):
    def select(self, config="", target=HOST, alternate=True):
        def answer(stream, request):
            if request==b"GETINFO config-text":
                return ("config-text=\n"+config+"\nOK").encode()
            if request==b"GETINFO stream-status":
                return ("1 SUCCEEDED 7 "+HOST+":17907").encode()
            if request==b"GETINFO circuit-status":
                rows=[f"7 BUILT ${A}~a,x PURPOSE=HS_CLIENT_REND"]
                if alternate:
                    rows.append(f"8 BUILT ${B}~b,x PURPOSE=GENERAL")
                return "\n".join(rows).encode()
            return b"r test id digest 2020-01-01 00:00:00 192.1.2.3 443 0\ns Guard Running Valid"
        with patch.dict(api["policy"].__globals__,command=answer):
            return api["policy"](None,target)

    def test_only_existing_guard_endpoints(self):
        rules=self.select()
        self.assertIn("EntryNodes $"+B,rules)
        self.assertIn("ReachableAddresses accept 192.1.2.3:443, reject *:*",rules)
        self.assertIn("EntryNodes $"+A,self.select(alternate=False))

    def test_no_direct_fallback_from_private_policy(self):
        for config in ("Socks5Proxy 127.0.0.1:1080","ExcludeNodes {xx}","DisableNetwork 1",
                       "UseBridges 1","ClientTransportPlugin unknown exec /bin/false"):
            with self.subTest(config=config), self.assertRaises(ValueError):
                self.select(config)
        with self.assertRaises(ValueError):
            self.select(target="b"*56+".onion")

    def test_bridge_policy_preserved(self):
        line="Bridge obfs4 192.0.2.4:443 "+A+" cert=YWJjZA== iat-mode=0"
        rows=self.select("UseBridges 1\nClientTransportPlugin obfs4 exec /usr/bin/obfs4proxy\n"+line)
        self.assertEqual(rows,["UseBridges 1","ClientTransportPlugin obfs4 exec /usr/bin/obfs4proxy",line])


if __name__=="__main__":
    unittest.main()
