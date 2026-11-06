/** ZIP theme-package import contracts. */

import { readFileSync } from "node:fs";

import {
  scopeDocThemeSelector,
  typoraCompatibilityCss,
} from "../src/styles/doc-theme";
import { canSelectCharacterBody, declaredThemeFamilies } from "../src/ui/font-check";

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

console.log("\n【主题导入：Nota 包与 Typora 原生布局】");

testCase("前端入口支持 ZIP、CSS 与 Typora 文件夹", () => {
  const hook = read("src/ui/useUiStyles.ts");
  const ipc = read("src/bridge/ipc.ts");
  assertValue(hook.includes('extensions: ["zip", "css"]'), "主题文件选择器不认 ZIP / CSS");
  assertValue(hook.includes("chooseDirectory"), "没有 Typora 文件夹入口");
  assertValue(hook.includes("api.theme.importPath(path)"), "没有调用后台主题导入命令");
  assertValue(
    hook.includes("refreshDocumentThemes()") && hook.includes("setScan((value) => value + 1)"),
    "导入后没有同时刷新界面主题与文档主题",
  );
  assertValue(ipc.includes('"nota_theme_import"'), "IPC 桥没有登记主题导入");
});

testCase("外观页和文档主题页共用 ZIP/CSS 导入入口，不内置 Typora 文件夹导入", () => {
  const appearance = read("src/ui/settings/panes/AppearancePane.tsx");
  const document = read("src/ui/settings/panes/DocThemePane.tsx");
  assertValue(appearance.includes("onImportTheme"), "外观页缺少导入入口");
  assertValue(document.includes("onImportTheme"), "文档主题页缺少导入入口");
  assertValue(!appearance.includes("onImportTyporaTheme"), "外观页仍内置 Typora 文件夹导入");
  assertValue(!document.includes("onImportTyporaTheme"), "文档主题页仍内置 Typora 文件夹导入");
});

testCase("后台同时支持主题包和原生 Typora 布局", () => {
  const backend = read("src-tauri/src/theme_import.rs");
  const typora = read("src-tauri/src/theme_import/typora.rs");
  const lib = read("src-tauri/src/lib.rs");
  for (const layout of ['"ui" | "ui-styles"', '"document"', '"themes"']) {
    assertValue(backend.includes(layout), `后台不认布局 ${layout}`);
  }
  assertValue(backend.includes("data-ui-style"), "界面主题没有做作用域校验");
  assertValue(backend.includes("--doc-bg"), "文档主题没有做内容校验");
  assertValue(backend.includes("不能包含符号链接"), "ZIP 符号链接没有被拒绝");
  assertValue(backend.includes("MAX_TOTAL_BYTES"), "ZIP 解压没有总大小上限");
  assertValue(backend.includes("pub(crate) mod typora"), "没有启用 Typora 导入器");
  assertValue(typora.includes("MANIFEST_FILE"), "Typora 集合没有清单");
  assertValue(typora.includes("collect_source_files"), "Typora 文件没有原样复制");
  assertValue(typora.includes("install_zip"), "ZIP 下载的 Typora 主题不能直接导入");
  assertValue(typora.includes("load_runtime_css"), "加载时没有解释 Typora @import");
  assertValue(lib.includes("commands::theme::nota_theme_import"), "主题导入命令没有注册");
});

testCase("Typora 根选择器映射到 Nota 正文根", () => {
  assertValue(
    scopeDocThemeSelector(":root").includes(".editor-pane") &&
      !scopeDocThemeSelector(":root").includes(".ProseMirror"),
    ":root 应只承载变量",
  );
  assertValue(
    scopeDocThemeSelector("body").includes(".editor-pane .editor-mount .ProseMirror"),
    "body 颜色没有落到正文根",
  );
  assertValue(
    scopeDocThemeSelector("#write > p").includes(".editor-pane .editor-mount .ProseMirror > p"),
    "#write 没有映射到正文根",
  );
  assertValue(
    scopeDocThemeSelector("html body > p").includes(".editor-pane .editor-mount .ProseMirror > p"),
    "html body 组合选择器映射错误",
  );
});

testCase("Typora 字体声明和字体栈被识别", () => {
  const css = `
    @font-face { font-family: "New Computer Modern"; src: url("data:font/woff2;base64,AA"); }
    :root { --font-family: "New Computer Modern", "Times New Roman", serif; }
  `;
  assertValue(
    declaredThemeFamilies(css).includes("New Computer Modern"),
    "没有识别 @font-face 家族",
  );
  assertValue(
    canSelectCharacterBody(css)[0] === "New Computer Modern",
    "没有识别 Typora --font-family 首选字体",
  );
});

testCase("Typora 文档变量桥接为 Nota 语义变量", () => {
  const bridge = typoraCompatibilityCss(`
    :root {
      --bg-color: #ffffff;
      --text-color: #111111;
      --code-bg-color: #fbfaf7;
      --syntax-keyword-color: #2f3c61;
    }
  `);
  assertValue(bridge.includes("--doc-bg: var(--bg-color"), "纸张底色没有桥接");
  assertValue(bridge.includes("--doc-fg: var(--text-color"), "正文色没有桥接");
  assertValue(bridge.includes("--bg-subtle: var(--code-bg-color"), "代码底色没有桥接");
  assertValue(bridge.includes("--code-keyword: var(--syntax-keyword-color"), "语法色没有桥接");
  assertValue(bridge.startsWith(".editor-pane {"), "桥接变量没有限制在文档作用域");
  assertValue(!typoraCompatibilityCss(":root { --doc-bg: white; }"), "内置主题不应被桥接覆盖");
});

testCase("Typora 主题只保留标题居中，正文块按书写方向靠左", () => {
  const bridge = typoraCompatibilityCss(`
    :root { --text-color: #111111; }
  `);
  assertValue(
    bridge.includes(":is(p, li, blockquote, td, th)") &&
      bridge.includes("text-align: start"),
    "Typora 主题没有正文左对齐兜底",
  );
  assertValue(!/:is\([^)]*h1/.test(bridge), "标题不应被正文对齐兜底覆盖");

  const editorCss = read("src/styles/editor.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assertValue(
    /\.editor-mount \.ProseMirror\s*\{[^}]*width:\s*100%/s.test(editorCss),
    "正文根没有吃满可用列宽，主题的 auto margin 会让空段落缩到中间",
  );
});

testCase("Typora CodeMirror token 选择器映射到 Prism token", () => {
  const selector = scopeDocThemeSelector(
    "pre.md-fences .cm-keyword, pre.md-fences .cm-string",
  );
  assertValue(selector.includes(".token.keyword"), "关键字 token 没有映射");
  assertValue(selector.includes(".token.string"), "字符串 token 没有映射");
  assertValue(!selector.includes(".cm-keyword"), "关键字仍使用 Typora 私有类");
});

testCase("Typora 表头结构映射到 GFM 的 data-is-header 行", () => {
  const selector = scopeDocThemeSelector("#write table thead > tr th");
  assertValue(selector.includes("tr[data-is-header] th"), "表头行没有映射");
  assertValue(!/\bthead\b/.test(selector), "改写结果仍含 thead");
});

testCase("Typora 常见内容结构映射到 Nota 语义节点", () => {
  const inlineMath = scopeDocThemeSelector("#write .md-inline-math");
  assertValue(inlineMath.includes(".nota-math-inline"), "行内公式没有映射");

  const table = scopeDocThemeSelector("#write .md-table-wrap table");
  assertValue(table.includes(".tableWrapper table"), "表格包装没有映射");

  const task = scopeDocThemeSelector("#write li.md-task-list-item");
  assertValue(task.includes('li[data-item-type="task"]'), "任务列表项没有映射");

  const alert = scopeDocThemeSelector("#write .md-alert-note p");
  assertValue(alert.includes(".nota-github-alert-note p"), "GitHub Alert 没有映射");

  const html = scopeDocThemeSelector("#write .md-htmlblock > .md-rawblock-container");
  assertValue(html.includes(".nota-html-block > .nota-html-render"), "HTML 块没有映射");
});

testCase("Typora 导出结构别名覆盖首行缩进与 figure 表格", () => {
  assertValue(
    scopeDocThemeSelector("#write.first-line-indent p").includes(".ProseMirror p"),
    "#write.first-line-indent 没有映射回正文根",
  );
  assertValue(
    scopeDocThemeSelector("#write > figure:has(> table)").includes(".tableWrapper:has(> table)"),
    "figure 表格包装没有映射到 ProseMirror tableWrapper",
  );
  assertValue(
    scopeDocThemeSelector("#write figure > table").includes(".tableWrapper > table"),
    "figure > table 没有映射",
  );
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
