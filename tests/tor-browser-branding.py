#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import io
import os
import struct
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
        self.assertIn("Браузер AltNet основан на Tor Browser", changed)
        self.assertIn("Поддержка и автоматические обновления AltNet пока не подключены", changed)
        self.assertIn(".label = О браузере AltNet", changed)
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

    def test_settings_labels_and_missing_support_are_honest(self):
        original = ('pane-about-firefox-title = О { -brand-short-name }\n'
                    '    .title = { pane-about-firefox-title }\n'
                    'help-button-label2 = Поддержка { -brand-short-name }\n'
                    '    .title = Поддержка { -brand-short-name }\n'
                    'about-firefox-header =\n    .heading = О { -brand-short-name }\n'
                    'support-application-heading =\n    .description = Старая поддержка\n'
                    '    .label = Поддержка { -brand-short-name }\n'
                    'unrelated = Tor — название сети\n')
        changed = branding.rewrite_russian_preferences(original)
        self.assertIn('pane-about-firefox-title = О браузере AltNet\n    .title = О браузере AltNet\n', changed)
        self.assertIn('help-button-label2 = Поддержка AltNet\n    .title = Поддержка AltNet\n', changed)
        self.assertIn('    .heading = О браузере AltNet\n', changed)
        self.assertIn('    .description = Поддержка AltNet пока не подключена.', changed)
        self.assertIn('unrelated = Tor — название сети\n', changed)
        self.assertEqual(changed, branding.rewrite_russian_preferences(changed))
        self.assertEqual(branding.rewrite_russian_base('pane-profiles-no-account-sync = Profiles\n    .title = Профили\n'),
                         'pane-profiles-no-account-sync = Профили\n    .title = Профили\n')

    def test_unavailable_updates_are_not_claimed_to_be_managed_by_os(self):
        source = ('update-application-heading =\n    .label = Updates\n'
                  '    .description = Old description\n'
                  'update-application-updates-managed-by-os =\n    .message = Managed by OS\n')
        ru = branding.rewrite_update_preferences(source, 'ru')
        self.assertIn('.label = Обновления AltNet', ru)
        self.assertIn('.message = Автоматические обновления AltNet пока не подключены.', ru)
        self.assertEqual(ru, branding.rewrite_update_preferences(ru, 'ru'))
        en = branding.rewrite_update_preferences(source, 'en-US')
        self.assertIn('.message = Automatic AltNet updates are not available yet.', en)
        self.assertNotIn('Managed by OS', en)

    def test_applies_assets_and_localized_brand_in_isolated_tree(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get("TEMP")) as tmp:
            root = Path(tmp); source = root / "src"; l10n = root / "l10n"
            asset_dir = source / "browser/branding/tb-release/content"; asset_dir.mkdir(parents=True)
            brand = l10n / "ru/browser/branding/tb-release"; brand.mkdir(parents=True)
            (brand / "brand.ftl").write_text("-brand-short-name = Браузер Tor\n-brand-full-name = Браузер Tor\n", encoding="utf-8")
            (brand / "brand.properties").write_text("brandShortName=Браузер Tor\nbrandFullName=Браузер Tor\n", encoding="utf-8")
            preferences = l10n / "ru/browser/browser/preferences/preferences.ftl"
            preferences.parent.mkdir(parents=True)
            preferences.write_text("pane-about-firefox-title = Старое имя\nupdate-application-updates-managed-by-os =\n    .message = OS\n", encoding="utf-8")
            base = l10n / "ru/toolkit/toolkit/global/base-browser.ftl"
            base.parent.mkdir(parents=True)
            base.write_text("pane-profiles-no-account-sync = Profiles\n", encoding="utf-8")
            branding.apply(source, l10n, ASSETS)
            self.assertIn("Браузер AltNet", (brand / "brand.ftl").read_text(encoding="utf-8"))
            self.assertIn("О браузере AltNet", preferences.read_text(encoding="utf-8"))
            self.assertIn("обновления AltNet пока не подключены", preferences.read_text(encoding="utf-8"))
            self.assertIn("Профили", base.read_text(encoding="utf-8"))
            self.assertTrue((asset_dir.parent / "firefox.ico").read_bytes().startswith(b"\0\0\1\0"))
            self.assertTrue((asset_dir / "about-logo.png").read_bytes().startswith(b"\x89PNG\r\n\x1a\n"))
            branding.apply(source, l10n, ASSETS)

    def test_windows_icon_contains_square_resolutions(self):
        with tarfile.open(ASSETS, "r") as tar:
            data = tar.extractfile("firefox.ico").read()
        reserved, kind, count = struct.unpack_from("<HHH", data)
        self.assertEqual((reserved, kind), (0, 1))
        sizes = set()
        for index in range(count):
            width, height, _, _, _, _, _, _ = struct.unpack_from("<BBBBHHII", data, 6 + 16 * index)
            width, height = width or 256, height or 256
            self.assertEqual(width, height)
            sizes.add(width)
        self.assertEqual(sizes, {16, 24, 32, 48, 64, 128, 256})

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
