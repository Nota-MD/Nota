# Distribution Profiles

Distribution profiles are build-time inputs. They do not change the Markdown
format, extension capability model, or user documents at runtime.

## Layout

```text
distributions/
  official/
    distribution.json
  example-university/
    distribution.json
    assets/
```

## Build

```sh
npm run build:dist -- official
npm run build:dist -- example-university
```

The generated Tauri configuration and resources stay under
`src-tauri/target/distribution-build/<id>/`. The normal official build remains
available through `npm run build`.

## Rules

- A profile must declare a unique application identifier and data directory.
- Organization profiles must not use the official identifier or data directory.
- URLs must use HTTPS.
- Asset paths must stay inside the profile directory.
- Onboarding HTML is static. Scripts, forms, iframes, event-handler attributes,
  and remote executable content are rejected.
- The upstream Nota license and third-party notices remain included.
- A profile without an update manifest disables online updates.
