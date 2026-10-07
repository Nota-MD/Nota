/**
 * `src/editor/video-view.ts`（图片语法指向视频时画成播放器）的**可运行**测试集。
 * 2026-09-28 写，与那个文件同批落地。
 *
 * # 跑法
 *
 * ```sh
 * npx esbuild tests/video-view.test.ts --bundle --platform=node --format=esm \
 *   --alias:@=./src --outfile=/tmp/nota-tests/video-view.mjs
 * node /tmp/nota-tests/video-view.mjs
 * ```
 *
 * # 这份测试盯的是什么
 *
 * - **第一组是判据**（纯函数）：哪个地址算视频。这里面**全是"写错了不报错、
 *   只是时灵时不灵"的坑**——尤其是带查询串那条（`a.mp4?t=3`，见下）。
 * - **第二组是那张后缀单子本身**：写成 `".mp4"`（多点）或者 `"MP4"`（大写）
 *   都会让它**永远判不出来**，而没有任何东西会抱怨。
 * - **第三组是"挂上了没有"**：NodeView 本体在本仓**测不了**（没有 DOM），
 *   但"写完了没接上"是这一批最容易发生、也最贵的一类错——三种实例少接一处，
 *   症状就是某一块地方还画着破图标。所以这一组去**读源码**：`create.ts` 里
 *   得真的 `.use()` 了、`main.tsx` 里得真的引了那份 CSS、三份文档主题里得
 *   真的有那条 `video`（导出那条路只认元素选择器）。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - ⚠️ **「`![](a.mp4)` 在屏幕上真的变成播放器了」没验**：`document.createElement`
 *   那一整条路要有真 DOM 才跑得起来（本仓没有 jsdom）。**播放、点一下选中、
 *   拖进度条、全屏**这四件事同样只能开窗目检（`docs/07` 第 88 项）。
 * - ⚠️ **「导出的 HTML 里真的有 `<video>`」没验**：那是 `editor/export.ts` 摘
 *   `innerHTML` 的结果，要靠离屏实例 ＋ 真 DOM，同上一批。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { 视频后缀, 是视频地址 } from "@/editor/video-view";

/* ── 一支极小的测试工装（与 `file-kind.test.ts` 同一套长相）── */

let 过 = 0;
let 败 = 0;
const 败的: string[] = [];

function 测(名称: string, 体: () => void): void {
  try {
    体();
    过++;
    console.log(`  ✔ ${名称}`);
  } catch (e) {
    败++;
    败的.push(名称);
    console.log(`  ✘ ${名称}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function 组(名: string): void {
  console.log(`\n【${名}】`);
}

function 等(实际: unknown, 期望: unknown, 说明: string): void {
  if (实际 !== 期望) {
    throw new Error(`${说明}：期望 ${JSON.stringify(期望)}，实际 ${JSON.stringify(实际)}`);
  }
}

function 读(相对: string): string {
  return readFileSync(join(...相对.split("/")), "utf8");
}

/* ── 一、判据 ───────────────────────────────────────────────────────── */

组("一、哪个地址算视频");

测("那四个后缀都认（大写小写一样认）", () => {
  for (const 尾 of 视频后缀) {
    等(是视频地址(`x.${尾}`), true, `.${尾}`);
    等(是视频地址(`x.${尾.toUpperCase()}`), true, `.${尾} 大写`);
  }
});

测("⚠️ 带查询串／片段的那种也算（先切掉再取后缀）", () => {
  // ⚠️ 这是这一格**最容易写错**的地方，而且症状很迷惑：不带参数的能播、
  // 带了参数的变回破图标——用户会以为"视频支持时灵时不灵"。
  // `#t=3` 那种是 Media Fragments（从第 3 秒起播），浏览器自己认。
  等(是视频地址("a.mp4?t=3"), true, "查询串");
  等(是视频地址("a.mp4#t=3"), true, "片段");
  等(是视频地址("https://x.test/a/b.mp4?t=3&v=2#t=5"), true, "全都有");
  等(是视频地址("a.webm?v=1"), true, "另一种后缀也走同一条路");
});

测("⚠️ 图片一律不认（这条判错了就是把一张图当视频播）", () => {
  for (const 尾 of ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"]) {
    等(是视频地址(`x.${尾}`), false, `.${尾}`);
  }
});

测("⚠️ `.mov` / `.mkv` / `.avi` **有意的**不认（容器里的编码不保证播得动）", () => {
  // ⚠️ 认了它们、而 WebKitGTK 播不动时的产物是**一块黑框**——比一张破图标更糟：
  // 破图标至少还写着 `alt`。这条判据的理由写在源码里那个常量上，别顺手放宽。
  for (const 尾 of ["mov", "mkv", "avi", "flv", "wmv"]) {
    等(是视频地址(`x.${尾}`), false, `.${尾}`);
  }
});

测("点开头的隐藏文件不算（`.bashrc` 没有后缀）", () => {
  等(是视频地址(".mp4"), false, "整个名字就是一个点开头的");
  等(是视频地址("/home/x/.mp4"), false, "带路径的");
  等(是视频地址(""), false, "空串");
});

测("没有后缀、或者后缀在目录那一段，都不算", () => {
  等(是视频地址("a"), false, "没有点");
  等(是视频地址("/a.mp4/b"), false, "点只在目录里");
  等(是视频地址("https://x.test/video"), false, "一个没后缀的网址");
});

测("路径、相对路径、`data:` 一律只看尾巴", () => {
  等(是视频地址("/tmp/素材/演示.MP4"), true, "绝对路径 ＋ 大写");
  等(是视频地址("./sub/演示.mp4"), true, "相对路径");
  等(是视频地址("C:\\素材\\演示.webm"), true, "反斜杠分隔");
});

/* ── 二、那张后缀单子本身 ───────────────────────────────────────────── */

组("二、后缀单子");

测("⚠️ 每条都必须是**小写、不带点**的裸后缀", () => {
  // ⚠️ 写成 `".mp4"`（带点）或 `"MP4"`（大写）的后果不是报错，是**永远判不出来**
  // ——而这个模块里没有任何东西会因此抱怨。
  if (视频后缀.length === 0) throw new Error("空单子");
  for (const 尾 of 视频后缀) {
    if (尾 !== 尾.toLowerCase()) throw new Error(`这条不是小写：${尾}`);
    if (尾.startsWith(".")) throw new Error(`这条带了点：${尾}`);
    if (尾.trim() !== 尾) throw new Error(`这条首尾有空白：${JSON.stringify(尾)}`);
  }
});

测("⚠️ 没有重复项（重复不清不楚，还说明有人复制粘贴时没看）", () => {
  等(new Set(视频后缀).size, 视频后缀.length, "去重之后的条数");
});

/* ── 三、⚠️ 挂上了没有（NodeView 本体在这儿测不了）────────────────── */

组("三、⚠️ 三处接线（读源码）");

测("`assemble.ts` 真的 `.use(视频视图)` 了", () => {
  // ⚠️ 写完不接的症状：`![](a.mp4)` 还画着破图标，而代码"看起来写完了"。
  // ⚠️ 2026-10-07：读的文件从 `create.ts` 换成了 `assemble.ts`——整条 `.use()`
  //    链搬去了那边（`docs/07` 第 89 项），"挂了没有"这件事只有那边答得了。
  const 源 = 读("src/editor/assemble.ts");
  if (!源.includes('from "./video-view"')) throw new Error("assemble.ts 没有引 video-view");
  if (!源.includes(".use(视频视图)")) throw new Error("assemble.ts 引了但没 .use()");
});

测("`main.tsx` 真的引了 `video.css`", () => {
  // ⚠️ 漏引**不报错**，只是编辑区里那段视频不缩、把正文列顶宽。
  const 源 = 读("src/main.tsx");
  if (!源.includes('import "./styles/video.css"'))
    throw new Error("main.tsx 里没有 import ./styles/video.css");
});

测("⚠️ 三份文档主题里都有那条 `video`（导出那条路全靠它）", () => {
  // ⚠️ 导出会把 `nota-` 开头的类名全摘掉（`editor/export.ts`），所以
  // `src/styles/video.css` 里那条选择器在导出的 HTML 里**一个字都匹配不上**。
  // 漏一份的症状是"某几套主题导出之后视频顶宽"，而截图分享时才发现。
  for (const 名 of ["minimal", "adwaita", "latex"]) {
    const 源 = 读(`src/styles/themes/${名}.css`);
    if (!/^video \{/m.test(源) && !/^img,\nvideo \{/m.test(源))
      throw new Error(`themes/${名}.css 里没有 video 那条`);
  }
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${过} 条，失败 ${败} 条`);
if (败) {
  console.log(`失败的：\n  - ${败的.join("\n  - ")}`);
  process.exitCode = 1;
}
