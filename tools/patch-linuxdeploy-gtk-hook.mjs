import { readFileSync, writeFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("usage: node tools/patch-linuxdeploy-gtk-hook.mjs <linuxdeploy-plugin-gtk.sh>");
  process.exit(2);
}

const marker = "# nota-appimage-runtime-compatibility";
const compatibility = `

${marker}
if [ "\${GTK_IM_MODULE:-}" = "wayland" ]; then
    export GTK_IM_MODULE=xim
fi
GIO_MODULE_DIR="$(find "$APPDIR/usr/lib" -type d -path "*/gio/modules" -print -quit 2>/dev/null || true)"
if [ -n "$GIO_MODULE_DIR" ]; then
    export GIO_MODULE_DIR
    export GIO_EXTRA_MODULES="$GIO_MODULE_DIR"
fi
`;

const source = readFileSync(path, "utf8");
if (!source.includes("export GDK_BACKEND=x11")) {
  throw new Error("The linuxdeploy GTK hook no longer forces the X11 backend");
}
if (!source.includes(marker)) {
  writeFileSync(path, `${source.trimEnd()}${compatibility}\n`);
}
