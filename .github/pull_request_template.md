## What changed

<!-- One or two sentences. If this touches a single add-on, name it. -->

## Checklist

- [ ] `python3 scripts/check_repo.py` passes locally
- [ ] If an add-on changed: `python3 scripts/build_addon.py <addon-id>` packages cleanly
- [ ] `header.version` was bumped in **every** manifest of the add-on, and the
      `CHANGELOG.md` section for that version exists
- [ ] No real name, email address, absolute path or hostname in any file,
      commit message or metadata field (see the Anonymity section of `CLAUDE.md`)
- [ ] Any new image has had its metadata stripped
      (`python3 scripts/strip_image_metadata.py <path>`)

## Release

Merging this does not publish anything. A release happens only when a
`<addon-id>-v<semver>` tag is pushed.
