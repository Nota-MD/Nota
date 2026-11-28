# 14 - Distribution Profiles

Last synchronized: 2026-11-27

Distribution profiles are build-time configuration for official Nota and
organization-branded distributions. A profile does not change the editor,
Markdown format, settings file schema, or Lua capability model.

## Profile layout

```text
distributions/
  official/distribution.json
  example-university/
    distribution.json
    assets/
```

The official application is the `official` profile. Organization profiles use
the same schema and build pipeline.

## Build

```sh
npm run build:dist -- official
npm run build:dist -- example-university
```

`node tools/build-dist.mjs <profile> --dry-run` validates and generates the
temporary Tauri configuration without compiling. Generated files are kept under
`src-tauri/target/distribution-build/`.

The profile controls:

- product name, binary name, identifier, publisher and data directory;
- application icon, About logo and default accent;
- first-run defaults;
- optional embedded settings backup;
- optional bundled extension packages;
- upstream license, distribution license and organization notice;
- update manifest and release prefixes;
- localized static HTML onboarding pages.

## Bootstrap

When `bootstrap.backup` is present, the embedded settings package is validated
and applied once before `Settings::load()` on the first profile launch. A
successful import writes a revisioned completion marker. Later launches and
updates preserve the user's current settings, themes, extension selections and
onboarding state; the embedded package is not re-applied. If either user
settings or the completion marker already exists, bootstrap is skipped.
Credentials and trusted signing keys must not be embedded in a public
organization build.

Embedded extension packages are installed through the normal package validation
path. They do not gain capabilities beyond their `plugin.toml` declaration.

Settings packages can also be imported manually from Settings -> General. The
file picker opens immediately, and inspection happens before writing.
Extension settings, plugin data and optional `.nota-plugin` packages are
selected independently during export. Imported installable packages still pass
through the normal manifest, API, signature and capability validation path.
Sensitive categories are unselected by default, selected files are staged, and
existing files are copied to a timestamped import backup before replacement.

## Onboarding and legal HTML

Onboarding and notice files are static HTML. Scripts, forms, iframes, event
handlers, remote executable content, and permission-sensitive browser APIs are
rejected by the build validator and sanitized again by the WebView.

The upstream Nota license remains available even when a profile provides a
distribution-specific license.

## Updates

The update manifest and package prefix are compiled into the distribution.
Profiles without an update source do not fall back to the official release
channel. Package URLs must remain under the configured release prefix.
