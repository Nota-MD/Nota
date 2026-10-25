/**
 * 外部主题包的字体：文件、CSS 声明与同目录许可证必须同时存在。
 *
 * 少字体文件 ⇒ CDE 静默退回系统宋体；少 `@font-face` ⇒ 文件在包里但没人用；
 * 少许可资源 ⇒ 分发不合规。三件事任何一件漏掉，界面都不一定报错。
 */

import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

let pass = 0;
let fail = 0;

function testCase(name: string, body3: () => void): void {
  try {
    body3();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✘ ${name}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function assertValue(value2: unknown, description: string): asserts value2 {
  if (!value2) throw new Error(description);
}

function contains(text4: string, slice: string, description: string): void {
  assertValue(text4.includes(slice), `${description}：缺少 ${JSON.stringify(slice)}`);
}

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");
const themeRoot = "src/styles/external-themes/cde";
const characterBodyRoot = `${themeRoot}/assets/fonts`;

console.log("\n【外部 CDE 主题的文泉驿点阵宋】");

testCase("完整文泉驿点阵宋 EBDT TTF 源文件与 WOFF2 运行时文件都在仓库里", () => {
  const name3 = "Nota-WenQuanYi-Bitmap-Song-EBDT-16px.ttf";
  const sourceSize = statSync(`${root}/${characterBodyRoot}/${name3}`).size;
  const moveLineTime = "Nota-WenQuanYi-Bitmap-Song-EBDT-16px.woff2";
  const moveLineTimeLargeSmall = statSync(`${root}/${characterBodyRoot}/${moveLineTime}`).size;
  assertValue(sourceSize > 1_000_000, `${name3} 只有 ${sourceSize} 字节`);
  assertValue(moveLineTimeLargeSmall > 500_000 && moveLineTimeLargeSmall < sourceSize / 3, `${moveLineTime} 体积异常：${moveLineTimeLargeSmall}`);
});

testCase("TTF 同时带完整 WQY 来源、ASCII cmap 与 EBDT/EBLC 位图表", () => {
  const twoEnterMake = readFileSync(
    `${root}/${characterBodyRoot}/Nota-WenQuanYi-Bitmap-Song-EBDT-16px.ttf`,
  );
  assertValue(twoEnterMake.includes(Buffer.from("WenQuanYi")), "缺 WenQuanYi 名称记录");
  assertValue(twoEnterMake.includes(Buffer.from("EBDT")), "缺 EBDT 位图数据");
  assertValue(twoEnterMake.includes(Buffer.from("EBLC")), "缺 EBLC 位图定位表");
  assertValue(
    createHash("sha256").update(twoEnterMake).digest("hex") ===
      "9ef195f67950c47b98d09015e4e4cf8692f82ab3180df04a8697c072d330f0ea",
    "TTF 与 THIRD-PARTY.md 登记的上游文件不是同一份",
  );
});

testCase("CDE CSS 用同一完整字体覆盖中文与西文，界面仍统一 Regular", () => {
  const css = read(`${themeRoot}/theme.css`);
  contains(css, 'font-family: "Nota WenQuanYi Bitmap Song"', "@font-face 家族");
  contains(css, "./assets/fonts/Nota-WenQuanYi-Bitmap-Song-EBDT-16px.woff2", "主题内字体地址");
  contains(css, 'format("woff2")', "WOFF2 字体格式");
  contains(css, "font-weight: 400", "常规字重");
  contains(css, "font-weight: 700", "粗体字重");
  assertValue(!/unicode-range\s*:/.test(css), "完整字体不应声明 unicode-range");
  contains(css, "font-synthesis: none", "禁止合成加粗");
  contains(css, ".app *:not(.ProseMirror, .ProseMirror *)", "界面统一 Regular，正文除外");
});

testCase("WOFF2 是无损容器转换而不是另一份来源不明的字体", () => {
  const twoEnterMake = readFileSync(
    `${root}/${characterBodyRoot}/Nota-WenQuanYi-Bitmap-Song-EBDT-16px.woff2`,
  );
  assertValue(twoEnterMake.subarray(0, 4).toString("ascii") === "wOF2", "缺 WOFF2 签名");
  assertValue(
    createHash("sha256").update(twoEnterMake).digest("hex") ===
      "beb8fbad0af63498b0c424c7bdcb8e69041b166fe5b1a161b77204287676187b",
    "WOFF2 与 THIRD-PARTY.md 登记的转换产物不是同一份",
  );
});

testCase("CDE 打印框不会露出原生圆角 select / number spinner", () => {
  const css = read(`${themeRoot}/theme.css`);
  contains(css, "[data-ui-style=\"cde\"] select", "select 覆盖");
  contains(css, "appearance: none", "关闭原生选择框皮肤");
  contains(css, "background-size: 5px 5px", "硬边下拉箭头");
  contains(css, "::-webkit-inner-spin-button", "数字微调器覆盖");
  contains(css, "appearance: textfield", "数字输入改文本式");
});

testCase("许可正文与修改说明和字体同目录，但不进入 Nota 安装包", () => {
  const license = read(`${characterBodyRoot}/WQY-Bitmap-Song-COPYRIGHT.txt`);
  const GPL = read(`${characterBodyRoot}/GPL-2.0.txt`);
  const description = read(`${characterBodyRoot}/Nota-WenQuanYi-Bitmap-Song-NOTICE.txt`);
  contains(license, "GPL-2-with-font-embedding-exception", "字体许可");
 contains(GPL, "GNU GENERAL PUBLIC LICENSE", "GPL 全文");
  contains(description, "WenQuanYi Bitmap Song", "上游署名");
  const tauri = read("src-tauri/tauri.conf.json");
  assertValue(!tauri.includes("WQY-Bitmap-Song"), "CDE 字体许可证仍被打进 Nota 安装包");
  assertValue(!tauri.includes("Nota-WenQuanYi-Bitmap-Song"), "CDE 字体说明仍被打进 Nota 安装包");
});

testCase("第三方清单登记 CDE 主题字体，根许可证仍是 BSD-2-Clause", () => {
  const ordinalThreeSquare = read("THIRD-PARTY.md");
  const rootLicense = read("LICENSE");
  contains(ordinalThreeSquare, "WenQuanYi Bitmap Song", "第三方清单");
  contains(ordinalThreeSquare, "GPL-2.0 with font embedding exception", "例外正文说明");
  const notifyThanks = read("src/ui/credits.ts");
  assertValue(!notifyThanks.includes("WenQuanYi Bitmap Song"), "核心关于页仍硬编码外部 CDE 主题字体");
  contains(rootLicense, "BSD 2-Clause License", "根许可证");
});

testCase("安装包唯一主题字体 Adwaita Sans / Mono 与 OFL 随包存在", () => {
  const characterRoot = "src/assets/fonts/adwaita";
  for (const name3 of [
    "AdwaitaSans-Regular.ttf",
    "AdwaitaSans-Italic.ttf",
    "AdwaitaMono-Regular.ttf",
    "AdwaitaMono-Italic.ttf",
  ]) {
    assertValue(statSync(`${root}/${characterRoot}/${name3}`).size > 500_000, `${name3} 缺失或体积异常`);
  }
  contains(read(`${characterRoot}/LICENSE.txt`), "SIL OPEN FONT LICENSE", "Adwaita 字体许可");
  contains(read("src/styles/theme/adwaita-fonts.css"), '"Adwaita Sans"', "界面字体声明");
  contains(read("src/styles/theme/adwaita-fonts.css"), '"Adwaita Mono"', "等宽字体声明");
});

testCase("主题字体鸣谢留在字体包内，不进入关于页鸣谢窗口", () => {
  const notifyThanks = read("src/ui/credits.ts");
  for (const name3 of ["Adwaita Sans", "Adwaita Mono", "Ubuntu Mono", "New Computer Modern"]) {
    assertValue(!notifyThanks.includes(name3), `关于页不应列出主题字体 ${name3}`);
  }
});

console.log("\n【LaTeX 主题的 CM Unicode 等宽字体】");

testCase("cmuntt.ttf 原版字体与 OFL 许可同时存在且摘要匹配", () => {
  const characterBodyPath = `${root}/src/styles/themes/latex-fonts/cmunt.ttf`;
  const twoEnterMake = readFileSync(characterBodyPath);
  assertValue(twoEnterMake.length > 500_000, `cmunt.ttf 体积异常：${twoEnterMake.length}`);
  assertValue(
    [0x00010000, 0x74727565].includes(twoEnterMake.readUInt32BE(0)),
    "cmunt.ttf 不是可识别的 TrueType 字体",
  );
  assertValue(
    createHash("sha256").update(twoEnterMake).digest("hex") ===
      "408c037330446e5f3225add1fcca336e2072c459deb39f5318390004a780de82",
    "cmunt.ttf 与 THIRD-PARTY.md 登记的 CM Unicode 0.7.0 文件不一致",
  );
  const license = read("src/styles/themes/latex-fonts/OFL.txt");
  contains(license, "SIL OPEN FONT LICENSE", "CM Unicode 字体许可");
  contains(license, "Andrey V. Panov", "CM Unicode 版权署名");
});

testCase("LaTeX 主题通过 @font-face 使用包内 cmuntt，且许可证不随核心包分发", () => {
  const css = read("src/styles/themes/latex.css");
  contains(css, 'font-family: "Nota CMU Typewriter"', "@font-face 逻辑家族");
  contains(css, 'url("./latex-fonts/cmunt.ttf")', "主题内字体地址");
  contains(css, '--font-mono: "Nota CMU Typewriter"', "代码块等宽字体栈");
  const tauri = read("src-tauri/tauri.conf.json");
  assertValue(!tauri.includes("latex-fonts"), "LaTeX 字体仍被核心安装包资源列表收录");
});

testCase("LaTeX 数学区与 KaTeX 渲染都使用带中文衬线回退的数学字体栈", () => {
  const base = read("src/styles/theme/base.css");
  const codeBlock = read("src/styles/code-block.css");
  const math = read("src/styles/math.css");
  contains(base, '"Noto Serif CJK SC"', "数学字体栈的中文衬线回退");
  contains(base, '"Source Han Serif SC"', "数学字体栈的思源宋体回退");
  contains(codeBlock, ".nota-code-math-render .katex", "math/latex/tex 围栏的 KaTeX 根");
  contains(codeBlock, "font-family: var(--font-math)", "围栏公式字体");
  contains(math, ".nota-math-render .katex", "行内与块公式的 KaTeX 根");
  contains(math, ".nota-math-preview .katex", "公式编辑预览的 KaTeX 根");
  contains(math, ".nota-math-source", "公式源码框");
  assertValue(
    /\.nota-math-source\s*\{[^}]*font-family:\s*var\(--font-mono\)/s.test(math),
    "公式源码框应与代码框共用等宽字体",
  );
  assertValue(
    /\.nota-math-ruler\s*\{[^}]*font-family:\s*var\(--font-mono\)/s.test(math),
    "公式源码宽度标尺应与源码框共用等宽字体",
  );
  assertValue(
    !codeBlock.includes(".nota-code-math-render .katex *") &&
      !math.includes(".nota-math-render .katex *"),
    "不要用通配符覆盖 KaTeX_Math 等数学专用字形",
  );
});

testCase("块公式的源码与预览是上下两块，预览参与文档流", () => {
  const math = read("src/styles/math.css");
  const openHead = math.indexOf(".nota-math-editing.nota-math-block .nota-math-preview");
  assertValue(openHead >= 0, "块公式预览选择器");
  const tail = math.indexOf("}", openHead);
  const ruleRule = math.slice(openHead, tail + 1);
  contains(ruleRule, "position: relative", "块预览应参与布局");
  contains(ruleRule, "width: 100%", "块预览应占满正文列");
  contains(ruleRule, "border-radius: 0 0 var(--radius-sm) var(--radius-sm)", "下方预览框的下圆角");
  assertValue(!ruleRule.includes("position: absolute"), "块公式预览仍是绝对定位浮层");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
