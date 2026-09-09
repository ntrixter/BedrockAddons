#!/usr/bin/env python3
"""Validate this repository and scan it for identity leaks.

Run it with no arguments, from anywhere:

    python3 scripts/check_repo.py

Exits non-zero if anything is wrong. This is the exact command CI runs -- there
is no separate CI code path. A clean run is required before any push; see the
Anonymity section of CLAUDE.md.

What it checks:
  * every manifest.json parses and carries the required fields
  * UUIDs are unique across the whole repo, and header != module UUIDs
  * versions are valid semver and agree between an add-on's packs
  * addon.json is well formed where present
  * catalog.json matches the schema in gen_catalog.py
  * no real name, email, absolute path, hostname or AI-session URL appears in a
    tracked file, in staged content, in a commit message, or in commit
    author/committer identity
  * no image carries EXIF/XMP metadata

It never modifies a file. Stripping image metadata is a deliberate command:
scripts/strip_image_metadata.py. Python 3 standard library only.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import gen_catalog  # noqa: E402  (sibling script; reuses the catalog schema)

# ---------------------------------------------------------------------------
# ALLOWLIST
#
# Everything that may legitimately look like an identity leak. This is the only
# place to add an exception -- if a check fires on something that is genuinely
# fine, widen this block rather than weakening a pattern below.
# ---------------------------------------------------------------------------

# The only identities permitted as a commit author or committer.
ALLOWED_COMMIT_IDENTITIES = {
    "ntrixter <1686841+ntrixter@users.noreply.github.com>",
    # release.yml commits catalog.json back to the default branch as the
    # Actions bot. Without this entry the history scan fails on the first
    # validate run after the first release.
    "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>",
}

# Addresses that may appear in files and commit messages.
ALLOWED_EMAILS = {
    "1686841+ntrixter@users.noreply.github.com",
    "41898282+github-actions[bot]@users.noreply.github.com",
    # The one permitted AI-attribution trailer.
    "noreply@anthropic.com",
}

# The only attribution trailer allowed anywhere in the repo.
ALLOWED_TRAILER = "Co-Authored-By: Claude <noreply@anthropic.com>"

# These files document the anonymity rules, so they necessarily quote the very
# strings the scan looks for. A line in one of these files is skipped only when
# it contains one of the rule strings below.
DOCUMENTED_RULE_FILES = {"CLAUDE.md", "CONTRIBUTING.md", "scripts/check_repo.py"}
DOCUMENTED_RULE_STRINGS = (
    "Co-Authored-By: Claude",
    "noreply@anthropic.com",
    "users.noreply.github.com",
    "github-actions[bot]",
    "claude.ai",
    "Claude-Session",
    "Generated with",
    "/home/",
    "/Users/",
    "/root/",
    "/tmp/",
    "absolute path",
)

# Directories that are not add-ons.
NON_ADDON_DIRS = {"scripts", ".github", "_template"}

# ---------------------------------------------------------------------------

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-\[\]]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
ABSOLUTE_PATH_RE = re.compile(r"(?<![\w.])/(?:home|root|Users|tmp|mnt|var/folders)/[\w.\-]+")
SESSION_URL_RE = re.compile(r"claude\.ai\S*|Claude-Session:|Generated with \[?Claude", re.IGNORECASE)
UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
SEMVER_RE = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?"
    r"(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$"
)
SENTINEL_RE = re.compile(r"REPLACE_ME|REPLACE_WITH|00000000-0000-0000-0000-000000000000")

TEXT_SUFFIXES = {".md", ".json", ".yml", ".yaml", ".py", ".txt", ".cfg", ".toml", ".sh", ""}
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".tga"}

findings: list = []


def report(level: str, path: str, line: int | None, message: str, fix: str) -> None:
    """Record one finding. Every finding says where it is and what to do."""
    findings.append({"level": level, "path": path, "line": line, "message": message, "fix": fix})


def error(path: str, line, message: str, fix: str) -> None:
    report("error", path, line, message, fix)


def warn(path: str, line, message: str, fix: str) -> None:
    report("warning", path, line, message, fix)


def git(*args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(REPO_ROOT), *args], capture_output=True, text=True
    )
    return result.stdout if result.returncode == 0 else ""


def tracked_files() -> list:
    """Files in the index: everything tracked plus anything staged for commit."""
    return [line for line in git("ls-files").splitlines() if line]


def is_documented_rule_line(path: str, text: str) -> bool:
    return path in DOCUMENTED_RULE_FILES and any(s in text for s in DOCUMENTED_RULE_STRINGS)


def scan_text_for_identity(path: str, text: str) -> None:
    """Look for identity leaks in one file's content, line by line."""
    for number, line in enumerate(text.splitlines(), start=1):
        if is_documented_rule_line(path, line):
            continue
        for match in EMAIL_RE.finditer(line):
            if match.group(0) not in ALLOWED_EMAILS:
                error(
                    path,
                    number,
                    f"email address {match.group(0)!r}",
                    "remove it; contact points route to this repo's GitHub Issues",
                )
        for match in ABSOLUTE_PATH_RE.finditer(line):
            error(
                path,
                number,
                f"absolute path {match.group(0)!r}",
                "use a relative path or a placeholder; absolute paths leak the machine",
            )
        if SESSION_URL_RE.search(line):
            error(
                path,
                number,
                "AI session URL or 'Generated with' attribution",
                f"delete it; {ALLOWED_TRAILER!r} as a commit trailer is the only "
                "attribution allowed",
            )


def png_metadata_chunks(data: bytes) -> list:
    """Names of PNG chunks that can carry authorship, software or GPS data."""
    interesting = {b"tEXt", b"iTXt", b"zTXt", b"eXIf", b"tIME"}
    found = []
    offset = 8  # skip the PNG signature
    while offset + 8 <= len(data):
        length = int.from_bytes(data[offset : offset + 4], "big")
        name = data[offset + 4 : offset + 8]
        if name in interesting:
            found.append(name.decode("ascii"))
        if name == b"IEND":
            break
        offset += 12 + length  # length + type + data + crc
    return found


def jpeg_metadata_segments(data: bytes) -> list:
    """Names of JPEG segments that can carry EXIF, XMP or IPTC data."""
    labels = {0xE1: "APP1 (EXIF/XMP)", 0xED: "APP13 (IPTC)", 0xFE: "COM (comment)"}
    found = []
    offset = 2  # skip SOI
    while offset + 4 <= len(data):
        if data[offset] != 0xFF:
            break
        marker = data[offset + 1]
        if marker == 0xDA:  # start of scan; metadata all precedes this
            break
        size = int.from_bytes(data[offset + 2 : offset + 4], "big")
        if marker in labels:
            found.append(labels[marker])
        offset += 2 + size
    return found


def scan_image(path: str, full: Path) -> None:
    data = full.read_bytes()
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        chunks = png_metadata_chunks(data)
        if chunks:
            error(
                path,
                None,
                f"PNG carries metadata chunks: {', '.join(chunks)}",
                f"run: python3 scripts/strip_image_metadata.py {path}",
            )
    elif data.startswith(b"\xff\xd8"):
        segments = jpeg_metadata_segments(data)
        if segments:
            error(
                path,
                None,
                f"JPEG carries metadata segments: {', '.join(segments)}",
                f"run: python3 scripts/strip_image_metadata.py {path}",
            )
    elif full.suffix.lower() in IMAGE_SUFFIXES:
        warn(
            path,
            None,
            f"image format {full.suffix} is not checked for embedded metadata",
            "prefer PNG, or strip the metadata by hand before committing",
        )


def scan_working_tree() -> None:
    """Scan every tracked and staged file for identity leaks and image metadata."""
    for path in tracked_files():
        full = REPO_ROOT / path
        if not full.is_file():
            continue
        suffix = full.suffix.lower()
        if suffix in IMAGE_SUFFIXES:
            scan_image(path, full)
            continue
        if suffix not in TEXT_SUFFIXES:
            continue
        try:
            scan_text_for_identity(path, full.read_text(encoding="utf-8"))
        except UnicodeDecodeError:
            warn(path, None, "file is not valid UTF-8 and was not scanned", "check it by hand")


def scan_history() -> None:
    """Check commit identity and messages across the whole history."""
    log = git("log", "--format=%H%x1f%an <%ae>%x1f%cn <%ce>%x1f%B%x1e")
    for record in log.split("\x1e"):
        record = record.strip("\n")
        if not record:
            continue
        parts = record.split("\x1f")
        if len(parts) != 4:
            continue
        sha, author, committer, message = parts
        where = f"commit {sha[:12]}"
        for role, identity in (("author", author), ("committer", committer)):
            if identity not in ALLOWED_COMMIT_IDENTITIES:
                error(
                    where,
                    None,
                    f"{role} identity is {identity!r}",
                    "set git config --local user.name/user.email to the handle and the "
                    "noreply address, then rewrite the commit",
                )
        scan_text_for_identity(where, message)
        for number, line in enumerate(message.splitlines(), start=1):
            stripped = line.strip()
            if stripped.lower().startswith("co-authored-by:") and stripped != ALLOWED_TRAILER:
                error(
                    where,
                    number,
                    f"unexpected attribution trailer {stripped!r}",
                    f"the only permitted trailer is {ALLOWED_TRAILER!r}",
                )


def addon_dirs() -> list:
    found = []
    for path in sorted(REPO_ROOT.iterdir()):
        if not path.is_dir() or path.name.startswith((".", "_")) or path.name in NON_ADDON_DIRS:
            continue
        if any((path / s / "manifest.json").is_file() for s, _, _ in gen_catalog.PACK_SOURCES):
            found.append(path.name)
    return found


def load_json(path: str) -> dict | None:
    full = REPO_ROOT / path
    try:
        return json.loads(full.read_text(encoding="utf-8"))
    except FileNotFoundError:
        error(path, None, "file is missing", "create it, or remove what references it")
    except json.JSONDecodeError as exc:
        error(path, exc.lineno, f"not valid JSON: {exc.msg}", "fix the syntax error")
    return None


def check_manifest(path: str, manifest: dict, uuids: dict, strict: bool) -> tuple:
    """Validate one manifest. strict=False for _template, whose values are placeholders."""
    if not isinstance(manifest, dict):
        error(path, None, "manifest must be a JSON object", "wrap the contents in { }")
        return None, None

    if "format_version" not in manifest:
        error(path, None, "missing 'format_version'", "add \"format_version\": 2")

    header = manifest.get("header")
    if not isinstance(header, dict):
        error(path, None, "missing a 'header' object", "add a header block")
        return None, None
    for field in ("name", "uuid", "version", "min_engine_version"):
        if field not in header:
            error(path, None, f"missing 'header.{field}'", f"add header.{field}")

    modules = manifest.get("modules")
    if not isinstance(modules, list) or not modules:
        error(path, None, "missing a non-empty 'modules' array", "add at least one module")
        modules = []

    if strict:
        candidates = [("header.uuid", header.get("uuid"))]
        candidates += [(f"modules[{i}].uuid", m.get("uuid")) for i, m in enumerate(modules) if isinstance(m, dict)]
        for label, value in candidates:
            if not isinstance(value, str) or not UUID_RE.match(value):
                error(path, None, f"{label} is not a UUID: {value!r}", "generate one with uuidgen")
                continue
            uuids.setdefault(value.lower(), []).append(f"{path} {label}")

        version = header.get("version")
        if isinstance(version, list):
            if len(version) != 3 or not all(isinstance(n, int) and n >= 0 for n in version):
                error(path, None, f"header.version must be three integers, got {version!r}",
                      "use e.g. [1, 0, 0]")
        elif isinstance(version, str):
            if not SEMVER_RE.match(version):
                error(path, None, f"header.version is not valid semver: {version!r}",
                      "use e.g. \"1.0.0\"")
        else:
            error(path, None, f"header.version has the wrong type: {version!r}",
                  "use [1, 0, 0] or \"1.0.0\"")

    metadata = manifest.get("metadata")
    if isinstance(metadata, dict):
        for author in metadata.get("authors") or []:
            if isinstance(author, str) and author.strip() and author.strip() != "ntrixter":
                error(path, None, f"metadata.authors contains {author!r}",
                      "metadata.authors gets the handle 'ntrixter' only")

    return header, modules


def check_addons() -> None:
    uuids: dict = {}

    for source, _, _ in gen_catalog.PACK_SOURCES:
        template = f"_template/{source}/manifest.json"
        if (REPO_ROOT / template).is_file():
            manifest = load_json(template)
            if manifest is not None:
                check_manifest(template, manifest, uuids, strict=False)

    for addon_id in addon_dirs():
        versions = {}
        for source, module_type, _ in gen_catalog.PACK_SOURCES:
            rel = f"{addon_id}/{source}/manifest.json"
            if not (REPO_ROOT / rel).is_file():
                continue
            manifest = load_json(rel)
            if manifest is None:
                continue
            header, modules = check_manifest(rel, manifest, uuids, strict=True)
            if header is None:
                continue
            declared = modules[0].get("type") if modules and isinstance(modules[0], dict) else None
            if declared != module_type:
                error(rel, None, f"modules[0].type is {declared!r} but the pack lives in {source}/",
                      f"set modules[0].type to {module_type!r}")
            versions[source] = gen_catalog.normalise_version(header.get("version"))

        if len(set(map(tuple, (v for v in versions.values() if v)))) > 1:
            detail = ", ".join(f"{k}={v}" for k, v in versions.items())
            error(f"{addon_id}/", None, f"packs disagree on header.version ({detail})",
                  "both packs of an add-on release together and share one version")

        check_addon_json(addon_id)
        check_changelog(addon_id, next(iter(versions.values()), None))

    for uuid, places in sorted(uuids.items()):
        if len(places) > 1:
            error("(repo)", None, f"UUID {uuid} is used {len(places)} times: {'; '.join(places)}",
                  "every pack needs its own UUIDs; regenerate the duplicates, but never "
                  "regenerate a UUID that has already been published")


def check_addon_json(addon_id: str) -> None:
    rel = f"{addon_id}/addon.json"
    if not (REPO_ROOT / rel).is_file():
        warn(f"{addon_id}/", None, "no addon.json, so catalog.json falls back to manifest text",
             f"copy _template/addon.json to {rel} and fill it in")
        return
    data = load_json(rel)
    if data is None:
        return
    if not isinstance(data, dict):
        error(rel, None, "must contain a JSON object", "wrap the contents in { }")
        return
    for field, kind, hint in (
        ("display_name", str, "the name people see, e.g. \"Sleep\""),
        ("description", str, "one short sentence"),
        ("deprecated", bool, "true once the add-on is retired"),
    ):
        if field not in data:
            error(rel, None, f"missing required field '{field}'", f"add {field}: {hint}")
        elif not isinstance(data[field], kind):
            error(rel, None, f"'{field}' must be {kind.__name__}", f"{field}: {hint}")
    text = (REPO_ROOT / rel).read_text(encoding="utf-8")
    if SENTINEL_RE.search(text):
        error(rel, None, "still contains a _template placeholder",
              "replace every REPLACE_ME value with the real one")


def check_changelog(addon_id: str, version: list | None) -> None:
    rel = f"{addon_id}/CHANGELOG.md"
    full = REPO_ROOT / rel
    if not full.is_file():
        error(rel, None, "missing", "start one in Keep a Changelog format")
        return
    if not version:
        return
    text = ".".join(str(n) for n in version)
    if not re.search(r"^##\s+\[?" + re.escape(text) + r"\]?", full.read_text(encoding="utf-8"), re.M):
        warn(rel, None, f"no section for the current manifest version {text}",
             f"add '## [{text}] - YYYY-MM-DD' before tagging; release notes are built from it")


def check_sentinels_in_addons() -> None:
    for addon_id in addon_dirs():
        for path in sorted((REPO_ROOT / addon_id).rglob("*.json")):
            rel = path.relative_to(REPO_ROOT).as_posix()
            if path.name == "addon.json":
                continue  # already reported by check_addon_json
            if SENTINEL_RE.search(path.read_text(encoding="utf-8")):
                error(rel, None, "still contains a _template placeholder",
                      "replace every REPLACE_ME / all-zero UUID with a real value")


def check_catalog() -> None:
    for problem in gen_catalog.validate_catalog(REPO_ROOT / "catalog.json"):
        error("catalog.json", None, problem.split(": ", 1)[-1],
              "regenerate it: python3 scripts/gen_catalog.py")


def check_gitignore_hygiene() -> None:
    ignored = git("ls-files", "--cached", "--ignored", "--exclude-standard").splitlines()
    for path in ignored:
        if path:
            error(path, None, "tracked but matched by .gitignore",
                  f"git rm --cached {path}")


def main() -> int:
    scan_working_tree()
    scan_history()
    check_addons()
    check_sentinels_in_addons()
    check_catalog()
    check_gitignore_hygiene()

    errors = [f for f in findings if f["level"] == "error"]
    warnings = [f for f in findings if f["level"] == "warning"]

    for finding in errors + warnings:
        location = finding["path"]
        if finding["line"]:
            location += f":{finding['line']}"
        print(f"{finding['level']}: {location}: {finding['message']}")
        print(f"  fix: {finding['fix']}")

    if errors:
        print(f"\n{len(errors)} error(s), {len(warnings)} warning(s)")
        return 1
    print(f"check_repo: clean ({len(warnings)} warning(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
