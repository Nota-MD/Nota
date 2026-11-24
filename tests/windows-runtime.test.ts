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

testCase("Utility windows use dedicated HTML entries", () => {
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
  const settings = read("settings.html");
  contains(settings, 'data-window="settings"', "settings.html");
  contains(settings, 'src="/src/settings-window.tsx"', "设置页独立轻量入口");
  contains(read("src/settings-window.tsx"), "<SettingsWindow />", "独立设置入口挂载");
  const about = read("about.html");
  contains(about, 'data-window="about"', "about.html");
  contains(about, 'src="/src/about-window.tsx"', "关于页独立轻量入口");
  contains(read("src/about-window.tsx"), "<AboutWindow />", "独立关于入口挂载");
  contains(
    read("src/ui/useDocThemeInventory.ts"),
    "useEffect(() => {",
    "设置等辅助窗口没有自动扫描文档主题",
  );
  contains(
    read("src/ui/SettingsWindow.tsx"),
    "api.frontendReady()",
    "独立设置页没有启动扩展发现握手",
  );
  const windowCommand = read("src-tauri/src/commands/window.rs");
  const runtime = read("src-tauri/src/lib.rs");
  const host = read("src-tauri/src/window_host.rs");
  for (const role of ["Editor", "Settings", "About", "DebugLog"]) {
    contains(host, role, `统一窗口角色缺少 ${role}`);
  }
  contains(host, "READY_ENV", "独立窗口缺少 ready 握手");
  contains(host, "READY_TIMEOUT", "独立窗口缺少 ready 超时");
  contains(host, "NOTA_WINDOW_ROLE", "独立窗口缺少环境变量角色兜底");
  contains(host, "background_command", "统一窗口模块没有使用后台进程启动器");
  contains(windowCommand, "window_host::launch(WindowRole::Settings", "设置命令未走统一窗口模块");
  contains(windowCommand, "window_host::launch(WindowRole::About", "关于命令未走统一窗口模块");
  contains(windowCommand, "window_host::launch(WindowRole::DebugLog", "日志命令未走统一窗口模块");
  contains(windowCommand, "window_host::launch(WindowRole::Editor", "新窗口命令未走统一窗口模块");
  if (windowCommand.includes("WebviewWindowBuilder")) {
    throw new Error("独立窗口命令仍直接创建 WebviewWindow");
  }
  contains(
    windowCommand,
    "pub fn nota_window_prepare_settings(_app: tauri::AppHandle)",
    "Windows 设置预热没有变成无操作",
  );
  contains(
    windowCommand,
    "pub fn nota_window_prepare_about(_app: tauri::AppHandle)",
    "Windows 关于窗口预热没有变成无操作",
  );
  contains(runtime, "window_host::current_role", "运行入口没有读取统一窗口角色");
  contains(runtime, "window_host::signal_ready", "子进程页面加载后没有报告 ready");
  contains(
    runtime,
    "role.page()",
    "子进程没有根据窗口角色加载页面",
  );
  if (runtime.includes("index.html?settings=1")) {
    throw new Error("设置进程仍会先启动完整编辑器页面");
  }
  contains(
    runtime,
    "standalone_settings_window",
    "设置进程没有独立的最小初始化分支",
  );
  contains(
    runtime,
    'PathBuf::from("nota-settings-webview")',
    "设置子进程与主程序共用了 WebView2 数据目录",
  );
  contains(
    runtime,
    'utility_window && window.label() == "main"',
    "独立设置进程的原生关闭按钮没有退出该进程",
  );
  contains(read("src-tauri/src/settings_watch.rs"), "settings reloaded from external window", "设置子进程修改没有同步回主进程");
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
  for (const entry of ["main", "about", "settings", "debugLog", "focusAlarm"]) {
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

testCase("diagnostic console build tails the shared log from an independent process", () => {
  const cargo = read("src-tauri/Cargo.toml");
  const main = read("src-tauri/src/main.rs");
  contains(cargo, "diagnostic-console = []", "diagnostic build feature");
  contains(main, "Get-Content -LiteralPath", "live log console");
  contains(main, '"-NoExit"', "console remains open after startup");
  contains(main, "set_debug_mode(true)", "diagnostic build does not enable full logging");
  contains(main, '"--settings-window"', "utility children would spawn extra consoles");
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
