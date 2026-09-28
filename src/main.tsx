import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { api } from "./bridge/ipc";
import { t, 定语言 } from "./i18n";
import { installErrorHooks } from "./ui/ErrorBoundary";
import { FocusAlarmWindow } from "./ui/FocusAlarmWindow";

import "./styles/theme.css";
import "./styles/app.css";
// 浮层那一族（四个对话框 ＋ Emoji 补全面板）。⚠️ **必须在 `app.css` 之后**——
// `.emoji-cat` 要盖掉 `.btn` 的内边距，靠的就是"后来居上"；顺序反了，
// 那排分类按钮会静默变回全尺寸。（2026-09-27 从 `app.css` 里按职责拆出来的，
// 理由见那份文件头。）
import "./styles/overlay.css";
// 左侧栏（栏本身 + 文件树 + 大纲）。⚠️ **必须在 `app.css` 之后**——折叠三角、
// 缩进那几条比 `app.css` 里的通用行规则更具体，靠顺序而不是 `!important` 压过去。
import "./styles/sidebar.css";
// 右侧插件栏（栏本身 + 面板内容 + 已装清单）。⚠️ **必须在 `app.css` 之后**——
// 它借了那边 `.btn` / `.btn-primary` / `.btn-danger` 那套按钮底子
//（`.panel-btn` 是在上面收小一号、`.btn-on` 是换底色）。理由写在 `dock.css` 文件头。
import "./styles/dock.css";
// 「差东西」面板（借 pandoc 导出时没探通的那一块）。⚠️ **必须在 `app.css`
// 之后**——它借了确认框那层壳（`.confirm-backdrop`/`.confirm-dialog`），
// 再靠顺序盖掉那个 440px 的宽度。
import "./styles/gate.css";
// 偏好设置那个框的样式。**必须在 `app.css` 之后**——它加宽的是 `app.css`
// 里 `.confirm-dialog` 那套底子（确认框和设置框共用一层遮罩）。
import "./styles/settings.css";
// ⚠️ **必须在 `app.css` 之后**。两份文件的选择器有重叠的部分（比如都碰过
// `.ProseMirror` 那棵树），靠后者覆盖前者。顺序反过来，正文区的字号、行高、
// 代码块底色就都会被外壳那几条盖掉。这条约束写在 `editor.css` 的文件头里。
import "./styles/editor.css";
// 代码块上的**挂件**（折叠/复制条、语言图标、语言下拉）。⚠️ **必须在
// `editor.css` 之后**：这一份里那几条选择器要盖住那边对 `pre` / `code` 的
// 通用规则。2026-09-26 从 `editor.css` 里整段搬出来的，搬的原因只有行数一个
// （那一份当时 961 行，离 1000 行硬上限只剩 39 行），内容一个字节没改。
// 理由写在 `code-block.css` 文件头。
import "./styles/code-block.css";
// 正文里的**标记长相**（`.nota-srcmark` 块标记 / `.nota-markhint` 行内标记 /
// `.nota-heading-pending` 待成块标题）。⚠️ **必须在 `editor.css` 之后**：
// 2026-09-26 从 `editor.css` 里搬出来的（那一份当时 928 行，离 1000 行上限
// 只差 72 行），搬的原因只有行数一个，内容一个字节没改。
// 顺序在这里仍然要紧：那几份文件里都有碰正文子元素（`p` / `pre` / `li`）的
// 通用规则，标记这几条要能盖住它们。理由写在 `marks.css` 文件头。
import "./styles/marks.css";
// 图表块（`editor/diagram-view.ts` 那棵树）。⚠️ **必须在 `editor.css` 之后**：
// 它借了那边 `.nota-code-btn` 那颗按钮的皮，也要盖住正文里对块级子元素的通用规则。
// 理由写在 `diagram.css` 文件头。
import "./styles/diagram.css";
// 公式块（`editor/math-view.ts` 那棵树）。⚠️ **必须在 `editor.css` 之后**：
// 它要盖住正文里对块级子元素的通用规则（同 `diagram.css` 的理由）。
// ⚠️ KaTeX 自己那份 `katex.min.css`（下面那条 `import`）**管不着这个文件**——
// 那份只画 `.katex` 那棵树，而这里画的是面板、半透明分隔符、源码框。
// ⚠️ **别在这里写行号**：这个文件里上面每加一条 import 都会把它顶掉。
import "./styles/math.css";
// 改动预览那一行的长相（新增 / 删除）。⚠️ **必须在 `editor.css` 之后**——
// 编辑区里那份改动预览和正文一样挂在 `.app-main` 底下，行高、字色那几条
// 要能盖住外壳的通用规则（同 `editor.css` 文件头那条理由）。
// 面板那边也用它（`PanelBody` 的 `kind = "diff"`），所以**位置在两边都用得上**：
// 放在所有"谁的规则更具体"的争执之后，只留颜色和装饰。
import "./styles/diff.css";
import "./styles/review.css";
// 面板里那块分享图（预览 ＋ 存盘/剪贴板）。⚠️ 从 `dock.css` 里分出来是因为
// 那一份已经 961 行、顶着本仓 1000 行那条硬上限——理由写在 `share.css` 头上。
import "./styles/share.css";
// 面板里那块热力图（写作统计的长期记录）。⚠️ 同样是**从 `dock.css` 里分出来**的
// ——理由同上，那一份也已经顶着 1000 行那条线（写在 `heatmap.css` 头上）。
import "./styles/heatmap.css";
// 格式化工具栏 / 查找替换条。⚠️ **必须在 `app.css` 之后**：这几条横条
// 贴在 `.app-main` 里，和外壳的骨架有重叠的选择器（`flex`、边框）。
import "./styles/bars.css";
// 从 Folio 搬来的那套图标（`.icon` 的遮罩画法）。
// ⚠️ 这一份与上面几份**没有重叠的选择器**，所以顺序不影响结果——
// 放在最后只是照这条规矩来（后一份能压前一份），省得以后加规则时
// 得回头猜为什么这里破了例。
// ⚠️ 这里**没有** `.sr-only`：图标按钮的可读名字走 `aria-label`
// （理由写在 `icons.css` 的文件头）——看着"少了点什么"不是补回来的理由。
import "./styles/icons.css";
// 强制专注：状态栏那一格余额表，**外加警报窗那一整棵树**。
//
// ⚠️ 这一份里有两种东西，它们**不共享任何选择器**：
//
// - `.status-focus*` —— 挂在主窗的状态栏里，要盖住 `app.css` 对状态栏子元素的
//   通用规则（所以必须在 `app.css` 之后，这里满足）；
// - `.alarm-*` —— 画在**另一个窗口**里（`ui/FocusAlarmWindow.tsx`）。
//   那边根本没有主窗那套外壳，所以这几条**不需要**和谁争优先级；
//   它们只管一件事：把整块屏幕涂红。
//
// ⚠️ 警报窗那一半是**唯一**一处可以假设"整个 viewport 都是我的"的样式。
// 往 `.alarm-*` 里加东西之前先读 `ui/FocusAlarmWindow.tsx` 的文件头。
import "./styles/focus.css";

// ⚠️ KaTeX 的排版样式，**必须引，而且只能从这里引**。
//
// `@milkdown/plugin-math` 的 `toDOM` 里是真的调了 `katex.render()` 的
// （`src/editor/create.ts` 里 `.use(math)`），它把 `$x^2$` 渲染成一棵
// 带 `katex` class 的 HTML 树——**但分数线画在哪、上下标缩到多大、
// 积分号用什么字体，全在这份 CSS 里，不在那棵树里**。
//
// 少了它的表现很有迷惑性：不报错、不空白，只是 `\frac{a}{b}` 变成两个字母并排、
// `x^2` 的 2 和 x 一样大。看着像"公式功能没做"，实际是"样式没引"。
import "katex/dist/katex.min.css";

// ⚠️ **拖列宽那份样式**（`prosemirror-tables` 自带，MIT）。
//
// 用户 2026-09-26：「还有就是表格，允许拖动改变大小」。这条功能缺的是**两半**，
// 而且**两半都缺**（一开始只找出一半，见下面那条更正）：
//
// ① **那条插件压根没装**——`@milkdown/preset-gfm` 的 `columnResizingPlugin`
//    只是被 `export` 出来，**不在 `gfm` 那个 `plugins` 数组里**（"preset 默认
//    就装"是个反直觉的错判）。装它那一行在 `create.ts`，注释在那边。
// ② **这份 CSS 没引过**（本行下面那条 `import`）。
//
// 所以少了它的症状是"表格看起来根本不能拖"：
//
// - 那根拖动手柄是一个 `<div class="column-resize-handle">`，
//   靠 `.ProseMirror td/th { position: relative }` ＋ 手柄自己的
//   `position:absolute; right:-2px; width:4px` 才**落在列边界上**。
//   少了这份 CSS，手柄是个 `static` 的零尺寸 div——不在任何地方，
//   鼠标碰不到，眼睛也看不见；
// - `cursor: col-resize`（`.resize-cursor`）同样在这儿。没有它，
//   鼠标移到列边界上光标一点变化都没有，"这儿能拖"这件事**没有出口**。
//
// 与 `katex.min.css` 是**同一种缺法**：不报错、不空白，功能其实在，
// 只是"什么反应都没有"——那种症状最容易被当成"这个功能没做"。
//
// ⚠️ 它自带的那几条**跟随主题的东西**在 `styles/editor.css` 里被覆盖
//（手柄颜色、单元格最小宽）：这份 CSS 写死了 `#adf`，深色主题下太扎眼。
import "@milkdown/kit/prose/tables/style/tables.css";

// 把全局错误钩上，免得未捕获的 Promise 拒绝只在 devtools 里一闪而过——
// 打包后的应用没有 devtools，那时这类错误就是彻底静默的。
installErrorHooks();

const root = document.getElementById("root");
if (!root) {
  // ⚠️ 走 `t(...)`：这句话会出现在错误边界那张卡片上（用户看得见）。
  throw new Error(t("No #root mount point; was index.html broken?"));
}

/**
 * ⚠️⚠️ **本应用有两个入口，靠 hash 分叉。**
 *
 * 主窗是 `index.html`（没有 hash），焦点警报窗是 `index.html#focus-alarm`
 * ——那个地址是宿主建窗时给的（`src-tauri/src/focus/alarm.rs::开窗`）。
 *
 * # 为什么是 hash 而不是另开一个 HTML 文件
 *
 * 多入口要让 `vite.config.ts` 加 `build.rollupOptions.input`、还要改
 * `tauri.conf.json` 的 `frontendDist` 指向的目录结构——为的只是"少判一个 if"。
 * 而这条路上的收益是**零**：两个窗共用同一份 bundle，本来就在同一个文件里。
 *
 * # ⚠️ 分叉要发生在**挂载之前**
 *
 * 警报窗里**不能**挂 `<App />`：`App` 一路会去拉文档列表、装插件、订阅一整套
 * 事件，而那个窗里没有编辑器、也没有 `#root` 之外该有的东西。最要命的是它会
 * 挂上 `useFocusAlarmSound`——宿主那一枪 `emit` 是发给所有窗口的，两边都订阅
 * 就是同一段警报响两遍（理由写在 `ui/useFocusAlarmSound.ts` 文件头）。
 *
 * ⚠️ `location.hash` 里带 `#`，所以比的是 `"#focus-alarm"`，不是 `"focus-alarm"`。
 */
const 是警报窗 = location.hash === "#focus-alarm";

/**
 * ⚠️⚠️ **警报窗那一支要自己把界面语言拉回来**（2026-09-27 补）。
 *
 * `i18n` 的模块级"当前语言"初值是**兜底** `"en"`（`i18n/index.ts` 的 `兜底`），
 * 而把它改成用户那种语言的 `定语言` **只有一个调用点**：`ui/useStartup.ts`，
 * 那个 hook 挂在 `<App />` 里面。
 *
 * 警报窗**不挂 `<App />`**（理由见上），于是这条链在它身上是断的：中文界面的
 * 用户挨警报时看到的是一整屏英文（`Back to Writing` / `I'm Back`）——2026-09-27
 * 开窗实测到的就是这个。**这条不是"翻译没做"，是"没人告诉它该说哪种语言"**：
 * 同一份 bundle 在同一个进程里，主窗说的是中文。
 *
 * ⚠️ 只打 `appLang` 这一枪，**不碰**文档 / 插件 / 事件订阅——那些正是"不能挂
 * `<App />`"的原因（见上）。
 * ⚠️ 不用 `await`：这一枪回来之前 `FocusAlarmWindow` 照常挂载，而它里面的
 * `useT()` **订阅**了语言，`定语言` 一调就自己重画（`i18n/index.ts::useT`）。
 * 所以首帧是英文、下一帧就是中文——比"等 IPC 回来再挂载"少一段白屏。
 * ⚠️ `catch` 不能省：`.catch` 掉链子时这一枪只是没生效，不该把警报窗整块掀翻
 *（它是这种情况下用户唯一能看见的东西）。
 */
if (是警报窗) {
  api.appLang()
    .then((语言) => 定语言(语言.effective))
    .catch(() => {});
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    {是警报窗 ? <FocusAlarmWindow /> : <App />}
  </React.StrictMode>,
);
