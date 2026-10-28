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

testCase("成功安装后关闭主窗并由更新脚本重启", () => {
  contains(pane, "installed.restartRequired", "读取重启要求");
  contains(pane, "getCurrentWindow().close()", "自动关闭当前窗口");
  contains(update, "Wait-Process -Id $p", "Windows 等待旧进程退出");
  contains(update, "'/S','/UPDATE','/R'", "NSIS 静默覆盖并重启");
  contains(update, "while kill -0", "Linux 等待旧进程退出");
  contains(update, "nohup", "Linux 安装后启动新版本");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
