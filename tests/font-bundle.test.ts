/**
 * 外部 CDE 主题包的点阵字体：文件、CSS 声明与同目录许可证必须同时存在。
 *
 * 少字体文件 ⇒ CDE 静默退回系统宋体；少 `@font-face` ⇒ 文件在包里但没人用；
 * 少许可资源 ⇒ 分发不合规。三件事任何一件漏掉，界面都不一定报错。
 */

import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

let 过 = 0;
let 败 = 0;

function 测(名称: string, 体: () => void): void {
  try {
    体();
    过++;
    console.log(`  ✔ ${名称}`);
  } catch (e) {
    败++;
    console.log(`  ✘ ${名称}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function 真(值: unknown, 说明: string): asserts 值 {
  if (!值) throw new Error(说明);
}

function 含(文: string, 片: string, 说明: string): void {
  真(文.includes(片), `${说明}：缺少 ${JSON.stringify(片)}`);
}

const 根 = process.cwd();
const 读 = (路径: string) => readFileSync(`${根}/${路径}`, "utf8");
const 主题根 = "src/styles/external-themes/cde";
const 字体根 = `${主题根}/assets/fonts`;

console.log("\n【外部 CDE 主题的文泉驿点阵宋】");

测("完整文泉驿点阵宋 EBDT TTF 在仓库里，且不是空文件", () => {
  const 名 = "Nota-WenQuanYi-Bitmap-Song-EBDT-16px.ttf";
  const 大小 = statSync(`${根}/${字体根}/${名}`).size;
  真(大小 > 1_000_000, `${名} 只有 ${大小} 字节`);
});

测("TTF 同时带完整 WQY 来源、ASCII cmap 与 EBDT/EBLC 位图表", () => {
  const 二进制 = readFileSync(
    `${根}/${字体根}/Nota-WenQuanYi-Bitmap-Song-EBDT-16px.ttf`,
  );
  真(二进制.includes(Buffer.from("WenQuanYi")), "缺 WenQuanYi 名称记录");
  真(二进制.includes(Buffer.from("EBDT")), "缺 EBDT 位图数据");
  真(二进制.includes(Buffer.from("EBLC")), "缺 EBLC 位图定位表");
  真(
    createHash("sha256").update(二进制).digest("hex") ===
      "9ef195f67950c47b98d09015e4e4cf8692f82ab3180df04a8697c072d330f0ea",
    "TTF 与 THIRD-PARTY.md 登记的上游文件不是同一份",
  );
});

测("CDE CSS 用同一完整字体覆盖中文与西文，界面仍统一 Regular", () => {
  const css = 读(`${主题根}/theme.css`);
  含(css, 'font-family: "Nota WenQuanYi Bitmap Song"', "@font-face 家族");
  含(css, "./assets/fonts/Nota-WenQuanYi-Bitmap-Song-EBDT-16px.ttf", "主题内字体地址");
  含(css, "font-weight: 400", "常规字重");
  含(css, "font-weight: 700", "粗体字重");
  真(!/unicode-range\s*:/.test(css), "完整字体不应声明 unicode-range");
  含(css, "font-synthesis: none", "禁止合成加粗");
  含(css, ".app *:not(.ProseMirror, .ProseMirror *)", "界面统一 Regular，正文除外");
});

测("CDE 打印框不会露出原生圆角 select / number spinner", () => {
  const css = 读(`${主题根}/theme.css`);
  含(css, "[data-ui-style=\"cde\"] select", "select 覆盖");
  含(css, "appearance: none", "关闭原生选择框皮肤");
  含(css, "background-size: 5px 5px", "硬边下拉箭头");
  含(css, "::-webkit-inner-spin-button", "数字微调器覆盖");
  含(css, "appearance: textfield", "数字输入改文本式");
});

测("许可正文与修改说明和字体同目录，但不进入 Nota 安装包", () => {
  const 许可 = 读(`${字体根}/WQY-Bitmap-Song-COPYRIGHT.txt`);
  const GPL = 读(`${字体根}/GPL-2.0.txt`);
  const 说明 = 读(`${字体根}/Nota-WenQuanYi-Bitmap-Song-NOTICE.txt`);
  含(许可, "GPL-2-with-font-embedding-exception", "字体许可");
 含(GPL, "GNU GENERAL PUBLIC LICENSE", "GPL 全文");
  含(说明, "WenQuanYi Bitmap Song", "上游署名");
  const tauri = 读("src-tauri/tauri.conf.json");
  真(!tauri.includes("WQY-Bitmap-Song"), "CDE 字体许可证仍被打进 Nota 安装包");
  真(!tauri.includes("Nota-WenQuanYi-Bitmap-Song"), "CDE 字体说明仍被打进 Nota 安装包");
});

测("第三方清单登记 CDE 主题字体，根许可证仍是 BSD-2-Clause", () => {
  const 第三方 = 读("THIRD-PARTY.md");
  const 根许可 = 读("LICENSE");
  含(第三方, "WenQuanYi Bitmap Song", "第三方清单");
  含(第三方, "GPL-2.0 with font embedding exception", "例外正文说明");
  const 鸣谢 = 读("src/ui/credits.ts");
  真(!鸣谢.includes("WenQuanYi Bitmap Song"), "核心关于页仍硬编码外部 CDE 主题字体");
  含(根许可, "BSD 2-Clause License", "根许可证");
});

console.log(`\n通过 ${过} 条，失败 ${败} 条`);
if (败 > 0) process.exitCode = 1;
