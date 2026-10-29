/** Windows 自绘打印框：iframe 预览与浏览器打印后端。 */

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

testCase("PrintDialog 在浏览器后端用同一份 HTML 做 iframe 预览", () => {
  const dialog = read("src/ui/PrintDialog.tsx");
  contains(dialog, "api.print.backend()", "没有读取打印后端");
  contains(dialog, "sandbox=\"allow-same-origin allow-modals\"", "iframe 缺少打印所需的受限沙箱");
  contains(dialog, "srcDoc={browserHtml}", "没有把导出 HTML 放进预览");
  contains(dialog, "frame.contentWindow.print()", "没有调用 WebView2 打印");
  contains(dialog, "backend === \"browser\"", "没有平台分支");
});

testCase("Windows 使用自绘打印框，不再落回旧系统 HTML 查看器", () => {
  const exportSource = read("src/ui/useExport.ts");
  contains(exportSource, "if (await api.print.supported())", "打印入口没有检查后端");
  assertValue(
    !exportSource.includes("Windows / macOS）→ **退回老那条**"),
    "导出流程仍把 Windows 排出自绘打印",
  );
  const bridge = read("src/bridge/ipc.ts");
  contains(bridge, 'invoke<PrintBackend>("nota_print_backend")', "IPC 没有后端查询");
  const rust = read("src-tauri/src/commands/print.rs");
  contains(rust, 'cfg!(target_os = "linux") || cfg!(target_os = "windows")', "Windows 未标记支持");
  contains(rust, "pub fn nota_print_backend()", "缺少后端命令");
  contains(rust, '"browser"', "Windows 后端不是 browser");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
