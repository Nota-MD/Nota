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
  contains(rust, "DEBUG_WINDOW_FLAG", "调试窗口必须在独立进程中启动");
  contains(rust, "SETTINGS_WINDOW_FLAG", "设置窗口必须在独立进程中启动");
  contains(rust, "background_command", "独立窗口没有使用无控制台的进程启动器");
  if (rust.includes("create_settings_window")) {
    throw new Error("Windows 仍在主进程内创建辅助设置 WebView");
  }
  const cli = read("src-tauri/src/cli.rs");
  contains(cli, 'pub const SETTINGS_WINDOW_FLAG: &str = "--settings-window"', "缺少设置窗口进程参数");
  const windowCommand = read("src-tauri/src/commands/window.rs");
  contains(
    windowCommand,
    '#[cfg(not(target_os = "windows"))]\n#[tauri::command]\npub fn nota_window_open_settings(app: tauri::AppHandle)',
    "非 Windows 设置窗口快速路径丢失",
  );
  contains(
    windowCommand,
    '#[cfg(target_os = "windows")]\n#[tauri::command]\npub fn nota_window_open_settings(_app: tauri::AppHandle)',
    "Windows 设置窗口没有走独立进程",
  );
  contains(
    windowCommand,
    "open_settings_process(true)",
    "Windows 没有直接启动设置进程",
  );
  contains(
    windowCommand,
    "open_settings_process(false)",
    "非 Windows 设置窗口缺少进程回退",
  );
  contains(
    windowCommand,
    "pub fn nota_window_prepare_settings(_app: tauri::AppHandle)",
    "Windows 设置预热没有变成无操作",
  );
  contains(
    windowCommand,
    "fn ensure_settings_window",
    "非 Windows 设置窗口创建入口丢失",
  );
  const ipc = read("src/bridge/ipc.ts");
  contains(ipc, "prepareSettings: () => invoke", "前端没有设置窗口预热接口");
  const utility = read("src/ui/useUtilityWindows.tsx");
  contains(utility, "api.window.prepareSettings()", "启动后没有预热设置窗口");
  contains(utility, "}, 700)", "设置窗口预热没有延后到启动稳定之后");
  const runtime = read("src-tauri/src/lib.rs");
  contains(runtime, "opens_debug_window || standalone_settings_window", "设置进程仍会撞上主实例");
  contains(runtime, "index.html?settings=1", "设置进程没有独立页面导航");
  contains(
    runtime,
    'standalone_settings_window && window.label() == "main"',
    "独立设置进程的原生关闭按钮没有退出该进程",
  );
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

testCase("Linux GTK4 dialog helper keeps a Windows-targetable entry point", () => {
  const helper = read("src-tauri/src/bin/nota-gtk4-dialogs.rs");
  contains(helper, '#[cfg(target_os = "linux")]', "GTK4 implementation is not Linux-gated");
  contains(
    helper,
    '#[cfg(not(target_os = "linux"))]\nfn main()',
    "Windows compilation would produce a crate without main",
  );
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
