/** 更新设置页与可交互通知的契约。 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;

function testCase(name3: string, body3: () => void): void {
  try {
    body3();
    pass += 1;
    console.log(`  ✔ ${name3}`);
  } catch (error) {
    fail += 1;
    console.log(`  ✘ ${name3}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValue(value2: unknown, description: string): asserts value2 {
  if (!value2) throw new Error(description);
}

function read(...paragraph2: string[]): string {
  return readFileSync(join(...paragraph2), "utf8");
}

console.log("\n【更新设置与通知】");

testCase("更新设置是独立持久化页面", () => {
  const rust = read("src-tauri", "src", "settings", "updates.rs");
  const types = read("src", "bridge", "types-settings.ts");
  const dialog = read("src", "ui", "settings", "SettingsDialog.tsx");
  assertValue(rust.includes("check_on_startup"), "Rust 缺少启动检查字段");
  assertValue(rust.includes("notify_when_available"), "Rust 缺少更新通知字段");
  assertValue(rust.includes("notification_position"), "Rust 缺少通知位置字段");
  assertValue(types.includes("export interface UpdateSettings"), "前端缺少更新设置类型");
  assertValue(dialog.includes('| "updates"'), "设置左栏缺少更新页");
  assertValue(dialog.includes("<UpdatePane"), "更新页没有接线");
});

testCase("通知开关依赖启动检查，且许可证不再重复在通用页", () => {
  const pane = read("src", "ui", "settings", "panes", "UpdatePane.tsx");
  const general = read("src", "ui", "settings", "panes", "GeneralPane.tsx");
  assertValue(pane.includes("disabled={!u.check_on_startup}"), "通知开关没有依赖启动检查");
  assertValue(!general.includes('title={t("License")}'), "通用页仍重复许可证组");
});

testCase("通知支持位置和操作按钮", () => {
  const general = read("src", "ui", "settings", "panes", "GeneralPane.tsx");
  const update = read("src", "ui", "settings", "panes", "UpdatePane.tsx");
  const toasts = read("src", "ui", "Toasts.tsx");
  const css = read("src", "styles", "toast.css");
  assertValue(general.includes('label={t("Notification position")}'), "通知位置没有落在通用页");
  assertValue(!update.includes('label={t("Notification position")}'), "更新页仍重复通知位置");
  assertValue(toasts.includes("data-position"), "通知容器没有位置属性");
  assertValue(toasts.includes("ToastAction"), "通知没有操作类型");
  assertValue(toasts.includes("toast-action"), "通知没有操作按钮");
  assertValue(css.includes('[data-position="top-center"]'), "缺少顶部通知样式");
});

testCase("启动检查只在首份设置到岸后执行一次", () => {
  const hook = read("src", "ui", "useUpdateNotifications.ts");
  assertValue(hook.includes("started.current"), "没有防重复检查");
  assertValue(hook.includes("check_on_startup"), "没有读取启动检查开关");
  assertValue(hook.includes("notify_when_available"), "没有读取通知开关");
});

testCase("菜单栏默认 Nota 自绘，外观设置可切系统原生", () => {
  const rust = read("src-tauri", "src", "settings", "appearance.rs");
  const types = read("src", "bridge", "types-settings.ts");
  const pane = read("src", "ui", "settings", "panes", "AppearancePane.tsx");
  const hooks = read("src", "ui", "useMenus.ts");
  assertValue(rust.includes("MenuBarRenderer"), "Rust 缺少菜单栏渲染枚举");
  assertValue(rust.includes("menu_renderer: MenuBarRenderer::Nota"), "默认不是 Nota 自绘");
  assertValue(types.includes('export type MenuBarRenderer = "nota" | "system"'), "前端类型不对");
  assertValue(pane.includes('label={t("Menu bar rendering")}'), "外观页没有菜单样式选项");
  assertValue(pane.includes("<Select") && pane.includes('{ value: "system", label: t("System native") }'), "菜单样式必须使用下拉框");
  assertValue(pane.includes('label: t("Nota (self-drawn)")'), "默认选项没有说明为 Nota 自绘");
  assertValue(hooks.includes('menuRenderer !== "system"'), "菜单钩子没有尊重渲染设置");
});

testCase("最大化或全屏时按设置强制使用 Nota 菜单", () => {
  const rust = read("src-tauri", "src", "settings", "appearance.rs");
  const types = read("src", "bridge", "types-settings.ts");
  const pane = read("src", "ui", "settings", "panes", "AppearancePane.tsx");
  const immersive = read("src", "ui", "useImmersive.ts");
  const hooks = read("src", "ui", "useMenus.ts");
  const app = read("src", "App.tsx");
  const appCss = read("src", "styles", "app.css");
  assertValue(
    rust.includes("force_nota_menu_when_expanded: true"),
    "Rust 默认没有开启最大化/全屏菜单兜底",
  );
  assertValue(
    types.includes("force_nota_menu_when_expanded: boolean"),
    "前端设置类型缺少最大化/全屏菜单兜底",
  );
  assertValue(
    pane.includes('label={t("Force Nota menu when maximized or full screen")}'),
    "外观页缺少最大化/全屏菜单兜底开关",
  );
  assertValue(immersive.includes("isMaximized()"), "没有读取窗口最大化状态");
  assertValue(hooks.includes("effectiveMenuRenderer"), "没有统一的菜单渲染覆盖判据");
  assertValue(
    app.includes("maximized || fullscreen"),
    "最大化/全屏没有接到菜单渲染器",
  );
  assertValue(
    appCss.includes(".app[data-zen=\"true\"] .zen-top:hover .toolbar"),
    "全屏时鼠标移到窗口顶端不会唤回自绘顶栏",
  );
});

testCase("设置界面支持铺满、内嵌和独立窗口", () => {
  const rust = read("src-tauri", "src", "settings", "appearance.rs");
  const types = read("src", "bridge", "types-settings.ts");
  const pane = read("src", "ui", "settings", "panes", "AppearancePane.tsx");
  const dialog = read("src", "ui", "settings", "SettingsDialog.tsx");
  const css = read("src", "styles", "settings.css");
  const windowCommand = read("src-tauri", "src", "commands", "window.rs");
  assertValue(rust.includes("SettingsWindowStyle"), "Rust 缺少设置窗口样式枚举");
  assertValue(
    rust.includes("settings_window_style: SettingsWindowStyle::Embedded"),
    "设置窗口默认不是内嵌卡片",
  );
  assertValue(
    types.includes('export type SettingsWindowStyle = "full" | "embedded" | "external"'),
    "前端缺少三种设置窗口样式",
  );
  for (const label of ["Full window", "Embedded card", "Separate window"]) {
    assertValue(pane.includes(`t("${label}")`), `外观页缺少 ${label}`);
  }
  assertValue(dialog.includes("standalone"), "设置框没有独立窗口模式");
  assertValue(css.includes('.settings-shell[data-settings-window-style="full"]'), "缺少铺满样式");
  assertValue(windowCommand.includes("nota_window_open_settings"), "缺少独立设置窗口命令");
  assertValue(windowCommand.includes("nota_window_open_about"), "关于窗口没有复用呈现方式");
  assertValue(windowCommand.includes("nota_window_prepare_about"), "关于窗口没有预热");
  assertValue(windowCommand.includes(".visible(false)"), "独立窗口创建时会先闪出未完成界面");
  assertValue(
    read("src-tauri", "src", "lib.rs").includes('window.label() == "about"'),
    "关闭关于窗口时没有改为隐藏复用",
  );
  assertValue(
    dialog.includes("{!standalone && <DialogClose"),
    "独立设置窗口仍显示重复的内嵌关闭按钮",
  );
  assertValue(
    read("src", "ui", "AboutDialog.tsx").includes("{!standalone && ("),
    "独立关于窗口仍显示重复的内嵌关闭按钮",
  );
  assertValue(
    read("src", "ui", "settings", "panes", "AppearancePane.tsx").includes(
      "Changes take effect the next time Preferences opens.",
    ),
    "设置窗口说明没有写明下次打开生效",
  );
});

testCase("源码模式强制使用等宽字体", () => {
  const css = read("src", "styles", "editor.css");
  const source = read("src", "editor", "source.ts");
  assertValue(
    /\.editor-pane-source \.editor-mount \.cm-scroller[\s\S]*?font-family:\s*var\(--font-mono\)\s*!important/s.test(
      css,
    ),
    "源码模式仍可能继承文档主题的衬线字体",
  );
  assertValue(source.includes("EditorView.lineWrapping"), "源码模式仍会产生横向滚动框");
  assertValue(
    /\.editor-pane-source \.editor-mount \.cm-scroller\s*\{[^}]*overflow-x:\s*hidden\s*!important/s.test(
      css,
    ),
    "源码模式没有隐藏横向滚动条",
  );
});

testCase("预设导出器参数可编辑且模板选择器为自绘", () => {
  const pane = read("src", "ui", "settings", "panes", "ExportPane.tsx");
  const rust = read("src-tauri", "src", "settings", "export.rs");
  assertValue(rust.includes("pub base_args: String"), "Rust 自定义导出器缺少可编辑基础参数");
  assertValue(pane.includes("currentCustom.base_args"), "预设导出器参数仍然不可编辑");
  assertValue(!pane.includes("<select"), "从模板添加仍使用原生菜单");
  assertValue(pane.includes("<Select"), "从模板添加没有使用自绘选择器");
  assertValue(
    /\.stg-color-hex\s*\{[^}]*color:\s*var\(--fg\)/s.test(
      read("src", "styles", "color-picker.css"),
    ),
    "主题色十六进制值仍使用弱化色，而不是设置正文色",
  );
});

testCase("Adwaita 的控件、开关和浮层尺寸对齐设计稿", () => {
  const shape = read("src", "styles", "theme", "shape.css");
  const color = read("src", "styles", "theme", "color.css");
  for (const token of [
    "--control-height: 34px",
    "--switch-w: 48px",
    "--switch-h: 26px",
    "--switch-knob: 22px",
    "--radius-lg: 12px",
    "--radius-sm: 6px",
  ]) {
    assertValue(shape.includes(token), `Adwaita 设计稿数值缺失：${token}`);
  }
  assertValue(color.includes("--accent: #1c71d8"), "Adwaita 浅色强调色仍不是 #1c71d8");
  assertValue(color.includes("--sidebar-surface: #28282c"), "Adwaita 深色侧栏表面不对");
  assertValue(color.includes("--settings-window-bg: #242424"), "Adwaita 深色设置窗口底色不对");
});

testCase("Yaru 深色与系统窗口统一使用同一支橙色", () => {
  const color = read("src", "styles", "theme", "color.css");
  const controls = read("src", "styles", "settings-controls.css");
  const yaruDark = color.slice(
    color.indexOf('[data-ui-style="yaru"][data-ui-mode="dark"]'),
    color.indexOf("/* ⚠️ 这里原来还有一档 **Yaru Blue**"),
  );
  assertValue(yaruDark.includes("--accent: #e95420"), "Yaru 深色强调色不是系统橙");
  assertValue(yaruDark.includes("--radio-on: #e95420"), "Yaru 深色单选仍使用另一支橙");
  assertValue(
    controls.includes('.stg-radio-item input[type="radio"]:checked') &&
      controls.includes("radial-gradient"),
    "单选仍由 WebKitGTK 原生控件绘制，内外圈可能分叉",
  );
});

if (fail > 0) {
  console.error(`\n${fail} 项失败`);
  process.exitCode = 1;
} else {
  console.log(`\n${pass} passed, 0 failed`);
}
