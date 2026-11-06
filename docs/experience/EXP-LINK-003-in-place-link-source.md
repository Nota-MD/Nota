---
id: EXP-LINK-003
area: editor-links
status: adopted
related:
  - src/editor/link-source-reveal.ts
  - src/editor/url-link.ts
  - src/editor/assemble.ts
  - e2e/main.ts
  - tests/url-link.test.ts
references:
  - Textus linkRevealPlugin
  - Typedown link.js
---

# Edit link Markdown in place

## Symptom

A transparent input overlay could not reliably place the caret after `.com`,
hold Left without reactivating at the link boundary, or apply Ctrl+A to the
document.

## Root cause

The overlay was not part of the document selection model. DOM caret mapping and
the ProseMirror source range could disagree by one character.

The first native-node version exposed a second issue: the explicit-link
append transaction recognized the newly revealed `[label](url)` text as a
completed link and immediately collapsed it back. This made the source node
transient and moved the caret into the label.

## Decision

When the caret touches a link, replace the linked run with one code-like inline
node containing the real Markdown source. Parse that source back into a link
when the caret leaves.

This follows Textus. Typedown uses the same broad principle: source tokens and
caret offsets are the authority, not an overlay control.

## Invariants

- Source editing is a real transaction.
- Native selection, IME, Ctrl+A, and undo remain available.
- The document caret stays visible inside the source node.
- Caret positions before and after the closing `)` stay distinct.
- Leaving malformed source produces plain text, never a broken link.
- Explicit-link recognition ignores source-node boundaries.

## Evidence

- Link source appears in place and accepts text before `)`.
- Leaving the source reparses the edited destination.
- Ctrl+A inside the source selects the whole document.
- Continuous Left exits the link and stops at the paragraph start.
- First Left at a rendered link tail reveals the source with the caret after
  `)`; the next Left enters the destination end.
