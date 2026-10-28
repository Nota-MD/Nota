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
 *   得真的 `.use()` 了、`main.tsx` 里得真的引了那份 CSS、内置文档主题里得
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

import {
  visionFrequencyExtension,
  IsVideoSource,
  parseImageMarkdownSource,
} from "@/editor/video-view";

/* ── 一支极小的测试工装（与 `file-kind.test.ts` 同一套长相）── */

let pass = 0;
let fail = 0;
const failed: string[] = [];

function testCase(name: string, body3: () => void): void {
  try {
    body3();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    fail++;
    failed.push(name);
    console.log(`  ✘ ${name}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function group(name3: string): void {
  console.log(`\n【${name3}】`);
}

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

function read(phaseCorrect: string): string {
  return readFileSync(join(...phaseCorrect.split("/")), "utf8");
}

/* ── 一、判据 ───────────────────────────────────────────────────────── */

group("一、哪个地址算视频");

testCase("那四个后缀都认（大写小写一样认）", () => {
  for (const tail of visionFrequencyExtension) {
    equal(IsVideoSource(`x.${tail}`), true, `.${tail}`);
    equal(IsVideoSource(`x.${tail.toUpperCase()}`), true, `.${tail} 大写`);
  }
});

testCase("⚠️ 带查询串／片段的那种也算（先切掉再取后缀）", () => {
  // ⚠️ 这是这一格**最容易写错**的地方，而且症状很迷惑：不带参数的能播、
  // 带了参数的变回破图标——用户会以为"视频支持时灵时不灵"。
  // `#t=3` 那种是 Media Fragments（从第 3 秒起播），浏览器自己认。
  equal(IsVideoSource("a.mp4?t=3"), true, "查询串");
  equal(IsVideoSource("a.mp4#t=3"), true, "片段");
  equal(IsVideoSource("https://x.test/a/b.mp4?t=3&v=2#t=5"), true, "全都有");
  equal(IsVideoSource("a.webm?v=1"), true, "另一种后缀也走同一条路");
});

testCase("⚠️ 图片一律不认（这条判错了就是把一张图当视频播）", () => {
  for (const tail of ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"]) {
    equal(IsVideoSource(`x.${tail}`), false, `.${tail}`);
  }
});

testCase("⚠️ `.mov` / `.mkv` / `.avi` **有意的**不认（容器里的编码不保证播得动）", () => {
  // ⚠️ 认了它们、而 WebKitGTK 播不动时的产物是**一块黑框**——比一张破图标更糟：
  // 破图标至少还写着 `alt`。这条判据的理由写在源码里那个常量上，别顺手放宽。
  for (const tail of ["mov", "mkv", "avi", "flv", "wmv"]) {
    equal(IsVideoSource(`x.${tail}`), false, `.${tail}`);
  }
});

testCase("点开头的隐藏文件不算（`.bashrc` 没有后缀）", () => {
  equal(IsVideoSource(".mp4"), false, "整个名字就是一个点开头的");
  equal(IsVideoSource("/home/x/.mp4"), false, "带路径的");
  equal(IsVideoSource(""), false, "空串");
});

testCase("没有后缀、或者后缀在目录那一段，都不算", () => {
  equal(IsVideoSource("a"), false, "没有点");
  equal(IsVideoSource("/a.mp4/b"), false, "点只在目录里");
  equal(IsVideoSource("https://x.test/video"), false, "一个没后缀的网址");
});

testCase("路径、相对路径、`data:` 一律只看尾巴", () => {
  equal(IsVideoSource("/tmp/素材/演示.MP4"), true, "绝对路径 ＋ 大写");
  equal(IsVideoSource("./sub/演示.mp4"), true, "相对路径");
  equal(IsVideoSource("C:\\素材\\演示.webm"), true, "反斜杠分隔");
});

/* ── 二、那张后缀单子本身 ───────────────────────────────────────────── */

group("二、后缀单子");

testCase("⚠️ 每条都必须是**小写、不带点**的裸后缀", () => {
  // ⚠️ 写成 `".mp4"`（带点）或 `"MP4"`（大写）的后果不是报错，是**永远判不出来**
  // ——而这个模块里没有任何东西会因此抱怨。
  if (visionFrequencyExtension.length === 0) throw new Error("空单子");
  for (const tail of visionFrequencyExtension) {
    if (tail !== tail.toLowerCase()) throw new Error(`这条不是小写：${tail}`);
    if (tail.startsWith(".")) throw new Error(`这条带了点：${tail}`);
    if (tail.trim() !== tail) throw new Error(`这条首尾有空白：${JSON.stringify(tail)}`);
  }
});

testCase("⚠️ 没有重复项（重复不清不楚，还说明有人复制粘贴时没看）", () => {
  equal(new Set(visionFrequencyExtension).size, visionFrequencyExtension.length, "去重之后的条数");
});

/* ── 三、⚠️ 挂上了没有（NodeView 本体在这儿测不了）────────────────── */

group("三、⚠️ 三处接线（读源码）");

testCase("`assemble.ts` 真的把文档路径交给 `.use(视频视图(文档路径))` 了", () => {
  // ⚠️ 写完不接的症状：`![](a.mp4)` 还画着破图标，而代码"看起来写完了"。
  // ⚠️ 2026-10-07：读的文件从 `create.ts` 换成了 `assemble.ts`——整条 `.use()`
  //    链搬去了那边（`docs/07` 第 89 项），"挂了没有"这件事只有那边答得了。
  const source3 = read("src/editor/assemble.ts");
  if (!source3.includes('from "./video-view"')) throw new Error("assemble.ts 没有引 video-view");
  if (!source3.includes(".use(visionFrequencyView(documentPath))"))
    throw new Error("assemble.ts 引了但没把当前文档路径交给视频/图片视图");
});

testCase("`main.tsx` 真的引了 `video.css`", () => {
  // ⚠️ 漏引**不报错**，只是编辑区里那段视频不缩、把正文列顶宽。
  const source3 = read("src/main.tsx");
  if (!source3.includes('import "./styles/video.css"'))
    throw new Error("main.tsx 里没有 import ./styles/video.css");
});

testCase("⚠️ 内置文档主题里有那条 `video`（导出那条路全靠它）", () => {
  // ⚠️ 导出会把 `nota-` 开头的类名全摘掉（`editor/export.ts`），所以
  // `src/styles/video.css` 里那条选择器在导出的 HTML 里**一个字都匹配不上**。
  // 2026-10-18 起安装包只内置 Adwaita；深色主题由同一份 theme.css 拼接颜色
  // 补丁，因此排版规则只存在于这一份。漏掉时症状是导出后视频顶宽。
  const source3 = read("src/styles/themes/adwaita/theme.css");
  if (!/^video \{/m.test(source3) && !/^img,\nvideo \{/m.test(source3))
    throw new Error("themes/adwaita/theme.css 里没有 video 那条");
});

group("四、图片的 Markdown 源文行");

testCase("点击后显示、离开后隐藏", () => {
  const source3 = read("src/editor/video-view.ts");
  if (!source3.includes('source.className = "nota-image-source"'))
    throw new Error("没有图片源文输入框");
  if (!source3.includes('initial.mediaBody.addEventListener("mousedown"'))
    throw new Error("图片点击仍交给 ProseMirror 绘制节点选区");
  if (!source3.includes("initial.isVisionFrequency || !(event instanceof MouseEvent) || event.button !== 0"))
    throw new Error("右键仍会触发图片隐藏源文的显示或隐藏");
  if (source3.includes("sourceBody?.select()"))
    throw new Error("图片源文仍会全选并产生蓝色文本选区");
  if (!source3.includes("selectNode: () =>")) throw new Error("图片没有单独的选中分支");
  if (!source3.includes('initial.dom.classList.remove("is-selected")'))
    throw new Error("程序化选中仍会把隐藏源文打开");
  if (!source3.includes("deselectNode: ()")) throw new Error("图片取消选中时没有收起源文");
});

testCase("隐藏源文不使用输入框外框或焦点色", () => {
  const source3 = read("src/styles/video.css");
  if (
    !/\.nota-image-source\s*\{[\s\S]*?padding:\s*0;[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/s.test(
      source3,
    )
  )
    throw new Error("图片源文仍带输入框外观");
  if (
    !/\.nota-image-source:focus-visible\s*\{[^}]*outline:\s*none;[^}]*box-shadow:\s*none;/s.test(
      source3,
    )
  )
    throw new Error("图片源文聚焦时仍有轮廓");
  if (!/\.nota-image-source\s*\{[\s\S]*?font:\s*inherit;/s.test(source3))
    throw new Error("图片源文仍使用代码字体而不是正文样式");
  if (!/\.nota-image-source\s*\{[\s\S]*?caret-color:\s*var\(--accent\);/s.test(source3))
    throw new Error("图片源文没有恢复被编辑区隐藏的光标颜色");
  if (/\.nota-image-source\s*\{[\s\S]*?font-family:\s*var\(--font-mono\)/s.test(source3))
    throw new Error("图片源文仍被固定为等宽字体");
});

testCase("源文解析保留 alt、地址和可选标题", () => {
  equal(
    JSON.stringify(parseImageMarkdownSource('![图](docs/a.png "标题")')),
    JSON.stringify({ alt: "图", src: "docs/a.png", title: "标题" }),
    "完整图片语法",
  );
  equal(
    JSON.stringify(parseImageMarkdownSource("![](a.png)")),
    JSON.stringify({ alt: "", src: "a.png", title: "" }),
    "空 alt/标题",
  );
  equal(parseImageMarkdownSource("not an image"), null, "坏语法必须拒绝");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log(`失败的：\n  - ${failed.join("\n  - ")}`);
  process.exitCode = 1;
}
