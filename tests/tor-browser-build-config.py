#!/usr/bin/env python3
"""Checks that the pinned-source build overlay never overwrites other changes."""
import importlib.util
import os
import shutil
import subprocess
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/prepare-tor-browser-build.py"
spec = importlib.util.spec_from_file_location("altnet_tor_build", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

CONFIG = b"input_files:\n  - project: container-image\n"
BUILD = b'cd /var/tmp/build/[% project %]-[% c("version") %]\ncp $rootdir/mozconfig ./\n' + module.LOCALIZATION + module.PDB_BEFORE


class BuildOverlayTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=os.environ.get("TEMP"))
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        directory = self.root / "projects/firefox"
        directory.mkdir(parents=True)
        (directory / "config").write_bytes(CONFIG)
        (directory / "build").write_bytes(BUILD)
        self.source_patch = self.root / "source.patch"
        self.source_patch.write_bytes(b"patch content")

    def fake_git(self, root, *args):
        if args == ("rev-parse", "HEAD"):
            return module.BUILD_COMMIT.encode()
        if args == ("show", "HEAD:projects/firefox/config"):
            return CONFIG
        if args == ("show", "HEAD:projects/firefox/build"):
            return BUILD
        raise AssertionError(args)

    def run_prepare(self):
        with patch.object(module, "git", self.fake_git), patch.object(module, "PATCH", self.source_patch):
            module.prepare(self.root)

    def test_is_idempotent_and_applies_patch_after_extracting_source(self):
        self.run_prepare()
        config = (self.root / "projects/firefox/config").read_bytes()
        build = (self.root / "projects/firefox/build").read_bytes()
        self.assertIn(b"filename: altnet-about-page.patch", config)
        self.assertIn(b"filename: altnet-branding.py", config)
        self.assertIn(b"filename: altnet-icons.tar", config)
        self.assertIn(b'patch -p1 --batch --forward < "$rootdir/altnet-about-page.patch"', build)
        self.assertIn(module.BRANDING_COMMAND, build)
        self.assertIn(module.UPDATER_CONFIG, build)
        self.assertIn(b'c("var/windows") && !c("var/updater_enabled")', module.UPDATER_CONFIG)
        self.assertIn(module.PDB_AFTER, build)
        self.run_prepare()
        self.assertEqual((self.root / "projects/firefox/config").read_bytes(), config)
        self.assertEqual((self.root / "projects/firefox/build").read_bytes(), build)

    def test_refuses_modified_build_file_without_changing_config(self):
        path = self.root / "projects/firefox/build"
        path.write_bytes(b"user changes")
        with self.assertRaises(ValueError):
            self.run_prepare()
        self.assertEqual((self.root / "projects/firefox/config").read_bytes(), CONFIG)
        self.assertEqual(path.read_bytes(), b"user changes")
        self.assertFalse((self.root / "projects/firefox/altnet-about-page.patch").exists())

    def test_refuses_mismatched_existing_patch(self):
        destination = self.root / "projects/firefox/altnet-about-page.patch"
        destination.write_bytes(b"other patch")
        with self.assertRaises(ValueError):
            self.run_prepare()
        self.assertEqual(destination.read_bytes(), b"other patch")
        self.assertEqual((self.root / "projects/firefox/config").read_bytes(), CONFIG)

    def test_upgrades_the_previous_prepared_build_without_discarding_changes(self):
        self.run_prepare()
        build = self.root / "projects/firefox/build"
        expected = build.read_bytes()
        build.write_bytes(expected.replace(module.UPDATER_CONFIG, b'').replace(module.BRANDING_COMMAND, module.LOCALIZATION).replace(module.PDB_AFTER, module.PDB_BEFORE))
        self.run_prepare()
        self.assertEqual(build.read_bytes(), expected)

    def test_upgrades_previous_overlay_for_disabled_updater(self):
        self.run_prepare()
        build = self.root / "projects/firefox/build"
        expected = build.read_bytes()
        build.write_bytes(expected.replace(module.UPDATER_CONFIG, b''))
        self.run_prepare()
        self.assertEqual(build.read_bytes(), expected)

    def test_refuses_unexpected_pdb_packaging_without_writing(self):
        self.source_patch.write_bytes(b"patch content")
        with patch.object(module, "git", side_effect=lambda root, *args: BUILD.replace(module.PDB_BEFORE, b"") if args == ("show", "HEAD:projects/firefox/build") else self.fake_git(root, *args)), patch.object(module, "PATCH", self.source_patch):
            with self.assertRaises(ValueError):
                module.prepare(self.root)
        self.assertEqual((self.root / "projects/firefox/config").read_bytes(), CONFIG)

    def test_refuses_other_upstream_commit(self):
        with patch.object(module, "git", return_value=b"different commit"), patch.object(module, "PATCH", self.source_patch):
            with self.assertRaises(ValueError):
                module.prepare(self.root)
        self.assertEqual((self.root / "projects/firefox/config").read_bytes(), CONFIG)

    def test_refuses_modified_existing_branding_without_changing_recipe(self):
        destination = self.root / "projects/firefox/altnet-branding.py"
        destination.write_bytes(b"user content")
        with self.assertRaises(ValueError):
            self.run_prepare()
        self.assertEqual(destination.read_bytes(), b"user content")
        self.assertEqual((self.root / "projects/firefox/config").read_bytes(), CONFIG)
        self.assertFalse((self.root / "projects/firefox/altnet-about-page.patch").exists())

    @unittest.skipIf(os.name == "nt" or not shutil.which("bash"), "Requires a POSIX bash")
    def test_preserves_different_pdbs_with_the_same_name(self):
        source = self.root / "objects"
        for folder, data in (("single", b"first"), ("versioned", b"second")):
            (source / folder).mkdir(parents=True)
            (source / folder / "InstallationDirLayout.pdb").write_bytes(data)
        output = self.root / "dist"
        (output / "Debug/Browser").mkdir(parents=True)
        subprocess.run(["bash", "-euo", "pipefail", "-c", module.PDB_AFTER.decode()], cwd=source,
                       env={**os.environ, "distdir": str(output)}, check=True)
        self.assertEqual((output / "Debug/Browser/InstallationDirLayout.pdb").read_bytes(), b"first")
        self.assertEqual((output / "Debug/Browser/duplicates/versioned/InstallationDirLayout.pdb").read_bytes(), b"second")


if __name__ == "__main__":
    unittest.main()
