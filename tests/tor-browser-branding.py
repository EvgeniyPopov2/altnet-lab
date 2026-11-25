#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import io
import os
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("branding", ROOT / "scripts/apply-tor-browser-branding.py")
branding = importlib.util.module_from_spec(spec)
spec.loader.exec_module(branding)
ASSETS = ROOT / "browser/tor-browser/assets/altnet-icons.tar"


class BrandingTests(unittest.TestCase):
    def test_product_names_change_without_erasing_tor_credit(self):
        original = "-brand-short-name = Браузер Tor\n-brand-full-name = Браузер Tor\n-vendor-short-name = Tor Project\ntrademarkInfo = Tor is a trademark\n"
        changed = branding.rewrite_brand(original, "ru", True)
        self.assertIn("-brand-short-name = Браузер AltNet\n", changed)
        self.assertIn("-brand-full-name = Браузер AltNet\n", changed)
        self.assertIn("-vendor-short-name = Tor Project\n", changed)
        self.assertIn("trademarkInfo = Tor is a trademark\n", changed)
        self.assertEqual(changed, branding.rewrite_brand(changed, "ru", True))
        self.assertIn("AltNet Browser", branding.rewrite_brand(original, "fr", True))

    def test_targeted_messages_preserve_network_and_official_manual(self):
        original = "torConnect.couldNotConnect=Браузер Tor не может подключиться к сети Tor\nmanual=Руководство Браузер Tor\n"
        changed = branding.rewrite_product_text(original, "ru")
        self.assertEqual(changed, "torConnect.couldNotConnect=Браузер AltNet не может подключиться к сети Tor\nmanual=Руководство Браузер Tor\n")
        en = "torConnect.restartTorBrowser=Restart Tor Browser\n    .label = Tor Browser Manual\n"
        self.assertEqual(branding.rewrite_product_text(en, "en-US"), "torConnect.restartTorBrowser=Restart AltNet Browser\n    .label = Tor Browser Manual\n")
        ru = "torlauncher.tor_exited_during_startup=Для запуска Tor Browser нужен Tor\n"
        self.assertEqual(branding.rewrite_product_text(ru, "ru"), "torlauncher.tor_exited_during_startup=Для запуска браузера AltNet нужен Tor\n")
        ru = "tor-browser-home-tor-check-warning=Соединение с Tor управляется браузером Tor\n"
        self.assertEqual(branding.rewrite_product_text(ru, "ru"), "tor-browser-home-tor-check-warning=Соединение с Tor управляется браузером AltNet\n")

    def test_missing_brand_fields_fail_closed(self):
        with self.assertRaises(ValueError):
            branding.rewrite_brand("unrelated = value\n", "ru", True)

    def test_applies_assets_and_localized_brand_in_isolated_tree(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get("TEMP")) as tmp:
            root = Path(tmp); source = root / "src"; l10n = root / "l10n"
            asset_dir = source / "browser/branding/tb-release/content"; asset_dir.mkdir(parents=True)
            brand = l10n / "ru/browser/branding/tb-release"; brand.mkdir(parents=True)
            (brand / "brand.ftl").write_text("-brand-short-name = Браузер Tor\n-brand-full-name = Браузер Tor\n", encoding="utf-8")
            (brand / "brand.properties").write_text("brandShortName=Браузер Tor\nbrandFullName=Браузер Tor\n", encoding="utf-8")
            branding.apply(source, l10n, ASSETS)
            self.assertIn("Браузер AltNet", (brand / "brand.ftl").read_text(encoding="utf-8"))
            self.assertTrue((asset_dir.parent / "firefox.ico").read_bytes().startswith(b"\0\0\1\0"))
            self.assertTrue((asset_dir / "about-logo.png").read_bytes().startswith(b"\x89PNG\r\n\x1a\n"))
            branding.apply(source, l10n, ASSETS)

    def test_rejects_unexpected_archive_before_writing(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get("TEMP")) as tmp:
            root = Path(tmp); source = root / "src"; (source / "browser/branding/tb-release").mkdir(parents=True)
            archive = root / "evil.tar"
            with tarfile.open(archive, "w") as tar:
                entry = tarfile.TarInfo("../outside"); entry.size = 4
                tar.addfile(entry, io.BytesIO(b"evil"))
            with self.assertRaises(ValueError):
                branding.apply(source, root / "l10n", archive)
            self.assertFalse((root / "outside").exists())


if __name__ == "__main__":
    unittest.main()
