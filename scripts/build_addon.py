#!/usr/bin/env python3
"""Package one add-on folder into a single distributable archive.

Produces exactly one download per add-on, plus its SHA256 and a machine-readable
build summary. Runs identically by hand and in CI. Python 3 standard library only.

    python3 scripts/build_addon.py sleep-addon
    python3 scripts/build_addon.py sleep-addon --version 1.5.0-beta.1
    python3 scripts/build_addon.py sleep-addon --release-notes dist/notes.md

Archive layout (see "Archive layout" in CONTRIBUTING.md before changing this):

  Both packs  -> <id>-<version>.mcaddon with the pack folders at the archive
                 root: <id>_BP/manifest.json and <id>_RP/manifest.json.
  One pack    -> <id>-<version>.mcpack in canonical form: that pack's files at
                 the zip root, manifest.json at top level, no wrapper folder.

Client double-click import is the constraint that decided both shapes. Do not
nest the packs under behavior_packs/ + resource_packs/, do not use the
Marketplace data/ + resources/ flavor, and never ship both layouts in one
archive -- the client would import each pack twice.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Pack source directory -> (module type, archive folder suffix).
PACK_KINDS = {
    "behavior_pack": ("data", "BP"),
    "resource_pack": ("resources", "RP"),
}

REQUIRED_HEADER_FIELDS = ("name", "uuid", "version", "min_engine_version")

# Excluded before zipping. Editor and OS artifacts embed absolute paths and
# machine names, so they must never reach a published archive.
EXCLUDED_NAMES = {
    ".DS_Store",
    "Thumbs.db",
    "desktop.ini",
    "__MACOSX",
    ".vscode",
    ".idea",
    "__pycache__",
}
EXCLUDED_SUFFIXES = (".pyc", ".swp", "~")

SEMVER_RE = re.compile(
    r"^(?P<major>0|[1-9]\d*)"
    r"\.(?P<minor>0|[1-9]\d*)"
    r"\.(?P<patch>0|[1-9]\d*)"
    r"(?:-(?P<prerelease>(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)"
    r"(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?"
    r"(?:\+(?P<build>[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$"
)

# Fixed timestamp for every zip entry. Deterministic builds mean rebuilding the
# same commit yields a byte-identical archive and therefore the same SHA256.
# 1980-01-01 is the earliest timestamp the zip format can represent.
ZIP_TIMESTAMP = (1980, 1, 1, 0, 0, 0)


class BuildError(Exception):
    """A problem the user has to fix. Reported without a traceback."""


def fail(message: str) -> None:
    raise BuildError(message)


def is_excluded(path: Path) -> bool:
    """True if this file or any parent directory is build junk."""
    for part in path.parts:
        if part in EXCLUDED_NAMES or part.startswith(".git"):
            return True
    return path.name.endswith(EXCLUDED_SUFFIXES)


def parse_semver(text: str, what: str) -> dict:
    match = SEMVER_RE.match(text)
    if not match:
        fail(f"{what} is not valid semver: {text!r} (expected e.g. 1.2.0 or 1.2.0-beta.1)")
    parts = match.groupdict()
    return {
        "core": (int(parts["major"]), int(parts["minor"]), int(parts["patch"])),
        "prerelease": parts["prerelease"],
        "text": text,
    }


def parse_version_field(value, where: str) -> tuple:
    """Read a Bedrock manifest version, which may be [1, 2, 0] or "1.2.0".

    Bedrock stores versions as three integers, so a prerelease suffix has
    nowhere to live in a manifest. The suffix lives in the git tag instead; see
    "Versioning and tags" in CONTRIBUTING.md.
    """
    if isinstance(value, list):
        if len(value) != 3 or not all(isinstance(n, int) and n >= 0 for n in value):
            fail(f"{where} must be three non-negative integers, got {value!r}")
        return tuple(value)
    if isinstance(value, str):
        parsed = parse_semver(value, where)
        if parsed["prerelease"]:
            fail(
                f"{where} must not carry a prerelease suffix ({value!r}). "
                "Bedrock manifests hold only the numeric version; put the "
                "suffix in the git tag instead."
            )
        return parsed["core"]
    fail(f"{where} must be a list of three integers or a version string, got {value!r}")


def version_text(version: tuple) -> str:
    return ".".join(str(n) for n in version)


def load_manifest(manifest_path: Path, rel: str) -> dict:
    """Read and validate one manifest.json. Fails loudly on anything missing."""
    if not manifest_path.is_file():
        fail(f"{rel}/manifest.json is missing")
    try:
        raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"{rel}/manifest.json is not valid JSON: {exc}")
    if not isinstance(raw, dict):
        fail(f"{rel}/manifest.json must contain a JSON object")

    if "format_version" not in raw:
        fail(f"{rel}/manifest.json is missing 'format_version'")

    header = raw.get("header")
    if not isinstance(header, dict):
        fail(f"{rel}/manifest.json is missing a 'header' object")
    for field in REQUIRED_HEADER_FIELDS:
        if field not in header:
            fail(f"{rel}/manifest.json is missing 'header.{field}'")

    modules = raw.get("modules")
    if not isinstance(modules, list) or not modules:
        fail(f"{rel}/manifest.json needs a non-empty 'modules' array")
    for index, module in enumerate(modules):
        if not isinstance(module, dict):
            fail(f"{rel}/manifest.json modules[{index}] must be an object")
        for field in ("type", "uuid", "version"):
            if field not in module:
                fail(f"{rel}/manifest.json is missing 'modules[{index}].{field}'")
        if module["uuid"] == header["uuid"]:
            fail(
                f"{rel}/manifest.json modules[{index}].uuid is the same as header.uuid. "
                "Every UUID in a pack must be distinct."
            )
    return raw


def discover_packs(addon_dir: Path, addon_id: str) -> list:
    """Find the behavior and/or resource pack in this add-on folder."""
    packs = []
    for source, (module_type, suffix) in PACK_KINDS.items():
        pack_dir = addon_dir / source
        if not pack_dir.is_dir():
            continue
        rel = f"{addon_id}/{source}"
        manifest = load_manifest(pack_dir / "manifest.json", rel)
        header = manifest["header"]
        declared = manifest["modules"][0].get("type")
        if declared != module_type:
            fail(
                f"{rel}/manifest.json declares modules[0].type={declared!r} "
                f"but lives in {source}/, which must declare {module_type!r}"
            )
        packs.append(
            {
                "source": source,
                "dir": pack_dir,
                "folder": f"{addon_id}_{suffix}",
                "uuid": header["uuid"],
                "type": module_type,
                "name": header["name"],
                "version": list(parse_version_field(header["version"], f"{rel} header.version")),
                "min_engine_version": list(
                    parse_version_field(
                        header["min_engine_version"], f"{rel} header.min_engine_version"
                    )
                ),
            }
        )
    if not packs:
        fail(
            f"{addon_id} contains neither behavior_pack/ nor resource_pack/. "
            "An add-on needs at least one."
        )
    return packs


def collect_entries(pack_dir: Path, prefix: str) -> list:
    """Map files under pack_dir to (arcname, path), sorted for determinism.

    prefix is "" for a canonical .mcpack (files at the zip root) or the pack
    folder name for a .mcaddon.
    """
    entries = []
    for path in sorted(pack_dir.rglob("*")):
        relative = path.relative_to(pack_dir)
        if is_excluded(relative):
            continue
        if path.is_symlink():
            fail(f"{path.relative_to(REPO_ROOT)} is a symlink; archives must contain real files")
        arcname = f"{prefix}/{relative.as_posix()}" if prefix else relative.as_posix()
        if path.is_dir():
            entries.append((arcname + "/", path, True))
        elif path.is_file():
            entries.append((arcname, path, False))
    return entries


def write_archive(destination: Path, entries: list) -> None:
    """Write a deterministic zip: fixed timestamps, stable order, plain deflate.

    ZIP64 is only enabled on the retry, so an ordinary add-on gets the widest
    compatible archive and an unusually large one still builds.
    """
    for allow_zip64 in (False, True):
        try:
            with zipfile.ZipFile(
                destination, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=allow_zip64
            ) as archive:
                for arcname, path, is_dir in entries:
                    info = zipfile.ZipInfo(arcname, date_time=ZIP_TIMESTAMP)
                    if is_dir:
                        info.external_attr = (0o40755 << 16) | 0x10
                        archive.writestr(info, b"")
                    else:
                        info.compress_type = zipfile.ZIP_DEFLATED
                        info.external_attr = 0o644 << 16
                        archive.writestr(info, path.read_bytes())
            return
        except zipfile.LargeZipFile:
            destination.unlink(missing_ok=True)
    fail(f"could not write {destination.name}")


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_addon_json(addon_dir: Path, addon_id: str) -> dict:
    """Read the optional addon.json. Absent is fine; malformed is not."""
    path = addon_dir / "addon.json"
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"{addon_id}/addon.json is not valid JSON: {exc}")
    if not isinstance(data, dict):
        fail(f"{addon_id}/addon.json must contain a JSON object")
    return data


# A manifest header often holds a localisation key such as "pack.name" rather
# than display text. Publishing that literal string would be worse than falling
# back to the add-on id, so it is filtered out here and in gen_catalog.py.
LOCALISATION_KEY_RE = re.compile(r"^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$")


def usable_manifest_text(value):
    """Return value if it reads as real display text, else None."""
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text or text.startswith("pack."):
        return None
    if " " not in text and LOCALISATION_KEY_RE.match(text):
        return None
    return text


def resolve_display_name(addon_id: str, addon_json: dict, packs: list) -> str:
    explicit = addon_json.get("display_name")
    if isinstance(explicit, str) and explicit.strip():
        return explicit.strip()
    for pack in packs:
        candidate = usable_manifest_text(pack["name"])
        if candidate:
            return candidate
    return addon_id


def extract_changelog_section(changelog_path: Path, version: str, addon_id: str) -> str:
    """Pull one version's section out of a Keep a Changelog file.

    Accepts "## [1.2.0] - 2026-01-01", "## [1.2.0]" and "## 1.2.0".
    """
    if not changelog_path.is_file():
        fail(f"{addon_id}/CHANGELOG.md is missing; release notes are generated from it")
    heading = re.compile(
        r"^##\s+\[?" + re.escape(version) + r"\]?\s*(?:[-–—]\s*.*)?$",
        re.MULTILINE,
    )
    match = heading.search(changelog_path.read_text(encoding="utf-8"))
    if not match:
        fail(
            f"{addon_id}/CHANGELOG.md has no section for version {version}. "
            f"Add a '## [{version}] - YYYY-MM-DD' heading before tagging."
        )
    rest = changelog_path.read_text(encoding="utf-8")[match.end():]
    next_heading = re.search(r"^##\s", rest, re.MULTILINE)
    body = rest[: next_heading.start()] if next_heading else rest
    return body.strip()


def world_pack_entry(pack: dict) -> str:
    entry = [{"pack_id": pack["uuid"], "version": pack["version"]}]
    return json.dumps(entry, indent=2)


def render_release_notes(summary: dict, changelog: str) -> str:
    """Build the release notes from the build output, so they cannot drift."""
    addon_id = summary["addon_id"]
    filename = summary["artifact"]["filename"]
    packs = summary["packs"]
    is_mcaddon = summary["artifact"]["kind"] == "mcaddon"
    behavior = next((p for p in packs if p["type"] == "data"), None)
    resource = next((p for p in packs if p["type"] == "resources"), None)

    out = [changelog, ""]
    out += [
        "## Compatibility",
        "",
        f"Minimum Minecraft version: **{version_text(summary['min_engine_version'])}** "
        "(`min_engine_version` from the manifest).",
        "",
        "## Install on a client",
        "",
        f"1. Download `{filename}`.",
        "2. Open the file. Minecraft imports the packs automatically.",
        "3. Enable the packs on the world you want them in, under its settings.",
        "",
        "## Install on a dedicated server",
        "",
        f"1. Rename `{filename}` to `.zip` and extract it.",
    ]
    if is_mcaddon:
        step = "2. Copy "
        if behavior:
            step += f"`{behavior['folder']}` into the server's `behavior_packs/`"
        if behavior and resource:
            step += ", and "
        if resource:
            step += f"`{resource['folder']}` into the server's `resource_packs/`"
        out.append(step + ".")
    else:
        only = packs[0]
        target = "behavior_packs" if only["type"] == "data" else "resource_packs"
        out += [
            f"2. This is a single-pack `.mcpack`, so it extracts loose rather than into a "
            f"folder. Create a folder named `{only['folder']}` inside the server's "
            f"`{target}/` directory and put the extracted files (including `manifest.json`) "
            "directly inside it.",
        ]
    out += [
        "3. Register the packs in the world's JSON files (below).",
        "4. Restart the server.",
        "",
        "Three things that quietly break a server install:",
        "",
        "- `level-name` in `server.properties` must match the world's folder name under "
        "`worlds/` **exactly**, spaces included. A mismatch is the most common reason a pack "
        "appears to be ignored.",
        "- A resource pack is not forced on connecting players unless "
        "`texturepack-required=true` is set in `server.properties`.",
        "- Do not hand-edit `valid_known_packs.json`. Older guides still say to; the server "
        "maintains it by scanning the pack directories.",
        "",
        "## Install with the itzg Docker image",
        "",
        "`MC_PACK` accepts an archive or directory whose root holds `behavior_packs/` and "
        "`resource_packs/`, or a Marketplace-flavour archive using `data/` and `resources/`. "
        "This file deliberately uses neither shape, because the client import path decided the "
        "layout, so wrap it once:",
        "",
        "```sh",
        "mkdir -p packs/behavior_packs packs/resource_packs",
        f"unzip -q {filename} -d extracted" if is_mcaddon else f"mkdir -p extracted/{packs[0]['folder']}",
    ]
    if is_mcaddon:
        if behavior:
            out.append(f"mv extracted/{behavior['folder']} packs/behavior_packs/")
        if resource:
            out.append(f"mv extracted/{resource['folder']} packs/resource_packs/")
    else:
        only = packs[0]
        target = "behavior_packs" if only["type"] == "data" else "resource_packs"
        out += [
            f"unzip -q {filename} -d extracted/{only['folder']}",
            f"mv extracted/{only['folder']} packs/{target}/",
        ]
    out += [
        "```",
        "",
        "Mount `packs/` into the container and point `MC_PACK` at its in-container path. The "
        "image installs the pack folders but does not register them, so the step below still "
        "applies. `TEXTUREPACK_REQUIRED=true` is that image's equivalent of "
        "`texturepack-required`.",
        "",
        "## Register the packs in the world",
        "",
        "These files live in `worlds/<world name>/`. If they already exist, **merge** these "
        "entries into the existing array rather than overwriting the file.",
        "",
    ]
    if behavior:
        out += ["`world_behavior_packs.json`", "", "```json", world_pack_entry(behavior), "```", ""]
    if resource:
        out += ["`world_resource_packs.json`", "", "```json", world_pack_entry(resource), "```", ""]
    out += [
        "## Checksum",
        "",
        "```",
        f"{summary['artifact']['sha256']}  {filename}",
        "```",
        "",
    ]
    return "\n".join(out)


def build(addon_id: str, out_dir: Path, version_override: str | None) -> dict:
    if addon_id in ("_template", "_template/"):
        fail("_template is a skeleton to copy, not a buildable add-on")
    addon_dir = REPO_ROOT / addon_id
    if not addon_dir.is_dir():
        fail(f"no such add-on folder: {addon_id}")

    packs = discover_packs(addon_dir, addon_id)
    addon_json = load_addon_json(addon_dir, addon_id)

    manifest_versions = {tuple(p["version"]) for p in packs}
    if len(manifest_versions) > 1:
        detail = ", ".join(f"{p['source']}={version_text(p['version'])}" for p in packs)
        fail(f"{addon_id}: packs disagree on header.version ({detail}); they must match")
    manifest_version = manifest_versions.pop()

    if version_override:
        parsed = parse_semver(version_override, "--version")
        if parsed["core"] != manifest_version:
            fail(
                f"version mismatch: --version {version_override} has core "
                f"{version_text(parsed['core'])} but {addon_id} manifests declare "
                f"header.version {version_text(manifest_version)}"
            )
        full_version = version_override
        prerelease = parsed["prerelease"] is not None
    else:
        full_version = version_text(manifest_version)
        prerelease = False

    kind = "mcaddon" if len(packs) > 1 else "mcpack"
    filename = f"{addon_id}-{full_version}.{kind}"
    out_dir.mkdir(parents=True, exist_ok=True)
    artifact = out_dir / filename

    entries = []
    for pack in packs:
        # A .mcaddon carries each pack in its own root folder; a single-pack
        # .mcpack puts that pack's files at the zip root.
        entries.extend(collect_entries(pack["dir"], pack["folder"] if kind == "mcaddon" else ""))
    entries.sort(key=lambda item: item[0])
    write_archive(artifact, entries)

    min_engine = max(tuple(p["min_engine_version"]) for p in packs)
    summary = {
        "addon_id": addon_id,
        "display_name": resolve_display_name(addon_id, addon_json, packs),
        "description": addon_json.get("description"),
        "deprecated": bool(addon_json.get("deprecated", False)),
        "version": full_version,
        "tag": f"{addon_id}-v{full_version}",
        "prerelease": prerelease,
        "min_engine_version": list(min_engine),
        "artifact": {
            "filename": filename,
            "kind": kind,
            "size": artifact.stat().st_size,
            "sha256": sha256_of(artifact),
        },
        "packs": [
            {
                "uuid": p["uuid"],
                "type": p["type"],
                "version": p["version"],
                "folder": p["folder"],
            }
            for p in packs
        ],
    }

    (out_dir / f"{filename}.sha256").write_text(
        f"{summary['artifact']['sha256']}  {filename}\n", encoding="utf-8"
    )
    (out_dir / f"{addon_id}-{full_version}.build.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    return summary


def main(argv: list) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("addon_id", help="add-on folder name, e.g. sleep-addon")
    parser.add_argument(
        "--out-dir", default="dist", help="where to write the artifact (default: dist)"
    )
    parser.add_argument(
        "--version",
        help=(
            "full semver for the filename, normally taken from the git tag. Its numeric "
            "core must match header.version; a prerelease suffix marks a prerelease."
        ),
    )
    parser.add_argument(
        "--release-notes", metavar="PATH", help="also render the GitHub release notes to PATH"
    )
    args = parser.parse_args(argv)

    try:
        summary = build(args.addon_id, Path(args.out_dir), args.version)
        if args.release_notes:
            changelog = extract_changelog_section(
                REPO_ROOT / args.addon_id / "CHANGELOG.md", summary["version"], args.addon_id
            )
            notes_path = Path(args.release_notes)
            notes_path.parent.mkdir(parents=True, exist_ok=True)
            notes_path.write_text(render_release_notes(summary, changelog), encoding="utf-8")
    except BuildError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    artifact = summary["artifact"]
    print(f"built {artifact['filename']}  ({artifact['size']} bytes)")
    print(f"  sha256 {artifact['sha256']}")
    for pack in summary["packs"]:
        print(f"  {pack['folder']}  type={pack['type']}  uuid={pack['uuid']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
