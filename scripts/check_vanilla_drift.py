#!/usr/bin/env python3
"""Report when Mojang changes a vanilla file that an add-on overrides.

    python3 scripts/check_vanilla_drift.py                  # check every add-on
    python3 scripts/check_vanilla_drift.py no-witch-conversion
    python3 scripts/check_vanilla_drift.py --print-hash      # hashes to record

Bedrock replaces vanilla entity files wholesale, with no way to patch a single
component, so an add-on that disables a vanilla mechanic has to ship the whole
file. That pins the vanilla behaviour until the copy is re-synced. The re-sync
itself is trivial; remembering to check is not. This does the remembering.

An add-on declares what it overrides in addon.json:

    "vanilla_overrides": [
      {
        "path": "behavior_pack/entities/villager_v2.json",
        "upstream_sha256": "<sha256 of the comment-stripped upstream at sync time>"
      }
    ]

`path` is relative to the add-on folder and is also the path inside
bedrock-samples, so one field serves both ends.

Detection is a hash comparison rather than a stored copy of the vanilla file,
which keeps a second copy of a large JSON blob out of the repository. When the
hash differs, the diff shown is upstream against the file we *ship* -- so it
includes the add-on's own edit as one extra hunk, which the reader expects.

Exit codes: 0 no drift, 1 drift found, 2 could not check (network, 404, bad
config). A check that silently stops checking is worse than no check, so a
failure to reach upstream is never reported as "no drift".

Python 3 standard library only.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
UPSTREAM_BASE = "https://raw.githubusercontent.com/Mojang/bedrock-samples/main"

# Mojang's vanilla JSON is not strict JSON: it carries // comments, some of them
# trailing a value on the same line. Splitting each line at // and keeping the
# left side is safe for these files -- no // occurs inside a string literal --
# and leaving the blank line behind keeps line numbers aligned with upstream,
# which makes the diff below readable. check_vanilla_drift and the re-sync
# procedure in each add-on's README must agree on this rule.
def strip_comments(text: str) -> str:
    lines = [ln.split("//")[0].rstrip() if "//" in ln else ln for ln in text.splitlines()]
    return "\n".join(lines) + "\n"


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def fetch_upstream(path: str) -> str:
    url = f"{UPSTREAM_BASE}/{path}"
    request = urllib.request.Request(url, headers={"User-Agent": "BedrockAddons-drift-check"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(
            f"upstream returned HTTP {exc.code} for {url}. If Mojang moved the file, "
            f"update 'path' in the add-on's addon.json."
        ) from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"cannot reach {url}: {exc.reason}") from exc


def overrides_for(addon_id: str) -> list:
    """Read the vanilla_overrides declaration from one add-on, if it has one."""
    path = REPO_ROOT / addon_id / "addon.json"
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{addon_id}/addon.json is not valid JSON: {exc}") from exc
    return data.get("vanilla_overrides") or []


def addon_ids() -> list:
    found = []
    for path in sorted(REPO_ROOT.iterdir()):
        if path.is_dir() and not path.name.startswith((".", "_")) and path.name != "scripts":
            if (path / "addon.json").is_file():
                found.append(path.name)
    return found


def check(addon_id: str, override: dict, print_hash: bool) -> bool:
    """Returns True if the upstream file has drifted from the recorded hash."""
    rel = override.get("path")
    recorded = override.get("upstream_sha256")
    if not rel or not recorded:
        raise RuntimeError(
            f"{addon_id}/addon.json: each vanilla_overrides entry needs 'path' and "
            f"'upstream_sha256'"
        )

    upstream = strip_comments(fetch_upstream(rel))
    current = sha256(upstream)

    if print_hash:
        print(f"{addon_id}  {rel}\n  {current}")
        return False

    if current == recorded:
        print(f"ok    {addon_id}  {rel}  (upstream unchanged)")
        return False

    shipped_path = REPO_ROOT / addon_id / rel
    print(f"DRIFT {addon_id}  {rel}")
    print(f"  recorded sha256: {recorded}")
    print(f"  upstream sha256: {current}")
    print(f"  upstream: {UPSTREAM_BASE}/{rel}")

    if shipped_path.is_file():
        shipped = shipped_path.read_text(encoding="utf-8")
        diff = list(
            difflib.unified_diff(
                upstream.splitlines(),
                shipped.splitlines(),
                fromfile=f"upstream/{rel}",
                tofile=f"{addon_id}/{rel}",
                lineterm="",
                n=3,
            )
        )
        print(
            f"\n  Diff below is upstream against the file this add-on ships, so it "
            f"includes\n  the add-on's own edit as well as Mojang's changes.\n"
        )
        print("\n".join(diff[:400]))
        if len(diff) > 400:
            print(f"\n  ... {len(diff) - 400} more diff lines omitted")
    return True


def main(argv: list) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("addon_id", nargs="?", help="check one add-on (default: all)")
    parser.add_argument(
        "--print-hash",
        action="store_true",
        help="print the current upstream hash instead of comparing, for recording in addon.json",
    )
    args = parser.parse_args(argv)

    targets = [args.addon_id] if args.addon_id else addon_ids()
    drifted = False
    checked = 0
    try:
        for addon_id in targets:
            for override in overrides_for(addon_id):
                checked += 1
                drifted |= check(addon_id, override, args.print_hash)
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if not checked:
        print("no add-on declares vanilla_overrides; nothing to check")
    return 1 if drifted else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
