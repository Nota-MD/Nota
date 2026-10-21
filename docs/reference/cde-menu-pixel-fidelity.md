# CDE 菜单像素级还原：源码对照与边界

最后同步：2026-10-19

本文回答两个问题：

1. Nota 的 CDE 菜单为什么可以做到**可测量的像素级还原**，而不是照着截图猜？
2. 哪些层可以做到像素级，哪些层只能做到视觉等价？

结论先说清楚：Nota 没有复刻 X/Motif 的渲染器，也不可能让 WebView 与 X11
在任意 DPI、任意字体回退下产生逐字节相同的帧。能做到的是**菜单控件的整数几何
模型一致**：框线、内外边距、行高、选中状态、快捷键留白、子菜单锚点和字体栅格。
这些恰好决定了 CDE 菜单最主要的视觉身份，而且全部有源码或真机像素作证据。

参考基准：

- CDE 2.5.3：`programs/dtpad/dtpad.c`
- CDE 系统资源：`programs/dtsession/sys.resources.src`
- Motif 2.3.8：`lib/Xm/RowColumn.c`、`LabelG.c`、`CascadeBG.c`、`PushBG.c`、
  `Display.c`
- 真机截图：[`cde-expected.png`](cde-expected.png)
- Nota 实现：`Nota-themes/ui/cde/cde.css`、`src/ui/MenuBar.tsx`、
  `src/ui/MenuPopup.tsx`

## 1. 先还原控件树，而不是先画皮

CDE `dtpad` 的菜单不是一整块“自己画的 HTML”。它先建菜单栏，再为每一栏建
pulldown，再往里面放 cascade 与 push button：

```c
/* programs/dtpad/dtpad.c::CreateFileMenu */
file_pane = XmCreatePulldownMenu(pPad->menu_bar, "fileMenu", al, ac);
cascade = XmCreateCascadeButtonGadget(pPad->menu_bar, "File", al, ac);
WidgList[count++] = XmCreatePushButtonGadget(file_pane, "new", al, ac);
WidgList[count++] = XmCreatePushButtonGadget(file_pane, "open", al, ac);
```

Nota 的 DOM 保持了同样的三层关系：

```tsx
// ui/MenuBar.tsx
<div className="menu-root">
  <button className="menu-title">File</button>
  {isOpen && <MenuPopup />}
</div>

// ui/MenuPopup.tsx
<div className="menu-popup" role="menu">
  <button className="menu-item" role="menuitem">New</button>
  <button className="menu-item" role="menuitem">Open…</button>
</div>
```

| Motif / CDE | Nota | 保留的语义 |
|---|---|---|
| `XmCreateMenuBar` | `.menubar` | 单选的顶层菜单带 |
| `XmCreateCascadeButtonGadget` | `.menu-title` | 打开某一栏 |
| `XmCreatePulldownMenu` | `.menu-popup` | 一栏自己的弹层 |
| `XmCreatePushButtonGadget` | `.menu-item` | 一条可执行命令 |
| `XmCreateSeparatorGadget` | `.menu-sep` | 分组线 |
| label + accelerator text | `.menu-label` + `.menu-accel` | 左侧命令、右侧快捷键 |

这层映射很重要：后面所有像素值都有明确落点。若只画一个带文字的矩形，就无法独立
控制 Motif 的 frame、label margin、accelerator pad 和 armed 状态。

## 2. 菜单的外框不是现代卡片

Motif 的 `XmRowColumn` 给普通容器补 3px 边距，但 pulldown 和 popup 是例外：

```c
/* lib/Xm/RowColumn.c::Initialize */
if (IsPulldown(m) || IsPopup(m)) {
    RC_MarginW(m) = 0;
    RC_MarginH(m) = 0;
} else {
    RC_MarginW(m) = 3;
    RC_MarginH(m) = 3;
}
```

CDE 又打开了细线模式：

```text
! programs/dtsession/sys.resources.src
*enableThinThickness: True
*enableEtchedInMenu: True
```

Motif 的解释器直接给出了 `1px`：

```c
/* lib/Xm/Display.c::_XmSetThickness */
if (xmDisplay->display.enable_thin_thickness)
    thickness = 1;
else
    thickness = 2;
```

所以 CDE 弹层是 **0px 容器内边距 + 1px 硬边**，没有圆角、柔光和多层外投影。
Nota 对应覆盖是：

```css
[data-ui-style="cde"] .menu-popup {
  padding: 0;
  border: 1px solid var(--bevel-dark);
  border-radius: 0;
  box-shadow: none;
}
```

这里不能只把现代菜单改成方角：现代菜单通常还有 `padding: 5px`、`min-width: 224px`
和浮层阴影。三者一起存在时，即使颜色正确，轮廓也会明显露出“网页卡片”的特征。

## 3. 行高是整数约束，不是审美选择

Motif label 的缺省上下边距各 2px：

```c
/* lib/Xm/LabelG.c */
{ XmNmarginWidth,  ..., 2 },
{ XmNmarginHeight, ..., 2 },
```

厚度为 1px 时，一条菜单项的可见高度近似为：

```text
max(label glyph height, accelerator glyph height)
+ 2 * label marginHeight
+ 2 * (shadow thickness + highlight thickness)
```

16px 点阵字模、1px 阴影与真机截图的扫描结果落在同一个 20px 网格。Nota 因此把
CDE 菜单项固定为：

```css
[data-ui-style="cde"] .menu-item {
  height: 20px;
  padding: 0 6px;
}
```

这不是把 22px 随手改成 20px。22px 是 Nota 通用菜单的值，而 CDE 的 20px 来自
Motif margin 与 1px thin-thickness 的组合，再与真机行边界逐像素核对。

## 4. 空白图标列是 Motif 没有的东西

Nota 的通用菜单有固定勾选列，好处是勾选前后文字不位移。CDE 的
`XmPushButtonGadget` 没有现代菜单那种常驻图标槽；普通命令直接从左边距起排。

所以 CDE 主题只隐藏**空**的检查列和箭头列：

```css
[data-ui-style="cde"] .menu-check:empty,
[data-ui-style="cde"] .menu-arrow:empty {
  display: none;
}
```

有勾选或子菜单时仍保留对应标记。这里改的是主题 CSS，不是给 CDE 增加 Rust 分支；
任意主题都可以使用同一选择器完成自己的菜单规格。

## 5. 快捷键右对齐来自 `LABELG_ACC_PAD`

Motif 不会把快捷键紧贴在命令文字后面。`LabelG.c` 在测量时确保右侧留出
accelerator 宽度加 `LABELG_ACC_PAD`；这个常量在 `LabelGP.h` 中是 15px：

```c
#define LABELG_ACC_PAD 15
```

Nota 用 flex 把 `.menu-label` 推到左边、把 `.menu-accel` 推到右边，并复现 15px
最小间隔：

```css
[data-ui-style="cde"] .menu-accel {
  padding-left: 15px;
  font-size: 1em;
}
```

`font-size: 1em` 也是必需项。通用菜单为了现代感把快捷键缩到 `0.8rem`；CDE 真机
的快捷键与菜单正文字形来自同一套 16px 点阵，缩小后会同时出现字形偏小和基线不齐。

## 6. 弹层宽度由内容决定

Motif pulldown 的宽度来自每个 label 的文本宽度、左右 margin、accelerator 留白
和 1px 边界，不会强制一个现代菜单的 224px 最小宽度。

```css
[data-ui-style="cde"] .menu-popup {
  min-width: 0;
  width: max-content;
}
```

同一父栏内的条目由 flex 拉成等宽，所以最长标签决定整栏宽度。这样既保留 Motif
的“自然定宽”，也不会让每一条各自长短不齐。

## 7. 选中/armed 状态是反相 3D，不是换一个圆角底色

CDE 设置了 `enableEtchedInMenu: True`。Motif 在菜单里 arm 条目时使用 etched-in
绘制，并调用 `XmSHADOW_IN`：

```c
/* lib/Xm/PushBG.c，语义摘要 */
XmeDrawShadows(..., etched_in ? XmSHADOW_IN : XmSHADOW_OUT);
```

翻成 CSS 就是：

```css
[data-ui-style="cde"] .menu-item:hover:not(:disabled),
[data-ui-style="cde"] .menu-item-open:not(:disabled) {
  background: var(--bg-active);
  box-shadow: var(--bevel-sunken);
}
```

`--bevel-sunken` 只有两条 1px 边：左上暗、右下亮。它形成的是 CDE 那种持续凹陷，
不是现代按钮的柔和渐变。鼠标离开后状态消失；复选框或持续开启的按钮则使用各自的
持久标记，不把“悬停”和“已开启”混成一个状态。

## 8. 为什么字体可以做到真正的点阵感

CDE 的资源使用 Xft 之前的位图字体别名：

```text
*labelFontList: -dt-interface system-medium-r-normal-m*-*-*-*-*-*-*-*-*
*buttonFontList: -dt-interface system-medium-r-normal-m*-*-*-*-*-*-*-*-*
```

Nota 不复刻 X Logical Font Description，而是把同一类 16×16 字模嵌入 TTF 的
EBDT/EBLC 位图表。浏览器拿到的是 **1-bit bitmap strike**，不是“矢量轮廓再做像素
风”的字体；配合 `font-synthesis: none` 和外层统一 400 字重，避免浏览器合成粗体
后把点阵边缘重新抹平。

主题目前同时保留两种容器：

- `.ttf`：可编辑源文件，完整 ASCII/CJK cmap 与 EBDT/EBLC；
- `.woff2`：同一字体的无损容器转换，约 653KB，CSS 运行时加载这一份。

WOFF2 只影响传输与解析成本，不改变字模。实测冷启动因此缩短，菜单字形仍是同一套
16px 位图。

## 9. 状态和锚点也是像素模型的一部分

菜单的像素位置不只在静态 CSS 里：

- 顶层菜单栏条目占满整条 30px bar；
- pulldown 从 bar 的底边开始，不再额外留现代菜单的 5px 空白；
- 顶层切换必须点击，鼠标跨过另一栏只移动指针，不替换当前打开的菜单；
- `F10` 进入菜单栏；菜单栏里 `←` / `→` 换栏，`↓` / Enter / Space 打开当前栏；
- 指针离开弹层、落到灰项或分隔线上时立即解除 armed；
- 子菜单里 `Esc` 只收当前一层（Motif `popdownOne`），再按一次才收父菜单；
- 子菜单从父项右边沿展开，保留一个像素的重叠，避免鼠标穿越“无人归属”的缝隙；
- 状态栏菜单仍然向上弹，不能套用菜单栏向下弹的 `top: 100%`。

其中两条交互也有 Motif 源码直接作证：

```c
/* lib/Xm/RowColumn.c::MenuBarInitialize，菜单栏默认 accelerator */
if (!(RC_MenuAccelerator(bar) = GetRealKey(bar, "osfMenuBar")))
    RC_MenuAccelerator(bar) = XtNewString("<KeyUp>F10");

/* lib/Xm/MenuUtil.c::_XmMenuEscape，Esc 只 popdown 一层 */
menu_shell_class.popdownOne(w, event, NULL, NULL);
```

所以 Nota 的 F10 只负责把焦点送进菜单栏，方向键或 Enter 才打开当前栏；子菜单的
Esc 先收子菜单并把焦点还给父项，第二次 Esc 才收父菜单。

这些规则全部是通用的菜单/navigation 行为，由组件和主题变量表达；Nota 二进制里
没有 `if ui_style === "cde"` 这样的主题分支。

## 10. 可复现的证据链

每次调整按同一顺序验收：

1. **源码证据**：先找 Motif 资源默认值或 CDE 资源覆盖，写出几何含义；
2. **真机像素**：在 1× 截图里量边界，记录外框、行高、选中行和文字起点；
3. **DOM/CSS 对齐**：把值落到 `.menu-title`、`.menu-popup`、`.menu-item`
   或 `.menu-accel`，不放进程序号的硬编码；
4. **开窗截图**：当前窗口裁切到同一区域，用 ImageMagick 并排对比；
5. **交互实测**：点击、悬停跨栏、子菜单、键盘、状态栏向上弹都必须重走；
6. **自动闸门**：TypeScript、前端用例、Rust 用例、文档同步与生产构建全绿。

这套链条让“像素级”有可验证含义：不是凭印象说像，而是每个像素差都能追溯到某个
Motif 资源、某个 Web 盒模型属性，或某个浏览器栅格限制。

## 11. 启动为什么也可以一起缩短

此前启动链有两处硬等待：

1. `useBootReveal` 等 `document.fonts.ready`，最坏再等 2 秒；
2. 2.1MB TTF 被 base64 内联后，WebView 每次冷启动都要解析更大的 CSS 与字体。

现在：

- 主题 CSS 注入后只等两个 `requestAnimationFrame` 就揭幕，不再把整套字体解析
  放进窗口首帧的必经链；
- 设置先到先应用，主题目录/工作区/命令行文件继续并行；
- 字体运行时容器从 2.1MB TTF 换成约 653KB WOFF2。

在开发态 Xvfb、CDE 主题、四个拓展都加载的条件下，实测进程到主题首帧从约 3.6 秒
降到约 2.5 秒；其中窗口创建本身约 1.8 秒。发布构建不包含 dev server 和 debug
符号，通常会更快。

## 12. 能做到什么，不能声称什么

可以做到：

- 菜单的整数边框、行高、内边距、快捷键留白、选中凹陷与字体栅格一致；
- 相同窗口缩放和相同字体环境下，菜单区域的结构性像素关系稳定；
- 差异可以用截图和源码逐项解释。

不能声称：

- 任意 DPI、任意字体回退、任意 WebKit/WebView2 版本都得到位图完全相同的帧；
- 浏览器抗锯齿、系统亚像素定位与 X11 扫描转换的行为完全相同；
- 操作系统的原生标题栏、窗口管理器边框也属于主题像素模型。

因此这里的“像素级还原”是一个工程判据：**可控部件的几何与状态可测、可复现、
可解释**；不是“整个桌面环境逐字节相同”。
