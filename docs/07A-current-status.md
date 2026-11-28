# Current status and execution queue

Last synchronized: 2026-11-28

This file is the current execution view. Permanent identifiers, evidence and
historical decisions remain in [`07-feature-status.md`](07-feature-status.md).
Feature completeness remains authoritative in
[`10-feature-matrix.md`](10-feature-matrix.md).

## Release baseline

| Item | Current state |
|---|---|
| Source version | `0.19.0-beta` |
| Supported release platforms | Linux and Windows; macOS unsigned preview packages |
| macOS | DMG builds are produced; runtime acceptance is partially confirmed and still needs final review |
| Extensions | Official extensions ship from `Nota-plugins`; installers do not bundle them |
| Interface themes | Only Adwaita is bundled. Other official themes use `Nota-themes` |
| Document themes | Adwaita light and dark are bundled |
| Printing | Native Linux and Windows print paths; light document theme required |
| Updates | Application updates remain experimental; extension updates are implemented |
| External developer access | Authenticated Host Control only; public MCP entry is removed |
| Open GitHub issues | None at the time of this synchronization |

## Priority definitions

| Priority | Meaning |
|---|---|
| P0 | Data loss, security, crash, or a defect that blocks the next supported release |
| P1 | Important user workflow, platform compatibility, migration, or release acceptance |
| P2 | Visible quality issue with an available workaround |
| P3 | Polish, optional feature, or work intentionally deferred |

Unresolved defects take priority over new features. A task marked as implemented
still requires real-window verification when the permanent record says that
verification is missing.

## Execution queue

| Priority | ID | Area | State | Next action | Exit criteria |
|---|---|---|---|---|---|
| P0 | 126 | Linux stability | Open | Reproduce close, restart, and single-instance cleanup; inspect WebKit child processes and the Unix socket owner | Ten consecutive close/restart cycles need no `killall`; stale sockets and child processes do not block startup |
| P0 | 130 | Windows settings window | Complete | Passed real Windows acceptance | First open, reopen, native close and presentation switching passed |
| P0 | 132 | Windows title bar | Complete | Covered by the completed Windows acceptance pass | Normal, maximized and fullscreen title-bar paths passed |
| P0 | 110 | Windows acceptance | Complete | Passed real-device acceptance | Install, update, single-instance, Host Control, plugins and restart paths have a pass record |
| P1 | 122 | Windows feedback checklist | Complete | All reported items have current conclusions | The Windows feedback checklist has no unresolved item |
| P1 | 129 | External test report | Needs retest | Retest the 2026-11-20 ODT report on current `main` before implementing anything | Each reported issue is marked fixed, reproducible, duplicate, or invalid |
| P1 | 131 | Theme icons on Windows | Complete | Passed Windows and Linux acceptance | Installed custom icons work and update without restart |
| P1 | BUG-31 | Native crash | Unlocated | Reproduce the old glibc `malloc` abort under stress with isolated profiles and native logging | A controlled reproduction exists, or the item is downgraded with a clear evidence boundary |
| P1 | 125 | Diff rendering | Complete | Passed visual review | Narrow panels, full editor review and light/dark themes passed |
| P1 | 128 | Code and source appearance | Open | Obtain a current reproduction and compare source mode, embedded code blocks and diff code views | Font metrics, line height, gutters, selection, caret, padding and zoom remain aligned across themes |
| P1 | 134 | Source English and identifier migration | Complete | Keep both zero baselines enforced by `npm run audit:language` and `npm run audit:pinyin` | Chinese production-source baseline and pinyin identifier baseline both remain at zero |
| P1 | 135 | Documentation English migration | In progress | Translate `docs/01` through `docs/13`, `THIRD-PARTY.md` and reference archives in focused batches | Maintainer documentation is concise English except explicit translations and test content |
| P1 | BUG-56 | Editing behavior | Needs clarification | Reconfirm the exact user-visible behavior before changing code | The reported sequence is reproduced or the item is closed as invalid |
| P2 | 127 | Startup behavior | Open | Add a persistent "Show landing screen after startup" option and define precedence rules | Explicit CLI files win; session restore remains predictable; both modes pass repeated startup checks |
| P2 | BUG-68 | Code-block appearance | Complete | Passed visual verification | Current code-block frame behavior is accepted |
| P2 | BUG-72 | Theme switching stability | Rare | Stress repeated theme and source-mode switches | No error boundary, blank editor, or crash occurs |
| P2 | 118 | Sidebar appearance | Complete | Passed visual acceptance | Tree, outline, resizing and CDE theme consistency passed |
| P2 | MACOS-BUILD | macOS support | Partial | About half of the real-machine acceptance is complete; confirm the remaining runtime paths | Startup, editing, dialogs, printing, installation and Gatekeeper paths all pass |
| P3 | DEVKIT-INPUT | Developer tooling | Complete | Live input playback was recorded successfully | Text, keys and shortcuts edit the intended live document |

## Long-document performance baseline

The 2026-11-28 pass uses the same 1,242,340-character, 20,800-block Markdown
fixture as the Textus benchmark. Measurements are from headless Chromium with
the production editor bundle, not a substitute for real-window acceptance.

| Metric | Nota | Textus baseline |
|---|---|---|
| Open-only startup | 5.02 s | 4.97 s |
| Full-path startup | 4.85 s | 4.97 s |
| Typing dispatch p95 | 102.6 ms | 88.0 ms |
| Input-to-frame p95 | 208.4 ms | 224.3 ms |
| Point-to-point scroll median | 23.3 ms | 33.3 ms |
| Open-only JavaScript heap | 93.3 MB | 81 MB |

The 1,000,000-character rich fixture opens in 1.54 s and the 2,000,000-character
fixture opens in 4.43 s. Raw reports and the Textus baseline are under
`src-tauri/target/perf-artifacts/2026-11-28/`. Run `npm run bench:large-doc`;
no installer is produced by that command.

## Recommended order

1. Complete 129 so old external reports do not create duplicate work.
2. Fix Linux lifecycle residue in 126.
3. Resolve the remaining source/code/diff appearance issue in 128.
4. Reconfirm BUG-31, BUG-56 and BUG-72 with current builds.
5. Finish settings and startup changes in 127 and 133.
6. Continue the behavior-neutral documentation migration in 135.
7. Confirm the remaining macOS runtime half before calling macOS a supported release.

## Needs evidence before implementation

- BUG-31: no reliable reproduction exists for the old native heap abort.
- BUG-56: the original user-visible sequence is still unclear.
- BUG-72: the theme-switch failure was seen once but has not been reproduced.
- 129: the external report spans several versions and must be retested.

## Deferred

- Image export remains unscheduled because Pandoc cannot provide a raster
  renderer.
- A full shell migration away from Tauri or WebKit is not planned. The cost and
  platform constraints are recorded in the permanent history.
- Optional plugin features should remain outside the core unless they preserve a
  clear host boundary.

## Current migration baseline

The source-language audit currently records:

```text
0 Chinese-containing production-source lines
0 non-functional emoji in production source
0 pinyin-transliteration identifiers
```

User-facing Chinese copy remains supported through localization resources.
Production source, identifiers and comments are English-only.

## Remaining manual review gaps

The 2026-11-01 manual checklist passed 19 of 21 items. The remaining gaps are:

| Area | Current state |
|---|---|
| Native printing | Item 8 did not pass on the acceptance run |
| GBK / GB2312 | Item 10 did not pass; automatic detection and round-trip preservation still require a fix |
| macOS runtime | Build and part of the runtime check passed; the remaining startup, editing, dialogs, printing, installation and Gatekeeper paths still need confirmation |
| Linux lifecycle | 126 remains open: repeated close and restart must not require `killall` |
| Source, code and diff appearance | 128 remains open pending a current reproduction |
| External report | 129 still needs retesting against current `main` |
| 0.18.1 distribution additions | Real-window import of an organization bootstrap, bundled extensions, custom onboarding/legal content and a custom update source still need end-to-end checks |

## Verification expectations

- Run focused tests while developing.
- Run `npm run verify:light` for routine cloud-safe validation.
- Run `npm run verify:full` before release candidates, not for every small edit.
- UI changes require real-window verification. CI and generated test summaries do
  not replace the submitter's manual check.
- Printing and PDF verification must use a light document theme.

## Release gates

1. `tools/check-version.sh <tag>` passes.
2. `verify:light` passes; `verify:full` passes before publication.
3. Installers do not contain extensions or third-party themes.
4. Manual Windows and Linux acceptance records are complete for the release.
5. A tag creates a draft release; publish only after validating artifacts,
   provenance and checksums.

## Authoritative sources

- Feature and defect history: [`07-feature-status.md`](07-feature-status.md)
- Feature matrix: [`10-feature-matrix.md`](10-feature-matrix.md)
- Version consistency: `package.json`, `src-tauri/Cargo.toml`,
  `src-tauri/tauri.conf.json` and `tools/check-version.sh`
- Release provenance: `BUILD-INFO.json` uploaded by CI
