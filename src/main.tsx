import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { installErrorHooks } from "./ui/ErrorBoundary";

import "./styles/theme.css";
import "./styles/app.css";
// ⚠️ **必须在 `app.css` 之后**。两份文件的选择器有重叠的部分（比如都碰过
// `.ProseMirror` 那棵树），靠后者覆盖前者。顺序反过来，正文区的字号、行高、
// 代码块底色就都会被外壳那几条盖掉。这条约束写在 `editor.css` 的文件头里。
import "./styles/editor.css";

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
