/**
 * CDE 菜单的整数几何与启动揭幕顺序。
 *
 * 这些值不是视觉偏好：0px pulldown 内边距、20px 行高、1px 边、15px
 * accelerator pad 都来自 Motif/CDE 的资源默认值；启动层不得重新等待整套字体。
 * 用源码断言钉住它们，防止以后把现代菜单规则或 2 秒字体等待顺手加回来。
 */

import { readFileSync } from "node:fs";

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

function contains(text4: string, slice: string, description: string): void {
  assertValue(text4.includes(slice), `${description}：缺少 ${JSON.stringify(slice)}`);
}

const read = (path: string) => readFileSync(path, "utf8");
const css = read("src/styles/external-themes/cde/theme.css");
const overlayCss = read("src/styles/overlay.css");
const boot = read("src/ui/useBootReveal.ts");
const startup = read("src/ui/useStartup.ts");
const menuBar = read("src/ui/MenuBar.tsx");
const menuPopup = read("src/ui/MenuPopup.tsx");
const roving = read("src/ui/useMenuRovingFocus.ts");
const about = read("src/ui/AboutDialog.tsx");
const commandTable = read("src/editor/command-table.ts");

console.log("\n【CDE 菜单几何与启动路径】");

testCase("pulldown 去掉现代最小宽度与空白内边距", () => {
  contains(css, "min-width: 0", "取消 224px 最小宽度");
  contains(css, "width: max-content", "按 Motif 内容宽度定宽");
  contains(css, "padding: 0;\n  border: 1px solid var(--bevel-dark);", "0px 内边距与 1px 硬边");
  contains(css, "box-shadow: none", "取消现代浮层投影");
});

testCase("菜单行采用 Motif 的 20px 网格与 15px accelerator pad", () => {
  contains(css, "height: 20px", "20px 行高");
  contains(css, "padding-left: 15px", "LABELG_ACC_PAD");
  contains(css, ".menu-check:empty", "普通命令不预留空图标槽");
  contains(css, ".menu-arrow:empty", "普通命令不预留空箭头槽");
});

testCase("顶层菜单条占满 bar，弹层从 bar 底边开始", () => {
  contains(css, '[data-ui-style="cde"] .menu-root', "菜单根节点规则");
  contains(css, "height: 100%", "菜单根与顶层按钮占满 bar");
  contains(css, '[data-ui-style="cde"] .menu-popup {\n  top: 100%;', "弹层贴底");
});

testCase("状态栏菜单仍向上弹，不被菜单栏的 top:100% 带歪", () => {
  contains(css, ".status-menu-anchor .menu-popup", "状态栏锚");
  contains(css, "top: auto", "取消向下定位");
  contains(css, "bottom: calc(100% + 5px)", "向上弹");
});

testCase("F10 进入菜单栏；方向键换栏，Enter/↓ 打开当前栏", () => {
  contains(menuBar, 'e.key !== "F10"', "F10 判定");
  contains(menuBar, "setKeyDiskDropPoint(target.id)", "F10 焦点落点");
  contains(menuBar, 'e.key === "ArrowRight"', "左右换栏");
  contains(menuBar, 'e.key === "ArrowDown" || e.key === "Enter" || e.key === " "', "打开当前栏");
  contains(menuBar, "menu-title-keyboard", "脚本 focus 的可见 armed 态");
  contains(css, ".menu-title-keyboard", "CDE armed 样式");
});

testCase("菜单开着时跨栏悬停不抢当前栏的 armed 态", () => {
  contains(menuBar, 'data-menu-open={open === null ? undefined : "true"}', "菜单栏开合状态");
  contains(
    css,
    '.menubar[data-menu-open="true"] .menu-title:hover:not(.menu-title-open)',
    "跨栏悬停不亮",
  );
});

testCase("指针离开条目/弹层会解除 armed；Esc 在子菜单只收一层", () => {
  contains(menuPopup, "onMouseLeave={() => roving.setFocusedIndex(-1)}", "弹层离开清高亮");
  contains(menuPopup, "roving.setFocusedIndex(-1)", "灰项/分隔线清高亮");
  contains(menuPopup, "onCancel: onClose", "子菜单 Esc 只收自己");
  contains(roving, "(onCancel ?? onDismiss)()", "Esc 单层取消语义");
});

testCase("关于窗所有文字落在 16px 点阵网格，行尾记号不依赖 fallback 字符", () => {
  contains(css, '[data-ui-style="cde"] .about-dialog *', "关于窗字体覆盖");
  contains(css, "font-size: 16px", "原生点阵网格");
  contains(overlayCss, ".about-mark-next::before", "CSS 硬边箭头");
  assertValue(!about.includes('"↗"'), "关于窗又使用浏览器字体回退的 ↗");
  assertValue(!about.includes('"›"'), "关于窗又使用浏览器字体回退的 ›");
});

testCase("工具栏代码块是可见的切换，不静默 no-op", () => {
  contains(commandTable, "export function cursorAtCodeBlock", "代码块判据");
  contains(commandTable, "turnIntoTextCommand", "再按一次退回段落");
  contains(commandTable, "createCodeBlockCommand", "普通块转成代码块");
});

testCase("启动揭幕不再把整套字体加载放进必经链", () => {
  assertValue(!boot.includes("document.fonts?.ready"), "useBootReveal 又等 document.fonts.ready");
  assertValue(!boot.includes("setTimeout(resolve, 2000)"), "useBootReveal 又出现 2 秒字体超时");
  assertValue(
    /api\.window\s*\.showMain\(\)/.test(boot),
    "编辑器就绪后直接显示已预热的窗口",
  );
});

testCase("启动设置先应用，主题目录等任务继续并行", () => {
  contains(startup, "const workWorkAreaTaskTask", "工作区任务先启动");
  contains(startup, "const themeTask", "主题任务先启动");
  contains(startup, "const startActionTextItemTaskTask", "启动文件任务先启动");
  contains(startup, "setSettings(s);", "设置一到立即应用");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
