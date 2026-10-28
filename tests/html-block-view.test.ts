/**
 * `src/editor/html-block-view.ts` 的纯判据。
 *
 * 本仓没有 jsdom，所以这里不伪造一次 DOMPurify 渲染。这里钉住的是两件能在
 * Node 里精确验证、也最容易在维护白名单时改坏的事：
 *
 * 1. GitHub README 常用标签与属性仍被允许，脚本/表单/内联样式仍被拒绝；
 * 2. URL 第二道闸门对相对地址、HTTP(S)、mailto/tel 与危险协议的口径。
 *
 * 真实 DOM 中的净化与图片显示由应用窗口回归验证。
 */

import {
  hTMLCleanConvertConfigurePlace,
  allowedHtmlAttributes,
  allowedHtmlTags,
  isSafeHtmlUrl,
} from "../src/editor/html-block-view";
import { Schema } from "@milkdown/kit/prose/model";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { readFileSync } from "node:fs";

let passed = 0;
let failure = 0;
const failureList: string[] = [];
let currentGroup = "";

function group(name3: string): void {
  currentGroup = name3;
  console.log(`\n── ${name3} ${"─".repeat(Math.max(0, 56 - name3.length))}`);
}

function testCase(name3: string, body3: () => void): void {
  try {
    body3();
    passed++;
    console.log(`  ✔ ${name3}`);
  } catch (e) {
    failure++;
    failureList.push(`${currentGroup} / ${name3}`);
    console.log(`  ✘ ${name3}\n      ${(e as Error).message.split("\n").join("\n      ")}`);
  }
}

function equal<T>(actual2: T, period: T, description = ""): void {
  const a = JSON.stringify(actual2);
  const b = JSON.stringify(period);
  if (a !== b) throw new Error(`${description}\n      实际：${a}\n      期望：${b}`);
}

function assertValue(value2: unknown, description: string): asserts value2 {
  if (!value2) throw new Error(description);
}

group("一、白名单");

testCase("README 的居中块、标题、图片、链接与徽章结构都能渲染", () => {
  for (const label of ["p", "h1", "a", "img", "div", "span", "br", "table"]) {
    equal(allowedHtmlTags.includes(label as never), true, `缺少 ${label}`);
  }
  for (const attribute of ["align", "src", "href", "alt", "width", "height", "title"]) {
    equal(allowedHtmlAttributes.includes(attribute as never), true, `缺少 ${attribute}`);
  }
});

testCase("脚本、iframe、表单、SVG 与内联样式不在白名单", () => {
  for (const label of ["script", "iframe", "object", "embed", "form", "svg", "style"]) {
    equal(allowedHtmlTags.includes(label as never), false, `不应允许 ${label}`);
    equal(hTMLCleanConvertConfigurePlace.FORBID_TAGS.includes(label as never), true, `应显式禁止 ${label}`);
  }
  for (const attribute of ["style", "class", "id", "srcdoc"]) {
    equal(allowedHtmlAttributes.includes(attribute as never), false, `不应允许 ${attribute}`);
    equal(hTMLCleanConvertConfigurePlace.FORBID_ATTR.includes(attribute as never), true, `应显式禁止 ${attribute}`);
  }
});

group("二、地址");

testCase("HTTP(S)、相对路径、片段与协议相对地址", () => {
  for (const address of [
    "https://img.shields.io/badge/Nota-0.9.0-blue",
    "http://example.com/a.png",
    "assets/a.png",
    "./assets/a.png",
    "../assets/a.png",
    "/assets/a.png",
    "#usage",
    "//example.com/a.png",
  ]) {
    equal(isSafeHtmlUrl(address, "src"), true, address);
  }
});

testCase("mailto / tel 只用于链接，asset / file 只用于图片", () => {
  equal(isSafeHtmlUrl("mailto:a@example.com", "href"), true, "mailto");
  equal(isSafeHtmlUrl("tel:+10000000000", "href"), true, "tel");
  equal(isSafeHtmlUrl("mailto:a@example.com", "src"), false, "mailto 不能作图片");
  equal(isSafeHtmlUrl("asset://localhost/a.png", "src"), true, "asset 图片");
  equal(isSafeHtmlUrl("file:///home/a.png", "src"), true, "本地图片交给宿主读取");
  equal(isSafeHtmlUrl("file:///home/a.png", "href"), false, "链接不保留 file:");
});

testCase("脚本、内联数据与模糊协议全部拒绝", () => {
  for (const address of [
    "javascript:alert(1)",
    "java\tscript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html,<script>alert(1)</script>",
    "blob:https://example.com/id",
    "unknown-protocol:value",
  ]) {
    equal(isSafeHtmlUrl(address, "href"), false, address);
    equal(isSafeHtmlUrl(address, "src"), false, address);
  }
});

testCase("Windows 本地图片路径可以交给宿主读取", () => {
  equal(isSafeHtmlUrl("C:\\图\\nota.png", "src"), true, "盘符路径");
  equal(isSafeHtmlUrl("\\\\server\\share\\nota.png", "src"), true, "UNC 路径");
  equal(isSafeHtmlUrl("C:\\图\\nota.png", "href"), false, "路径不能变成链接");
});

testCase("整块渲染区域进入编辑，编辑态右上角显示结束编辑勾号", () => {
  const source = readFileSync("src/editor/html-block-view.ts", "utf8");
  const css = readFileSync("src/styles/editor-inline.css", "utf8");
  assertValue(source.includes("if (!sourceMode) setSourceMode(true)"), "渲染区域没有整块编辑入口");
  assertValue(source.includes('splitReplace.title = open2 ? t("Finish editing")'), "编辑态按钮不是结束编辑");
  assertValue(
      source.includes("root.contains(document.activeElement)) return") &&
      source.includes("if (sourceMode) setSourceMode(false)"),
    "焦点离开整块后没有自动结束编辑",
  );
  assertValue(
    /\.nota-html-source-toggle\[aria-pressed="true"\]::after\s*\{[^}]*transform:\s*rotate\(45deg\)/s.test(
      css,
    ),
    "编辑态按钮没有矢量勾号",
  );
  assertValue(
    /\.nota-html-source-mode \.nota-html-source\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*justify-content:\s*center;/s.test(
      css,
    ),
    "HTML 源码框没有在垂直方向居中",
  );
});

testCase("HTML 标签和边框只在悬停或块内获得焦点时出现", () => {
  const css = readFileSync("src/styles/editor-inline.css", "utf8");
  assertValue(
    /\.nota-html-block\s*\{[^}]*outline:\s*1px solid transparent;/s.test(css),
    "HTML 块没有预留透明边框",
  );
  assertValue(
    /\.nota-html-block:hover,\s*\.editor-mount \.ProseMirror\) \.nota-html-block:focus-within\s*\{[^}]*outline-color:\s*var\(--border\)/s.test(
      css,
    ) ||
      /\.nota-html-block:hover,[\s\S]*?\.nota-html-block:focus-within\s*\{[^}]*outline-color:\s*var\(--border\)/s.test(
        css,
      ),
    "悬停或块内聚焦时没有显示边框",
  );
  assertValue(
    !/\.nota-html-block\.ProseMirror-selectednode \.nota-html-source-toggle/.test(css),
    "整块选中后仍会脱离鼠标悬停显示 HTML 标签",
  );
});

testCase("HTML 渲染块在启动与拖动时都不会产生原生蓝色选区", () => {
  const css = readFileSync("src/styles/editor-inline.css", "utf8");
  const view = readFileSync("src/editor/html-block-view.ts", "utf8");
  const create = readFileSync("src/editor/create.ts", "utf8");
  assertValue(
    /\.nota-html-render\s*\{[^}]*user-select:\s*none;[^}]*\}?/s.test(css) &&
      css.includes("-webkit-user-select: none"),
    "HTML 渲染区仍允许浏览器生成原生选区",
  );
  assertValue(
    /\.nota-html-source\s*\{[\s\S]*?user-select:\s*text;/s.test(css),
    "源码编辑框没有恢复文本选择",
  );
  assertValue(
    /\.nota-html-block\.ProseMirror-selectednode[\s\S]*?outline-color:\s*transparent/s.test(
      css,
    ),
    "程序化 NodeSelection 仍会显示轮廓",
  );
  assertValue(
    view.includes('show.addEventListener("mousedown"') &&
      view.includes("event.preventDefault();") &&
      view.includes("if (!sourceMode) setSourceMode(true);"),
    "渲染区鼠标按下时没有阻断选区并进入源码编辑",
  );
  assertValue(
    view.includes("if (event.button !== 0) return;") &&
      view.includes("if (event.button === 0) event.preventDefault();"),
    "HTML 块没有区分左右键",
  );
  assertValue(
    create.includes("TextSelection.between(state.doc.resolve(0), state.doc.resolve(0))") &&
      !/state\.tr\.setSelection\(\s*TextSelection\.atStart/.test(
        create.slice(create.indexOf("const cursorToOpenHead"), create.indexOf("return {")),
      ),
    "启动落点仍可能退化为 HTML 原子块的 NodeSelection",
  );
});

testCase("文档以 HTML 原子块开头时，打开位置会越过它落到文本节点", () => {
  const schema = new Schema({
    nodes: {
      text: { group: "inline" },
      paragraph: { group: "block", content: "inline*" },
      html: { group: "block", atom: true, selectable: true },
      doc: { content: "block+" },
    },
  });
  const doc = schema.node("doc", null, [
    schema.node("html", { value: "<p>badge</p>" }),
    schema.node("paragraph", null, [schema.text("正文")]),
  ]);
  const oldOpening = TextSelection.atStart(doc);
  const opening = TextSelection.between(doc.resolve(0), doc.resolve(0));
  assertValue(
    oldOpening instanceof NodeSelection,
    "前置条件不成立：atStart 没有复现 HTML 原子块整块选中",
  );
  assertValue(opening instanceof TextSelection, "打开位置仍停在 HTML 原子块上");
  equal(opening.from, 2, "打开位置没有落到第一个文本节点");
});

testCase("HTML 链接优先打开，不把点击吞成进入源码编辑", () => {
  const view = readFileSync("src/editor/html-block-view.ts", "utf8");
  const links = readFileSync("src/ui/useLinkClick.ts", "utf8");
  assertValue(view.includes('if (target.closest("a[href]")) return;'), "HTML 块仍吞掉链接点击");
  assertValue(
    links.includes('element?.closest(\'[data-type="html-block"]\')'),
    "链接分流没有识别 HTML 块",
  );
  assertValue(links.includes("openRawHtmlLink(chain.href"), "HTML 链接没有进入打开流程");
  assertValue(links.includes("openUrl(address)"), "外部链接没有交给系统浏览器");
  assertValue(links.includes("openDocument(localLocal)"), "相对链接没有交给文档打开流程");
});

console.log(`\n${"─".repeat(64)}`);
if (failure) {
  console.log(`通过 ${passed} 条，失败 ${failure} 条：`);
  for (const name3 of failureList) console.log(`  · ${name3}`);
  process.exit(1);
}
console.log(`通过 ${passed} 条，失败 0 条`);
