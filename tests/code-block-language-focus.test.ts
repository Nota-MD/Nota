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
const diagramRender = readFileSync("src/editor/diagram-render.ts", "utf8");

console.log("\n【代码块语言逻辑】");

testCase("点击选项和回车提交后都回到原代码编辑器", () => {
  assertValue(picker.includes("restoreFocus?: () => void"), "语言选择器没有回焦入口");
  assertValue(
    (picker.match(/queueMicrotask\(\(\) => \{/g) ?? []).length >= 2,
    "鼠标选择或回车提交没有在弹层卸载后回焦",
  );
  assertValue(
    block.includes("restoreFocus: () => codeEditor?.clusterFocus()"),
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
  assertValue(block.includes("bootstrap, langWrap"), "语言选择器仍混进代码内容层");
});

testCase("代码块编辑态与 token 后代始终使用主题等宽字体", () => {
  assertValue(cm.includes('fontFamily: "var(--font-mono)"'), "CodeMirror 根没有绑定主题等宽字体");
  assertValue(
    /\.nota-source-surface \.cm-editor \*\s*\{[^}]*font-family:\s*var\(--font-mono\)/s.test(blocksCss),
    "CodeMirror 后代没有全量等宽字体兜底",
  );
  assertValue(
    blocksCss.includes(".nota-source-surface .cm-editor *"),
    "等宽字体兜底没有接到统一源码表面",
  );
  assertValue(
    /\.cm-content:focus-visible\s*\{[^}]*outline:\s*none !important/s.test(blocksCss),
    "CodeMirror 的 contenteditable 焦点框仍会出现",
  );
});

testCase("隐藏的 ProseMirror 文本层不参与可视选区和命中测试", () => {
  const rule = chromeCss.match(
    /\.editor-mount \.ProseMirror pre \.nota-code-text\s*\{([\s\S]*?)\n\}/,
  )?.[1];
  assertValue(rule, "找不到隐藏代码内容层的样式");
  assertValue(/left:\s*-100000px !important;/.test(rule), "隐藏代码内容层仍压在可视区域内");
  assertValue(/display:\s*block !important;/.test(rule), "文档主题可把隐藏代码层改成行内显示");
  assertValue(/visibility:\s*hidden !important;/.test(rule), "隐藏代码内容层仍可能被浏览器绘制");
  assertValue(/pointer-events:\s*none !important;/.test(rule), "隐藏代码内容层仍会接收指针事件");
  assertValue(/user-select:\s*none !important;/.test(rule), "隐藏代码内容层仍会被原生选区画出");
  assertValue(/-webkit-user-select:\s*none !important;/.test(rule), "WebKit 原生选区仍能选中隐藏代码层");
  assertValue(
    block.includes('code.style.setProperty(property, value, "important")'),
    "隐藏代码内容层的关键样式没有以内联 important 隔离第三方主题",
  );
  assertValue(
    block.includes('code.setAttribute("aria-hidden", "true")'),
    "隐藏代码内容层仍暴露给无障碍树",
  );
});

testCase("代码框上下留白收紧且行号装订线保持逐行对齐", () => {
  assertValue(
    /\.editor-mount \.ProseMirror pre,[\s\S]*?\.nota-source-surface\s*\{[\s\S]*?padding:\s*8px 14px;/s.test(
      blocksCss,
    ),
    "代码框仍使用过大的上下留白",
  );
  assertValue(
    block.includes("nativeLineNumbers: true"),
    "普通代码块没有与 Mermaid、LaTeX 共用 CodeMirror 行号",
  );
  assertValue(
    !block.includes('gutter.className = "nota-code-gutter"'),
    "旧的独立行号层仍在创建",
  );
});

testCase("外部文档主题不能把代码框下方的语言选择器裁掉", () => {
  assertValue(
    /\.editor-mount \.ProseMirror pre\s*\{[^}]*overflow:\s*visible !important;/s.test(
      blocksCss,
    ),
    "代码框 overflow 仍会被 GitHub 等外部主题改成 auto",
  );
  assertValue(
    /\.nota-code-wrap\s*\{[^}]*overflow:\s*visible;/s.test(chromeCss),
    "代码块外层仍可能在边界裁切语言选择器",
  );
});

testCase("代码框外框更轻，折叠与复制按钮已移除", () => {
  assertValue(
    blocksCss.includes("background: color-mix(in srgb, var(--bg-subtle) 76%, var(--doc-bg));"),
    "代码块仍有厚重底色",
  );
  assertValue(
    /\.editor-mount \.ProseMirror pre,[\s\S]*?\.nota-source-surface\s*\{[\s\S]*?border:\s*1px solid color-mix\(in srgb, var\(--border\) 62%, transparent\)/s.test(
      blocksCss,
    ),
    "统一源码表面的边框仍然过重",
  );
  assertValue(!block.includes("foldBtn"), "折叠按钮仍在创建");
  assertValue(!block.includes("copyBtn"), "复制按钮仍在创建");
  assertValue(!block.includes("nota-code-bar"), "代码块仍创建工具栏容器");
  assertValue(!chromeCss.includes(".nota-code-bar"), "代码块工具栏样式仍未删除");
});

testCase("语言选择贴近 Typora：宽按钮、搜索框和更高的结果列表", () => {
  assertValue(chromeCss.includes("width: clamp(148px, 28%, 280px);"), "语言按钮仍然过窄");
  assertValue(/\.nota-lang-popup\s*\{[\s\S]*?min-width:\s*240px/s.test(chromeCss), "语言弹层仍然过窄");
  assertValue(/\.nota-lang-input\s*\{[\s\S]*?height:\s*34px/s.test(chromeCss), "语言搜索框仍然过矮");
  assertValue(picker.includes("const popupMostLargeHeight = 360;"), "语言列表高度仍被压得过低");
});

testCase("思维导图向 Mermaid 显式传入明暗模式与完整节点配色", () => {
  assertValue(diagramRender.includes("darkMode: dark"), "mindmap 没有显式告诉 Mermaid 明暗模式");
  assertValue(diagramRender.includes("mainBkg: surface"), "缺少主节点底色");
  assertValue(diagramRender.includes("nodeBorder: border"), "缺少节点边框色");
  assertValue(diagramRender.includes("edgeLabelBackground: paper"), "缺少连线标签底色");
  assertValue(diagramRender.includes("cScaleLabel${i}`] = text3"), "分支文字没有显式跟随明暗配色");
  assertValue(
    /\.mindmap-edges path,\s*\.mindmap-edges \.edge\s*\{[^}]*stroke:\s*\$\{theme\.mode/s.test(diagramRender),
    "思维导图连线没有独立于节点填充色的高对比样式",
  );
  assertValue(
    diagramRender.includes("text-anchor: middle !important"),
    "思维导图节点文字没有默认水平居中",
  );
  assertValue(
    diagramRender.includes("justify-content: center !important"),
    "思维导图 HTML 标签没有默认居中",
  );
  assertValue(
    /\.nota-diagram-preview\s*\{[^}]*background:\s*var\(--doc-bg,\s*var\(--bg\)\)/s.test(diagramCss),
    "图表预览仍在用界面底色，深色外壳会把浅色文档中的图表衬黑",
  );
});

testCase("Mermaid 源码只在当前图表获得焦点时显示", () => {
  assertValue(
    /\.nota-diagram-source-shell\s*\{[^}]*display:\s*none/s.test(diagramCss),
    "图表源码框默认仍然常驻",
  );
  assertValue(
    /\.nota-diagram-editing\s+\.nota-diagram-source-shell\s*\{[^}]*display:\s*block/s.test(diagramCss),
    "图表进入编辑态时源码框没有展开",
  );
  assertValue(
    diagrams.includes('dom.classList.add("nota-diagram-editing")'),
    "图表视图没有编辑态类",
  );
  assertValue(
    diagrams.includes('preview.addEventListener("mousedown"'),
    "点击渲染图不能进入源码编辑",
  );
  assertValue(
    diagrams.includes("nativeLineNumbers: true"),
    "Mermaid CodeMirror 没有接入全局行号设置",
  );
});

testCase("CodeMirror 嵌入编辑器实时跟随全局行号开关", () => {
  const source = readFileSync("src/editor/code-block-cm.ts", "utf8");
  assertValue(
    source.includes('attributeFilter: ["data-code-wrap", "data-code-line-numbers"]'),
    "CodeMirror 没有监听行号设置变化",
  );
  assertValue(
    source.includes("lineNumberCabin.reconfigure(wantLineNumbers() ? lineNumbers() : [])"),
    "CodeMirror 行号开关不能即时重配",
  );
});

testCase("代码块恢复括号、引号和反引号自动配对", () => {
  assertValue(cm.includes('from "@codemirror/autocomplete"'), "没有加载 CodeMirror 括号配对扩展");
  assertValue(cm.includes("...closeBracketsKeymap"), "括号配对键位没有接回代码块");
  assertValue(cm.includes("closeBrackets()"), "括号配对扩展没有启用到代码块");
  assertValue(
    cm.includes('brackets: ["(", "[", "{", "\'", \'"\', "`"]'),
    "配对表缺少常用括号、引号或反引号",
  );
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
