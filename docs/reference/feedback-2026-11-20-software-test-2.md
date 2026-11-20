# Software Test 2 feedback triage

Source: `软件测试2.odt`, supplied by DING-YC on 2026-11-20.

The original report spans several intermediate builds. Its observations are
recorded here as a regression checklist, not as proof that every issue still
exists. Re-run each item on current `main` before assigning a permanent BUG ID.

| Area | Reported behavior | Current action |
|---|---|---|
| Arbitrary Markdown/LaTeX input | Some converted CommonMark cases and specific escape sequences crash the editor. The report later notes that Nota does not implement CommonMark, so the full suite is not a valid conformance target; the crash still matters if reproduced with a small input. | Reduce to a minimal reproducer and add it as a parser regression test. |
| Empty fenced block | The caret starts in the wrong place inside an empty fence, and entering certain characters may blank the window. | Test empty fences with and without a language, then verify caret placement and recovery from input errors. |
| Table pipe | Typing `|` inside a table cell does not serialize it as `\|`, and returning to WYSIWYG corrupts the table layout. | Verify the current serializer and add byte-level round-trip cases. |
| Nested emphasis | Strong text containing emphasis can lose delimiter characters when switching to source mode. | Retest nested `strong`/`emphasis` combinations and verify Markdown round-trip stability. |
| LF and CRLF | Saving and reopening may add or remove line breaks, producing extra blank lines or losing expected breaks. | Re-audit byte fidelity for LF, CRLF, mixed endings, and newly created documents. |
| Production DevTools | `F12` can open the developer console in a production build. | Decide whether DevTools must require developer mode or an explicit debug launch flag. |
| HTML context menu | Rendered HTML can expose application-level Print/Download actions through the context menu. | Verify the security boundary and disable host actions inside untrusted rendered HTML. |
| Browser shortcuts | `Ctrl+G`, `F5`, and `Ctrl+J` can trigger browser behaviors, while `Ctrl+F` and `Ctrl+G` may open duplicate find surfaces. | Build a shortcut allow/deny audit for WebView2 and WebKitGTK and add browser-native commands to the key-conflict registry. |
| Line-ending policy | The report recommends following the existing file, while new documents should follow the platform, to preserve byte fidelity. | Evaluate migration from the global line-ending setting to per-document preservation. |
| Vim extension | Insert mode initially appeared unavailable with an active IME; visual-mode `G`, `:e`, `:b1`, and Vim search highlighting were incomplete. | Retest against the current Vim plugin and split host bugs from extension bugs. |
| Binary files | Opening a PDF as text, making no edits, and saving could overwrite the file with text content. | Verify the later file-loading hardening and add an explicit reject/read-only path for binary data. |
| Large-file drag and drop | Dragging a large Markdown file could leave only a background process and no window, especially with very long lines. | Re-run with the hardened loader, measure startup and memory, and require a visible error instead of a headless orphan. |
| Source-mode appearance | Source mode still looks visually poor. | This is tracked separately as backlog item 128; collect a screenshot before changing typography or layout. |

## Triage rules

1. Reproduce on current `main`, not on the build named in the original report.
2. Prefer one minimal Markdown file or action sequence per issue.
3. A crash, blank window, data loss, or shortcut escape is P1 even when it is
   difficult to reproduce.
4. Record the exact platform, renderer, settings, and file bytes for any
   remaining issue.
5. Close an item only after an automated regression exists, or document why the
   behavior is an intentional product boundary.
