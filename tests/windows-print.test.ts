/** Linux/Windows 原生打印：版面 HTML 与 WebView2 打印入口。 */

import { readFileSync } from "node:fs";

import { browserPrintHtml } from "../src/ui/print-browser";

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
  assertValue(text.includes(part), `${message}：缺少 ${JSON.stringify(part)}`);
}
const read = (path: string) => readFileSync(path, "utf8");

console.log("\n【Windows 自绘打印】");

testCase("浏览器打印 HTML 注入纸张、方向、边距与颜色调整", () => {
  const a4 = browserPrintHtml("<html><head></head><body>x</body></html>", "a4", false, 12);
  contains(a4, "@page { size: 210mm 297mm; margin: 12mm; }", "A4 纵向");
  const landscape = browserPrintHtml("<html></html>", "letter", true, 8);
  contains(landscape, "size: 279.4mm 215.9mm", "Letter 横向");
  contains(landscape, "print-color-adjust: exact", "打印颜色");
  const clamped = browserPrintHtml("<p>x</p>", "a4", false, 999);
  contains(clamped, "margin: 60mm", "边距上限");
  assertValue(clamped.startsWith("<style data-nota-browser-print>"), "没有 head 时样式应放最前面");
});

testCase("Ctrl+P 直接进入两端系统打印，不再打开自绘框", () => {
  const exportSource = read("src/ui/useExport.ts");
  const browser = read("src/ui/print-browser.ts");
  contains(exportSource, "await api.print.backend()", "没有读取原生打印后端");
  contains(exportSource, "await api.print.system({", "Linux 没有调用 GTK 系统打印");
  contains(exportSource, "await openBrowserSystemPrint(html)", "Windows 没有调用 WebView2 原生打印");
  contains(exportSource, "backend === \"pdf\"", "没有区分 Linux 原生后端");
  assertValue(!exportSource.includes("openPrint("), "打印入口仍在打开自绘打印框");
  contains(browser, "popup.print()", "WebView2 iframe 没有调用系统打印");
  contains(browser, "addEventListener(\"afterprint\"", "打印 iframe 未等原生对话框结束");
});

testCase("Windows 使用 WebView2 原生打印，不再落回旧系统 HTML 查看器", () => {
  const exportSource = read("src/ui/useExport.ts");
  contains(exportSource, "if (await api.print.supported())", "打印入口没有检查后端");
  const bridge = read("src/bridge/ipc.ts");
  contains(bridge, 'invoke<PrintBackend>("nota_print_backend")', "IPC 没有后端查询");
  const rust = read("src-tauri/src/commands/print.rs");
  contains(rust, 'cfg!(target_os = "linux") || cfg!(target_os = "windows")', "Windows 未标记支持");
  contains(rust, "pub fn nota_print_backend()", "缺少后端命令");
  contains(rust, '"browser"', "Windows 后端不是 browser");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
