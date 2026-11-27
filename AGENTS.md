# Nota development entry

Read this file before changing the repository. Mandatory rules are in
[`CORE_RULES.md`](CORE_RULES.md). Durable engineering lessons are in
[`DEVELOPMENT_EXPERIENCE.md`](DEVELOPMENT_EXPERIENCE.md). Contribution and AI
requirements are in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## 0. Mandatory workflow

1. Read the relevant documents before changing code:
   - [`docs/01-architecture.md`](docs/01-architecture.md)
   - [`docs/02-modules.md`](docs/02-modules.md)
   - [`docs/07A-current-status.md`](docs/07A-current-status.md)
   - [`docs/07-feature-status.md`](docs/07-feature-status.md)
   - [`docs/08-development-guide.md`](docs/08-development-guide.md) for new UI
     or behavior.
2. Update affected documentation in the same change. The source mapping is in
   [`docs/09-doc-sync-policy.md`](docs/09-doc-sync-policy.md). Run
   `bash tools/doc-sync-check.sh` before handoff.
3. Do not assume that a visible control works. Check the current-status,
   feature-status and UI-map documents first.
4. Treat code as authoritative when it conflicts with documentation. Correct the
   documentation immediately and record the drift.
5. Keep one change focused. Do not mix a language cleanup with unrelated feature
   work.
6. Source files must not exceed 1000 lines. The target range is 300-800 lines.
   Split by responsibility when a file approaches the warning threshold.
7. Printing, system printing and PDF export require a light document theme.
   Stop before layout and ask the user to select one when the active theme is
   dark.
8. AI-assisted contributions are welcome, but the submitter must personally
   test the complete relevant behavior and accept responsibility for licensing.

9. DOM-facing E2E requires both engines. Run `npm run test:e2e` and
   `npm run test:webkit` for editor input, caret, selection, IME, clipboard,
   drag/drop, contenteditable, and inline NodeView changes. Do not report a
   Chromium-only pass as complete browser verification.
10. Do not run browser E2E during iterative development. Defer Chromium and
    WebKit E2E until immediately before a release, then run the required focused
    `NOTA_E2E_ONLY` subsets followed by the release gate. Use unit, static,
    typecheck and build checks during implementation.

## 1. Project

Nota is a local-first Markdown editor built with:

- Tauri 2;
- Rust under `src-tauri/`;
- React 19, TypeScript and Vite under `src/`;
- Milkdown 7, ProseMirror and remark in the editor;
- Lua 5.4 for isolated extensions;
- application ID `io.github.nota.Nota`.

The current version is stored consistently in `package.json`,
`src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.

### Core architecture

| Layer | Responsibility |
|---|---|
| Rust host | Window lifecycle, documents, files, settings, plugins, printing, updates and native integration |
| React UI | Application shell, settings, sidebars, dialogs, tabs and status surfaces |
| Editor | Markdown document tree, source editing, inline atoms, IME integration and rendering |
| Lua host | Per-plugin state, manifest capabilities and a restricted host API |
| Themes | Independent interface and document theme axes |

The frontend owns live document text. The backend mirrors text after a debounce.
Any backend mutation must notify the frontend, or saved content can diverge from
what the editor shows.

Lock order is:

```text
plugins -> documents -> settings
```

Never acquire these locks in reverse order. Never hold a lock across `.await`.

## 2. Code map

The authoritative file-level reference is
[`docs/02-modules.md`](docs/02-modules.md). The main areas are:

| Path | Responsibility |
|---|---|
| `src-tauri/src/lib.rs` | Tauri setup, shared state and command registration |
| `src-tauri/src/document/` | Document model, loading, saving, encoding and mirror state |
| `src-tauri/src/settings/` | Settings schema, persistence and migration |
| `src-tauri/src/plugin/` | Plugin discovery, manifests, install, trust, update and reload |
| `src-tauri/src/lua/` | Lua runtime and host APIs |
| `src-tauri/src/commands/` | Tauri command boundary |
| `src-tauri/src/image/` and `upload/` | Image placement, remote resources and upload |
| `src-tauri/src/pandoc*`, `print_job.rs`, `pdf_print.rs` | Export, printing and PDF paths |
| `src-tauri/src/dev_bridge.rs` | Authenticated Host Control bridge |
| `src/App.tsx` | Application composition and shared UI state |
| `src/editor/` | Milkdown assembly, source editing, input behavior and rendering |
| `src/ui/` | React shell, commands, menus, dialogs, settings, sidebar and status bar |
| `src/styles/` | Interface shell styles, document themes and external theme assets |
| `src/bridge/` | Typed IPC and shared frontend types |
| `src/i18n/` | English source keys and translation resources |
| `plugins/` | Development-only plugin workspace when present; official plugins live in `Nota-plugins` |
| `tests/` | Focused frontend and policy tests |
| `tools/` | Verification, synchronization, packaging and development utilities |

Detailed behavior, signatures and historical evidence must be documented in the
appropriate `docs/` file instead of growing this index.

## 3. Build and run

The standard development environment uses a Podman container named `tauri-dev`.
Run build commands as UID 1000 so generated files remain owned by the developer.

```sh
podman exec -u 1000 -w "$PWD" tauri-dev npm install
podman exec -u 1000 -w "$PWD" tauri-dev npm run app
```

Useful checks:

```sh
podman exec -u 1000 -w "$PWD" tauri-dev npx tsc --noEmit
podman exec -u 1000 -w "$PWD" tauri-dev bash tools/test-frontend.sh
podman exec -u 1000 -w "$PWD/src-tauri" tauri-dev cargo test --lib --locked
podman exec -u 1000 -w "$PWD" tauri-dev npx vite build
```

Use `npm run verify:light` for routine cloud checks and `npm run verify:full`
for E2E, the complete Rust suite, documentation checks and the production build.

Platform dependencies, headless window recipes and detailed test commands are in
[`docs/06-build-run-test.md`](docs/06-build-run-test.md).

## 4. Engineering conventions

### Rust

- Use `NotaError` for command errors.
- Keep user-facing localization outside production logic.
- Move pure policy into testable functions instead of hiding it inside
  `AppHandle`-dependent shells.
- Keep module comments concise and explain why the boundary exists.

### TypeScript and React

- `@/` resolves to `src/`; Vite aliases and TypeScript paths must stay aligned.
- Call the backend through `src/bridge/ipc.ts`.
- `noUnusedLocals`, `noUnusedParameters` and `noUncheckedIndexedAccess` are
  enabled.
- Prefer pure helpers for policy and state transitions.

### Lua

- Request only capabilities declared by the plugin manifest.
- Plugin failures should normally return structured results instead of throwing
  across the host boundary.
- Never use plain `Lua::new()` for untrusted plugins. Use the hardened runtime.

### Documentation

- Maintainer documentation uses concise English.
- Chinese belongs in explicit translations, localization resources and test
  data.
- Do not add emoji.
- Preserve identifiers, commands, paths, links and code examples exactly during
  translation.

## 5. Platform constraints

### Tauri

- Event names allow only alphanumerics and `-`, `/`, `:`, `_`.
- Plugin IDs may contain dots, so event channel names must pass through
  `plugin::manifest::channel_id()`.
- Keep CSP only in `tauri.conf.json`. Do not duplicate it in `index.html`.
- The Tauri 2 bundle category is `Productivity`, not `Office`.

### Lua isolation

- Plugin Lua states must come from the hardened runtime.
- `Lua::new()` is not a capability sandbox.
- `loadfile` and `dofile` must be removed explicitly even when using a standard
  library allowlist.

### WebView

- Parse Markdown before replacing a whole editor document. Remark may silently
  accept malformed input.
- Custom protocol font loading has CORS limitations in WebKitGTK. Do not assume
  that an image succeeding means a font request will succeed.
- Use `event.code` for shortcuts where `event.key` changes under Shift.

### Windows

- Runtime child processes must use the hidden-process launcher.
- Cross-compilation uses `x86_64-pc-windows-gnu`.
- Keep updater launching, silent overwrite and restart behavior aligned with
  native Windows process rules.

### Linux

- Native file and print dialogs may use the separate GTK4 helper process.
- Do not initialize GTK3 and GTK4 in the same process.
- Main windows must be created at a normal screen position so Wayland
  compositors can display them reliably.

### Packaging

- Application installers do not bundle extensions or third-party themes.
- Official plugins and themes use their separate repositories.
- New third-party dependencies and assets require `THIRD-PARTY.md` updates.

## 6. Current status and authority

Do not maintain moving test counts or feature-score snapshots in this file.

- Current release facts and active queue:
  [`docs/07A-current-status.md`](docs/07A-current-status.md)
- Permanent feature and defect record:
  [`docs/07-feature-status.md`](docs/07-feature-status.md)
- Authoritative feature matrix:
  [`docs/10-feature-matrix.md`](docs/10-feature-matrix.md)
- Mandatory source-to-documentation mapping:
  [`docs/09-doc-sync-policy.md`](docs/09-doc-sync-policy.md)

Unresolved P1 defects take priority over new backlog work. A generated test
summary cannot replace the submitter's verification in a real window.

## 7. Documentation index

| Document | Authority |
|---|---|
| [`docs/README.md`](docs/README.md) | Reading order and full index |
| [`docs/01-architecture.md`](docs/01-architecture.md) | Runtime architecture and process boundaries |
| [`docs/02-modules.md`](docs/02-modules.md) | File-level interfaces |
| [`docs/03-data-structures.md`](docs/03-data-structures.md) | Shared data structures, constants and lock order |
| [`docs/04-ui-map.md`](docs/04-ui-map.md) | UI control tree and behavior |
| [`docs/05-editor-bridge.md`](docs/05-editor-bridge.md) | Editor assembly and IPC semantics |
| [`docs/06-build-run-test.md`](docs/06-build-run-test.md) | Build, run, debug and test recipes |
| [`docs/07-feature-status.md`](docs/07-feature-status.md) | Permanent features, defects and backlog history |
| [`docs/07A-current-status.md`](docs/07A-current-status.md) | Current release facts and active queue |
| [`docs/08-development-guide.md`](docs/08-development-guide.md) | UI, command, event, plugin and settings recipes |
| [`docs/09-doc-sync-policy.md`](docs/09-doc-sync-policy.md) | Required documentation synchronization |
| [`docs/10-feature-matrix.md`](docs/10-feature-matrix.md) | Feature coverage matrix |
| [`docs/11-writing-a-plugin.md`](docs/11-writing-a-plugin.md) | Plugin authoring guide |
| [`docs/12-plugin-runtime.md`](docs/12-plugin-runtime.md) | Plugin runtime and sandbox |
| [`docs/13-lua-api.md`](docs/13-lua-api.md) | Lua API reference |

## 8. Source registry

The synchronization check uses these stable keys for files whose responsibility
is not obvious from a top-level directory name:

```text
bridge/types-app-settings.ts
bridge/types-settings-export.ts
bridge/types-settings.ts
tests/browser-shortcuts.test.ts
commands/diff.rs
commands/path_kind.rs
commands/session.rs
commands/table_width.rs
commands/watch.rs
commands/window_registry.rs
debug-log.tsx
editor/block-keys.ts
editor/caret-commander.ts
editor/create-types.ts
editor/document-audit.ts
editor/github-alert-edit.ts
editor/github-docs.ts
editor/image-kind.ts
editor/ime-guard.ts
editor/inline-escape.ts
editor/math-current.ts
editor/math-view-dom.ts
editor/math-inline-focus.ts
editor/plugin-vim-engine.d.ts
editor/plugin-vim-input.ts
editor/plugin-vim-ops.ts
editor/plugin-vim-text.ts
editor/plugin-vim-types.ts
editor/review-prose.ts
editor/review-source.ts
editor/review.ts
editor/spell-check.ts
lua/api/review.rs
pandoc/tests.rs
session.rs
settings/appearance.rs
settings/document.rs
settings/editor.rs
settings/files.rs
settings/focus.rs
settings/general.rs
settings/image.rs
settings/markdown.rs
settings/mod.rs
settings/updates.rs
settings_export.rs
table_width.rs
window_registry.rs
styles/code-block.css
styles/focus.css
styles/github-alert.css
styles/settings-export.css
styles/theme/adwaita-fonts.css
styles/themes/dark/latex.css
styles/themes/dark/minimal.css
styles/themes/latex.css
styles/themes/minimal.css
styles/command-palette.css
styles/vim.css
styles/zoom-hud.css
ui/ExternalChangeBar.tsx
ui/ExternalDiffPane.tsx
ui/CommandPalette.tsx
ui/command-palette.ts
ui/FocusAlarmWindow.tsx
ui/FocusMeter.tsx
ui/PanelDiffBlock.tsx
ui/ReviewBar.tsx
ui/WindowIdOverlay.tsx
ui/WindowPickerDialog.tsx
ui/ZoomHud.tsx
ui/document-save-text.ts
ui/browser-shortcuts.ts
ui/recentMenu.ts
ui/settings/SettingsExportDialog.tsx
ui/settings/panes/AppearancePane.tsx
ui/settings/panes/DocThemePane.tsx
ui/settings/panes/EditorPane.tsx
ui/settings/panes/FilesPane.tsx
ui/settings/panes/FocusPane.tsx
ui/settings/panes/GeneralPane.tsx
ui/settings/panes/MarkdownPane.tsx
ui/settings/panes/SpellLangPicker.tsx
ui/settings/panes/props.ts
ui/tab-order.ts
ui/useAppEvents.ts
ui/useAppWindowRegistry.ts
ui/useDocThemeInventory.ts
ui/useDocumentCheck.ts
ui/useEditorInput.ts
ui/useExternalChanges.ts
ui/useFindBar.ts
ui/useFocusAlarmSound.ts
ui/useFocusIntro.ts
ui/useForceFocus.ts
ui/useImeCursorBridge.ts
ui/useReviewView.ts
ui/useSession.ts
ui/useSpellcheck.ts
ui/useStartup.ts
ui/useUpdateNotifications.ts
ui/useUtilityWindows.tsx
ui/useWindowRegistry.ts
ui/useWorkspaceDelete.ts
ui/window-picker.ts
ui/zoom-hud-state.ts
```
