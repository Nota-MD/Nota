import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { woff2OnlyFonts } from "./tools/woff2-fonts";

// Tauri uses a fixed development port referenced by `devUrl`.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), woff2OnlyFonts()],

  // Windows serves bundled assets through `http://tauri.localhost`. A relative
  // base resolves entry HTML, static assets and lazy chunks from the page.
  base: "./",

  resolve: {
    // `@/...` maps to `src/...`. Keep this aligned with `tsconfig.json` paths.
    alias: [
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
      {
        // The package index exports both syntax and HTML extensions. The HTML
        // branch imports KaTeX eagerly; the editor only needs the syntax branch.
        find: /micromark-extension-math\/lib\/html\.js$/,
        replacement: fileURLToPath(
          new URL("./src/editor/micromark-math-html-placeholder.ts", import.meta.url),
        ),
      },
    ],
  },

  // Fail when the fixed port is occupied instead of selecting another port that
  // `devUrl` does not target.
  clearScreen: false,
  server: {
    port: 5273,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 5274 } : undefined,
    watch: {
      // Cargo watches `src-tauri`; Vite does not.
      ignored: ["**/src-tauri/**"],
    },
  },

  // Target syntax supported by WebKitGTK 4.1 so older WebViews do not fail.
  build: {
    target: "es2021",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // Settings and KaTeX are lazy modules. Avoid Vite's modulepreload wrapper,
    // which can fail under the Windows custom protocol. Native dynamic import
    // already loads dependencies in parallel.
    modulePreload: false,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        about: fileURLToPath(new URL("./about.html", import.meta.url)),
        settings: fileURLToPath(new URL("./settings.html", import.meta.url)),
        debugLog: fileURLToPath(new URL("./debug-log.html", import.meta.url)),
        focusAlarm: fileURLToPath(new URL("./focus-alarm.html", import.meta.url)),
      },
    },
  },
  define: {
    __NOTA_DISTRIBUTION__: JSON.stringify(
      (() => {
        const path =
          process.env.NOTA_DISTRIBUTION_PROFILE ??
          fileURLToPath(
            new URL("./distributions/official/distribution.json", import.meta.url),
          );
        const profile = JSON.parse(readFileSync(path, "utf8"));
        const resources = profile.resources ?? {};
        return {
          schemaVersion: profile.schemaVersion,
          kind: profile.kind,
          id: profile.id,
          identity: profile.identity,
          branding: profile.branding,
          defaults: profile.defaults,
          legal: profile.legal,
          updates: profile.updates,
          onboarding: profile.onboarding,
          resources,
        };
      })(),
    ),
  },
});
