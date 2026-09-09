#!/usr/bin/env python3
"""Regenerate catalog.json from this repository's released tags.

catalog.json is a small machine-readable index published at the repo root so a
consumer can resolve "latest version of add-on X" over raw.githubusercontent.com
with no auth and no meaningful rate limit. See CATALOG.md for the schema.

    python3 scripts/gen_catalog.py                 # regenerate catalog.json
    python3 scripts/gen_catalog.py --validate catalog.json
    python3 scripts/gen_catalog.py --offline       # skip the API; null releases

Facts come from three places, each chosen so the catalog cannot drift:

  * The release list comes from the GitHub API, so a deleted release disappears
    and a tag without a release never appears.
  * SHA256 comes from downloading the release's own .sha256 asset. It is never
    recomputed locally -- a later change to the build script must not silently
    republish a different hash for an already-released artifact.
  * Pack UUIDs, types and versions are read from the manifests *at that tag*
    via `git show`, not from the working tree, so an old release keeps
    describing what it actually shipped. This needs full history
    (actions/checkout with fetch-depth: 0).

Python 3 standard library only.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_VERSION = 1
API_ROOT = "https://api.github.com"

# Tag shape: <addon-id>-v<semver>. The id is matched non-greedily so an add-on
# whose own name contains "-v" still splits at the right place.
TAG_RE = re.compile(r"^(?P<id>.+?)-v(?P<version>\d+\.\d+\.\d+(?:[-+].*)?)$")
PRERELEASE_RE = re.compile(r"^\d+\.\d+\.\d+-")
LOCALISATION_KEY_RE = re.compile(r"^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$")

PACK_SOURCES = (("behavior_pack", "data", "BP"), ("resource_pack", "resources", "RP"))


class CatalogError(Exception):
    """A problem the user has to fix. Reported without a traceback."""


def usable_manifest_text(value):
    """Return value if it reads as real display text, else None.

    A manifest header often holds a localisation key such as "pack.name".
    Publishing that literal string to every consumer would be worse than
    falling back to the add-on id, so keys are rejected here.
    """
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text or text.startswith("pack."):
        return None
    if " " not in text and LOCALISATION_KEY_RE.match(text):
        return None
    return text


def git(*args: str) -> str | None:
    """Run a git command, returning None if it fails (e.g. path absent at tag)."""
    result = subprocess.run(
        ["git", "-C", str(REPO_ROOT), *args], capture_output=True, text=True
    )
    return result.stdout if result.returncode == 0 else None


def repo_slug() -> str:
    """owner/repo, from the Actions environment or the git remote."""
    from_env = os.environ.get("GITHUB_REPOSITORY")
    if from_env:
        return from_env
    remote = (git("remote", "get-url", "origin") or "").strip()
    match = re.search(r"github\.com[:/](?P<slug>[^/]+/[^/]+?)(?:\.git)?$", remote)
    if not match:
        raise CatalogError(
            "cannot determine the repository slug; set GITHUB_REPOSITORY=owner/repo"
        )
    return match.group("slug")


def api_request(url: str, accept: str) -> bytes:
    request = urllib.request.Request(url, headers={"Accept": accept, "X-GitHub-Api-Version": "2022-11-28"})
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def fetch_releases(slug: str) -> list:
    """Every published (non-draft) release, newest first."""
    releases = []
    page = 1
    while True:
        url = f"{API_ROOT}/repos/{slug}/releases?per_page=100&page={page}"
        try:
            batch = json.loads(api_request(url, "application/vnd.github+json"))
        except urllib.error.HTTPError as exc:
            raise CatalogError(f"GitHub API returned {exc.code} for {url}") from exc
        except urllib.error.URLError as exc:
            raise CatalogError(f"cannot reach the GitHub API: {exc.reason}") from exc
        if not batch:
            break
        releases.extend(r for r in batch if not r.get("draft"))
        if len(batch) < 100:
            break
        page += 1
    return releases


def fetch_sha256(slug: str, asset: dict) -> str | None:
    """Read a release's .sha256 asset. Works while the repo is still private."""
    url = f"{API_ROOT}/repos/{slug}/releases/assets/{asset['id']}"
    try:
        body = api_request(url, "application/octet-stream").decode("utf-8", "replace")
    except (urllib.error.HTTPError, urllib.error.URLError):
        return None
    first = body.strip().split()
    return first[0] if first and re.fullmatch(r"[0-9a-f]{64}", first[0]) else None


def manifest_at_tag(tag: str, addon_id: str, source: str) -> dict | None:
    """Read one manifest as it existed at a released tag."""
    blob = git("show", f"{tag}:{addon_id}/{source}/manifest.json")
    if blob is None:
        return None
    try:
        return json.loads(blob)
    except json.JSONDecodeError:
        return None


def normalise_version(value) -> list | None:
    if isinstance(value, list) and len(value) == 3 and all(isinstance(n, int) for n in value):
        return list(value)
    if isinstance(value, str):
        parts = value.split(".")
        if len(parts) == 3 and all(p.isdigit() for p in parts):
            return [int(p) for p in parts]
    return None


def packs_at_tag(tag: str, addon_id: str) -> tuple:
    """Pack descriptors and min_engine_version for one released version."""
    packs = []
    min_engine = None
    for source, module_type, suffix in PACK_SOURCES:
        manifest = manifest_at_tag(tag, addon_id, source)
        if not manifest:
            continue
        header = manifest.get("header", {})
        modules = manifest.get("modules") or [{}]
        packs.append(
            {
                "uuid": header.get("uuid"),
                "type": modules[0].get("type", module_type),
                "version": normalise_version(header.get("version")),
                "folder": f"{addon_id}_{suffix}",
            }
        )
        engine = normalise_version(header.get("min_engine_version"))
        if engine and (min_engine is None or engine > min_engine):
            min_engine = engine
    return packs, min_engine


def semver_sort_key(version: str) -> tuple:
    """Semver precedence: 1.2.0-beta.1 sorts below 1.2.0, numeric ids below alphanumeric."""
    core_text, _, pre = version.partition("-")
    core = tuple(int(part) for part in core_text.split("."))
    if not pre:
        return (core, 1, ())
    identifiers = tuple(
        (0, int(part), "") if part.isdigit() else (1, 0, part) for part in pre.split(".")
    )
    return (core, 0, identifiers)


def discover_addons() -> list:
    """Add-on folders in the working tree: kebab-case dirs holding at least one pack."""
    found = []
    for path in sorted(REPO_ROOT.iterdir()):
        if not path.is_dir() or path.name.startswith((".", "_")):
            continue
        if any((path / source / "manifest.json").is_file() for source, _, _ in PACK_SOURCES):
            found.append(path.name)
    return found


def addon_metadata(addon_id: str) -> dict:
    """Display name, description and deprecation for one add-on, read at HEAD.

    addon.json is the source of truth so that retiring an add-on is a one-line
    edit that needs no release. Manifest headers are only a fallback, and only
    when they hold real display text rather than a localisation key.
    """
    path = REPO_ROOT / addon_id / "addon.json"
    data = {}
    if path.is_file():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise CatalogError(f"{addon_id}/addon.json is not valid JSON: {exc}") from exc
        if not isinstance(loaded, dict):
            raise CatalogError(f"{addon_id}/addon.json must contain a JSON object")
        data = loaded

    display_name = None
    if isinstance(data.get("display_name"), str) and data["display_name"].strip():
        display_name = data["display_name"].strip()
    description = data.get("description") if isinstance(data.get("description"), str) else None

    if display_name is None or description is None:
        for source, _, _ in PACK_SOURCES:
            manifest_path = REPO_ROOT / addon_id / source / "manifest.json"
            if not manifest_path.is_file():
                continue
            try:
                header = json.loads(manifest_path.read_text(encoding="utf-8")).get("header", {})
            except json.JSONDecodeError:
                continue
            display_name = display_name or usable_manifest_text(header.get("name"))
            description = description or usable_manifest_text(header.get("description"))

    return {
        "display_name": display_name or addon_id,
        "description": description or "",
        "deprecated": bool(data.get("deprecated", False)),
    }


def release_entry(slug: str, release: dict, addon_id: str, version: str, offline: bool) -> dict:
    tag = release["tag_name"]
    assets = release.get("assets") or []
    artifact = next(
        (a for a in assets if a["name"].endswith((".mcaddon", ".mcpack"))), None
    )
    sha_asset = next((a for a in assets if a["name"].endswith(".sha256")), None)
    filename = artifact["name"] if artifact else None
    packs, min_engine = packs_at_tag(tag, addon_id)
    return {
        "version": version,
        "tag": tag,
        "filename": filename,
        "download_url": (
            artifact.get("browser_download_url")
            if artifact
            else (f"https://github.com/{slug}/releases/download/{tag}/{filename}" if filename else None)
        ),
        "sha256": None if offline or not sha_asset else fetch_sha256(slug, sha_asset),
        "published_at": release.get("published_at"),
        "min_engine_version": min_engine,
        "packs": packs,
    }


def build_catalog(offline: bool, releases_override: list | None) -> dict:
    slug = repo_slug()
    if releases_override is not None:
        releases = releases_override
    elif offline:
        releases = []
    else:
        releases = fetch_releases(slug)

    # An add-on folder with no release yet is a normal, published state: the
    # entry exists with null release fields. Consumers must handle it.
    addons = {addon_id: addon_metadata(addon_id) for addon_id in discover_addons()}
    for entry in addons.values():
        entry["latest_stable"] = None
        entry["latest_prerelease"] = None

    grouped: dict = {}
    for release in releases:
        match = TAG_RE.match(release.get("tag_name", ""))
        if not match:
            continue
        addon_id, version = match.group("id"), match.group("version")
        if addon_id not in addons:
            continue
        channel = "latest_prerelease" if PRERELEASE_RE.match(version) else "latest_stable"
        grouped.setdefault((addon_id, channel), []).append((version, release))

    for (addon_id, channel), candidates in grouped.items():
        version, release = max(candidates, key=lambda item: semver_sort_key(item[0]))
        addons[addon_id][channel] = release_entry(slug, release, addon_id, version, offline)

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
        "repository": slug,
        "addons": {addon_id: addons[addon_id] for addon_id in sorted(addons)},
    }


def validate_catalog(path: Path) -> list:
    """Check a catalog against the documented schema. Returns a list of problems."""
    problems = []

    def note(message: str) -> None:
        problems.append(f"{path.name}: {message}")

    try:
        catalog = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return [f"{path.name}: file is missing"]
    except json.JSONDecodeError as exc:
        return [f"{path.name}: not valid JSON: {exc}"]

    if not isinstance(catalog, dict):
        return [f"{path.name}: top level must be a JSON object"]
    if catalog.get("schema_version") != SCHEMA_VERSION:
        note(f"schema_version must be {SCHEMA_VERSION}, got {catalog.get('schema_version')!r}")
    if not isinstance(catalog.get("generated_at"), str):
        note("generated_at must be an ISO 8601 string")
    if not isinstance(catalog.get("repository"), str):
        note("repository must be a string like owner/repo")

    addons = catalog.get("addons")
    if not isinstance(addons, dict):
        return problems + [f"{path.name}: addons must be an object keyed by add-on id"]

    for addon_id, entry in addons.items():
        where = f"addons.{addon_id}"
        if not isinstance(entry, dict):
            note(f"{where} must be an object")
            continue
        for field, kind in (("display_name", str), ("description", str), ("deprecated", bool)):
            if not isinstance(entry.get(field), kind):
                note(f"{where}.{field} must be {kind.__name__}")
        for channel in ("latest_stable", "latest_prerelease"):
            if channel not in entry:
                note(f"{where}.{channel} is missing (use null when there is no such release)")
                continue
            release = entry[channel]
            # null is a first-class value here: an add-on can exist before it
            # has ever been released, and may never have a prerelease at all.
            if release is None:
                continue
            if not isinstance(release, dict):
                note(f"{where}.{channel} must be an object or null")
                continue
            for field in ("version", "tag", "filename", "download_url", "sha256"):
                if field in release and release[field] is not None and not isinstance(release[field], str):
                    note(f"{where}.{channel}.{field} must be a string or null")
            for field in ("version", "tag"):
                if not release.get(field):
                    note(f"{where}.{channel}.{field} is required")
            packs = release.get("packs")
            if not isinstance(packs, list):
                note(f"{where}.{channel}.packs must be an array")
                continue
            for index, pack in enumerate(packs):
                pack_where = f"{where}.{channel}.packs[{index}]"
                if not isinstance(pack, dict):
                    note(f"{pack_where} must be an object")
                    continue
                if pack.get("type") not in ("data", "resources"):
                    note(f"{pack_where}.type must be 'data' or 'resources'")
                if not isinstance(pack.get("uuid"), str):
                    note(f"{pack_where}.uuid must be a string")
                version = pack.get("version")
                if not (isinstance(version, list) and len(version) == 3 and all(isinstance(n, int) for n in version)):
                    note(f"{pack_where}.version must be three integers")
    return problems


def main(argv: list) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", default="catalog.json", help="output path (default: catalog.json)")
    parser.add_argument("--validate", metavar="PATH", help="validate an existing catalog and exit")
    parser.add_argument(
        "--offline", action="store_true", help="skip the GitHub API; emit null release fields"
    )
    parser.add_argument(
        "--releases-json",
        metavar="PATH",
        help="read the release list from a file instead of the API (for testing)",
    )
    args = parser.parse_args(argv)

    if args.validate:
        problems = validate_catalog(Path(args.validate))
        for problem in problems:
            print(f"error: {problem}", file=sys.stderr)
        if problems:
            return 1
        print(f"{args.validate} is valid (schema_version {SCHEMA_VERSION})")
        return 0

    try:
        override = None
        if args.releases_json:
            override = json.loads(Path(args.releases_json).read_text(encoding="utf-8"))
        catalog = build_catalog(args.offline, override)
    except CatalogError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    Path(args.out).write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    count = len(catalog["addons"])
    released = sum(1 for e in catalog["addons"].values() if e["latest_stable"])
    print(f"wrote {args.out}: {count} add-on(s), {released} with a stable release")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
