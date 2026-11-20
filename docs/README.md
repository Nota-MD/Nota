# Nota documentation

[`../AGENTS.md`](../AGENTS.md) is the primary entry point. This file expands its
documentation index and explains reading order and authority.

Contribution and AI rules are in [`../CONTRIBUTING.md`](../CONTRIBUTING.md).
Core mandatory rules are in [`../CORE_RULES.md`](../CORE_RULES.md). Durable
engineering lessons are in [`../DEVELOPMENT_EXPERIENCE.md`](../DEVELOPMENT_EXPERIENCE.md).

## Reading paths

Do not read every document in numeric order. Choose the path that matches the
task.

### A. Change application code

```text
AGENTS.md              -> rules, code map and platform constraints
  |
01-architecture.md     -> runtime structure and startup sequence
  |
02-modules.md          -> file-level interfaces and responsibilities
  |
07A-current-status.md  -> current release facts and active queue
  |
07-feature-status.md   -> permanent identifiers, evidence and history
```

Always check `07A-current-status.md` and `07-feature-status.md` before concluding
that a visible control is wired and functional.

### B. Change the interface

```text
04-ui-map.md             -> control tree, callbacks and current state
  |
05-editor-bridge.md      -> Milkdown assembly and frontend/backend channels
  |
08-development-guide.md  -> step-by-step UI and feature recipes
  |
09-doc-sync-policy.md    -> required documentation updates
```

### C. Write a plugin

```text
11-writing-a-plugin.md  -> layout, manifest, capabilities and lifecycle
  |
13-lua-api.md            -> nota.* tables and functions
  |
12-plugin-runtime.md     -> Lua runtime and sandbox boundaries
```

The Git plugin in the adjacent `Nota-plugins/plugins/git/` repository is a
working reference implementation. Plugin source is not part of this repository
and is not bundled with application installers. References to
`plugins/<id>/...` in this repository refer to that separate repository.

## Document index

| ID | Document | Authority |
|---|---|---|
| - | [`../AGENTS.md`](../AGENTS.md) | Primary entry point, code map, build commands and platform constraints |
| 01 | [`01-architecture.md`](01-architecture.md) | Runtime boundaries, startup order, event flow and lock order |
| 02 | [`02-modules.md`](02-modules.md) | File-level interface reference |
| 03 | [`03-data-structures.md`](03-data-structures.md) | `AppState`, `Document`, `Settings` and `Manifest` fields and constants |
| 04 | [`04-ui-map.md`](04-ui-map.md) | Control tree, callbacks, current state and target behavior |
| 05 | [`05-editor-bridge.md`](05-editor-bridge.md) | Milkdown assembly, IPC channels, debounce behavior and whole-document replacement |
| 06 | [`06-build-run-test.md`](06-build-run-test.md) | Dependencies, builds, debugging, headless inspection and test recipes |
| 07 | [`07-feature-status.md`](07-feature-status.md) | Permanent defect and backlog identifiers, evidence, history and audit trail |
| 07A | [`07A-current-status.md`](07A-current-status.md) | Current release facts and active execution queue |
| 08 | [`08-development-guide.md`](08-development-guide.md) | Recipes for UI, commands, events, plugins and settings |
| 09 | [`09-doc-sync-policy.md`](09-doc-sync-policy.md) | Mandatory source-to-documentation mapping |
| 10 | [`10-feature-matrix.md`](10-feature-matrix.md) | Authoritative Markdown editor feature matrix |
| 11 | [`11-writing-a-plugin.md`](11-writing-a-plugin.md) | Plugin layout, manifest, capabilities, lifecycle and build integration |
| 12 | [`12-plugin-runtime.md`](12-plugin-runtime.md) | Lua runtime, isolated states and sandbox boundaries |
| 13 | [`13-lua-api.md`](13-lua-api.md) | Lua API reference for `nota.*` |
| Experience | [`../DEVELOPMENT_EXPERIENCE.md`](../DEVELOPMENT_EXPERIENCE.md) | Durable engineering lessons and rejected approaches |
| Reference | [`reference/cde-menu-pixel-fidelity.md`](reference/cde-menu-pixel-fidelity.md) | CDE/Motif menu comparison and pixel-fidelity evidence |
| Reference | [`reference/theme-package-spec.md`](reference/theme-package-spec.md) | Theme package layout, selectors, variables, assets and Typora compatibility |
| Reference | [`reference/typora-theme-compatibility.md`](reference/typora-theme-compatibility.md) | Typora theme compatibility tests and known differences |

## Documents that challenge assumptions

Most documents are descriptive. These documents are authoritative when they
contradict an assumption about readiness:

| Document | Question it answers |
|---|---|
| `07` | Is the feature implemented, wired and verified in the real UI? |
| `10` | Which editor features are complete, partial, missing or intentionally unsupported? |
| `09` | Is the change actually complete, including its documentation updates? |

## Conventions

- Documents use stable numeric IDs (`01` through `13`). Source comments may cite
  those IDs.
- Backlog and BUG identifiers are permanent. Do not delete or reuse them.
- Every document records its last synchronization date near the top. Update the
  date when changing the document.
- If documentation and code disagree, code is authoritative. Correct the
  documentation in the same change and record the drift in `07`.
