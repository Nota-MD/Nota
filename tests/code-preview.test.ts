/**
 * `editor/code-preview.ts` 那条判据「**这段语言算不算 HTML**」的可运行测试集
 * （2026-10-16，用户点名：「如果代码框语言是html的话，在下面可以直接显示预览，
 * 类似流程图那样」）。
 *
 * # 跑法
 *
 * ```sh
 * npx esbuild tests/code-preview.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-测试/code-preview.mjs
 * node /tmp/nota-测试/code-preview.mjs
 * ```
 *
 * ⚠️ **不需要** `--alias:@=./src`：这一份只 import `@/editor/code-preview`…
 * 那是要的——它里面有 `document.createElement`。所以真正能在这里测的只有
 * **纯函数那一半**（`是HTML`），建 DOM 的那一半靠开窗目检
 *（`docs/06` §5.67）。
 *
 * # 为什么这条判据值得单独一份测试
 *
 * 它长得很像"三行 `includes`"，但**写错的样子全都静默**：
 *
 * - 只认小写 `html`：语言选择器写进节点的值来自 `refractor` 那张表，而
 *   用户手写的围栏可以是 ` ```HTML `、` ```html `、` ```xhtml `——认不出的
 *   症状是**预览根本不出现**，而"没出现"和"这个语言不支持"在屏幕上长得一样；
 * - 归一化写成 `startsWith("html")`：`htmlbars`（Ember 那个模板语言，真的在
 *   `refractor` 的表里）会被错认成 HTML，于是那个代码块下面冒出一个空白框；
 * - 忘了 `trim()`：手写围栏里 ` ```html ` 后面多一个空格是常事。
 *
 * ⚠️ **它证明不了**"预览真的画出来了"：那要真 DOM ＋ 真编辑器（本仓没有
 * jsdom）。沙箱属性、去抖、以及"语言改成 python 之后那一块收起来了"三条都在
 * 开窗那一半里量（`docs/06` §5.67）。
 */

import { 是HTML } from "@/editor/code-preview";

let 过 = 0;
let 败 = 0;

function 判(条件: boolean, 说明: string) {
  if (条件) {
    过++;
  } else {
    败++;
    console.log(`  ✘ ${说明}`);
  }
}

console.log("【一、认得出的那三个】");
for (const 语 of ["html", "htm", "xhtml"]) {
  判(是HTML(语), `${语} 算 HTML`);
}

console.log("【二、大小写与空白】");
判(是HTML("HTML"), "全大写算");
判(是HTML("Html"), "首字母大写算");
判(是HTML("  html  "), "两端有空白算");
判(是HTML("XHTML"), "XHTML 大写算");

console.log("【三、不该认的那些】");
判(!是HTML(""), "空串不算（没选语言）");
判(!是HTML("htmlbars"), "htmlbars **不算**——`startsWith` 那种写法会把它认进来");
判(!是HTML("htmlish"), "htmlish 不算");
判(!是HTML("markdown"), "markdown 不算");
判(!是HTML("vue"), "vue 不算（今天不认 SFC）");
判(!是HTML("xml"), "xml 不算——它不是网页，渲染出来是一张错误页");
判(!是HTML("javascript"), "javascript 不算");

console.log("────────────────────────────────────────────────────────────────");
console.log(`通过 ${过} 条，失败 ${败} 条`);
process.exit(败 === 0 ? 0 : 1);
