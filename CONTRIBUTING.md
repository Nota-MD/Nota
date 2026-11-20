# Contributing to Nota

## AI-assisted contributions are welcome

Nota explicitly supports contributions created with or assisted by AI. This
includes code, tests, documentation, icons, themes and issue analysis. The
quality and final responsibility remain with the person submitting the change.

When using AI:

1. Disclose the use of AI and the parts it influenced in the pull request,
   commit message or change record.
2. Personally test every contributed behavior. CI alone, code inspection alone
   and an AI claim that something was tested do not count.
3. Record the test environment, steps, actual results and unverified boundaries
   in the pull request. Include screenshots or screen recordings for UI changes.
4. Reproduce a defect before fixing it and verify the behavior before and after
   the change.
5. Verify the origin and license of code, icons, fonts and text. Do not submit
   third-party material without permission.
6. Do not send private source, credentials, user documents or unpublished data
   to an external service without approval.

Maintainers may request more test evidence or reject a change when the evidence
is insufficient. AI cannot accept responsibility. The submitter is responsible
for the sign-off, test claims and contributed content.

## Definition of done

Every contribution must meet all of these requirements:

- Code and affected documentation change together.
- Relevant unit and integration tests pass.
- UI changes are exercised through the main path and key error paths in a real
  application window.
- `bash tools/check-version.sh` passes.
- `bash tools/test-frontend.sh` passes.
- `cargo test --lib --locked` passes under `src-tauri/`.
- `bash tools/i18n-check.sh` passes.
- `bash tools/doc-sync-check.sh --ci` passes in CI, or the advisory local mode
  passes without `--ci`.
- `npm run build` passes.

CI is necessary but not sufficient. Personal testing by the submitter is required
before merge.

## Code and documentation language

- Production identifiers use English.
- New or rewritten source comments use concise English.
- Production source must not contain hard-coded Chinese. User-facing Chinese
  belongs in `src/i18n/zh-*.ts`, plugin `lang/zh-*.toml` or bundled content.
- Documentation uses concise English by default.
- Chinese is allowed in explicit translation resources, localization files and
  test data.
- Do not add emoji to source code, comments or English documentation.
- Migrate legacy Chinese comments and documentation with related changes. Do not
  create unrelated large diffs solely for language cleanup.

## Issues and pull requests

- Keep one pull request focused on one change. Do not mix unrelated formatting or
  large renames into it.
- Use permanent defect identifiers such as `BUG-74` and backlog identifiers where
  available.
- Complete the pull request template, including the AI disclosure and test
  evidence.
- Do not force-push a public branch that is already under review.

## README translations

- `README.md` is the only English source version and must remain English-only.
- Translation files use `README.<BCP-47>.md`; Simplified Chinese is
  `README.zh-CN.md`.
- Every language version exposes the same language selector. The current
  language is bold and the others link to their matching files.
- When adding a language, update every existing README selector in the same
  change.
- Preserve command names, filenames, link targets and code blocks exactly.
- A translation may lag behind the English source, but it must not alter product
  behavior, versions, licensing or security requirements.

## Security and licensing

- Report vulnerabilities privately according to [`SECURITY.md`](SECURITY.md).
- Update [`THIRD-PARTY.md`](THIRD-PARTY.md) for third-party content.
- Do not redistribute a font or asset when its source or license is unclear.
- Nota uses the BSD 2-Clause License. Third-party components keep their own
  licenses.
