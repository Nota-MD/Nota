/** Windows/WebView2 下独立窗口与按需模块的运行时契约。 */

import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail++;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function contains(text: string, part: string, description: string): void {
  if (!text.includes(part)) throw new Error(`${description}：缺少 ${JSON.stringify(part)}`);
}

const read = (path: string) => readFileSync(path, "utf8");

console.log("\n【Windows 运行时入口】");

testCase("日志与警报窗口各有独立 HTML 入口", () => {
  for (const [path, marker] of [
    ["focus-alarm.html", 'data-window="focus-alarm"'],
  ]) {
    const html = read(path);
    contains(html, marker, path);
    contains(html, 'src="/src/main.tsx"', `${path} 共享前端入口`);
  }
  const debugLog = read("debug-log.html");
  contains(debugLog, 'data-window="debug-log"', "debug-log.html");
  contains(debugLog, 'src="/src/debug-log.tsx"', "日志页独立轻量入口");
  contains(read("src/debug-log.tsx"), "<DebugLogWindow />", "独立日志入口挂载");
  const rust = read("src-tauri/src/commands/window.rs");
  contains(rust, "调试窗口选项", "调试窗口必须在独立进程中启动");
  const alarm = read("src-tauri/src/focus/alarm.rs");
  contains(alarm, 'WebviewUrl::App("focus-alarm.html"', "警报窗口不得依赖 fragment");
});

testCase("主入口先读 HTML 标记，再兼容旧 hash", () => {
  const main = read("src/main.tsx");
  contains(main, "document.documentElement.dataset.window", "读取独立入口标记");
  contains(main, 'windowEntry === "focus-alarm"', "警报入口");
});

testCase("动态模块使用相对基址且不依赖 Vite 预加载包装", () => {
  const vite = read("vite.config.ts");
  contains(vite, 'base: "./"', "相对资源基址");
  contains(vite, "modulePreload: false", "关闭不稳定的 modulepreload");
  for (const entry of ["main", "debugLog", "focusAlarm"]) {
    contains(vite, `${entry}:`, `多页面入口 ${entry}`);
  }
  if (vite.includes("help: fileURLToPath")) throw new Error("帮助页仍被构建");
});

testCase("Windows 便携版由无提权的 Nota 单文件启动器承载，并保留更新器入口", () => {
  const launcher = read("tools/windows-portable-launcher.c");
  const manifest = read("tools/windows-portable-launcher.manifest");
  const resources = read("tools/windows-portable-launcher.rc");
  const recipe = read("tools/make-windows-portable.sh");
  contains(launcher, "CreateProcessW", "便携启动器没有运行 Nota");
  contains(manifest, 'requestedExecutionLevel level="asInvoker"', "便携启动器请求提权");
  contains(resources, 'src-tauri/icons/icon.ico', "便携启动器没有 Nota 图标");
  contains(recipe, "windows-portable-launcher.c", "构建脚本没有使用自有启动器");
  contains(recipe, "NOTA_BUILD_ID", "构建脚本没有为便携缓存生成唯一标识");
  const updateManifest = read("tools/make-update-manifest.mjs");
  contains(updateManifest, "_x64-portable\\.(?:exe|zip)", "更新清单不认单文件便携 EXE");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
