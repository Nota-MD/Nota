/**
 * GitHub Flavored Markdown 兼容面：解析、往返、远程图片与 Alert 识别。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

import { recognizeDistinguishGitHubNotice } from "../src/editor/github-alert";

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

function read(...paragraph2: string[]): string {
  return readFileSync(join(...paragraph2), "utf8");
}

const parseDevice = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
const roundtripDevice = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkStringify);

console.log("\n【GitHub Markdown 兼容】");

testCase("CommonMark 与 GFM 核心结构都能解析", () => {
  const source3 = [
    "# 标题",
    "",
    "~~删除线~~ 和 https://example.com/autolink",
    "",
    "- [x] 已完成",
    "- [ ] 未完成",
    "",
    "| A | B |",
    "| :- | -: |",
    "| 1 | 2 |",
    "",
    "脚注[^a]。",
    "",
    "[^a]: 注释正文",
  ].join("\n");
  const tree = parseDevice.parse(source3) as { children: Array<{ type: string }> };
  const type = new Set(tree.children.map((n) => n.type));
  assertValue(type.has("heading"), "缺少标题");
  assertValue(type.has("table"), "缺少表格");
  assertValue(type.has("list"), "缺少任务/列表");
  assertValue(type.has("footnoteDefinition"), "缺少脚注定义");
  assertValue(source3.includes("~~删除线~~"), "测试源不完整");
});

testCase("GitHub 徽章是 link > image，并能逐字往返", () => {
  const source3 =
    "[![Release](https://img.shields.io/badge/release-v0.6.0--beta-e95420?style=flat-square)](https://github.com/Nota-MD/Nota/releases)";
  const root = parseDevice.parse(source3) as {
    children: Array<{
      type: string;
      url?: string;
      children?: Array<{
        type: string;
        url?: string;
        children?: Array<{ type: string; url?: string }>;
      }>;
    }>;
  };
  const link = root.children[0]?.children?.find((n) => n.type === "link");
  assertValue(link, "找不到徽章外层链接");
  assertValue(link.type === "link", "徽章外层不是链接");
  assertValue(link.children?.[0]?.type === "image", "链接里不是图片");
  assertValue(link.children[0].url?.startsWith("https://img.shields.io/"), "图片地址错误");
  const returnCome = roundtripDevice.processSync(source3).toString().trim();
  assertValue(returnCome === source3, `徽章往返变化：${returnCome}`);
});

testCase("远程 HTTPS/HTTP 图片已加入 CSP img-src", () => {
  const configurePlace = JSON.parse(read("src-tauri", "tauri.conf.json")) as {
    app: { security: { csp: string } };
  };
  const csp = configurePlace.app.security.csp;
  const imgSrc = /img-src ([^;]+);/.exec(csp)?.[1] ?? "";
  assertValue(imgSrc.split(/\s+/).includes("https:"), "CSP 未允许 https 图片");
  assertValue(imgSrc.split(/\s+/).includes("http:"), "CSP 未允许 http 图片");
});

testCase("五种 GitHub Alert 都能识别，普通引用不误判", () => {
  for (const type of ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"]) {
    assertValue(
      recognizeDistinguishGitHubNotice(`[!${type}]`) === type.toLowerCase(),
      `${type} 未识别`,
    );
    assertValue(
      recognizeDistinguishGitHubNotice(`[!${type}]\n正文`) === type.toLowerCase(),
      `${type} 带下一行正文时未识别`,
    );
  }
  assertValue(recognizeDistinguishGitHubNotice("[!NOTE] 后面还有字") === null, "标记必须独占首行");
  assertValue(recognizeDistinguishGitHubNotice("普通引用") === null, "普通引用被误判");
});

testCase("公式、Mermaid 与块级 HTML 的处理链仍已接线", () => {
  const installConfigure = read("src", "editor", "assemble.ts");
  const styleStyleEnterMouth = read("src", "main.tsx");
  assertValue(installConfigure.includes(".use(math.filter("), "缺少公式插件");
  assertValue(installConfigure.includes(".use(diagramView)"), "缺少 Mermaid 图表解析");
  assertValue(installConfigure.includes(".use(blockHTMLSpecPlugin)"), "缺少块级 HTML 节点");
  assertValue(installConfigure.includes(".use(gitHubNoticePlugin)"), "缺少 GitHub Alert 装饰");
  assertValue(styleStyleEnterMouth.includes('import "./styles/github-alert.css";'), "缺少 Alert 样式");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
