# Changelog

Nota keeps short release-line notes. Full evidence, defect identifiers and
historical details are in
[`docs/07-feature-status.md`](docs/07-feature-status.md).

## 0.19.0-beta

- Settings packages can include installable `.nota-plugin` packages alongside
  extension settings and data. Import validates, stages and rolls back extension
  installation with the rest of the settings transaction.
- Settings-package import opens the file picker immediately, then shows the
  preflight inventory before applying changes.
- Long documents now reach Textus-class startup, typing and scrolling
  performance. Heading ids are written during parsing, syntax highlighting is
  viewport-driven, and math, Mermaid, images, HTML and code editors hydrate near
  the viewport.
- Viewport work is coalesced after scrolling settles and runs with a small
  frame budget. Formulas and diagrams render once instead of repeatedly
  rebuilding their DOM.
- Typewriter mode reserves half a viewport above and below the document and
  centers after native scrolling finishes.
- Added a reproducible production-editor benchmark with external fixtures,
  point-to-point scrolling, frame latency, heap and optional mutation/observer
  diagnostics.
- macOS release jobs produce unsigned Intel and Apple Silicon DMG previews.

## 0.17.0-beta

- Declare `libc` under Unix target dependencies so macOS builds can compile
  `window_registry::process_alive` (`kill(pid, 0)`), which previously failed
  when `libc` was Linux-only.
- Stop reinstalling an unchanged macOS system menu on every editor cursor update,
  which previously dismissed the open File menu and made items unclickable.
- Keep the forced in-app menu visible in full screen when "Force Nota menu when
  maximized or full screen" is on (do not zen-hide it under the screen edge).
- Added extension API v2.4 table snapshots, temporary rendering, undoable writes
  and localized context actions.
- Added the `nota.sheet-formulas` extension with Excel-compatible references,
  arithmetic, logical, text and lookup functions plus cycle detection.
  Calculated values remain display-only until the table **Keep Values** action
  is chosen.
- Formula cells now follow the selected table cell, and the native formula input
  supports normal caret placement and text selection.
- Vim input now applies inside fenced code, Mermaid and block LaTeX source
  editors while preserving each CodeMirror instance's selection and undo state.
- Preferences now use one cross-platform fast path: create and show an in-process
  settings window first, then fall back to the established standalone process
  only if creation fails.
- Release builds now favor artifact size with `opt-level="s"`, fat LTO and abort
  unwinding.
- The spreadsheet formula bar keeps its cell target and input mounted while the
  native selection temporarily leaves the table, so pointer focus and typing no
  longer unmount the toolbar.
- Inline LaTeX suggestions inside table cells no longer clip KaTeX samples or
  long descriptions, and a first `/` or `\` in empty math keeps a visible source
  slot in WebKitGTK. WebKit's temporarily stale input selection no longer moves
  the caret before the inserted character or outside the closing `$`.
- Inline LaTeX suggestions now render in a fixed viewport layer above the table
  selection and formula preview. Live math previews use the active theme's
  surface and border instead of an opaque black card, eliminating the
  table-line/preview layering conflict.
- Mermaid previews now fit both the available width and height before falling
  back to scrolling, so tall mindmaps and flowcharts no longer show a clipped
  lower half.
- The Separate window Preferences mode now launches a dedicated Nota process
  and top-level window, matching the reliable debug-log window lifecycle on
  Windows/WebView2.

## 0.16.0-beta

- Added optional spreadsheet-style table interaction with A1 references, row
  and column headers, a cell bar, range selection and a fill handle.
- Spreadsheet fills can extend GFM tables while preserving ordinary Markdown.
- Empty table cells no longer write automatic `<br />` placeholders.
- Reworked AI, Git and external diff rendering with clearer markers, hunk and
  metadata styling, horizontal scrolling and collapsible unchanged context.
- Status-bar selection metrics now show selected over total values.
- Moved update checks, notifications and manual update actions into General
  settings.
- Blocked browser shortcuts by default and added an opt-in developer setting to
  restore WebView-native reload, find, download, source and DevTools keys.
- Added live Typora `[TOC]` rendering and expanded callouts across the Obsidian
  aliases and the original GitHub alert types.
- Escaped dollar signs now stay inside inline math, and dollars wrapped by inline
  HTML no longer consume the rest of the line as a formula.
- Unified link colors between source editing and rendered links. Command-click
  on a link now opens it without first entering source editing.
- Resting block math is borderless; only source and preview surfaces appear
  while editing. Empty math delimiters no longer crash document loading.
- Fixed Mermaid diagrams being enlarged beyond their natural size and restored
  syntax colors for `gfm` fenced code. The language picker now follows document
  theme colors.
- Spreadsheet headers, range outlines and the A1 formula bar now stay below the
  application menu and toolbar layers. The front matter banner sits between
  application chrome and spreadsheet controls.
- AI assistant replies now use safe Markdown rendering for headings, emphasis,
  links, lists, tables and fenced code. DeepSeek-style reasoning streams show a
  thinking state before final content, and mixed prose pastes linkify every URL
  and email token without changing visible text.
- AI extension 0.1.6 can import JSON, Markdown or plain-text personas and always
  exposes a direct custom-preset editor. Presets are injected as explicit system
  context without changing document content.
- AI extensions now send the required POST request for streaming. DeepSeek-style
  reasoning and answer chunks display incrementally instead of returning HTTP
  405 and silently falling back to a complete response.
- Extension APIs now use `vMAJOR.MINOR`. Host API `v2.3` accepts compatible
  older minors, rejects incompatible versions, reports installed mismatches in
  the extension list and on startup, and blocks incompatible imports without
  writing them.
- Link source editing now collapses after clicking anywhere outside the source.
  Explicit, automatic and source-edit links all use the single `--link` theme
  token.
- Pending headings retain their source state while the caret is anywhere inside
  the heading paragraph, and spreadsheet overlays continuously follow editor
  scrolling and layout changes.
- Sequence, flow and other Mermaid diagram fence aliases now use the shared
  diagram frame and supply missing Mermaid type headers. PlantUML and Graphviz
  fences also enter the frame for source editing with an explicit renderer
  notice. Large diagrams scroll inside a height-bounded preview.
- Spreadsheet overlays are clipped to the editor viewport, and clicking the A1
  formula field keeps focus there instead of moving it into the document.
- Fixed GTK4 writing-statistics image saves when the selected name has no folder
  component.
- Standalone CSS theme imports now detect UI and document themes, route them to
  the correct theme directory and copy only the selected stylesheet and its
  local imports, fonts and images. Downloads folders with unrelated files no
  longer exceed the theme import limits.
- Consolidated maintainer rules and experience files and expanded language
  enforcement.

## 0.15.0-beta

- Running Nota windows receive stable numeric IDs. Tabs can move to another
  window by ID, with configurable focus following, ID hints and shortcuts.
- Document and plugin tabs support pointer drag ordering. Plugin tabs can close
  and reopen from the plus control while preserving order and closed state.
  Dragging a side panel past its safe threshold shows a red collapse indicator.
- Fixed Save All and save-on-exit writing the active tab text into other
  documents. Same-named files in different directories now use independent
  document IDs and mirror paths.
- Sidebar context actions preserve the target directory, create files and
  folders in any subtree during tree view, and require confirmation before
  deletion. The backend rejects workspace escapes and root deletion.
- Image paste and drop now handle HTML images, URL lists, blob/data URLs, file
  URIs and native clipboard images. Remote images are downloaded or copied
  according to settings before Markdown is updated.
- Headings that inherit bold no longer gain automatic `**` markers. Explicit
  URL-label links render immediately, and link source editing follows the
  document-theme link color.
- Mermaid uses a wide content column while prose uses a Typora-style centered
  paper width. Zoom changes show a percentage, minus, plus and reset overlay in
  the top-right corner.
- Added first-run onboarding, license and notice screens, native plugin icon
  themes, tab context management and additional editor-feel fixes.
- Published with Nota Plugins `0.9.0-beta` and Nota Themes `0.8.0-beta`.

## 0.14.4-beta

- Fixed Windows installed builds not launching the updater. The native
  `ShellExecuteW` path matches Textus, and NSIS uses `/P /UPDATE /R` to show
  passive progress, replace the current installation and restart.
- Update completion now terminates the whole application so hidden Settings and
  About webviews cannot block file replacement. Windows updates no longer depend
  on a PowerShell script that waits for an old PID.
- Fixed inline code occasionally adding 1-2 px to paragraph height because
  monospace metrics participated in baseline calculation. Outer prose now owns
  line height while code bounds and backgrounds remain unchanged.

## 0.14.3-beta

- Fixed code-block line numbers becoming a separate row in WebKitGTK, which
  placed every number above the code body.
- Locked the embedded CodeMirror code block to a horizontal single-line flex
  layout: the gutter stays at the left and the content expands at the right.
  Line numbers and matching `.cm-line` elements share line height and top
  coordinates.

## 0.14.2-beta

- Fixed the Linux main window being created off-screen, where Wayland
  compositors could not reliably move it back. Launching from the `nota` command
  or desktop icon now produces a visible window.
- The compositor creates the main window at a normal screen position. Repeated
  launches explicitly call `show()` after focusing so hidden or invisible
  windows can recover.
- Windows automatic updates no longer call NSIS silently. After the old process
  exits, the installer shows progress and replaces the installation with
  `/UPDATE /R`, preventing a brief installer flash without a version change.

## 0.14.1-beta

- Fixed the custom caret lagging during Chinese IME composition. Preedit uses
  the native caret for its full lifetime, then Nota restores the custom caret
  after the committed text settles.
- Fixed code-block carets jumping to the next line at line starts, line ends and
  empty lines. Carets now bind to real characters or line boxes.
- Unordered bullets and ordered numbers no longer switch rendering modes when a
  caret enters, eliminating misalignment and flicker.
- Fixed ProseMirror helper nodes taking two extra lines in WebKitGTK after
  `Ctrl+B` and pushing later paragraphs. Real `**` boundaries and source editing
  remain available.
- Consolidated the code-block language picker into one centered input. The
  candidate list matches its width and supports direct input, filtering, alias
  search and custom languages.
- Fixed color inputs in Settings not receiving keyboard focus. Unified control
  sizes, accent colors, radio controls and window colors across Adwaita and Yaru.
- Settings and About windows support filled, embedded and independent-window
  presentations. Independent windows are reused, and full-screen or maximized
  mode no longer leaves a white strip at the top.
- The developer bridge can list, install, uninstall, enable, disable, check and
  upgrade extensions through authenticated remote commands. Local uploads,
  host-path installation and batch upgrades share one protocol.
- Source mode always uses a monospace font. Improved theme import, preview
  windows, toolbars and custom menu details.

## 0.14.0-beta

- Switched editing behavior to Typedown's full source-offset model and Textus's
  in-place link source editing. Bold, italic, highlight, superscript, subscript,
  links and Chinese IME caret boundaries now share one model.
- Fixed Left navigation at link tails, editing at destination ends, continuous
  navigation, whole-document selection and invalid-source fallback.
- Added direct Typora theme directory, standalone CSS and ZIP compatibility while
  preserving bundled fonts, images, `@import` rules and relative assets. Added
  Typora page structure, variables and LaTeX theme bridging.
- Added draft recovery and text encoding/newline preservation. Unedited files are
  saved with their original bytes.
- Linux printing uses the XDG Portal and GTK4. Windows uses native WebView2
  printing. HTML, math and Mermaid reuse the complete document style layer.
- Improved diagrams, HTML image fallback, block-math preview, code-block boundary
  navigation and quote exit behavior.
- Developer mode adds UI text selection, an element inspector and an opt-in Lua
  extension auto-reload setting that defaults to off.

## 0.9.0-beta

- Typing three backticks in a normal paragraph provides language completion.
  `mat` shows `math`, `mathematica` and `matlab`; confirming one creates a code
  block.
- Inline mark hints cover bold, italic, inline code, strike-through, highlight,
  superscript, subscript and underline with real delimiters that inherit prose
  styling.
- Added a menu-bar rendering setting. Nota's custom menu is the default and the
  native system menu can be selected immediately.
- The LaTeX theme gained Typora-compatible typography and a CJK serif fallback.
  Math fences provide source editing and a separate preview below the source.
- About, Settings and other modal windows use the official-style close button
  with a 32 px hit area.
- The file sidebar gained a Typora-style context menu, summary, search, system
  file picker and current-section tracking.
- Startup is shorter. The editor mounts and focuses before the window moves
  on-screen, while math and diagrams remain deferred.
- Finished table tools, the Mermaid source/preview split, update progress and
  sidebar submenu direction.
- Updated official interface themes from the Figma UI Kit and added the external
  Vellum document theme.
- Continued the 0.9 development line for update settings, interactive
  notifications, editor opening keys, single-row table Enter behavior and
  release workflow separation. `update/latest.json` continues to point to
  `0.8.0-beta` until a complete cross-platform release is published.

## 0.8.1-beta

- Startup no longer waits for the complete interface font set. The window can
  appear after imported theme CSS arrives.
- CDE menus use Motif integer geometry and support F10, arrow navigation,
  click-to-switch columns, pointer-leave disarm and one-level Esc for submenus.
- CDE bitmap fonts use lossless WOFF2 at runtime, reducing theme data inlining
  and WebView parsing time.
- The toolbar code-block action is a visible toggle: outside a block it converts
  the paragraph; inside a block it restores a normal paragraph.
- Fixed mixed fonts, mnemonic fallback and text baseline issues caused by
  non-16 px sizes in About and CDE popup surfaces.

## 0.8.0-beta

- Added an Advanced Settings page visible only in debug mode. Clicking the About
  version number five times toggles debug mode.
- Debug mode also controls backend internal logs, so users no longer need to edit
  environment variables.
- Download settings support `original prefix => replacement prefix` rules for
  application and extension update manifests and installers.
- Extension management is split into Extension Management and Plugin Settings.
  One page manages installs and updates; the other manages settings declared by
  plugins to the host.
- Moved settings-file access, reset, runtime information and download replacement
  rules into Advanced Settings.

## 0.7.0-beta

- Added experimental application update checks. The host selects assets for deb,
  rpm, AppImage, Windows portable, Windows installer and development builds.
- Update manifests use a fixed official repository. Installers must come from an
  official Nota release and SHA-256 is verified before execution.
- Added plugin repository updates. A plugin can declare an `[update] manifest`
  pointing to a `latest.json` that describes multiple plugins.
- Plugin updates reuse package digests, Ed25519 verification, signer continuity
  and atomic replacement.
- Entered the beta line with compatibility fixes for GitHub Markdown badges,
  remote images and GitHub Alerts.

## 0.6.0-beta

- First public beta with Linux and Windows packages.
- Added English and Chinese READMEs, the product website and user and developer
  documentation.
- Added the independent official theme repository. CDE styles, icons, fonts and
  licenses are fully external.
- Every modal window provides a top-right close button.
- Interface text uses neutral, formal language without visible status emoji or
  conversational wording.
- Installers continue to ship without extensions or third-party themes.

## 0.5.0-beta

- Added CDE interface and document themes. Real EBDT bitmap fonts are bundled
  from a WQY derivative; licensing is documented in `THIRD-PARTY.md` section 9.
- Printing uses IPP over the CUPS Unix socket instead of `lpstat` and `lp`. PDFs
  still pass through the correct CUPS driver chain. CDE uses the complete WQY
  EBDT Song font with its license beside the font.
- Restored WebKit DMA-BUF/GPU compositing by default on Linux. Long code-block
  syntax highlighting batches updates every 80 ms to improve scroll and typing
  frame rate.
- Reduced bundled document themes to Adwaita light and dark. Other official
  themes moved to the independent theme repository.
- Theme assets can declare icons, fonts and images in CSS. Added the CDE
  custom-drawn hard-edge icon set.
- Improved AI, Git, Slidev and writing-statistics extensions, in-app printing
  and HTML code preview.
- Experimented with Windows cross-compilation and installers.
- Added verification CI, version gates, documentation-sync CI mode and release
  provenance manifests.
