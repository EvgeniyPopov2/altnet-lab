"""Проверить и сохранить точные байты подписанной поставки. Ключи доверия хранить отдельно от загрузки."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

PRODUCT = "altnet-browser-windows-x86_64"
MAX_BYTES = 2 * 1024**3


def small(path, limit):
    with path.open("rb") as source:
        value = source.read(limit + 1)
    if not 0 < len(value) <= limit:
        raise ValueError("Некорректный размер метаданных")
    return value


def unique(fields):
    result = {}
    for key, value in fields:
        if key in result:
            raise ValueError("Повторное поле манифеста")
        result[key] = value
    return result


def verified_copy(archive, manifest, signature, trusted, build, parent):
    parent = parent.resolve(strict=True)
    if parent.drive.upper() != "H:" or not parent.is_dir():
        raise ValueError("Для проверенной копии нужен каталог на H:")
    raw = small(manifest, 4096)
    sig = base64.b64decode(small(signature, 128).strip(), validate=True)
    for path in trusted:
        public = serialization.load_pem_public_key(small(path, 4096))
        if not isinstance(public, Ed25519PublicKey):
            raise ValueError("Нужен доверенный открытый ключ Ed25519")
        try:
            public.verify(sig, raw)
            break
        except InvalidSignature:
            continue
    else:
        raise ValueError("Подпись выпуска не подтверждена")
    meta = json.loads(raw, object_pairs_hook=unique)
    if (not isinstance(meta, dict) or set(meta) != {"product", "build", "size", "sha256"}
            or meta["product"] != PRODUCT or type(meta["build"]) is not int or meta["build"] != build or build < 1
            or type(meta["size"]) is not int or not 0 < meta["size"] <= MAX_BYTES
            or not isinstance(meta["sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", meta["sha256"])):
        raise ValueError("Манифест не соответствует ожидаемой поставке")
    directory = Path(tempfile.mkdtemp(dir=parent, prefix="altnet-verified-delivery-"))
    pending = directory / "pending"
    try:
        digest, total = hashlib.sha256(), 0
        with archive.open("rb") as src, pending.open("xb") as out:
            while block := src.read(1024 * 1024):
                total += len(block)
                if total > meta["size"]:
                    raise ValueError("Пакет больше подписанного размера")
                digest.update(block)
                out.write(block)
            out.flush()
            os.fsync(out.fileno())
        if total != meta["size"] or digest.hexdigest() != meta["sha256"]:
            raise ValueError("Содержимое пакета расходится с подписанным манифестом")
        dest = directory / "AltNet-Browser.zip"
        pending.rename(dest)
        return dest
    finally:
        pending.unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("archive", "manifest", "signature", "output"):
        parser.add_argument("--" + name, required=True, type=Path)
    parser.add_argument("--trusted-key", required=True, type=Path, action="append")
    parser.add_argument("--build", required=True, type=int, help="Номер ожидаемого выпуска из доверенного источника")
    args = parser.parse_args()
    print(verified_copy(args.archive, args.manifest, args.signature, args.trusted_key, args.build, args.output))
