/**
 * 试验台自己的 vite 配置。**临时文件，不是产品代码。**
 *
 * 只为了 `vite build` 出一个静态页，交给系统 Chrome 无头截图。
 * 和仓库根那份 `vite.config.ts` 的差别只有两处，都是刻意的：
 *   - `root` 指到这个目录（那份的 root 是仓库根）；
 *   - 没有固定端口 / HMR（截图走的是 `build`，不起 dev server）。
 * `@` 别名**照抄**根那份——试验台 import 的是 `src/` 里的真组件，
 * 别名对不上就什么都挂不起来。
 */

import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../src", import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL("./dist", import.meta.url)),
    emptyOutDir: true,
    target: "es2021",
  },
});
