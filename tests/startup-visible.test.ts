/** 主窗口只在编辑器可输入后显示。 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    pass += 1;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail += 1;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

console.log("\n【启动窗口可见性】");

testCase("主窗口先隐藏预热，就绪后再显示", () => {
  const config = JSON.parse(
    readFileSync(join(process.cwd(), "src-tauri/tauri.conf.json"), "utf8"),
  ) as {
    app: {
      windows: Array<{
        label: string;
        visible?: boolean;
        skipTaskbar?: boolean;
        x?: number;
        y?: number;
        minWidth?: number;
        minHeight?: number;
      }>;
    };
  };
  const main = config.app.windows.find((window) => window.label === "main");
  assertValue(main?.visible === false, "主窗口不能在编辑器可输入前露出");
  assertValue(main?.skipTaskbar === true, "预热阶段不能提前占用任务栏");
  assertValue(main?.x === undefined && main?.y === undefined, "不能把主窗口预创建在屏幕外");
});

testCase("主窗口保留设置页与编辑区所需的最小尺寸", () => {
  const config = JSON.parse(
    readFileSync(join(process.cwd(), "src-tauri/tauri.conf.json"), "utf8"),
  ) as {
    app: { windows: Array<{ label: string; minWidth?: number; minHeight?: number }> };
  };
  const main = config.app.windows.find((window) => window.label === "main");
  assertValue(main?.minWidth === 720, "主窗口最小宽度不是 720px");
  assertValue(main?.minHeight === 520, "主窗口最小高度不是 520px");
});

testCase("入口不再绘制 Nota 加载动画", () => {
  const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
  assertValue(!html.includes('id="nota-boot"'), "仍有启动文字层");
  assertValue(!html.includes("html:not([data-booted]) #root"), "应用内容仍被启动层遮住");
});

testCase("编辑器聚焦后才宣告 ready", () => {
  const source = readFileSync(join(process.cwd(), "src/ui/EditorPane.tsx"), "utf8");
  const boot = readFileSync(join(process.cwd(), "src/ui/useBootReveal.ts"), "utf8");
  assertValue(source.includes("finishEditorBootstrap("), "EditorPane 没有走统一启动收尾");
  const helper = boot.indexOf("export function finishEditorBootstrap");
  const focusFirst = boot.indexOf("editor.focusAtStart()", helper);
  const editable = boot.indexOf('contenteditable="true"', helper);
  const ready = boot.indexOf("markEditorReady();", helper);
  assertValue(helper >= 0, "缺少编辑器启动收尾函数");
  assertValue(focusFirst > helper && editable > focusFirst, "没有在聚焦后确认可编辑面");
  assertValue(ready > editable, "markEditorReady 必须排在聚焦和可编辑面确认之后");
});

testCase("窗口同时等待界面主题和文档主题", () => {
  const source = readFileSync(join(process.cwd(), "src/ui/useBootReveal.ts"), "utf8");
  assertValue(source.includes("documentThemeReady"), "揭幕没有等待文档主题");
  assertValue(source.includes("DOCUMENT_THEME_READY_EVENT"), "文档主题完成时不会唤醒揭幕");
});

testCase("字体诊断排在窗口揭幕后的空闲帧", () => {
  const source = readFileSync(join(process.cwd(), "src/ui/useDocTheme.ts"), "utf8");
  const gate = source.indexOf("deferUntilWindowIdle(() =>");
  const load = source.indexOf("document.fonts.load", gate);
  assertValue(gate >= 0, "字体诊断没有等待窗口揭幕");
  assertValue(load > gate, "字体诊断仍在揭幕前主动加载全部主题字体");
});

testCase("大体积文档主题只保留最后一份绘制缓存", () => {
  const source = readFileSync(join(process.cwd(), "src/styles/doc-theme.ts"), "utf8");
  assertValue(
    /paintedThemeCacheLimit\s*=\s*1\b/.test(source),
    "大型导入主题仍可能同时保留四份 CSS 与绘制结果",
  );
});

testCase("macOS 开关跟随主题色", () => {
  const color = readFileSync(join(process.cwd(), "src/styles/theme/color.css"), "utf8");
  const mac = color.match(/\[data-ui-style="macos"\]\[data-ui-mode="(?:light|dark)"\][\s\S]*?\n\}/g) ?? [];
  assertValue(mac.length >= 2, "找不到 macOS 两档颜色");
  for (const block of mac) {
    assertValue(block.includes("--switch-on: var(--accent)"), "macOS 开关仍绕过主题色");
  }
});

testCase("窗口真正显示后重新把焦点交给正文", () => {
  const source = readFileSync(join(process.cwd(), "src/ui/EditorPane.tsx"), "utf8");
  const handler = source.indexOf("const focusAfterReveal");
  assertValue(
    source.includes('window.addEventListener("nota-window-shown"'),
    "没有监听窗口显示完成事件",
  );
  assertValue(
    handler >= 0 && source.indexOf("handleRef.current?.focus()", handler) > handler,
    "原生窗口显示后没有重新聚焦正文",
  );
});

testCase("源码模式挂载点有确定高度，CodeMirror 不会收成空白", () => {
  const css = readFileSync(join(process.cwd(), "src/styles/editor.css"), "utf8");
  const rule = /\.editor-pane-source\s+\.editor-mount\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? "";
  assertValue(rule.includes("height: 100%;"), "源码模式挂载点没有占满编辑区");
  assertValue(rule.includes("min-height: 0;"), "源码模式挂载点缺少可收缩高度");
});

testCase("揭幕动作是显示原生窗口，而不是播放网页动画", () => {
  const source = readFileSync(join(process.cwd(), "src/ui/useBootReveal.ts"), "utf8");
  assertValue(/api\.window\s*\.showMain\(\)/.test(source), "没有调用宿主显示窗口");
  assertValue(!source.includes("opacity"), "仍有网页透明度动画");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
