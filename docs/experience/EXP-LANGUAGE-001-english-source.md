# EXP-LANGUAGE-001: English-only production source

## Rule

Production code uses English identifiers, comments, and internal literals.
Chinese belongs in localization files, content resources, or test data.

## Why

- Mixed-language identifiers break search, tooling, and review consistency.
- Error strings embedded in Rust bypass the frontend translation system.
- English-only code makes future API extraction and cross-repository work safer.

## Migration order

1. Add an audit that rejects new violations.
2. Clean leaf modules with few callers.
3. Rename shared identifiers with compiler assistance.
4. Move user-visible strings into localization resources.
5. Remove the legacy baseline only after every production file is clean.

## Safety

Rename without changing behavior. Run the full test suite after each batch.
Do not combine large identifier churn with feature work.
