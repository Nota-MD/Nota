/**
 * 随包点阵字体：文件、CSS 声明、安装包许可资源三处必须同时存在。
 *
 * 少字体文件 ⇒ CDE 静默退回系统宋体；少 `@font-face` ⇒ 文件在包里但没人用；
 * 少许可资源 ⇒ 分发不合规。三件事任何一件漏掉，界面都不一定报错。
 */

import { readFileSync, statSync } from "node:fs";

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

console.log("\n【随包 GB16ST 点阵字体】");

测("常规与粗体 TTF 都在仓库里，且不是空文件", () => {
  for (const 名 of ["NotaGB16ST-EBDT-Regular.ttf", "NotaGB16ST-EBDT-Bold.ttf"]) {
    const 大小 = statSync(`${根}/src/assets/fonts/${名}`).size;
    真(大小 > 1_000_000, `${名} 只有 ${大小} 字节`);
  }
});

测("两份 TTF 都带 EBDT/EBLC 表", () => {
  for (const 名 of ["NotaGB16ST-EBDT-Regular.ttf", "NotaGB16ST-EBDT-Bold.ttf"]) {
    const 二进制 = readFileSync(`${根}/src/assets/fonts/${名}`);
    const 头 = 二进制.subarray(0, 4096);
    真(头.includes(Buffer.from("EBDT")) || 二进制.includes(Buffer.from("EBDT")), `${名} 缺 EBDT`);
    真(头.includes(Buffer.from("EBLC")) || 二进制.includes(Buffer.from("EBLC")), `${名} 缺 EBLC`);
  }
});

测("CDE CSS 声明了 400 / 700 两档，并引用两份随包字体", () => {
  const css = 读("src/styles/cde.css");
  含(css, 'font-family: "Nota GB16ST Bitmap"', "@font-face 家族");
  含(css, "NotaGB16ST-EBDT-Regular.ttf", "常规字重地址");
  含(css, "NotaGB16ST-EBDT-Bold.ttf", "粗体字重地址");
  含(css, "font-weight: 400", "常规字重");
  含(css, "font-weight: 700", "粗体字重");
  含(css, "U+4E00-9FFF", "点阵字面只接管 CJK");
  含(css, "font-synthesis: none", "禁止合成加粗");
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
  const 许可 = 读("src/assets/fonts/WQY-Bitmap-Song-COPYRIGHT.txt");
  const GPL = 读("src/assets/fonts/GPL-2.0.txt");
  const 说明 = 读("src/assets/fonts/Nota-GB16ST-NOTICE.txt");
  const tauri = 读("src-tauri/tauri.conf.json");
  含(许可, "GPL-2-with-font-embedding-exception", "字体许可");
  含(GPL, "GNU GENERAL PUBLIC LICENSE", "GPL 全文");
  含(说明, "WenQuanYi Bitmap Song", "上游署名");
  含(tauri, "licenses/WQY-Bitmap-Song-COPYRIGHT.txt", "许可资源映射");
  含(tauri, "licenses/Nota-GB16ST-NOTICE.txt", "修改说明资源映射");
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
