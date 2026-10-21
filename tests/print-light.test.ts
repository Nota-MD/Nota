/** 打印与 PDF 的浅色主题闸门。 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  documentThemeLooksDark,
  parseCssColor,
  relativeLuminance,
} from "../src/styles/theme-contrast";

let 过 = 0;
let 败 = 0;

function 测(name: string, body: () => void): void {
  try {
    body();
    过 += 1;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    败 += 1;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function 真(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

console.log("\n【打印与 PDF 浅色主题】");

测("CSS 颜色解析与亮度", () => {
  const white = parseCssColor("#fff");
  const dark = parseCssColor("#242424");
  真(white && dark, "常见十六进制颜色应能解析");
  真(relativeLuminance(white) > 0.9, "白色亮度应接近 1");
  真(relativeLuminance(dark) < 0.1, "深灰色亮度应接近 0");
  真(parseCssColor("rgb(100% 100% 100%)") !== null, "百分比 RGB 应能解析");
  真(parseCssColor("var(--paper)") === null, "无法求值的颜色不要猜");
});

测("内置浅色与深色文档主题走同一条判据", () => {
  const dir = join(process.cwd(), "src/styles/themes/adwaita");
  const light = readFileSync(join(dir, "theme.css"), "utf8");
  const dark = readFileSync(join(dir, "dark.css"), "utf8");
  真(!documentThemeLooksDark(light), "Adwaita 浅色不应被拦截");
  真(documentThemeLooksDark(`${light}\n${dark}`), "Adwaita 深色应被拦截");
});

测("声明 color-scheme 深色的用户主题也会被拦截", () => {
  真(documentThemeLooksDark(":root { color-scheme: dark; }"), "color-scheme: dark");
  真(
    !documentThemeLooksDark(":root { color-scheme: light dark; --doc-bg: #fff; }"),
    "同时支持浅色时不应只按 dark 关键字误判",
  );
});

测("打印、PDF 与 Pandoc 兜底都经过同一个浅色闸门", () => {
  const source = readFileSync(join(process.cwd(), "src/ui/useExport.ts"), "utf8");
  真(source.includes("const 取打印主题CSS"), "缺少共用浅色主题闸门");
  真(source.includes("if (themeCss === null) return"), "打印入口没有在深色时停止");
  真(source.includes("if (printThemeCss === null) return"), "PDF 入口没有在深色时停止");
  真(source.includes("lightOutput: true"), "打印和 PDF HTML 没有标记浅色输出");
  真(source.includes('themeCss: pdf ? ""'), "PDF 仍会把活动文档主题传给 Pandoc");
});

测("提示文案明确要求用户选择浅色主题", () => {
  const source = readFileSync(join(process.cwd(), "src/ui/useExport.ts"), "utf8");
  const translations = readFileSync(join(process.cwd(), "src/i18n/zh-ui.ts"), "utf8");
  真(source.includes("Printing and PDF output only support light themes"), "缺少拦截提示");
  真(translations.includes("请选择一个浅色主题进行打印"), "中文提示未翻译");
});

console.log(`\n通过 ${过} 条，失败 ${败} 条`);
if (败 > 0) process.exitCode = 1;
