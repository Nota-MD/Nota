# Menu harness

This is a developer tool, not product code. It is not included in the production
Vite build and is not part of any package script.

Tauri keyboard events are difficult to inspect inside a headless container
without a window manager. The harness mounts the real `MenuBar` and related
components from `src/ui/` in an ordinary web page so headless Chrome can inspect
DOM output, keyboard focus and screenshots.

The harness imports production components through the same `@` alias. It does
not contain copies of product UI code.

## Run

Inside the `tauri-dev` container:

```sh
npx vite build --config tools/menu-harness/vite.config.ts
python3 -m http.server 8777 --directory tools/menu-harness/dist
```

The server root is `dist/`, so URLs do not include `dist/`.

Inspect the generated DOM:

```sh
google-chrome --headless --disable-gpu --virtual-time-budget=3000 --dump-dom \
  'http://127.0.0.1:8777/#frontmatter'
```

The harness writes precise assertion strings into:

```html
<pre id="harness-report" ...>
```

Use a regex that accepts attributes when extracting it. Reading screenshots is
appropriate only for visual properties such as menu spacing, submenu placement
and dark-theme contrast.

Capture a screenshot:

```sh
google-chrome --headless --disable-gpu --screenshot=/tmp/menu.png \
  --window-size=1280,900 --virtual-time-budget=3000 \
  'http://127.0.0.1:8777/#subopen'
```

Scenes that create a real editor need a longer virtual-time budget. Fifteen
seconds is sufficient for `#frontmatter`; three seconds is enough for pure
function scenes such as `#accel` and `#native`.

## Type checking

Run this after changing props or imports used by the harness:

```sh
npx tsc --noEmit -p tools/menu-harness
```

The root TypeScript configuration does not include `tools/`, and Vite transpiles
without type checking. This separate check catches props that compile but fail at
runtime.

## Scenes

| Hash | Purpose |
|---|---|
| `#accel` | Keyboard parsing, display formatting and accelerator-index warnings |
| `#native` | Native menu tree shape passed to Rust |
| `#theme` | Dynamic theme entries and keyboard focus |
| `#submenu` | Nested submenu focus and close behavior |
| `#subopen` | Submenu left open for screenshots |
| `#sidebar` | Real sidebar with outline and workspace fixtures |
| `#sidebar-empty` | Empty workspace state |
| `#math` | Physics macro rendering and equivalence checks |
| `#frontmatter` | Front-matter parsing, editor round trip and read-only behavior |
| `#dark` / `#ghub-dark` | Dark appearance checks |
| Other | Default file-menu keyboard navigation |

Hash parts are separated by `-`. For example, use `#dark-adwaita-dark` for the
dark appearance with the Adwaita style.

The harness proves DOM shape, data transformations and layout. It does not prove
that the same behavior is wired correctly in a real Tauri window. Both checks are
required.
