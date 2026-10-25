/** HTML / PDF 导出中代码、公式、图表与 HTML 预览的接线判据。 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cssAssetMime } from "../src/editor/export-assets";

let pass = 0;
let fail = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    pass += 1;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail += 1;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

console.log("\n【导出渲染完整性】");

testCase("导出使用完整的正文样式层，而不是只有外壳 CSS", () => {
  const source = readFileSync(join(process.cwd(), "src/editor/export.ts"), "utf8");
  assertValue(source.includes('import("@/styles/editor-inline.css?inline")'), "缺少行内层");
  assertValue(source.includes('import("@/styles/editor-blocks.css?inline")'), "缺少块级层");
  assertValue(source.includes('import("@/styles/diagram.css?inline")'), "缺少图表框线样式");
  assertValue(source.includes("inlineCssAssets(commonStyle.default)"), "KaTeX 字体未内联");
});

testCase("KaTeX 字体与图片资源有正确的 data URL MIME", () => {
  assertValue(cssAssetMime("KaTeX_Main-Regular.woff2") === "font/woff2", "woff2");
  assertValue(cssAssetMime("KaTeX_Main-Regular.woff?v=1") === "font/woff", "woff 查询串");
  assertValue(cssAssetMime("diagram.svg#x") === "image/svg+xml", "SVG");
  assertValue(cssAssetMime("unknown.bin") === null, "不认识的资源保持原样");
});

testCase("HTML 导出保留沙箱预览，PDF/打印不保留", () => {
  const exportSource = readFileSync(join(process.cwd(), "src/editor/export.ts"), "utf8");
  const caller = readFileSync(join(process.cwd(), "src/ui/useExport.ts"), "utf8");
  assertValue(exportSource.includes('sel === ".nota-code-preview" && includeHtmlPreviews'), "没有条件保留");
  assertValue(exportSource.includes('"nota-code-preview-frame"'), "预览类名会被前缀清洗");
  assertValue(caller.includes("includeHtmlPreviews: true"), "HTML 导出没有打开预览");
  const occurrences = caller.match(/includeHtmlPreviews:\s*true/g)?.length ?? 0;
  assertValue(occurrences === 1, "只有 HTML 导出能打开预览；打印与 PDF 必须保持关闭");
});

testCase("HTML 导出仍保留 iframe 的 sandbox 与 srcdoc", () => {
  const source = readFileSync(join(process.cwd(), "src/editor/export.ts"), "utf8");
  assertValue(source.includes('frame?.getAttribute("srcdoc")'), "没有确认 srcdoc");
  assertValue(!source.includes('removeAttribute("sandbox")'), "不许移除沙箱");
  assertValue(!source.includes('removeAttribute("srcdoc")'), "不许清空预览正文");
});

testCase("流程图与数学围栏的生成物保留框线", () => {
  const source = readFileSync(join(process.cwd(), "src/editor/export.ts"), "utf8");
  const diagram = readFileSync(join(process.cwd(), "src/styles/diagram.css"), "utf8");
  assertValue(source.includes('"nota-diagram"'), "导出的流程图类名被清掉");
  assertValue(source.includes('math.className = "md-math-code"'), "数学围栏没有生成专用块");
  assertValue(source.includes(".md-math-code {"), "数学围栏没有框线样式");
  assertValue(
    /\.nota-diagram-preview\s+svg\s*\{[^}]*margin:\s*0 auto/s.test(diagram),
    "流程图没有默认居中",
  );
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
