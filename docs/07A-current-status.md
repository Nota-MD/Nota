# Current status and execution queue

Last synchronized: 2026-11-22

This file is the current execution view. Permanent identifiers, evidence and
historical decisions remain in [`07-feature-status.md`](07-feature-status.md).
Feature completeness remains authoritative in
[`10-feature-matrix.md`](10-feature-matrix.md).

## Release baseline

| Item | Current state |
|---|---|
| Source version | `0.17.0-beta` |
| Supported release platforms | Linux and Windows |
| macOS | Adaptation exists, but no supported build or release pipeline yet |
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
| P0 | 130 | Windows settings window | Implemented; Windows acceptance pending | Windows now launches Preferences as a standalone process with an isolated WebView2 data directory; verify first open, reopen, native close and presentation switching on a real Windows build | First open and reopening work after restart; switching presentation modes leaves no hidden blocker; failures show an error |
| P0 | 132 | Windows title bar | Open | Record WebView2 and DWM window events; isolate prewarm, maximize/fullscreen listeners and title-bar recalculation | System title bar runs five minutes without flicker; normal, maximized and fullscreen transitions stay stable |
| P0 | 110 | Windows acceptance | Partial | Complete the real-device checklist after 122, 130, 131 and 132 | Install, update, single-instance, Host Control, plugins and restart paths each have a pass/fail record |
| P1 | 122 | Windows feedback checklist | Partial | Re-audit remaining items in the external 17-item report and close or split every unresolved item | Every original item has a current evidence-backed conclusion |
| P1 | 129 | External test report | Needs retest | Retest the 2026-11-20 ODT report on current `main` before implementing anything | Each reported issue is marked fixed, reproducible, duplicate, or invalid |
| P1 | 131 | Theme icons on Windows | Open | Verify package icon mappings, protocol URLs, theme reload order and per-icon fallback | Installed custom icons work on Windows and Linux and update without restart |
| P1 | BUG-31 | Native crash | Unlocated | Reproduce the old glibc `malloc` abort under stress with isolated profiles and native logging | A controlled reproduction exists, or the item is downgraded with a clear evidence boundary |
| P1 | 125 | Diff rendering | Needs visual review | Core renderer now has stable markers, row classes, context collapse, keyboard scrolling and localized controls | Verify narrow panels, full editor review and light/dark themes in a real window; fix any remaining spacing or overflow issues |
| P1 | 128 | Code and source appearance | Open | Obtain a current reproduction and compare source mode, embedded code blocks and diff code views | Font metrics, line height, gutters, selection, caret, padding and zoom remain aligned across themes |
| P1 | 134 | Source English and identifier migration | Complete | Keep both zero baselines enforced by `npm run audit:language` and `npm run audit:pinyin` | Chinese production-source baseline and pinyin identifier baseline both remain at zero |
| P1 | 135 | Documentation English migration | In progress | Translate `docs/01` through `docs/13`, `THIRD-PARTY.md` and reference archives in focused batches | Maintainer documentation is concise English except explicit translations and test content |
| P1 | BUG-56 | Editing behavior | Needs clarification | Reconfirm the exact user-visible behavior before changing code | The reported sequence is reproduced or the item is closed as invalid |
| P2 | 127 | Startup behavior | Open | Add a persistent "Show landing screen after startup" option and define precedence rules | Explicit CLI files win; session restore remains predictable; both modes pass repeated startup checks |
| P2 | BUG-68 | Code-block appearance | Needs verification | Recheck the missing-frame report against the current code-block implementation | The current behavior is accepted as intentional or corrected with a screenshot-backed test |
| P2 | BUG-72 | Theme switching stability | Rare | Stress repeated theme and source-mode switches | No error boundary, blank editor, or crash occurs |
| P2 | 118 | Sidebar appearance | Partial | Recheck tree and outline spacing, resizing and CDE theme consistency | Sidebar states are visually consistent under bundled and external themes |
| P2 | 136 | Spreadsheet table mode | Needs real-window testing | Verify A1 headers, ranges, cell bar, fill handle and Markdown round trips | The optional mode works on Linux and Windows without changing the saved GFM table format |
| P1 | 137 | Table formulas | Needs real-window testing | Test `nota.sheet-formulas`, setting ownership and Keep Values on Linux and Windows | Formula display remains non-destructive; disable/uninstall restores the setting; Keep Values is one undo step |
| P2 | MACOS-BUILD | macOS support | Planned | Define the CI runner, signing, notarization, DMG and Gatekeeper path | A signed build passes startup, editing, dialogs, printing, updates and installation checks |

## Recommended order

1. Complete 129 first so old external reports do not create duplicate work.
2. Fix and verify the Windows blockers in 130, 131 and 132, then finish 110 and 122.
3. Fix Linux lifecycle residue in 126.
4. Improve the highest-impact editor quality issues in 125 and 128.
5. Reconfirm BUG-31, BUG-56, BUG-68 and BUG-72 with current builds.
6. Finish settings and startup changes in 127 and 133.
7. Continue the behavior-neutral source and documentation migrations in 134 and 135.
8. Start macOS release engineering only after Windows acceptance is stable.

## Needs evidence before implementation

- BUG-31: no reliable reproduction exists for the old native heap abort.
- BUG-56: the original user-visible sequence is still unclear.
- BUG-68: the current code-block frame behavior needs a fresh comparison.
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

## Manual visual review gaps for 0.17.0-beta

These areas still need a real-window check. Automated tests do not close them.

| Area | Required check |
|---|---|
| Table formulas | Install `nota.sheet-formulas` on Linux and Windows; verify display-only results, setting ownership, cycle errors, context-menu Keep Values and one-step undo |
| Spreadsheet mode | Verify A1 headers, persistent cell highlight, row and column selection, rectangular ranges, fill handles and GFM round trips |
| Table and LaTeX layers | Verify inline and block formula suggestions above table controls, caret placement for `$`, `/` and `\`, and stable focus |
| Source mode, code and diff | Verify fonts, line height, gutters, selection, caret, horizontal overflow and light, dark and external themes |
| Vim in nested editors | Verify Normal, Insert and Visual modes in fenced code, Mermaid and block LaTeX editors with IME input |
| Settings presentation | Verify embedded, full-page and standalone modes before and after restart, including maximized, fullscreen and Windows title-bar behavior |
| Sidebars and tabs | Verify file tree actions, long paths, context-menu bounds, tab and extension drag ordering, red collapse threshold and restored state |
| Themes and selection | Stress theme and source-mode switching; verify table ranges, text selection, accent controls and custom icons under bundled and external themes |
| IME and inline boundaries | Verify Chinese composition at link tails, headings, bold boundaries and inline math, including `$|$` followed by `\` |
| Output and lifecycle | Verify Linux and Windows printing, Pandoc PDF, PDF-to-image inspection, ten Linux close and restart cycles, and Windows install, portable and update paths |

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
