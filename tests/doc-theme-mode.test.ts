/** 文档主题按 id 原样生效，不因界面是深色就偷偷改成 `*-dark`。 */

import type { Settings } from "../src/bridge/ipc";
import { readFileSync } from "node:fs";
import { generateEffectOfDocumentTheme } from "../src/ui/useDocTheme";

let passed = 0;
let failure = 0;

function testCase(name3: string, body3: () => void): void {
  try {
    body3();
    passed += 1;
    console.log(`  ✔ ${name3}`);
  } catch (error) {
    failure += 1;
    console.log(`  ✘ ${name3}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValue(value2: unknown, description: string): asserts value2 {
  if (!value2) throw new Error(description);
}

function settings(partShare: Record<string, unknown>): Settings {
  return partShare as unknown as Settings;
}

console.log("\n【文档主题与界面明暗】");

testCase("深色界面下选择 Adwaita 仍使用 Adwaita", () => {
  const s = settings({
    document_theme: "adwaita",
    appearance: { dark_theme_separate: false, dark_document_theme: "" },
  });
  assertValue(generateEffectOfDocumentTheme(s, "dark") === "adwaita", "被自动换成了深色配对");
});

testCase("显式开启单独深色主题时才使用 dark_document_theme", () => {
  const s = settings({
    document_theme: "adwaita",
    appearance: { dark_theme_separate: true, dark_document_theme: "adwaita-dark" },
  });
  assertValue(generateEffectOfDocumentTheme(s, "dark") === "adwaita-dark", "显式深色槽没有生效");
  assertValue(generateEffectOfDocumentTheme(s, "light") === "adwaita", "浅色下不该使用深色槽");
});

testCase("直接选择带 dark 的主题时按所选 id 生效", () => {
  const s = settings({
    document_theme: "minimal-dark",
    appearance: { dark_theme_separate: false, dark_document_theme: "" },
  });
  assertValue(generateEffectOfDocumentTheme(s, "light") === "minimal-dark", "id 被界面明暗改写");
});

testCase("Adwaita 深色补丁覆盖浅色表头、隔行底色和行内代码底", () => {
  const css = readFileSync("src/styles/themes/adwaita/dark.css", "utf8");
  assertValue(/th\s*\{[^}]*background:\s*#333333/s.test(css), "表头仍是浅色底");
  assertValue(
    /tbody tr:nth-child\(even\)\s*\{[^}]*background:\s*#292929/s.test(css),
    "隔行底色没有深色覆盖",
  );
  assertValue(/code\s*\{[^}]*background:\s*#343434/s.test(css), "行内代码底没有深色覆盖");
  assertValue(!css.includes("#f0f0ef"), "深色补丁仍引用浅色表头值");
});

testCase("正文高亮色不继承深色界面主题", () => {
  const css = readFileSync("src/styles/editor.css", "utf8");
  const pane = /\.editor-pane\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  assertValue(pane.includes("--find-hit:"), "编辑区没有自己的查找普通命中色");
  assertValue(pane.includes("--find-current:"), "编辑区没有自己的查找当前命中色");
  assertValue(pane.includes("--mark-bg:"), "编辑区没有自己的 ==高亮== 底色");
  assertValue(pane.includes("--mark-bg: #ffd84d;"), "==高亮== 没有使用清晰的黄色");
  assertValue(pane.includes("--mark-fg: #1a1a1a;"), "黄色高亮没有使用可读的深色文字");
});

testCase("front matter 编辑区使用外壳配色，不继承浅色文档主题", () => {
  const css = readFileSync("src/styles/editor.css", "utf8");
  const banner = /\.editor-frontmatter\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  const text = /\.editor-frontmatter-text\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  const base = readFileSync("src/styles/theme/base.css", "utf8");
  assertValue(banner.includes("background: color-mix(in srgb, CanvasText 6%, Canvas);"), "横幅仍使用文档底色");
  assertValue(banner.includes("color: CanvasText;"), "横幅仍使用文档文字色");
  assertValue(text.includes("background: Canvas;"), "输入框仍使用文档底色");
  assertValue(text.includes("color: CanvasText;"), "输入框仍使用文档文字色");
  assertValue(text.includes("appearance: none;"), "输入框仍交给 GTK 绘制原生外观");
  assertValue(base.includes("color-scheme: light;"), "浅色外壳没有声明 color-scheme");
  assertValue(base.includes("color-scheme: dark;"), "深色外壳没有声明 color-scheme");
});

if (failure > 0) process.exit(1);
console.log(`\n${passed} passed, 0 failed`);
