# Release process

## 1. Version and tag

1. Keep the version identical in `package.json`, `src-tauri/Cargo.toml` and
   `src-tauri/tauri.conf.json`.
2. Run `bash tools/check-version.sh <tag>`. After removing the leading `v`, the
   tag must equal the source version.
3. Use the same tag shape as the version. For example, source version `0.9.0`
   uses tag `v0.9.0`.
4. Upload `update/latest.json` with every release. Clients always read
   `releases/latest/download/latest.json`. The version may contain `beta`, but the
   GitHub release must be published as latest rather than prerelease, otherwise
   the fixed URL will not point to the new build.

## 2. Verification and build separation

GitHub Actions has four entry points. They do not all run sequentially:

- `verify.yml`: full push and pull request verification;
- `platform.yml`: manually triggered toolchain check for one platform;
- `build.yml`: manually builds Linux and Windows preview packages and uploads
  artifacts without creating a release;
- `release.yml`: packages on tags or manual dispatch and does not repeat the full
  verification suite.

Full verification includes:

- version consistency;
- the complete frontend test suite;
- Rust tests;
- localization checks;
- git-diff-based documentation synchronization;
- official plugin repository validation and compatibility contracts;
- production frontend build.

## 3. Artifacts and provenance

- Generate checksums only after every Linux and Windows packaging job passes.
- `BUILD-INFO.json` records the version, tag, commit, workflow run and
  `pluginsBundled=false`.
- `SHA256SUMS.txt` covers every installer produced for that release.
- Releases start as drafts. Publish only after manual review so the release
  becomes `releases/latest`.

## 4. Manual acceptance before publication

- Install every platform artifact from the draft at least once.
- Confirm that packages contain no plugins and that the application starts.
- Open, edit and save a document, restart, then reopen it.
- Test the features required for this release. A person responsible for the
  release must exercise UI changes and retain screenshots or recordings.
- Review known limitations and rollback instructions in the release notes.

## 5. Rollback

Release notes must identify the previous stable version. If a problem is found:

1. keep the draft unpublished or remove the faulty artifact;
2. mark the release as prerelease and point users to the previous stable version;
3. add the blocker and evidence to `docs/07A-current-status.md`;
4. fix the issue with a new tag. Never overwrite a published tag.
