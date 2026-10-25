import { formatDiagnosticText } from "../src/ui/diagnostics-text";

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

const base = {
  version: "0.9.0-beta",
  build_time: 1_790_000_000,
  build_host: "builder",
  build_platform: "Windows x86_64",
  target: "x86_64-pc-windows-msvc",
  profile: "release",
  rustc: "rustc 1.90",
  cargo: "cargo 1.90",
  node: "v24",
  npm: "11",
  tauri: "2.11.6",
  webkit_crate: "",
  gtk_crate: "",
  mlua: "0.12",
  os_pretty: "Windows 11",
  kernel: "10.0.26100",
  arch: "x86_64",
  gtk_runtime: "",
  webkit_runtime: "",
};

console.log("\n【调试日志中的系统信息】");

testCase("Windows 显示系统、编译目标与 WebView2，不显示 GTK/WebKitGTK", () => {
  const text = formatDiagnosticText(
    base,
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Edg/140.0.0.0",
    new Date("2026-10-25T10:00:00Z"),
  );
  for (const part of ["Windows 11", "x86_64-pc-windows-msvc", "rustc 1.90", "WebView2", "140.0.0.0"]) {
    assertValue(text.includes(part), `缺少 ${part}`);
  }
  assertValue(!text.includes("GTK runtime"), "Windows 页面露出了 GTK 行");
  assertValue(!text.includes("WebKitGTK runtime"), "Windows 页面露出了 WebKitGTK 行");
});

testCase("Linux 显示 GTK 与 WebKitGTK 运行时信息", () => {
  const text = formatDiagnosticText(
    { ...base, os_pretty: "Fedora", gtk_runtime: "3.24.50", webkit_runtime: "2.50.2" },
    "Mozilla/5.0 (X11; Linux x86_64) WebKitGTK/2.50.2",
    new Date("2026-10-25T10:00:00Z"),
  );
  for (const part of ["Fedora", "GTK runtime", "3.24.50", "WebKitGTK runtime", "2.50.2"]) {
    assertValue(text.includes(part), `缺少 ${part}`);
  }
});

testCase("空字段有明确占位，不会显示 undefined", () => {
  const text = formatDiagnosticText(base, "Windows", new Date("2026-10-25T10:00:00Z"));
  assertValue(!text.includes("undefined"), "出现 undefined");
  assertValue(text.includes("—"), "空值没有占位");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
