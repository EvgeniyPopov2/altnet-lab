#!/usr/bin/env python3
"""Apply AltNet product branding to a pinned, extracted Tor Browser source tree.

The Tor network name and upstream copyright/trademark notices are retained.
Run only in an isolated build tree after upstream localization has completed.
"""
import argparse
from pathlib import Path
import re
import tarfile

ASSET_NAMES = {*(f"default{n}.png" for n in (16, 22, 24, 32, 48, 64, 128, 256)),
               "VisualElements_70.png", "VisualElements_150.png", "firefox.ico",
               "content/about-logo.png", "content/about-logo@2x.png",
               "content/about-logo.svg", "content/about-logo-small.svg", "content/about-wordmark.svg"}
FTL_KEYS = {"-brand-shorter-name", "-brand-short-name", "-brand-full-name", "-brand-product-name"}
PROPERTY_KEYS = {"brandShorterName", "brandShortName", "brandFullName"}
TEXT_KEYS = {
    "settings.torPreferencesDescription", "torConnect.noInternet", "torConnect.couldNotConnect",
    "torConnect.errorLocation", "torConnect.errorLocationDescription", "torConnect.isLocationCorrectDescription",
    "torConnect.finalError", "torConnect.restartTorBrowser", "torlauncher.tor_exited_during_startup",
    "torlauncher.tor_exited", "tor-browser-home-message-updated", "tor-browser-home-message-testing",
    "tor-browser-home-tor-check-warning",
}


def rewrite_brand(text, locale, is_ftl):
    label = "Браузер AltNet" if locale == "ru" else "AltNet Browser"
    keys = FTL_KEYS if is_ftl else PROPERTY_KEYS
    seen = set()
    output = []
    for line in text.splitlines(keepends=True):
        match = re.match(r"^(\s*)([-\w]+)(\s*=\s*)(.*?)(\r?\n)?$", line)
        if match and match.group(2) in keys:
            seen.add(match.group(2))
            line = f"{match.group(1)}{match.group(2)}{match.group(3)}{label}{match.group(5) or ''}"
        elif match and not is_ftl and match.group(2) in {"brandShortName_alpha", "brandFullName_alpha", "brandShortName_nightly", "brandFullName_nightly"}:
            alpha = match.group(2).endswith("_alpha")
            suffix = (" (альфа)" if alpha else " (тестовая)") if locale == "ru" else (" Alpha" if alpha else " Nightly")
            line = f"{match.group(1)}{match.group(2)}{match.group(3)}{label}{suffix}{match.group(5) or ''}"
        output.append(line)
    required = {"-brand-short-name", "-brand-full-name"} if is_ftl else {"brandShortName", "brandFullName"}
    if not required <= seen:
        raise ValueError("Required upstream branding keys missing")
    result = "".join(output)
    if is_ftl:
        messages = (
            'altnet-about-project = Браузер AltNet основан на Tor Browser от <label data-l10n-name="project-link">Tor Project</label> и Mozilla Firefox.\n'
            'altnet-about-support = Поддержка и автоматические обновления AltNet пока не подключены.\n'
            'altnet-about-window-title =\n    .title = О браузере AltNet\n'
            'altnet-menu-about =\n    .label = О браузере AltNet\n    .accesskey = О\n'
            'altnet-appmenu-about =\n    .label = О браузере AltNet\n    .accesskey = О\n'
            if locale == "ru" else
            'altnet-about-project = AltNet Browser is based on Tor Browser by <label data-l10n-name="project-link">Tor Project</label> and Mozilla Firefox.\n'
            'altnet-about-support = AltNet support and automatic updates are not available yet.\n'
            'altnet-about-window-title =\n    .title = About AltNet Browser\n'
            'altnet-menu-about =\n    .label = About AltNet Browser\n    .accesskey = A\n'
            'altnet-appmenu-about =\n    .label = About AltNet Browser\n    .accesskey = A\n'
        )
        if "altnet-about-project =" in result or "altnet-about-support =" in result:
            if messages.strip() not in result:
                raise ValueError("Unexpected existing AltNet about messages")
        else:
            result = result.rstrip("\n") + "\n\n" + messages
    return result


def rewrite_product_text(text, locale):
    if locale not in ("ru", "en-US"):
        return text
    replacements = (("Tor Browser", "AltNet Browser"),) if locale == "en-US" else (
        ("Браузер Tor", "Браузер AltNet"), ("браузера Tor", "браузера AltNet"),
        ("браузер Tor", "браузер AltNet"), ("браузере Tor", "браузере AltNet"),
        ("браузером Tor", "браузером AltNet"), ("Для запуска Tor Browser", "Для запуска браузера AltNet"),
        ("Tor Browser", "браузер AltNet"))
    lines = []
    for line in text.splitlines(keepends=True):
        key = line.split("=", 1)[0].strip()
        if key in TEXT_KEYS or line.strip() in (".label = Tor Browser Home", ".label = Домашняя страница браузера Tor"):
            for before, after in replacements:
                line = line.replace(before, after)
        lines.append(line)
    return "".join(lines)


def write_changed(path, transform):
    original = path.read_text(encoding="utf-8")
    changed = transform(original)
    if original != changed:
        path.write_text(changed, encoding="utf-8", newline="\n")


def apply(source, l10n, archive):
    source = source.resolve(strict=True)
    target = source / "browser/branding/tb-release"
    if not target.is_dir():
        raise ValueError("Unexpected browser source tree")
    # Never extract arbitrary archive paths into the source tree.
    with tarfile.open(archive, "r") as tar:
        members = tar.getmembers()
        if {m.name for m in members} != ASSET_NAMES or len(members) != len(ASSET_NAMES):
            raise ValueError("Unexpected icon asset set")
        for member in members:
            if not member.isfile() or member.size > 1_000_000:
                raise ValueError("Invalid icon asset")
        for member in members:
            data = tar.extractfile(member).read()
            (target / member.name).write_bytes(data)
    source_torbutton = source / "toolkit/torbutton/chrome/locale"
    if source_torbutton.is_dir():
        for locale_dir in source_torbutton.iterdir():
            if not locale_dir.is_dir():
                continue
            locale = locale_dir.name
            for name in ("brand.properties", "settings.properties", "torConnect.properties", "torlauncher.properties"):
                path = locale_dir / name
                if not path.is_file():
                    continue
                if name == "brand.properties":
                    write_changed(path, lambda value: rewrite_brand(value, locale, False))
                else:
                    write_changed(path, lambda value: rewrite_product_text(value, locale))
    en_ftl = source / "toolkit/locales/en-US/toolkit/global/tor-browser.ftl"
    if en_ftl.is_file():
        write_changed(en_ftl, lambda value: rewrite_product_text(value, "en-US"))
    if l10n.is_dir():
        for locale_dir in l10n.iterdir():
            if not locale_dir.is_dir():
                continue
            locale = locale_dir.name
            brand = locale_dir / "browser/branding/tb-release"
            for name in ("brand.ftl", "brand.properties"):
                path = brand / name
                if path.is_file():
                    write_changed(path, lambda value: rewrite_brand(value, locale, name.endswith(".ftl")))
            path = locale_dir / "toolkit/toolkit/global/tor-browser.ftl"
            if path.is_file():
                write_changed(path, lambda value: rewrite_product_text(value, locale))
    print("AltNet product names and chosen icons applied; Tor network and attribution retained")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("l10n", type=Path)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    apply(args.source, args.l10n, args.archive)
