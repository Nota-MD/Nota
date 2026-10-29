/** 原生风格调试日志窗口的实时滚动、纯黑白样式和保底入口。 */

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
function assertValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function contains(text: string, part: string, message: string): void {
  assertValue(text.includes(part), `${message}：缺少 ${part}`);
}

const read = (path: string) => readFileSync(path, "utf8");
const windowSource = read("src/ui/DebugLogWindow.tsx");
const css = read("src/styles/debug-log.css");

console.log("\n【实时调试日志窗口】");

testCase("每 400ms 读取日志增量，并跟随到底部", () => {
  contains(windowSource, "window.setInterval(() => void read(), 400)", "400ms 轮询");
  contains(windowSource, "offset.current = chunk.offset", "记录字节偏移");
  contains(windowSource, "pre.scrollTop = pre.scrollHeight", "实时跟随");
  contains(windowSource, "follow.current =", "用户向上滚动后停止抢滚动");
});

testCase("日志页使用独立轻量入口，不再加载主应用", () => {
  contains(read("debug-log.html"), 'src="/src/debug-log.tsx"', "独立日志入口");
  contains(read("src/debug-log.tsx"), "<DebugLogWindow />", "日志组件挂载");
  assertValue(!read("src/main.tsx").includes("DebugLogWindow"), "主入口仍引用日志窗口");
  assertValue(!read("src/main.tsx").includes('windowEntry === "debug-log"'), "主入口仍有日志分支");
});

testCase("窗口固定英文，不进入翻译系统", () => {
  contains(windowSource, "RAW DEBUG LOG", "英文标题");
  contains(windowSource, "SHOW DIAGNOSTICS", "系统信息按钮");
  contains(windowSource, "SHOW LOG", "切回日志按钮");
  contains(windowSource, "api.diagnostics.collect()", "读取编译与系统信息");
  contains(windowSource, 'view === "log" ? (', "日志与诊断原地切换");
  contains(windowSource, "COPY ALL", "复制动作");
  contains(windowSource, "EXPORT .LOG", "导出动作");
  contains(windowSource, "raw-debug-actions", "复制与导出按钮没有成组靠右");
  contains(css, "margin-left: auto", "右侧按钮组没有推到最右侧");
  assertValue(!windowSource.includes("@/i18n"), "日志窗口引入了翻译");
});

testCase("配色只有硬黑底白字", () => {
  contains(css, "background: #000", "黑底");
  contains(css, "color: #fff", "白字");
  assertValue(!/#(?:111|222|555|777|bbb|d7ffd0|d6d3c8|c0beb5)/i.test(css), "仍含杂色");
  contains(css, "border-radius: 0", "方角");
});

testCase("日志窗口在独立进程启动，不再给主进程追加 WebView", () => {
  const rust = read("src-tauri/src/commands/window.rs");
  const cli = read("src-tauri/src/cli.rs");
  const helper = read("src-tauri/src/debug_log.rs");
  contains(read("debug-log.html"), 'data-window="debug-log"', "日志入口标记");
  contains(read("debug-log.html"), 'src="/src/debug-log.tsx"', "日志页独立轻量入口");
  contains(read("src/debug-log.tsx"), "<DebugLogWindow />", "独立日志入口挂载");
  contains(rust, ".arg(crate::cli::调试窗口选项)", "独立日志进程");
  assertValue(!rust.includes("WebviewWindowBuilder::new"), "主进程仍创建辅助 WebView");
  contains(cli, '--debug-log-window', "实时日志窗口模式");
  contains(cli, '--debug-log', "快照模式保留");
  contains(helper, "open::that", "系统默认查看器");
});

testCase("后端日志同时写入持久文件，并提供增量读取命令", () => {
  const log = read("src-tauri/src/log.rs");
  const commands = read("src-tauri/src/commands/diagnostics.rs");
  const lib = read("src-tauri/src/lib.rs");
  const bridge = read("src/bridge/ipc.ts");
  contains(log, "nota-debug.log", "持久日志路径");
  contains(log, "OpenOptions::new()", "追加写入");
  contains(log, "pub fn 读取增量", "增量读取");
  contains(commands, "nota_debug_log_read", "IPC 命令");
  contains(commands, "nota_debug_log_write", "前端事件写入命令");
  contains(lib, "commands::diagnostics::nota_debug_log_write", "写入命令注册");
  contains(bridge, "nota_debug_log_write", "前端写入桥接");
});

testCase("生命周期日志覆盖启动、编辑器、文档、主题与插件，但不记录每次输入", () => {
  const startup = read("src/ui/useStartup.ts");
  const editor = read("src/ui/EditorPane.tsx");
  const documents = read("src/ui/useDocuments.ts");
  const theme = read("src/ui/useDocTheme.ts");
  const plugins = read("src-tauri/src/plugin/mod.rs");
  contains(startup, '"settings ready"', "启动设置");
  contains(startup, '"session restore finished"', "会话恢复");
  contains(editor, '"editor ready"', "编辑器就绪");
  contains(editor, '"editor disposed"', "模式/文档切换");
  contains(documents, '"open failed"', "文档打开失败");
  contains(documents, '"save failed"', "文档保存失败");
  contains(theme, '"document theme applied"', "文档主题装载");
  contains(plugins, "plugin loaded:", "插件加载");
  contains(plugins, "plugin failed:", "插件失败");
  assertValue(!startup.includes("onChange"), "启动日志不应逐次记录正文变化");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
