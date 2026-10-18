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

import { 识别GitHub提示 } from "../src/editor/github-alert";

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

function 读(...段: string[]): string {
  return readFileSync(join(...段), "utf8");
}

const 解析器 = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
const 往返器 = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkStringify);

console.log("\n【GitHub Markdown 兼容】");

测("CommonMark 与 GFM 核心结构都能解析", () => {
  const 源 = [
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
  const 树 = 解析器.parse(源) as { children: Array<{ type: string }> };
  const 类型 = new Set(树.children.map((n) => n.type));
  真(类型.has("heading"), "缺少标题");
  真(类型.has("table"), "缺少表格");
  真(类型.has("list"), "缺少任务/列表");
  真(类型.has("footnoteDefinition"), "缺少脚注定义");
  真(源.includes("~~删除线~~"), "测试源不完整");
});

测("GitHub 徽章是 link > image，并能逐字往返", () => {
  const 源 =
    "[![Release](https://img.shields.io/badge/release-v0.6.0--beta-e95420?style=flat-square)](https://github.com/Nota-MD/Nota/releases)";
  const 根 = 解析器.parse(源) as {
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
  const 链接 = 根.children[0]?.children?.find((n) => n.type === "link");
  真(链接, "找不到徽章外层链接");
  真(链接.type === "link", "徽章外层不是链接");
  真(链接.children?.[0]?.type === "image", "链接里不是图片");
  真(链接.children[0].url?.startsWith("https://img.shields.io/"), "图片地址错误");
  const 回来 = 往返器.processSync(源).toString().trim();
  真(回来 === 源, `徽章往返变化：${回来}`);
});

测("远程 HTTPS/HTTP 图片已加入 CSP img-src", () => {
  const 配置 = JSON.parse(读("src-tauri", "tauri.conf.json")) as {
    app: { security: { csp: string } };
  };
  const csp = 配置.app.security.csp;
  const imgSrc = /img-src ([^;]+);/.exec(csp)?.[1] ?? "";
  真(imgSrc.split(/\s+/).includes("https:"), "CSP 未允许 https 图片");
  真(imgSrc.split(/\s+/).includes("http:"), "CSP 未允许 http 图片");
});

测("五种 GitHub Alert 都能识别，普通引用不误判", () => {
  for (const 类型 of ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"]) {
    真(
      识别GitHub提示(`[!${类型}]`) === 类型.toLowerCase(),
      `${类型} 未识别`,
    );
    真(
      识别GitHub提示(`[!${类型}]\n正文`) === 类型.toLowerCase(),
      `${类型} 带下一行正文时未识别`,
    );
  }
  真(识别GitHub提示("[!NOTE] 后面还有字") === null, "标记必须独占首行");
  真(识别GitHub提示("普通引用") === null, "普通引用被误判");
});

测("公式、Mermaid 与块级 HTML 的处理链仍已接线", () => {
  const 装配 = 读("src", "editor", "assemble.ts");
  const 样式入口 = 读("src", "main.tsx");
  真(装配.includes(".use(math.filter("), "缺少公式插件");
  真(装配.includes(".use(图表解析())"), "缺少 Mermaid 图表解析");
  真(装配.includes(".use(块HTML规格插件)"), "缺少块级 HTML 节点");
  真(装配.includes(".use(GitHub提示插件)"), "缺少 GitHub Alert 装饰");
  真(样式入口.includes('import "./styles/github-alert.css";'), "缺少 Alert 样式");
});

console.log(`\n通过 ${过} 条，失败 ${败} 条`);
if (败 > 0) process.exitCode = 1;
