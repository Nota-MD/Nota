/**
 * 随包点阵字体：文件、CSS 声明、安装包许可资源三处必须同时存在。
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

console.log("\n【随包文泉驿点阵宋】");

测("完整文泉驿点阵宋 EBDT TTF 在仓库里，且不是空文件", () => {
  const 名 = "Nota-WenQuanYi-Bitmap-Song-EBDT-16px.ttf";
  const 大小 = statSync(`${根}/src/styles/themes/cde/${名}`).size;
  真(大小 > 1_000_000, `${名} 只有 ${大小} 字节`);
});

测("TTF 同时带完整 WQY 来源、ASCII cmap 与 EBDT/EBLC 位图表", () => {
  const 二进制 = readFileSync(
    `${根}/src/styles/themes/cde/Nota-WenQuanYi-Bitmap-Song-EBDT-16px.ttf`,
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
  const css = 读("src/styles/cde.css");
  含(css, 'font-family: "Nota WenQuanYi Bitmap Song"', "@font-face 家族");
  含(css, "Nota-WenQuanYi-Bitmap-Song-EBDT-16px.ttf", "随包字体地址");
  含(css, "font-weight: 400", "常规字重");
  含(css, "font-weight: 700", "粗体字重");
  真(!css.includes("unicode-range"), "完整字体不应再用 unicode-range 排除西文");
  含(css, "font-synthesis: none", "禁止合成加粗");
  含(css, ".app *:not(.ProseMirror, .ProseMirror *)", "界面统一 Regular，正文除外");
});

测("CDE 打印框不会露出原生圆角 select / number spinner", () => {
  const css = 读("src/styles/cde.css");
  含(css, "[data-ui-style=\"cde\"] select", "select 覆盖");
  含(css, "appearance: none", "关闭原生选择框皮肤");
  含(css, "background-size: 5px 5px", "硬边下拉箭头");
  含(css, "::-webkit-inner-spin-button", "数字微调器覆盖");
  含(css, "appearance: textfield", "数字输入改文本式");
});

测("许可正文与修改说明随源码保存，安装包 resources 也带上", () => {
  const 许可 = 读("src/styles/themes/cde/WQY-Bitmap-Song-COPYRIGHT.txt");
  const GPL = 读("src/styles/themes/cde/GPL-2.0.txt");
  const 说明 = 读("src/styles/themes/cde/Nota-WenQuanYi-Bitmap-Song-NOTICE.txt");
  const tauri = 读("src-tauri/tauri.conf.json");
  含(许可, "GPL-2-with-font-embedding-exception", "字体许可");
  含(GPL, "GNU GENERAL PUBLIC LICENSE", "GPL 全文");
  含(说明, "WenQuanYi Bitmap Song", "上游署名");
  含(tauri, "licenses/WQY-Bitmap-Song-COPYRIGHT.txt", "许可资源映射");
  含(
    tauri,
    "licenses/Nota-WenQuanYi-Bitmap-Song-NOTICE.txt",
    "字体说明资源映射",
  );
  含(tauri, "licenses/GPL-2.0.txt", "GPL 全文资源映射");
});

测("第三方清单与鸣谢都登记，根许可证仍是 BSD-2-Clause", () => {
  const 第三方 = 读("THIRD-PARTY.md");
  const 鸣谢 = 读("src/ui/credits.ts");
  const 根许可 = 读("LICENSE");
  含(第三方, "WenQuanYi Bitmap Song", "第三方清单");
  含(第三方, "GPL-2.0 with font embedding exception", "例外正文说明");
  含(鸣谢, "WenQuanYi Bitmap Song", "关于 → 鸣谢");
  含(根许可, "BSD 2-Clause License", "根许可证");
});

console.log(`\n通过 ${过} 条，失败 ${败} 条`);
if (败 > 0) process.exitCode = 1;
