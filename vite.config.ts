import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri 约定：dev 时固定端口，供 src-tauri/tauri.conf.json 的 devUrl 指向。
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],

  resolve: {
    // `@/…` → `src/…`。**必须与 tsconfig.json 的 paths 保持一致**——
    // 两处不一致时的表现是：`tsc` 过了、`vite build` 挂了（或者反过来）。
    alias: [
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
      {
        // `micromark-extension-math` 的 index 同时导出语法与 HTML 扩展，而
        // HTML 扩展在顶层静态导入 KaTeX。编辑器只用语法；把这个未使用的分支
        // 换掉后，KaTeX 才能留在后台 chunk 里。
        find: /micromark-extension-math\/lib\/html\.js$/,
        replacement: fileURLToPath(
          new URL("./src/editor/micromark-math-html-placeholder.ts", import.meta.url),
        ),
      },
    ],
  },

  // Tauri 期望一个固定端口，端口被占用时**直接失败**而不是悄悄换一个
  // （换端口会让 Tauri 的 devUrl 指向空处）。
  clearScreen: false,
  server: {
    port: 5273,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 5274 } : undefined,
    watch: {
      // src-tauri 由 cargo 自己盯着，vite 不用管。
      ignored: ["**/src-tauri/**"],
    },
  },

  // Tauri 用的是 WebKitGTK（webkit2gtk-4.1）。目标定在它能稳吃的语法上，
  // 免得 esbuild 吐出新语法在旧 WebKit 上白屏。
  build: {
    target: "es2021",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
