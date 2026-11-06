# Nota experience notes

Use this directory for durable engineering lessons: observed bugs, rejected
approaches, platform behavior, and handfeel decisions.

## Format

- Use Markdown files only.
- Use a stable ID such as `EXP-LINK-003`.
- Keep the English concise and concrete.
- Put a short invariant near the code; put the full history here.
- Link affected source files and tests.

## Naming

```text
EXP-<AREA>-<NNN>-<short-name>.md
```

Examples:

```text
EXP-EDIT-004-hidden-delimiter-tokens.md
EXP-LINK-003-in-place-link-source.md
EXP-IME-002-webkit-composition-anchor.md
```

## Template

```markdown
---
id: EXP-LINK-003
area: editor-links
status: adopted
related:
  - src/editor/link-source-reveal.ts
---

# Title

## Symptom

What the user saw.

## Root cause

The verified mechanism.

## Decision

What Nota does now.

## Evidence

Tests and platform observations.
```
