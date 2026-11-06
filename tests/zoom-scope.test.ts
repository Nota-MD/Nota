/** “字体大小”只改编辑区，“缩放”才改整个界面。 */

import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;

function check(name: string, body: () => void): void {
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

function contains(text: string, fragment: string, message: string): void {
  if (!text.includes(fragment)) throw new Error(`${message}：缺少 ${fragment}`);
}

function excludes(text: string, fragment: string, message: string): void {
  if (text.includes(fragment)) throw new Error(`${message}：仍包含 ${fragment}`);
}

const read = (path: string) => readFileSync(path, "utf8");

console.log("\n【字号与缩放作用域】");

check("字体大小写编辑区变量，不写外壳字体变量", () => {
  const source3 = read("src/styles/applyTheme.ts");
  contains(source3, 'setProperty("--editor-font-size"', "没有设置编辑区字号");
  contains(source3, 'removeProperty("--editor-font-size")', "自动档没有摘掉编辑区覆盖");
  contains(source3, 'root.dataset.editorFontSize = customEditorFont ? "custom" : "auto"', "没有标记当前是否由用户控制字号");
  excludes(source3, 'setProperty("--ui-font-size"', "仍在修改外壳 UI 字号");
});

check("外壳根字号与编辑区基准字号来自不同变量", () => {
  const app = read("src/styles/app.css");
  const editor = read("src/styles/editor.css");
  contains(app, "font-size: var(--ui-font-size);", "外壳根字号不是 UI 变量");
  contains(
    editor,
    "font-size: var(--doc-font-size, 1.02em);",
    "正文没有跟随编辑区基准字号",
  );
  contains(
    editor,
    ':root[data-editor-font-size="custom"] .editor-pane .ProseMirror',
    "用户字号不能覆盖主题写死的正文根字号",
  );
  contains(
    editor,
    ':root[data-editor-font-size="custom"] .editor-pane {',
    "用户字号不能覆盖 Typora 主题写死的编辑区根字号",
  );
  contains(
    editor,
    '.editor-pane[data-doc-font-size="custom"] .ProseMirror',
    "正文大小倍数不能覆盖主题写死的正文根字号",
  );
  excludes(
    editor,
    "calc(var(--doc-font-size, 1.02em) *",
    "正文仍在依赖 WebKitGTK 兼容性不稳定的长度乘法",
  );
});

check("Ctrl+滚轮的字号档写编辑区变量，缩放档仍走 webview", () => {
  const zoom = read("src/ui/useZoom.ts");
  contains(zoom, 'setProperty(\n    "--editor-font-size"', "滚轮字号档仍写外壳变量");
  contains(zoom, 'root.dataset.editorFontSize = "custom"', "滚轮字号档没有立即启用用户字号覆盖");
  contains(zoom, "getCurrentWebview().setZoom", "整体缩放没有走 webview");
  contains(zoom, 'target === "font_size"', "滚轮目标分流不见了");
});

check("源码模式跟随编辑区字号，行内公式分隔符跟随正文", () => {
  const source3 = read("src/editor/source.ts");
  const math = read("src/styles/math.css");
  contains(
    source3,
    'fontSize: "var(--editor-font-size, var(--ui-font-size, 15px))"',
    "源码模式没有跟随编辑区字号",
  );
  contains(
    math,
    "font-size: 1em",
    "行内公式分隔符没有继承正文字号",
  );
  contains(
    math,
    "font-family: inherit",
    "行内公式分隔符没有继承正文字体",
  );
});

check("拖动任一编辑器字号控件都会自动启用自定义字号", () => {
  const appearance = read("src/ui/settings/panes/AppearancePane.tsx");
  const documentPane = read("src/ui/settings/panes/DocThemePane.tsx");
  contains(
    appearance,
    "appearance: { ...a, custom_font_size: true }",
    "外观页字号滑杆没有同时打开自定义字号",
  );
  excludes(
    appearance.match(/<Range[\s\S]*?suffix="px"[\s\S]*?\/>/)?.[0] ?? "",
    "disabled={!a.custom_font_size}",
    "外观页字号滑杆在自动档仍然禁用",
  );
  contains(
    documentPane,
    "write({ font_size, custom_font_size: true })",
    "文档主题字号倍数没有同时打开自定义字号",
  );
  excludes(
    documentPane.match(/<NumberInput[\s\S]*?value={d\.font_size}[\s\S]*?\/>/)?.[0] ?? "",
    "disabled={!d.custom_font_size}",
    "文档主题字号倍数在关闭自定义时仍然禁用",
  );
});

check("编辑器会把正文大小倍数标成用户覆盖", () => {
  const pane = read("src/ui/EditorPane.tsx");
  contains(
    pane,
    'data-doc-font-size={documentTypography?.custom_font_size ? "custom" : undefined}',
    "编辑器没有标记正文大小倍数覆盖",
  );
});

check("自动档展示真实推荐值，不把上次自定义值冒充推荐", () => {
  const zoom = read("src/ui/useZoom.ts");
  const appearance = read("src/ui/settings/panes/AppearancePane.tsx");
  contains(
    zoom,
    "export const recommendedEditorFontSize = 15",
    "推荐字号没有统一常量",
  );
  contains(
    appearance,
    "const shownFontSize = a.custom_font_size",
    "设置页没有区分自动值与自定义值",
  );
  contains(
    appearance,
    "? settings.ui_font_size",
    "自定义档没有显示保存值",
  );
  contains(
    appearance,
    ": recommendedEditorFontSize;",
    "自动档没有显示推荐值",
  );
  contains(
    appearance,
    "Dragging the slider switches to Custom.",
    "自动档帮助没有说明拖动会切到自定义",
  );
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
