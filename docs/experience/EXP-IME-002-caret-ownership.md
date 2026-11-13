# EXP-IME-002: Caret ownership during IME composition

## Symptom

A Chinese or Japanese IME could keep its candidate window interactive while the
Nota caret stayed at the composition start or dropped onto a later visual line.
Code blocks could show the same split between the text line and the custom
caret.

## Cause

Nota hides native carets and paints its own caret for stable blinking. That
overlay is positioned from ProseMirror coordinates, which do not advance for
every IME preedit update. CodeMirror used a separate `1.2em` inline widget; on
WebKit that widget could participate in line-box layout and appear one line
below the source.

## Rule

- The IME owns the native caret for the complete `compositionstart` through
  `compositionend` interval.
- Hide the ProseMirror overlay and every embedded CodeMirror caret widget during
  that interval.
- Restore the normal custom caret only after the committed edit has settled.
- Bind the code-block caret to a real neighbouring character (or to the line
  for an empty line) with a mark decoration. Paint its bar with a pseudo-element.
  Do not place a widget at the end position: WebKit can lay that widget out on
  the following visual line.
- Never move the candidate window by dispatching a document transaction from a
  preedit event.

## Regression checks

- `tests/blink-caret.test.ts` covers composition class ownership.
- `tests/code-block-language-focus.test.ts` covers the code-block composition
  handoff and zero-size caret anchor.
- `e2e/main.ts` covers the real editor composition interval.
