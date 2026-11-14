# EXP-COUNT-001: Typora-compatible word count

## Symptom

For the same Chinese and English mixed document, Nota reported 893 words while
Typora reported 929. Characters, lines, and reading time already matched.

## Cause

Nota accumulated Unicode letter and number runs. Typora uses a different
regex pipeline: selected CJK UTF-16 ranges count one per code unit, apostrophe
words are normalized, standalone Markdown punctuation is removed, and the
remaining text is split by a fixed ASCII punctuation table.

## Rule

- Keep the frontend `countText().words` and backend `stats().words` identical.
- Port Typora's expression literally; do not tune an offset for one document.
- Preserve the existing code-point character count and line count.
- The two sentinel tokens in Typora's algorithm are required to handle leading
  and trailing separators.

## Verification

- The reported fixture produces `2184 characters, 929 words, 50 lines, 2 min`.
- `tests/count-text.test.ts` covers punctuation-only markers, underscores,
  dots, slashes, apostrophes, and mixed CJK/Latin text.
- `lua::api::document::tests` covers the backend copy used by Writing Stats.
