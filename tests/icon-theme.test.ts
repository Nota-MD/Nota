/**
 * 主题图标覆盖链的纯文本回归。
 *
 * 读源码而不是渲染：本仓没有 jsdom，而这条链真正容易断的是**变量名是否拼对**、
 * **行内默认图是否让主题变量失去优先级**、以及后端是否又偷偷写死了
 * `主题id/icons/` 目录。真窗口里“换主题后图标有没有变”另走目检。
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

let pass = 0;
let fail = 0;
const failure: string[] = [];

function testCase(name3: string, body3: () => void): void {
  try {
    body3();
    pass++;
    console.log(`  ✔ ${name3}`);
  } catch (e) {
    fail++;
    failure.push(name3);
    console.log(`  ✘ ${name3}\n      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function assertValue(condition: boolean, description: string): void {
  if (!condition) throw new Error(description);
}

function read(...paragraph2: string[]): string {
  return readFileSync(join(...paragraph2), "utf8");
}

const Icon = read("src", "ui", "Icon.tsx");
const iconsCss = read("src", "styles", "icons.css");
const marksCss = read("src", "styles", "marks.css");
const cdeCss = read("src", "styles", "external-themes", "cde", "theme.css");
const mainTsx = read("src", "main.tsx");
const assetsRs = read("src-tauri", "src", "theme_assets.rs");
const uiStylesRs = read("src-tauri", "src", "ui_styles.rs");

testCase("Icon 把逻辑名拼成 --icon-<id> 并由默认图兜底", () => {
  assertValue(Icon.includes("data-icon={name}"), "Icon 没有输出 data-icon");
  assertValue(
    Icon.includes("`var(--icon-${name}, var(--icon-base))`"),
    "逻辑名没有拼成 --icon-<id>，或者默认图没有兜底",
  );
  assertValue(iconsCss.includes("var(--icon-override, var(--icon-base))"), "遮罩没有消费覆盖变量");
});

testCase("CDE 只声明图标 ID → 地址，不写 per-icon 组件规则", () => {
  assertValue(
    cdeCss.includes(
      '--icon-folio-close-symbolic: url("./assets/icons/close.svg")',
    ),
    "缺少 CDE 的 close 映射",
  );
  assertValue(cdeCss.includes("--icon-folio-format-text-bold-symbolic"), "缺少加粗图标映射");
  assertValue(cdeCss.includes("--icon-nota-heading-1-symbolic"), "缺少 CDE 一级标题图标映射");
  assertValue(cdeCss.includes("--nota-source-quote-icon"), "缺少 CDE 引用源码图标映射");
  assertValue(!cdeCss.includes('.icon[data-icon="folio-close-symbolic"]'), "又退回选择器硬编码了");
});

testCase("编辑器块标记使用自绘 SVG，位置由 50% 垂直居中", () => {
  assertValue(marksCss.includes('--nota-source-quote-icon'), "缺少引用源码图标变量");
  assertValue(marksCss.includes('data-srcmark=">"'), "引用块没有接到 SVG");
  assertValue(marksCss.includes('data-srcmark="-"]'), "无序列表没有接到 SVG");
  assertValue(marksCss.includes('data-srcmark="```"'), "代码围栏没有接到 SVG");
  assertValue(
    marksCss.includes("top: 50%") && marksCss.includes("transform: translateY(-50%)"),
    "块标记没有相对块垂直居中",
  );
});

testCase("CDE 外部主题不进入程序内置风格和静态样式导入", () => {
  assertValue(!uiStylesRs.includes('"cde"'), "ui_styles.rs 仍把 cde 列为内置风格");
  assertValue(!mainTsx.includes('"./styles/external-themes/cde/theme.css"'), "main.tsx 静态导入了 CDE");
  assertValue(!mainTsx.includes('"./styles/cde.css"'), "main.tsx 仍在导入旧 CDE 样式");
});

testCase("核心 CSS 不再包含 CDE 专用选择器", () => {
  const root = join(process.cwd(), "src", "styles");
  const externalPlace = join(root, "external-themes");
  const cssTextItem = (itemRecord: string): string[] =>
    readdirSync(itemRecord, { withFileTypes: true }).flatMap((item5) => {
      const path = join(itemRecord, item5.name);
      if (item5.isDirectory()) return path === externalPlace ? [] : cssTextItem(path);
      return item5.isFile() && item5.name.endsWith(".css") ? [path] : [];
    });
  for (const path of cssTextItem(root)) {
    assertValue(
      !readFileSync(path, "utf8").includes('data-ui-style="cde"'),
      `${relative(process.cwd(), path)} 仍含 CDE 专用选择器`,
    );
  }
});

testCase("自绘 CDE 图标都存在且是 16 格源", () => {
  for (const name3 of [
    "document-open",
    "document-new",
    "document-save",
    "close",
    "configure",
    "plugin",
    "window",
    "image",
    "code",
    "link",
    "columns",
    "spellcheck",
    "format-bold",
    "format-italic",
    "format-underline",
    "list-bullet",
    "list-ordered",
    "quote",
    "task",
    "unfold-more",
    "sidebar-collapse",
    "sidebar-toggle",
    "heading-1",
    "heading-2",
    "heading-3",
    "source-quote",
    "source-bullet",
    "source-code",
  ]) {
    const path = join("src", "styles", "external-themes", "cde", "assets", "icons", `${name3}.svg`);
    assertValue(existsSync(path), `缺少 ${path}`);
    const source3 = readFileSync(path, "utf8");
    assertValue(source3.includes('width="16"') && source3.includes('height="16"'), `${name3} 不是 16×16`);
  }
});

testCase("用户资源相对 CSS 文件解析且不绑定固定目录", () => {
  assertValue(assetsRs.includes('find("url(")'), "后端没有解析 CSS 相对 url()");
  assertValue(assetsRs.includes("font/ttf") && assetsRs.includes("image/svg+xml"), "字体/图标 MIME 缺失");
  assertValue(!uiStylesRs.includes('join("icons")'), "ui_styles.rs 又写死了 主题id/icons 目录");
});

if (fail) {
  console.error(`\n${fail} 条失败`);
  process.exitCode = 1;
} else {
  console.log(`\n${pass} 条全过`);
}
