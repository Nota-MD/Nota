/** Windows child-process console-window contracts. */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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

const read = (path: string) => readFileSync(path, "utf8");

function rustFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return rustFiles(path);
    return path.endsWith(".rs") ? [path] : [];
  });
}

console.log("\n【Windows 后台子进程无窗启动】");

testCase("统一封装使用 CREATE_NO_WINDOW", () => {
  const proc = read("src-tauri/src/proc.rs");
  assertValue(proc.includes("pub(crate) fn background_command"), "缺少统一后台命令构造器");
  assertValue(proc.includes("command.creation_flags(CREATE_NO_WINDOW)"), "Windows 没有设置无窗标志");
  assertValue(proc.includes("0x0800_0000"), "CREATE_NO_WINDOW 数值不对");
  assertValue(proc.includes("hide_console_window(command)"), "spawn_retrying 没有兜底无窗设置");
});

testCase("Git 与直接 spawn 的运行期路径都走统一封装", () => {
  const git = read("src-tauri/src/lua/api/git.rs");
  const window = read("src-tauri/src/commands/window.rs");
  const update = read("src-tauri/src/update.rs");
  assertValue(git.includes('crate::proc::background_command("git")'), "nota.git 仍直接启动 git");
  assertValue(window.includes("crate::proc::background_command(&程序)"), "窗口/日志子进程绕过封装");
  assertValue(update.includes('crate::proc::background_command("powershell")'), "更新 PowerShell 绕过封装");
});

testCase("运行期源码不得重新引入裸 Command::new", () => {
  const root = "src-tauri/src";
  const procPath = join(root, "proc.rs");
  const violations: string[] = [];
  for (const path of rustFiles(root)) {
    if (path === procPath) continue;
    const runtime = read(path).split("#[cfg(test)]", 1)[0];
    runtime.split("\n").forEach((line, index) => {
      const code = line.trim();
      if (!code.startsWith("//") && code.includes("Command::new(")) {
        violations.push(`${path}:${index + 1} ${code}`);
      }
    });
  }
  assertValue(violations.length === 0, `运行期存在绕过 background_command 的启动点：\n${violations.join("\n")}`);
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
