/** GitHub 风格文档检查：只报能确定的写作/无障碍问题。 */

import { auditMarkdown } from "../src/editor/document-audit";

let pass = 0;
let fail = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail++;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

console.log("\n【文档检查】");

testCase("缺替代文字的 Markdown 与 HTML 图片都会被找到", () => {
  const issues = auditMarkdown([
    "![](a.png)",
    '<img src="b.png">',
    "![有效说明](c.png)",
    '<img src="d.png" alt="有效说明">',
  ].join("\n"));
  assert(
    issues.filter((issue) => issue.code === "image-alt-missing").length === 2,
    JSON.stringify(issues),
  );
});

testCase("标题跳级与同级重名都会报告行号", () => {
  const issues = auditMarkdown("# 标题\n\n### 跳级\n\n### 跳级\n");
  assert(
    issues.some(
      (issue) => issue.code === "heading-level-skip" && issue.line === 3,
    ),
    "没有报告跳级",
  );
  assert(
    issues.some(
      (issue) => issue.code === "heading-duplicate" && issue.line === 5,
    ),
    "没有报告重名",
  );
});

testCase("脚注引用与定义双向检查", () => {
  const issues = auditMarkdown("引用[^a] 和 定义[^b]: 文\n\n[^c]: 孤立\n");
  assert(
    issues.some(
      (issue) =>
        issue.code === "footnote-missing-definition" && issue.detail === "a",
    ),
    "缺定义未报告",
  );
  assert(
    issues.some(
      (issue) =>
        issue.code === "footnote-missing-reference" && issue.detail === "c",
    ),
    "孤立定义未报告",
  );
});

testCase("危险链接、空链接与 rowheaders 边界", () => {
  const issues = auditMarkdown([
    "[点击](javascript:alert(1))",
    "[](https://example.com)",
    "{% rowheaders %}",
    "| A | B |",
    "| --- | --- |",
  ].join("\n"));
  assert(issues.some((issue) => issue.code === "dangerous-link"), "危险链接");
  assert(issues.some((issue) => issue.code === "link-label-empty"), "空链接");
  assert(
    issues.some((issue) => issue.code === "rowheaders-unbalanced"),
    "边界未闭合",
  );
});

testCase("代码围栏里的伪语法不参与检查", () => {
  const issues = auditMarkdown("```md\n![](a.png)\n### 跳级\n```\n");
  assert(issues.length === 0, JSON.stringify(issues));
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
