/**
 * CDE 菜单的整数几何与启动揭幕顺序。
 *
 * 这些值不是视觉偏好：0px pulldown 内边距、20px 行高、1px 边、15px
 * accelerator pad 都来自 Motif/CDE 的资源默认值；启动层不得重新等待整套字体。
 * 用源码断言钉住它们，防止以后把现代菜单规则或 2 秒字体等待顺手加回来。
 */

import { readFileSync } from "node:fs";

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

function 含(文: string, 片: string, 说明: string): void {
  真(文.includes(片), `${说明}：缺少 ${JSON.stringify(片)}`);
}

const 读 = (路径: string) => readFileSync(路径, "utf8");
const css = 读("src/styles/external-themes/cde/theme.css");
const overlayCss = 读("src/styles/overlay.css");
const boot = 读("src/ui/useBootReveal.ts");
const startup = 读("src/ui/useStartup.ts");
const menuBar = 读("src/ui/MenuBar.tsx");
const menuPopup = 读("src/ui/MenuPopup.tsx");
const roving = 读("src/ui/useMenuRovingFocus.ts");
const about = 读("src/ui/AboutDialog.tsx");
const commandTable = 读("src/editor/command-table.ts");

console.log("\n【CDE 菜单几何与启动路径】");

测("pulldown 去掉现代最小宽度与空白内边距", () => {
  含(css, "min-width: 0", "取消 224px 最小宽度");
  含(css, "width: max-content", "按 Motif 内容宽度定宽");
  含(css, "padding: 0;\n  border: 1px solid var(--bevel-dark);", "0px 内边距与 1px 硬边");
  含(css, "box-shadow: none", "取消现代浮层投影");
});

测("菜单行采用 Motif 的 20px 网格与 15px accelerator pad", () => {
  含(css, "height: 20px", "20px 行高");
  含(css, "padding-left: 15px", "LABELG_ACC_PAD");
  含(css, ".menu-check:empty", "普通命令不预留空图标槽");
  含(css, ".menu-arrow:empty", "普通命令不预留空箭头槽");
});

测("顶层菜单条占满 bar，弹层从 bar 底边开始", () => {
  含(css, '[data-ui-style="cde"] .menu-root', "菜单根节点规则");
  含(css, "height: 100%", "菜单根与顶层按钮占满 bar");
  含(css, '[data-ui-style="cde"] .menu-popup {\n  top: 100%;', "弹层贴底");
});

测("状态栏菜单仍向上弹，不被菜单栏的 top:100% 带歪", () => {
  含(css, ".status-menu-anchor .menu-popup", "状态栏锚");
  含(css, "top: auto", "取消向下定位");
  含(css, "bottom: calc(100% + 5px)", "向上弹");
});

测("F10 进入菜单栏；方向键换栏，Enter/↓ 打开当前栏", () => {
  含(menuBar, 'e.key !== "F10"', "F10 判定");
  含(menuBar, "set键盘落点(target.id)", "F10 焦点落点");
  含(menuBar, 'e.key === "ArrowRight"', "左右换栏");
  含(menuBar, 'e.key === "ArrowDown" || e.key === "Enter" || e.key === " "', "打开当前栏");
  含(menuBar, "menu-title-keyboard", "脚本 focus 的可见 armed 态");
  含(css, ".menu-title-keyboard", "CDE armed 样式");
});

测("菜单开着时跨栏悬停不抢当前栏的 armed 态", () => {
  含(menuBar, 'data-menu-open={open === null ? undefined : "true"}', "菜单栏开合状态");
  含(
    css,
    '.menubar[data-menu-open="true"] .menu-title:hover:not(.menu-title-open)',
    "跨栏悬停不亮",
  );
});

测("指针离开条目/弹层会解除 armed；Esc 在子菜单只收一层", () => {
  含(menuPopup, "onMouseLeave={() => roving.setFocusedIndex(-1)}", "弹层离开清高亮");
  含(menuPopup, "roving.setFocusedIndex(-1)", "灰项/分隔线清高亮");
  含(menuPopup, "onCancel: onClose", "子菜单 Esc 只收自己");
  含(roving, "(onCancel ?? onDismiss)()", "Esc 单层取消语义");
});

测("关于窗所有文字落在 16px 点阵网格，行尾记号不依赖 fallback 字符", () => {
  含(css, '[data-ui-style="cde"] .about-dialog *', "关于窗字体覆盖");
  含(css, "font-size: 16px", "原生点阵网格");
  含(overlayCss, ".about-mark-next::before", "CSS 硬边箭头");
  真(!about.includes('"↗"'), "关于窗又使用浏览器字体回退的 ↗");
  真(!about.includes('"›"'), "关于窗又使用浏览器字体回退的 ›");
});

测("工具栏代码块是可见的切换，不静默 no-op", () => {
  含(commandTable, "export function 光标在代码块", "代码块判据");
  含(commandTable, "turnIntoTextCommand", "再按一次退回段落");
  含(commandTable, "createCodeBlockCommand", "普通块转成代码块");
});

测("启动揭幕不再把整套字体加载放进必经链", () => {
  真(!boot.includes("document.fonts?.ready"), "useBootReveal 又等 document.fonts.ready");
  真(!boot.includes("setTimeout(resolve, 2000)"), "useBootReveal 又出现 2 秒字体超时");
  含(boot, "api.window.showMain()", "编辑器就绪后直接显示已预热的窗口");
});

测("启动设置先应用，主题目录等任务继续并行", () => {
  含(startup, "const 工作区任务", "工作区任务先启动");
  含(startup, "const 主题任务", "主题任务先启动");
  含(startup, "const 启动文件任务", "启动文件任务先启动");
  含(startup, "setSettings(s);", "设置一到立即应用");
});

console.log(`\n通过 ${过} 条，失败 ${败} 条`);
if (败 > 0) process.exitCode = 1;
