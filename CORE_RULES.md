# Core rules

These rules are mandatory for every source change.

1. Production identifiers must be ASCII English.
   This includes variables, functions, types, traits, modules, constants,
   parameters, fields, properties, command names, IPC keys, and API names.
2. Production source must not contain hard-coded Chinese.
   User-facing Chinese belongs in `src/i18n/zh-*.ts`, plugin `lang/zh-*.toml`,
   or bundled notice/document files.
3. Comments in source code must be concise English.
   Put durable rationale in `DEVELOPMENT_EXPERIENCE.md` instead of long code comments.
4. Tests may contain Chinese input and expected data.
   Test names, helper identifiers, assertions, and comments remain English.
5. Existing violations are migration debt.
   Do not add new violations. Clean touched files and record remaining debt in
   `docs/07-feature-status.md`.
6. Every language cleanup must be behavior-neutral.
   Lock behavior with tests before renaming shared identifiers or moving
   user-facing strings.
7. Do not add emoji to source code, comments, or English documentation.
8. New documentation is concise English unless it is an explicit translation
   resource.

## Exceptions

- Localization files and translation resources.
- Explicit CJK parsing tests or character-class data with a nearby reason.
- Third-party fixtures whose bytes must remain unchanged.

## Review checklist

- No Han characters in production identifiers.
- No Han characters in comments.
- No hard-coded Chinese outside localization resources or approved test data.
- Compile, type check, and relevant tests pass after renames.
