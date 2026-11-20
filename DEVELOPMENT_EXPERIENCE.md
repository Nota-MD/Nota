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
