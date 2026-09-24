/**
 * 导出 HTML（`docs/07` backlog 第 1 项里能当场做完的那一半）。
 *
 * # 怎么把 Markdown 变成 HTML
 *
 * **不是**再找一个 Markdown 库：那样一来"屏幕上是什么样"和"导出的是什么样"
 * 就成了两套实现，迟早有一天长得不一样，而且没人会发现（两边各自都"对"）。
 * 这里走的是同一条渲染路径——**起一个只读的 Milkdown 实例**把文本解析成
 * 文档树、渲染成 DOM，再把那块 DOM 摘下来。
 *
 * ⚠️ 代价要写清楚：导出一次要多建一个编辑器实例（几十毫秒），所以它是
 * **点了才做**，不做预渲染、不做缓存。省这一次重建换来的是"导出 = 所见"。
 *
 * # 摘的是**渲染后的 DOM**，不是文档树
 *
 * 文档树那条路（`DOMSerializer`）更"干净"，但它丢掉两样用户看得见的东西：
 * ① 宽松模式下 `#标签` 被显示成标题（那是 `Decoration.node` 的 `nodeName`，
 * 装饰不在文档树里）；② 任务项的方框、代码块的容器结构。导出对不上屏幕，
 * 用户只会觉得"导出的东西坏了"。
 *
 * ⚠️ 所以必须在摘完之后**把我们自己插进 DOM 的东西摘干净**——那些是编辑时的
 * 交互零件（代码块的语言选择器/复制按钮、即时渲染的块标记），它们在导出的
 * 文件里没有对应的 CSS、也没有任何用处。规则见下面 `摘正文()`。
 *
 * # 两种导出
 *
 * | 菜单项 | 里面有什么 | 用在哪 |
 * |---|---|---|
 * | HTML（不含样式） | 只有语义标签，**一条 CSS 都没有** | 贴进别的系统、丢给别的工具再加工 |
 * | HTML（含样式） | 嵌 `editor.css`（`?inline`，同一份字节）＋当前文档主题 | 直接打开看、打印、发给人 |
 *
 * ⚠️ 「含样式」复用**编辑器自己那份 `editor.css`**，不是另写一份。另写一份
 * 就是第二个真相源，而它漂移的症状是"导出看着挺像但哪哪都不对"，最难查。
 * 为了让它生效，正文外面那几层 class（`.editor-pane`/`.editor-mount`/
 * `.milkdown`/`.ProseMirror`）**必须照着编辑区的 DOM 摆**——这不是巧合，
 * 是这套 CSS 的作用域要求。
 */

import { createEditor } from "@/editor/create";
import { scopeDocThemeCss } from "@/styles/doc-theme";

export interface 导出选项 {
  /** 严格模式（`Settings.strict_markdown`）。**解析口径必须和屏幕上一致**。 */
  strict: boolean;
  /** 含样式。见上面那张表。 */
  styled: boolean;
  /** 文档主题的**原始** CSS（没限域过的）。缺省 = 不嵌主题。 */
  themeCss?: string;
  /** 写进 `<title>`。也是"另存为"对话框的默认文件名。 */
  title: string;
}

/**
 * 摆正文外面那几层用的 class。**必须和 `EditorPane.tsx` / `editor.css` 一致**
 *（那边是 `div.editor-mount > div.milkdown > div.ProseMirror`）。
 */
const 外壳开头 = '<div class="editor-mount"><div class="milkdown"><div class="ProseMirror">';
const 外壳结尾 = "</div></div></div>";

/**
 * 我们自己插进编辑区 DOM 的东西——**只服务编辑时的交互**，不该进导出。
 *
 * ⚠️ 判据收成一条：**类名以 `nota-` 开头的一律不算内容**。这条规则好记也好核，
 * 而且比"逐个列清楚"耐腐蚀——将来再加一个 `nota-xxx` 零件时它自动生效，
 * 不会因为忘了来这儿登记而漏进导出。代价是**正文自己不能带 `nota-` 开头的
 * class**（用户写的 Markdown 里不可能有 class，所以这条代价是零）。
 */
const 我们的类 = /^nota-/;

/** 摘掉的那些属性：全是"编辑时才成立"的。`data-srcmark` 是块标记的文字。 */
const 摘掉的属性 = ["data-srcmark", "contenteditable", "spellcheck", "translate"];

/** 整段删掉的元素（它们是容器，不是"带个类名的正文"）。 */
const 整块删掉 = [".nota-code-bar"];

/**
 * 把 Markdown 渲染成 HTML 正文片段，并**把编辑时的零件摘干净**。
 *
 * ⚠️ 那个挂载点是**挂在文档里但屏幕外**的（`left: -99999px` + `visibility:
 * hidden`），不是 `display: none`：ProseMirror 建实例时要量 DOM
 *（`coordsAtPos`、行高），`display: none` 下量出来全是 0，某些插件会当场
 * 走岔路。`visibility: hidden` 保留布局、不占屏，两头都对。
 */
async function 摘正文(markdown: string, strict: boolean): Promise<string> {
  const root = document.createElement("div");
  root.setAttribute(
    "style",
    "position:fixed;left:-99999px;top:0;width:800px;visibility:hidden;pointer-events:none",
  );
  document.body.appendChild(root);

  let 片段 = "";
  try {
    const handle = await createEditor({
      root,
      initialMarkdown: markdown,
      strict,
      readOnly: true,
    });
    const pm = root.querySelector(".ProseMirror");
    if (pm) {
      // ⚠️ 在**还挂着的 DOM 上**摘零件，不是先把 HTML 拼成字符串再拿正则洗：
      // 正则会碰到正文里恰好出现 `contenteditable` 这几个字之类的意外，
      // 而遍历 DOM 只认真正的元素和真正的属性。
      for (const sel of 整块删掉) pm.querySelectorAll(sel).forEach((n) => n.remove());
      for (const n of [pm, ...pm.querySelectorAll("*")]) {
        const 留着 = [...n.classList].filter((c) => !我们的类.test(c));
        if (留着.length) n.setAttribute("class", 留着.join(" "));
        else n.removeAttribute("class");
        for (const a of 摘掉的属性) n.removeAttribute(a);
      }
      片段 = pm.innerHTML;
    }
    handle.destroy();
  } finally {
    // ⚠️ `finally` 里删：中途抛错也必须把那个离屏节点收走，否则每导出一次
    // 就在页面上留一个看不见的编辑器（它的 DOM 监听还活着）。
    root.remove();
  }
  return 片段;
}

/** 嵌进去的那一小段<strong>导出专用</strong>规则。 */
const 导出基础样式 = [
  "html, body { margin: 0; }",
  'body { background: var(--doc-bg, #fff); color: var(--doc-fg, #1a1a1a); }',
  // 屏上那一栏是"编辑区有一个自己的滚动条"，导出的文件由**整页**滚，
  // 留着 `overflow: auto` 会在某些浏览器里切出一个内层滚动条。
  ".editor-pane { overflow: visible; }",
  // 打印时页面背景常常被浏览器丢掉（省墨），文字颜色却是深底主题的浅字
  // ——那会打出白纸白字。所以打印时强制两样都回到黑纸白字。
  "@media print { body { background: #fff; color: #000; } }",
].join("\n");

/** 转义进 `<title>` 的文本。正文不动——它是 HTML。 */
function 转义文本(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 生成一份完整的 HTML 文档。 */
export async function 导出HTML(markdown: string, opts: 导出选项): Promise<string> {
  const 正文 = await 摘正文(markdown, opts.strict);

  const 样式块: string[] = [导出基础样式];
  if (opts.styled) {
    // ⚠️ 动态 import：这份 CSS 只有"含样式导出"才用得上，不该压在主包里
    //（编辑区自己那份是通过 `main.tsx` 正常加载的，跟这里无关）。
    const { default: editorCss } = await import("@/styles/editor.css?inline");
    样式块.unshift(editorCss);
    if (opts.themeCss) {
      // ⚠️ **必须限域**，理由和界面上完全一样（否则主题里那句 `body { … }`
      // 会跑到导出文件的页面上、而不是正文上）。见 `styles/doc-theme.ts`。
      const 限域后 = scopeDocThemeCss(opts.themeCss);
      if (限域后) 样式块.unshift(限域后);
    }
  }

  // ⚠️ 不含样式那一种**连 class 都不带**（正文直接进 `<body>`）：它的用途是
  // "贴进别的系统再加工"，而 `.editor-mount` 这种类名在那里毫无意义，只会
  // 变成噪声。含样式那一种则必须带——那是上面那份 CSS 的作用域。
  const body = opts.styled ? 外壳开头 + 正文 + 外壳结尾 : 正文;
  const headStyle = opts.styled ? `<style>\n${样式块.join("\n")}\n</style>\n` : "";

  return [
    "<!DOCTYPE html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${转义文本(opts.title)}</title>`,
    headStyle + "</head>",
    opts.styled ? `<body class="editor-pane">${body}</body>` : `<body>${body}</body>`,
    "</html>",
    "",
  ].join("\n");
}

/** 导出文件的默认文件名。**只做后缀替换**——保留原文件名，用户认识它。 */
export function 默认导出名(title: string, ext: string): string {
  const 底 = title.replace(/\.(md|markdown|mdx|mdown|mkd|txt)$/i, "");
  return `${底 || "未命名"}.${ext}`;
}
