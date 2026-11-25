#!/usr/bin/env python3
"""Rebuild the native browser icon bundle from AltNet's selected logo (Pillow required)."""
from base64 import b64encode
from io import BytesIO
from pathlib import Path
import tarfile
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
original = Image.open(ROOT / "ui/altnet-ui/public/altnet-logo.png").convert("RGBA")
side = max(original.size)
image = Image.new("RGBA", (side, side), (0, 0, 0, 0))
image.alpha_composite(original, ((side - original.width) // 2, (side - original.height) // 2))
files = {}


def png(size):
    output = BytesIO()
    image.resize((size, size), Image.Resampling.LANCZOS).save(output, format="PNG", optimize=False, compress_level=9)
    return output.getvalue()


for size in (16, 22, 24, 32, 48, 64, 128, 256):
    files[f"default{size}.png"] = png(size)
for size in (70, 150):
    files[f"VisualElements_{size}.png"] = png(size)
files["content/about-logo.png"] = png(256)
files["content/about-logo@2x.png"] = png(512)
payload = b64encode(png(256)).decode("ascii")
svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><image width="256" height="256" href="data:image/png;base64,{payload}"/></svg>\n'.encode("ascii")
files["content/about-logo.svg"] = svg
files["content/about-logo-small.svg"] = svg
files["content/about-wordmark.svg"] = b'<svg xmlns="http://www.w3.org/2000/svg" width="260" height="64" viewBox="0 0 260 64"><text x="2" y="49" fill="#7457eb" font-family="sans-serif" font-size="52" font-weight="700">AltNet</text></svg>\n'
ico = BytesIO()
image.save(ico, format="ICO", sizes=[(n, n) for n in (16, 24, 32, 48, 64, 128, 256)])
files["firefox.ico"] = ico.getvalue()
output = ROOT / "browser/tor-browser/assets/altnet-icons.tar"
output.parent.mkdir(parents=True, exist_ok=True)
with tarfile.open(output, "w", format=tarfile.USTAR_FORMAT) as archive:
    for name, data in sorted(files.items()):
        info = tarfile.TarInfo(name)
        info.size = len(data)
        info.mode = 0o644
        info.mtime = 0
        info.uid = info.gid = 0
        info.uname = info.gname = ""
        archive.addfile(info, BytesIO(data))
print(f"Created {output} ({len(files)} assets)")
