import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { installErrorHooks } from "./ui/ErrorBoundary";

import "./styles/theme.css";
import "./styles/app.css";
// 左侧栏（栏本身 + 文件树 + 大纲）。⚠️ **必须在 `app.css` 之后**——折叠三角、
// 缩进那几条比 `app.css` 里的通用行规则更具体，靠顺序而不是 `!important` 压过去。
import "./styles/sidebar.css";
// 右侧插件栏（栏本身 + 面板内容 + 已装清单）。⚠️ **必须在 `app.css` 之后**——
// 它借了那边 `.btn` / `.btn-primary` / `.btn-danger` 那套按钮底子
//（`.panel-btn` 是在上面收小一号、`.btn-on` 是换底色）。理由写在 `dock.css` 文件头。
import "./styles/dock.css";
// Slidev「装没装」面板的样式。⚠️ **必须在 `app.css` 之后**——它借了确认框那层
// 壳（`.confirm-backdrop`/`.confirm-dialog`），再靠顺序盖掉那个 440px 的宽度。
import "./styles/slidev.css";
// 偏好设置那个框的样式。**必须在 `app.css` 之后**——它加宽的是 `app.css`
// 里 `.confirm-dialog` 那套底子（确认框和设置框共用一层遮罩）。
import "./styles/settings.css";
// ⚠️ **必须在 `app.css` 之后**。两份文件的选择器有重叠的部分（比如都碰过
// `.ProseMirror` 那棵树），靠后者覆盖前者。顺序反过来，正文区的字号、行高、
// 代码块底色就都会被外壳那几条盖掉。这条约束写在 `editor.css` 的文件头里。
import "./styles/editor.css";
// 格式化工具栏 / 查找替换条。⚠️ **必须在 `app.css` 之后**：这几条横条
// 贴在 `.app-main` 里，和外壳的骨架有重叠的选择器（`flex`、边框）。
import "./styles/bars.css";
// 从 Folio 搬来的那套图标（`.icon` 的遮罩画法）。
// ⚠️ 这一份与上面几份**没有重叠的选择器**，所以顺序其实不影响结果——
// 放在最后只是照这条规矩来（后一份能压前一份），省得以后有人加规则时
// 得回头猜为什么这里破了例。
// ⚠️ 这里**没有** `.sr-only`：图标按钮的可读名字走 `aria-label`
// （理由写在 `icons.css` 的文件头），别看着"少了点什么"就给补回来。
import "./styles/icons.css";

// ⚠️ KaTeX 的排版样式，**必须引，而且只能从这里引**。
//
// `@milkdown/plugin-math` 的 `toDOM` 里是真的调了 `katex.render()` 的
// （`src/editor/create.ts` 里 `.use(math)`），它把 `$x^2$` 渲染成一棵
// 带 `katex` class 的 HTML 树——**但分数线画在哪、上下标缩到多大、
// 积分号用什么字体，全在这份 CSS 里，不在那棵树里**。
//
// 少了它的表现很有迷惑性：不报错、不空白，只是 `\frac{a}{b}` 变成两个字母并排、
// `x^2` 的 2 和 x 一样大。看着像"公式功能没做"，其实是"样式没引"。
import "katex/dist/katex.min.css";

// 把全局错误钩上，免得未捕获的 Promise 拒绝只在 devtools 里一闪而过——
// 打包后的应用没有 devtools，那时这类错误就是彻底静默的。
installErrorHooks();

const root = document.getElementById("root");
if (!root) {
  throw new Error("找不到 #root 挂载点；index.html 被改坏了？");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
