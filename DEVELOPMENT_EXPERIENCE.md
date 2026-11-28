# Development experience

This file stores durable engineering lessons in concise English.
Rules belong in `CORE_RULES.md`.

## Count parity

Typography-based word counts must match across frontend and backend.
Port the reference expression directly instead of tuning offsets for one file.
Keep code-point character counts, line counts, and sentinel-based separator
handling stable. Mixed CJK and Latin fixtures are required.

## Authenticated developer bridge

Developer access becomes remote shell access when it can invoke editor commands.
Host Control requires developer mode, bridge enablement, an IP allowlist, an
Argon2 password, and a live bearer session. Sessions are memory-only, expire,
bind to the authenticating IP, and can be revoked together. Enabling access
requires randomized confirmation steps. The public MCP entry remains removed.

## IME caret ownership

The input method owns the native caret from `compositionstart` through
`compositionend`. Hide custom editor carets during composition. Restore them
only after the committed edit settles. Never dispatch document transactions
from preedit events merely to move the candidate window.

## IME candidate position

WebKitGTK can retain a stale input-method cursor rectangle after scrolling.
Send the focused editor's viewport-space caret rectangle on focus, selection,
composition, scroll, and resize. Use the native input-method context rather
than mutating the document.

## In-place link source

When the caret touches a link, replace it with one inline node containing the
real Markdown source. Parse the source back when the caret leaves. This keeps
native selection, IME, Ctrl+A, and undo available while preserving distinct
caret positions around the closing delimiter. Malformed source becomes plain
text.

## English-only production source

Production identifiers, comments, and internal literals use English.
Chinese belongs in localization files, content resources, or test data.
Use the source-language audit to reject new violations.

Migration order:

1. Lock behavior with tests.
2. Clean leaf modules.
3. Rename shared identifiers with compiler assistance.
4. Move user-facing strings into localization resources.
5. Remove the legacy baseline only after all production files are clean.

Do not combine large language cleanup with feature work.

## Table extension bridge

Keep table parsing and calculation in the extension. The host should expose only
a source snapshot, temporary display values, one undoable write intent and
context actions. Reapply temporary computed values to the current live table
after ProseMirror redraws its DOM; stale table references are not sufficient.

## Embedded Vim

Vim support for fenced code, Mermaid and block LaTeX belongs to each embedded
CodeMirror instance. Use a compartment so the extension can be enabled or
disabled without rebuilding the editor. The outer ProseMirror Vim engine remains
responsible for document-level navigation.

## Cross-platform Preferences

Create the in-process settings window first and fall back to a standalone
process only when creation fails. This keeps the startup path consistent across
platforms while preserving the Windows WebView2 fallback.

## Utility window state boundaries

Utility processes may intentionally run without `AppState`. The shared
`on_page_load` callback must use `try_state` before reading application state;
an unconditional state lookup panics before the window can report ready. Keep
the debug-log child independent of settings and plugin initialization.

On Linux, launch utility windows through `/proc/self/exe`. A development rebuild
can replace the executable while Nota is running; `current_exe()` may then return
a path ending in ` (deleted)`, and launching About, Settings or the log window
fails even though the running process is healthy.

## Release size

Measure binary and installer sizes after every release-profile change. Keep
optional formula and plugin logic out of the core; use lazy chunks for large
diagram dependants and avoid loading uncommon code paths during startup.

## Theme compatibility

Imported themes may define Typora variables, Carbon-style variables, or only
raw element rules. Preserve the source CSS and add a narrow compatibility layer
inside the document scope. Never rewrite third-party files in place.

Keep interface and document themes independent. A document theme must not leak
variables or selectors into the application shell.

Heavy font and image assets belong to the theme package. Keep licenses beside
the assets and use relative paths. Package-local files are preferable to remote
requests because themes must work offline.

## Adaptive selection

Do not hard-code one global selection color across themes. Start from the
theme's semantic colors, then enforce measurable contrast. The current minimum
targets are 2.5:1 for selection fill, 4.5:1 for selected text, and 3:1 for the
outline.

Keep the calculation deterministic and test theme pairs such as IBM
Documentation light and dark. Use a separate result-text color for computed
table values; selection ink must not leak into unselected cells.

## Table extensions

The Markdown source remains authoritative. Extensions receive a table
snapshot, return display-only values, and request edits through one undoable
transaction. Never store private sheet state in Markdown or a side database.

Paint computed values from the live table, not stale DOM references.
ProseMirror can replace table nodes after transactions. Keep a persistent
display layer for values that must survive focus leaving the table.

Use a single formula-source predicate for both evaluation and display.
Leading whitespace is allowed. A single `=` starts a formula; `==...==`, code
spans, escaped equals, and other Markdown syntax remain text.

When an extension renders non-source table content, expose additive metadata to
the host. Save confirmation should tell the user that the rendered table depends
on an extension while the saved Markdown remains unchanged.

## Platform consistency

Prefer one logical implementation across Linux, Windows, and future macOS
support. Use a fast in-process path first, then a platform-specific fallback.
Do not fork behavior merely because one backend needs a different launch path.

Window geometry, menu visibility, and title-bar mode must be derived from
actual window state. A cached setting is not enough when users move between
normal, maximized, and full-screen modes.

## Editor mount ownership

React StrictMode may start two editor effects in succession. Attach the
Milkdown mount before creating the editor, and let destroy remove only that
editor instance. Never clear the shared editor mount from an old instance:
the cleanup can run after the replacement editor has mounted.

## Plugin security

The developer bridge is remote-control authority. Require developer mode,
explicit enablement, an allowlist, a strong password, and short-lived sessions.
Confirmation steps must be randomized so users cannot click through a warning
without reading it.

Do not retain a public MCP endpoint when the developer bridge already provides
the required control surface. Keep privileged network access opt-in and visibly
warn before granting it.

## Persistence and recovery

Editor state and disk state are separate. Flush pending editor transactions
before saving, but never save when the active document and editor instance do
not match.

Autosave, draft recovery, and manual save must share the same serialization
path. Quiet saves suppress only the success notification; failures must remain
visible.

Session recovery must preserve document order, active tab, cursor where safe,
and unsaved drafts without overwriting source files. Close, discard, and save
actions must be explicit and mutually exclusive.

## Settings persistence

Treat settings writes as cross-process transactions. Merge a small patch into
the latest on-disk settings instead of writing a stale full snapshot from a
main, Settings or About window. Write through a same-directory temporary file,
flush it, and atomically replace the target. Distribution bootstrap imports run
only when no user settings or completion marker exists; they must never be
reapplied on later launches.

## Dual-engine E2E

Chromium and WebKitGTK disagree about contenteditable caret placement, NBSP
insertion, beforeinput ordering, selection APIs, IME composition, and native
key delivery. For DOM-facing editor behavior, passing Chromium E2E alone is not
evidence that the Tauri window works. Run both engines and compare DOM state,
ProseMirror state, and serialized Markdown.

## Geometry and overlays

Fixed overlays must be clipped to the editor viewport, not just the document.
Measure row and column geometry against the live DOM and account for scrolling,
window scaling, and front matter.

When text and overlays share a region, define which layer owns the caret and
which layer owns hit testing. Pointer capture and native selection can otherwise
fight after every redraw.

## Panel motion

Do not animate sidebar width or flex-basis. Those properties force layout on
every frame. Reserve the editor width once, position side panels absolutely, and
animate transform on the compositor. Keep pointer-driven resizing direct and
without transition.

## Testing strategy

Lock behavior with pure tests where possible. Use source-shape checks only for
integration rules that cannot be exercised in Node. Real-window tests are
reserved for caret ownership, IME, scrolling, platform dialogs, and visual
contrast.

Do not use a large end-to-end run to replace focused tests. Keep E2E suites
small and reserve them for interactions where DOM, native input, and rendering
dependencies cannot be simulated faithfully.

## Language migration

Production identifiers, comments, and internal literals use ASCII English.
Chinese belongs in localization resources, maintainer translations, or test
data. Emoji are not part of source comments or English documentation.

The legacy comment archive is local migration evidence and must not be
committed. Extract durable lessons into this file before deleting historical
comments. Run type checking, Rust tests, frontend tests, language audits, and
documentation sync after every cleanup batch.

Use `tools/clean-source-comments.mjs` in dry-run mode first. Treat any
mechanical source rewriter as untrusted: a scanner can preserve bytes and still
break strings, regular expressions, JSX text, or line adjacency. Snapshot the
worktree, run type checking immediately, and inspect `git diff --check` after
each batch.

Source-shape tests that search for old identifiers must migrate with production
names. A passing compiler does not protect those tests, so update them only
after checking that runtime behavior and exported identifiers still exist.

Language migration has exposed two high-risk patterns: a raw backtick inside a
regular-expression literal, and an interpolated URL truncated from
`https://${value}` to `https:`. Search changed string and regex literals for
partial protocols and unmatched delimiters before running the full suites.

Mechanical comment removal can also delete a neighboring statement when the
scanner loses block boundaries. Search for empty `if` / `match` blocks, run
`cargo check` with warnings treated as evidence, and compare suspicious
assignments or counters against the last known source. A clean test suite does
not prove that every command-side effect survived; source-shape tests should
pin critical assignments such as in-memory workspace updates and skipped-file
counters.
