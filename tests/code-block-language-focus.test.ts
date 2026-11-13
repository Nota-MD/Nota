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
const editorCss = readFileSync("src/styles/editor.css", "utf8");
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

testCase("源码面强制左对齐，不让 Typora 图表主题把代码居中", () => {
  const css = readFileSync(`${process.cwd()}/src/styles/editor-blocks.css`, "utf8");
  assertValue(
    /\.nota-source-surface[\s\S]*?\.cm-line\s*\{[^}]*text-align:\s*left\s*!important/s.test(css),
    "源码面没有覆盖 Typora 图表面板继承的居中规则",
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
    /\.editor-mount \.ProseMirror pre,[\s\S]*?\.nota-source-surface\s*\{[\s\S]*?border:\s*1px solid var\(--border\);[\s\S]*?border-color:\s*color-mix\(in srgb, var\(--border\) 62%, transparent\)/s.test(
      blocksCss,
    ),
    "统一源码表面的边框缺少颜色兼容回退或仍然过重",
  );
  assertValue(!block.includes("foldBtn"), "折叠按钮仍在创建");
  assertValue(!block.includes("copyBtn"), "复制按钮仍在创建");
  assertValue(!block.includes("nota-code-bar"), "代码块仍创建工具栏容器");
  assertValue(!chromeCss.includes(".nota-code-bar"), "代码块工具栏样式仍未删除");
});

testCase("旧 WebView2 不支持 color-mix 时代码框仍有边框和底色", () => {
  assertValue(
    /\.editor-mount \.ProseMirror pre,[\s\S]*?\.nota-source-surface\s*\{[\s\S]*?border:\s*1px solid var\(--border\);[\s\S]*?background:\s*var\(--bg-subtle\);[\s\S]*?background:\s*color-mix\(/s.test(
      blocksCss,
    ),
    "代码块没有在 color-mix 前提供纯色边框和底色",
  );
});

testCase("语言选择只有一个可编辑输入框和结果列表", () => {
  assertValue(chromeCss.includes("width: clamp(148px, 28%, 280px);"), "语言输入框仍然过窄");
  assertValue(
    /\.nota-code-lang-wrap\s*\{[\s\S]*?top:\s*auto;[\s\S]*?bottom:\s*-24px;[\s\S]*?height:\s*24px;/s.test(
      chromeCss,
    ),
    "语言选择框没有按代码块底边锚定，WebView2 下会出现额外缝隙",
  );
  assertValue(
    /\.nota-lang-popup\s*\{[\s\S]*?box-sizing:\s*border-box;[\s\S]*?min-width:\s*0;/s.test(
      chromeCss,
    ),
    "语言候选层仍保留独立最小宽度",
  );
  assertValue(
    picker.includes('pop.style.width = `${r.width}px`') &&
      picker.includes('pop.style.minWidth = "0"'),
    "语言候选层没有复用输入框宽度",
  );
  assertValue(
    picker.includes('optionName.className = "nota-lang-option-name"'),
    "过长语言名没有可省略的文本层",
  );
  assertValue(
    /\.nota-code-lang-input\s*\{[\s\S]*?height:\s*24px/s.test(chromeCss),
    "唯一语言输入框没有合并原来的闭合控件",
  );
  assertValue(
    /\.nota-code-lang-input:focus\s*\{[^}]*text-align:\s*center/s.test(chromeCss),
    "语言输入框聚焦后没有保持居中",
  );
  assertValue(
    picker.includes('field.className = "nota-code-lang-input"'),
    "语言选择器没有使用唯一输入框",
  );
  assertValue(
    !picker.includes("nota-lang-search") &&
      !picker.includes('document.createElement("button")'),
    "语言选择器仍保留独立下拉触发器和重复搜索框",
  );
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

testCase("代码块配对括号和引号，但反引号保持字面输入", () => {
  assertValue(cm.includes('from "@codemirror/autocomplete"'), "没有加载 CodeMirror 括号配对扩展");
  assertValue(cm.includes("...closeBracketsKeymap"), "括号配对键位没有接回代码块");
  assertValue(cm.includes("closeBrackets()"), "括号配对扩展没有启用到代码块");
  assertValue(
    cm.includes('brackets: ["(", "[", "{", "\'", \'"\']'),
    "配对表缺少常用括号或引号",
  );
  assertValue(
    !cm.includes('brackets: ["(", "[", "{", "\'", \'"\', "`"]'),
    "反引号仍会被自动补全",
  );
});

testCase("嵌入式代码块把光标绑定到真实字符或空行", () => {
  assertValue(!cm.includes("drawSelection()"), "代码块仍启用了 CodeMirror 的光标层");
  assertValue(cm.includes("class CodeBlockCaret"), "代码块没有自己的光标覆盖层");
  assertValue(
    cm.includes("Decoration.mark({ class: caretAfterClass })") &&
      cm.includes("Decoration.mark({ class: caretBeforeClass })") &&
      cm.includes("Decoration.line({ class: emptyCaretClass })"),
    "代码块光标没有绑定到字符或空行",
  );
  assertValue(
    !cm.includes("Decoration.widget") && !cm.includes("WidgetType"),
    "代码块仍在行尾使用可能被 WebKit 换行的 Widget",
  );
  assertValue(
    blocksCss.includes(".nota-code-caret-before") &&
      blocksCss.includes(".nota-code-caret-after") &&
      blocksCss.includes(".nota-code-empty-caret"),
    "代码块光标覆盖层没有样式",
  );
  assertValue(
    /\.nota-code-caret-after::after\s*\{[^}]*left:\s*calc\(100% - 1px\)/s.test(
      blocksCss,
    ),
    "行尾光标没有绑定到前一个字符的右侧",
  );
  assertValue(
    /:is\(\.nota-code-caret-before,\s*\.nota-code-empty-caret\)::before\s*\{[^}]*left:\s*-1px/s.test(
      blocksCss,
    ),
    "行首与空行光标没有绑定到字符左侧",
  );
  assertValue(
    /\.editor-mount \.ProseMirror \.nota-code-cm \.cm-content,[\s\S]*?\.editor-mount \.ProseMirror \.nota-code-cm \.cm-line\s*\{[^}]*caret-color:\s*transparent\s*!important/s.test(
      editorCss,
    ),
    "通用 CodeMirror 原生光标规则仍覆盖代码块的透明光标",
  );
  assertValue(
    cm.includes("inline-mark-v8") &&
      cm.includes("forced-color-adjust") &&
      cm.includes("rgba(0, 0, 0, 0)"),
    "代码块没有用 WebView2 可覆盖的内联透明光标兜底",
  );
});

testCase("代码块在 IME 组合态交还原生光标", () => {
  assertValue(
    cm.includes("const imeNativeCaret = EditorView.domEventHandlers"),
    "代码块没有监听 IME 组合事件",
  );
  assertValue(
    cm.includes('compositionstart(_event, view)') &&
      cm.includes('caret-color", "var(--accent)"'),
    "代码块 preedit 期间没有显示跟随候选的原生光标",
  );
  assertValue(
    cm.includes('contentDOM.classList.add(imeComposingClass)') &&
      cm.includes('contentDOM.classList.remove(imeComposingClass)'),
    "代码块没有在组合开始和结束时切换光标归属",
  );
  assertValue(
    /\.cm-content\.nota-ime-composing[\s\S]*?\.nota-code-caret-after::after\s*\{[\s\S]*?display:\s*none\s*!important/s.test(
      editorCss,
    ),
    "代码块组合态仍可能同时显示自绘光标",
  );
});

testCase("语言选择框按真实布局坐标贴住代码块底边", () => {
  assertValue(block.includes("placeLanguagePicker"), "没有运行时语言框定位");
  assertValue(
    block.includes("langWrap.offsetParent") &&
      block.includes("pre.offsetHeight - pre.clientTop"),
    "语言框定位没有使用不受浏览器缩放二次换算的布局尺寸",
  );
  assertValue(
    block.includes('document.addEventListener("scroll"') &&
      block.includes("languageLayoutObserver"),
    "语言框没有在滚动和尺寸变化后重新对齐",
  );
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
