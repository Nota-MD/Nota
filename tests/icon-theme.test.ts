/**
 * 主题图标覆盖链的纯文本回归。
 *
 * 读源码而不是渲染：本仓没有 jsdom，而这条链真正容易断的是**变量名是否拼对**、
 * **行内默认图是否让主题变量失去优先级**、以及后端是否又偷偷写死了
 * `主题id/icons/` 目录。真窗口里“换主题后图标有没有变”另走目检。
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let 过 = 0;
let 败 = 0;
const 失败: string[] = [];

function 测(名: string, 体: () => void): void {
  try {
    体();
    过++;
    console.log(`  ✔ ${名}`);
  } catch (e) {
    败++;
    失败.push(名);
    console.log(`  ✘ ${名}\n      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function 真(条件: boolean, 说明: string): void {
  if (!条件) throw new Error(说明);
}

function 读(...段: string[]): string {
  return readFileSync(join(...段), "utf8");
}

const Icon = 读("src", "ui", "Icon.tsx");
const iconsCss = 读("src", "styles", "icons.css");
const cdeCss = 读("src", "styles", "cde.css");
const assetsRs = 读("src-tauri", "src", "theme_assets.rs");
const uiStylesRs = 读("src-tauri", "src", "ui_styles.rs");

测("Icon 把逻辑名拼成 --icon-<id> 并由默认图兜底", () => {
  真(Icon.includes("data-icon={name}"), "Icon 没有输出 data-icon");
  真(
    Icon.includes("`var(--icon-${name}, var(--icon-base))`"),
    "逻辑名没有拼成 --icon-<id>，或者默认图没有兜底",
  );
  真(iconsCss.includes("var(--icon-override, var(--icon-base))"), "遮罩没有消费覆盖变量");
});

测("CDE 只声明图标 ID → 地址，不写 per-icon 组件规则", () => {
  真(
    cdeCss.includes('--icon-folio-close-symbolic: url("../assets/icons/cde/close.svg")'),
    "缺少 CDE 的 close 映射",
  );
  真(cdeCss.includes("--icon-folio-format-text-bold-symbolic"), "缺少加粗图标映射");
  真(!cdeCss.includes('.icon[data-icon="folio-close-symbolic"]'), "又退回选择器硬编码了");
});

测("自绘 CDE 图标都存在且是 16 格源", () => {
  for (const 名 of [
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
  ]) {
    const 路径 = join("src", "assets", "icons", "cde", `${名}.svg`);
    真(existsSync(路径), `缺少 ${路径}`);
    const 源 = readFileSync(路径, "utf8");
    真(源.includes('width="16"') && 源.includes('height="16"'), `${名} 不是 16×16`);
  }
});

测("用户资源相对 CSS 文件解析且不绑定固定目录", () => {
  真(assetsRs.includes('find("url(")'), "后端没有解析 CSS 相对 url()");
  真(assetsRs.includes("font/ttf") && assetsRs.includes("image/svg+xml"), "字体/图标 MIME 缺失");
  真(!uiStylesRs.includes('join("icons")'), "ui_styles.rs 又写死了 主题id/icons 目录");
});

if (败) {
  console.error(`\n${败} 条失败`);
  process.exitCode = 1;
} else {
  console.log(`\n${过} 条全过`);
}
