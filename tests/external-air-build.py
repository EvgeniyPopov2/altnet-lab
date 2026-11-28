"""Build the identical native candidate on the two Jammy endpoints from a pinned archive."""
import copy
import gzip
import hashlib
import io
from pathlib import Path
import tarfile


BASE_SHA256 = "b134fc2e47fe3771ab8683762ec8457e51611238bc49e4a51c0d238987bbed50"
NATIVE = ("invite_transport.py", "onion_proxy.py", "onion_entry.py", "voice_transport.py")


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def build(base, destination, native, unit):
    if sha256(base) != BASE_SHA256:
        raise ValueError("Unexpected base archive")
    patches = {"altnet-browser/Browser/altnet-linux/" + name:
               (native / name).read_bytes().replace(b"\r\n", b"\n") for name in NATIVE}
    patches["altnet-browser/network/altnet-onion-entry.service"] = unit.read_bytes().replace(b"\r\n", b"\n")
    additions={"altnet-browser/Browser/altnet-linux/air_tor.py":native/"air_tor.py"}
    for name in ("altnet-air-tor.socket","altnet-air-tor@.service"):
        additions["altnet-browser/network/"+name]=unit.parent/name
    with tarfile.open(base, "r|gz") as previous, destination.open("xb") as output:
        with gzip.GzipFile(filename="", mode="wb", compresslevel=1, fileobj=output, mtime=0) as zipped:
            with tarfile.open(fileobj=zipped, mode="w|") as updated:
                for member in previous:
                    header = copy.copy(member)
                    stream = previous.extractfile(member) if member.isfile() else None
                    if member.name in patches:
                        if not member.isfile():
                            raise ValueError("Unexpected archive member")
                        stream = io.BytesIO(patches.pop(member.name))
                        header.size = stream.getbuffer().nbytes
                    updated.addfile(header, stream)
                for name, path in additions.items():
                    contents=path.read_bytes().replace(b"\r\n",b"\n")
                    header=tarfile.TarInfo(name)
                    header.size=len(contents)
                    header.mode=0o644
                    updated.addfile(header,io.BytesIO(contents))
    if patches:
        raise ValueError("Candidate is missing native modules")
    return sha256(destination)
