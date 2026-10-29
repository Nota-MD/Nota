/** 代码块语言选择完成后的焦点与空块逻辑。 */

import { readFileSync } from "node:fs";

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

function assertValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const picker = readFileSync("src/editor/lang-picker.ts", "utf8");
const block = readFileSync("src/editor/code-block.ts", "utf8");
const cm = readFileSync("src/editor/code-block-cm.ts", "utf8");
const blocksCss = readFileSync("src/styles/editor-blocks.css", "utf8");
const chromeCss = readFileSync("src/styles/code-block.css", "utf8");
const diagramCss = readFileSync("src/styles/diagram.css", "utf8");
const diagrams = readFileSync("src/editor/diagram-view.ts", "utf8");

console.log("\n【代码块语言逻辑】");

testCase("点击选项和回车提交后都回到原代码编辑器", () => {
  assertValue(picker.includes("restoreFocus?: () => void"), "语言选择器没有回焦入口");
  assertValue(
    (picker.match(/queueMicrotask\(\(\) => \{/g) ?? []).length >= 2,
    "鼠标选择或回车提交没有在弹层卸载后回焦",
  );
  assertValue(
    block.includes("restoreFocus: () => codeEditor.clusterFocus()"),
    "代码块没有把焦点交回 CodeMirror",
  );
});

testCase("改语言只更新节点属性，不替换代码文本或光标", () => {
  const start = block.indexOf("const applyLanguage");
  const end = block.indexOf("// ⚠️ 语言框", start);
  const implementation = block.slice(start, end);
  assertValue(implementation.includes("setNodeMarkup"), "语言没有写回节点属性");
  assertValue(!implementation.includes("replaceWith"), "改语言仍在替换整块内容");
  assertValue(!implementation.includes("insertText"), "改语言仍在插入文本");
});

testCase("空代码块只保留一个真实空行，语言选择器独立于代码输入", () => {
  assertValue(block.includes('code.className = "nota-code-text"'), "缺少 ProseMirror 代码内容层");
  assertValue(block.includes('langWrap.className = "nota-code-lang-wrap"'), "语言选择器不在独立挂件层");
  assertValue(block.includes('codeEditor.view.dom, gutter, bar, langWrap'), "语言选择器仍混进代码内容层");
});

testCase("代码块编辑态与 token 后代始终使用主题等宽字体", () => {
  assertValue(cm.includes('fontFamily: "var(--font-mono)"'), "CodeMirror 根没有绑定主题等宽字体");
  assertValue(
    /pre \.cm-editor \*\s*\{[^}]*font-family:\s*var\(--font-mono\)/s.test(blocksCss),
    "CodeMirror 后代没有全量等宽字体兜底",
  );
  assertValue(
    blocksCss.includes(".nota-code-wrap:not(.nota-code-math-editing) pre .cm-editor *"),
    "等宽字体兜底没有排除数学源码框",
  );
  assertValue(
    /\.cm-content:focus-visible\s*\{[^}]*outline:\s*none !important/s.test(blocksCss),
    "CodeMirror 的 contenteditable 焦点框仍会出现",
  );
});

testCase("代码框上下留白收紧且行号装订线保持逐行对齐", () => {
  assertValue(
    /\.editor-mount \.ProseMirror pre\s*\{[\s\S]*?padding:\s*8px var\(--nota-code-pad-l\);[\s\S]*?margin:\s*12px 0 24px;/s.test(
      blocksCss,
    ),
    "代码框仍使用过大的上下留白",
  );
  assertValue(
    /\.nota-code-gutter\s*\{[\s\S]*?padding:\s*8px 8px 8px 14px;/s.test(chromeCss),
    "行号装订线的纵向 padding 与代码框不一致",
  );
});

testCase("思维导图向 Mermaid 显式传入明暗模式与完整节点配色", () => {
  assertValue(diagrams.includes("darkMode: dark"), "mindmap 没有显式告诉 Mermaid 明暗模式");
  assertValue(diagrams.includes("mainBkg: surface"), "缺少主节点底色");
  assertValue(diagrams.includes("nodeBorder: border"), "缺少节点边框色");
  assertValue(diagrams.includes("edgeLabelBackground: paper"), "缺少连线标签底色");
  assertValue(diagrams.includes("cScaleLabel${i}`] = text3"), "分支文字没有显式跟随明暗配色");
  assertValue(
    /\.mindmap-edges path,\s*\.mindmap-edges \.edge\s*\{[^}]*stroke:\s*\$\{theme\.mode/s.test(diagrams),
    "思维导图连线没有独立于节点填充色的高对比样式",
  );
  assertValue(
    /\.nota-diagram-preview\s*\{[^}]*background:\s*var\(--doc-bg,\s*var\(--bg\)\)/s.test(diagramCss),
    "图表预览仍在用界面底色，深色外壳会把浅色文档中的图表衬黑",
  );
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
