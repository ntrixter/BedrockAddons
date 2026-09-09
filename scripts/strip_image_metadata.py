#!/usr/bin/env python3
"""Strip identifying metadata out of PNG and JPEG files, in place.

    python3 scripts/strip_image_metadata.py sleep-addon/behavior_pack/pack_icon.png
    python3 scripts/strip_image_metadata.py --dry-run some-addon/**/*.png

A pack_icon.png that came off a phone or out of an image editor can carry an
author name, the software that made it, a device model, or GPS coordinates.
Run this over every image on its way into the repo; see the Anonymity section
of CLAUDE.md.

This is deliberately a separate command from scripts/check_repo.py. The check
script reports; only this one rewrites files, and it is never run by CI.
Python 3 standard library only.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# PNG chunks that can carry authorship, software, timestamps or EXIF payloads.
PNG_STRIP = {b"tEXt", b"iTXt", b"zTXt", b"eXIf", b"tIME"}

# JPEG segments: EXIF/XMP, Photoshop/IPTC, and free-text comments.
JPEG_STRIP = {0xE1: "APP1 (EXIF/XMP)", 0xED: "APP13 (IPTC)", 0xFE: "COM (comment)"}

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def strip_png(data: bytes) -> tuple:
    """Rebuild a PNG keeping every chunk except the metadata ones."""
    out = bytearray(PNG_SIGNATURE)
    removed = []
    offset = len(PNG_SIGNATURE)
    while offset + 8 <= len(data):
        length = int.from_bytes(data[offset : offset + 4], "big")
        name = data[offset + 4 : offset + 8]
        end = offset + 12 + length  # length + type + data + crc
        if end > len(data):
            raise ValueError("truncated PNG chunk")
        if name in PNG_STRIP:
            removed.append(name.decode("ascii"))
        else:
            out += data[offset:end]
        offset = end
        if name == b"IEND":
            break
    return bytes(out), removed


def strip_jpeg(data: bytes) -> tuple:
    """Rebuild a JPEG keeping the structural segments and the image data."""
    out = bytearray(data[:2])  # SOI
    removed = []
    offset = 2
    while offset + 4 <= len(data):
        if data[offset] != 0xFF:
            break
        marker = data[offset + 1]
        if marker == 0xDA:  # start of scan: copy the rest verbatim
            out += data[offset:]
            return bytes(out), removed
        size = int.from_bytes(data[offset + 2 : offset + 4], "big")
        end = offset + 2 + size
        if end > len(data):
            raise ValueError("truncated JPEG segment")
        if marker in JPEG_STRIP:
            removed.append(JPEG_STRIP[marker])
        else:
            out += data[offset:end]
        offset = end
    out += data[offset:]
    return bytes(out), removed


def process(path: Path, dry_run: bool) -> bool:
    """Returns True if the file was (or would be) changed."""
    data = path.read_bytes()
    if data.startswith(PNG_SIGNATURE):
        cleaned, removed = strip_png(data)
    elif data.startswith(b"\xff\xd8"):
        cleaned, removed = strip_jpeg(data)
    else:
        print(f"skipped {path}: not a PNG or JPEG")
        return False

    if not removed:
        print(f"clean   {path}")
        return False
    action = "would strip" if dry_run else "stripped"
    print(f"{action} {path}: {', '.join(removed)}")
    if not dry_run:
        path.write_bytes(cleaned)
    return True


def main(argv: list) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("paths", nargs="+", type=Path, help="image files to clean")
    parser.add_argument("--dry-run", action="store_true", help="report without rewriting")
    args = parser.parse_args(argv)

    changed = 0
    for path in args.paths:
        if not path.is_file():
            print(f"error: no such file: {path}", file=sys.stderr)
            return 1
        try:
            if process(path, args.dry_run):
                changed += 1
        except ValueError as exc:
            print(f"error: {path}: {exc}", file=sys.stderr)
            return 1
    print(f"{changed} file(s) {'would be ' if args.dry_run else ''}changed")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
