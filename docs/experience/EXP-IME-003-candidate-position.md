# EXP-IME-003: Native IME candidate position

## Symptom

After scrolling the document, the fcitx5 candidate window appeared near the
bottom-right of the window while the caret remained in the text.

## Cause

Tauri 2 / WebKitGTK can retain a stale document-space cursor rectangle for the
input method context. The composition still commits correctly, but the native
candidate UI is anchored elsewhere.

## Rule

- Send the focused editor's viewport-space caret rectangle to WebKitGTK.
- Refresh it on focus, selection changes, composition updates, scroll, and
  resize.
- Use `InputMethodContextExt::notify_cursor_area`; do not dispatch a document
  transaction just to move the native candidate window.
- Keep browser-only previews tolerant because they have no native bridge.

## Regression checks

- `tests/ime-cursor.test.ts` validates coordinate normalization.
- A real Linux window must be checked with fcitx5 after scrolling and while
  composing Chinese text.
