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

testCase("帮助、日志与警报窗口各有独立 HTML 入口", () => {
  for (const [path, marker] of [
    ["help.html", 'data-window="help"'],
    ["debug-log.html", 'data-window="debug-log"'],
    ["focus-alarm.html", 'data-window="focus-alarm"'],
  ]) {
    const html = read(path);
    contains(html, marker, path);
    contains(html, 'src="/src/main.tsx"', `${path} 共享前端入口`);
  }

  const rust = read("src-tauri/src/commands/window.rs");
  contains(rust, 'WebviewUrl::App("debug-log.html"', "调试窗口不得依赖 fragment");
  contains(rust, 'WebviewUrl::App(format!("help.html?section={section}").into())', "帮助窗口使用查询参数");
  const alarm = read("src-tauri/src/focus/alarm.rs");
  contains(alarm, 'WebviewUrl::App("focus-alarm.html"', "警报窗口不得依赖 fragment");
});

testCase("主入口先读 HTML 标记，再兼容旧 hash", () => {
  const main = read("src/main.tsx");
  contains(main, "document.documentElement.dataset.window", "读取独立入口标记");
  contains(main, 'windowEntry === "help"', "帮助入口");
  contains(main, 'windowEntry === "debug-log"', "日志入口");
  contains(main, 'windowEntry === "focus-alarm"', "警报入口");
});

testCase("动态模块使用相对基址且不依赖 Vite 预加载包装", () => {
  const vite = read("vite.config.ts");
  contains(vite, 'base: "./"', "相对资源基址");
  contains(vite, "modulePreload: false", "关闭不稳定的 modulepreload");
  for (const entry of ["main", "help", "debugLog", "focusAlarm"]) {
    contains(vite, `${entry}:`, `多页面入口 ${entry}`);
  }
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
