/** 更新页终止按钮与安装器参数的界面契约。 */

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

function assertValue(value: unknown, description: string): asserts value {
  if (!value) throw new Error(description);
}

const read = (path: string) => readFileSync(path, "utf8");
const pane = read("src/ui/SoftwareUpdatePane.tsx");
const update = read("src-tauri/src/update.rs");

console.log("\n【更新终止与重启】");

testCase("下载阶段提供可用的终止按钮", () => {
  contains(pane, "const cancel = useCallback", "取消处理函数");
  contains(pane, "await api.update.cancel()", "调用宿主取消命令");
  contains(pane, 't("Cancel Download")', "按钮文案");
  contains(pane, 'progress?.phase !== "installing"', "安装阶段不再提供无效取消");
});

testCase("成功安装后退出整个应用并重启", () => {
  contains(pane, "installed.restartRequired", "读取重启要求");
  contains(pane, "api.window.quit()", "自动退出整个应用进程");
  assertValue(!pane.includes("getCurrentWindow().close()"), "只关闭主窗口会让隐藏 WebView 留住进程");
  contains(update, "ShellExecuteW", "Windows 安装器没有走原生 ShellExecuteW");
  contains(update, '"/P /UPDATE /R"', "NSIS 没有用被动进度、覆盖和重启参数");
  const installed = update.slice(
    update.indexOf("fn 启动_windows_安装器"),
    update.indexOf("fn 替换_windows_便携版"),
  );
  assertValue(!installed.includes("Wait-Process"), "已安装版仍在等待旧进程 PID");
  assertValue(!installed.includes("powershell"), "已安装版仍绕道 PowerShell");
  contains(update, "while kill -0", "Linux 等待旧进程退出");
  contains(update, "nohup", "Linux 安装后启动新版本");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
