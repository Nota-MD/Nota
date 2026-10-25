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

const about = readFileSync("src/ui/AboutDialog.tsx", "utf8");
const diagnostics = readFileSync("src-tauri/src/diagnostics.rs", "utf8");

console.log("\n【英文诊断默认输出】");

testCase("关于页故障排除的标签与时间固定英文", () => {
  for (const label of [
    '"Package version"',
    '"Build time"',
    '"Build host"',
    '"Build platform"',
    '"Target triple"',
    '"Build profile"',
    '"Operating system"',
    '"Kernel"',
    '"Architecture"',
  ]) {
    assertValue(about.includes(label), `缺少 ${label}`);
  }
  assertValue(about.includes("toISOString()"), "构建时间没有固定为 ISO");
});

testCase("Windows 关于页显示 WebView2，GTK 字段按平台隐藏", () => {
  assertValue(about.includes('"WebView2"'), "缺少 WebView2");
  assertValue(about.includes("/Linux|X11/i.test(navigator.userAgent)"), "Linux 字段未分平台");
});

testCase("内核侧把本地化系统输出归一化为英文", () => {
  for (const part of [
    'format!("Windows {version}")',
    '"macOS".into()',
    'format!("{name} {version}")',
    '.env("LC_ALL", "C")',
    '.env("LANG", "C")',
  ]) {
    assertValue(diagnostics.includes(part), `缺少 ${part}`);
  }
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
