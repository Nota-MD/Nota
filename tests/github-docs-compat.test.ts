/** GitHub Docs Liquid 兼容层与新增编辑命令的接线。 */

import { readFileSync } from "node:fs";

import { githubOcticonGlyph, isGithubRowDirective } from "../src/editor/github-docs";

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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const read = (path: string) => readFileSync(path, "utf8");

console.log("\n【GitHub Docs 兼容】");

testCase("rowheaders 边界与常见 Octicon 有本地语义", () => {
  assert(isGithubRowDirective("{% rowheaders %}"), "起始边界");
  assert(isGithubRowDirective("{% endrowheaders %}"), "结束边界");
  assert(githubOcticonGlyph("check") === "✓", "check");
  assert(githubOcticonGlyph("x") === "✕", "x");
});

testCase("兼容层不改源文，编辑与导出分别做装饰/语义转换", () => {
  const editor = read("src/editor/github-docs.ts");
  const exporter = read("src/editor/export.ts");
  const assemble = read("src/editor/assemble.ts");
  assert(editor.includes("Decoration.node"), "缺少编辑器装饰");
  assert(editor.includes('heading.setAttribute("scope", "row")'), "导出未生成行标题");
  assert(exporter.includes("applyGithubDocsToExport(pm)"), "导出未接兼容层");
  assert(assemble.includes(".use(githubDocsCompat)"), "编辑器未接兼容层");
});

testCase("五种 Alert、脚注、按键、表格行标题与文档检查都有命令入口", () => {
  for (const id of [
    "para.alertNote",
    "para.alertTip",
    "para.alertImportant",
    "para.alertWarning",
    "para.alertCaution",
    "para.tableRowHeaders",
    "fmt.kbd",
    "edit.checkDocument",
  ]) {
    assert(read("src/ui/commands.ts").includes(`id: "${id}"`), `菜单缺少 ${id}`);
  }
  assert(read("src/ui/useCommandTable.ts").includes('"edit.checkDocument"'), "命令未接线");
});

testCase("命名锚点与无障碍属性已进入 HTML 白名单", () => {
  const html = read("src/editor/html-block-view.ts");
  for (const attribute of ["name", "aria-label", "aria-hidden"]) {
    assert(html.includes(`"${attribute}"`), `缺少 ${attribute}`);
  }
  assert(read("src/ui/useLinkClick.ts").includes("jumpToInternalAnchor"), "内部锚点未导航");
});

testCase("五种 GitHub Alert 标题都有类型图标", () => {
  const css = read("src/styles/github-alert.css");
  for (const marker of ["ⓘ  Note", "◆  Tip", "❗  Important", "⚠  Warning", "⛔  Caution"]) {
    assert(css.includes(marker), `缺少 ${marker}`);
  }
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
