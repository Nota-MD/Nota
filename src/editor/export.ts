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
 * ⚠️ 所以摘完之后必须**把本仓自己插进 DOM 的东西摘干净**——那些是编辑时的
 * 交互零件（代码块的语言选择器/复制按钮、即时渲染的块标记），它们在导出的
 * 文件里没有对应的 CSS、也没有任何用处。
 *
 * ⚠️⚠️ 而且**要分两件事干，不能指望一条规则兜住全部**：挂在正文上的**装饰**
 *（`nota-` 开头的类名）摘掉类名就干净了，而**容器**（行号、语言选择器那一格）
 * 摘掉类名之后元素还杵在原地。前者靠 `nota类前缀`，后者靠 `整块删掉` 那份名单。
 * 这条边界 2026-09-27 被用户的一份 PDF 撞出来，教训写在 `整块删掉` 那段。
 *
 * ⚠️ 还有**第三件事**：图表是异步画的，摘之前得先等它画完（`等异步渲染`）。
 *
 * # 两种导出
 *
 * | 菜单项 | 里面有什么 | 用在哪 |
 * |---|---|---|
 * | HTML（不含样式） | 只有语义标签，**一条 CSS 都没有** | 贴进别的系统、丢给别的工具再加工 |
 * | HTML（含样式） | 嵌 **三份**驻留在磁盘上的 CSS（`?inline`，同一份字节）：`theme/base.css`（变量）＋`editor.css`（正文）＋`katex.min.css`（公式），再叠上当前文档主题 | 直接打开看、打印、发给人 |
 *
 * ⚠️ 「含样式」复用**编辑器自己那几份 CSS**，不是另写一份。另写一份
 * 就是第二个真相源，而它漂移的症状是"导出看着挺像但哪哪都不对"，最难查。
 * 为了让它生效，正文外面那几层 class（`.editor-pane`/`.editor-mount`/
 * `.milkdown`/`.ProseMirror`）**必须照着编辑区的 DOM 摆**——这不是巧合，
 * 是这套 CSS 的作用域要求。
 *
 * ⚠️ 那三份的**名单是 2026-09-27 定下来的**，不是拍脑袋挑的：编辑区在界面上
 * 拿到的 CSS 有十来份，但其中 `code-block.css` / `math.css` / `marks.css` /
 * `diagram.css` 的规则**全部挂在 `.nota-*` 上**，而 `.nota-*` 正是上面要摘掉的
 * 编辑时零件——摘完之后它们一条都不命中。所以导出真正需要的只有那三份。
 * **再加一份之前先问一句：它的规则在摘干净之后还命中吗？**（怎么看出来：
 * 把注释剥掉，看还剩几条选择器不带 `nota-`。）
 */

import { createEditor } from "@/editor/create";
import { 是目录标记, 锚点 } from "@/editor/toc";
import { t } from "@/i18n";
import { scopeDocThemeCss } from "@/styles/doc-theme";

export interface 导出选项 {
  // ⚠️ 这里原来有一个 `strict`（`Settings.strict_markdown`），2026-09-26 删掉了，
  // **2026-09-29 也没有加回来——这是有意的**：导出走的虽然是同一条渲染路径
  //（一个只读 Milkdown 实例，`摘正文` 里建的那个），但见上面那条前缀规则
  //——`nota-` 开头的类名连同**装饰**在导出前一律摘掉，所以"宽松档标题"
  // (`#你好`) 在导出的 HTML/PDF 里**永远是普通段落**，与参不传 `strict`
  // 无关。屏幕上那一侧的显示层（`heading-on-enter.ts`）是**编辑时的提示**，
  // 不该跟着进文件。留一个不起作用的开关在这里，只会让人以为导出与屏幕上
  // 可能不一致。
  //
  // ⚠️ 反过来说：**这条说明依赖上面那条前缀规则**。哪天有人给这类装饰换成
  // 不用 `nota-` 前缀的类名，导出就会开始带上标题字号——那时这里必须补上
  // `strict`（或者把类名改回去）。
  /** 含样式。见上面那张表。 */
  styled: boolean;
  /** 文档主题的**原始** CSS（没限域过的）。缺省 = 不嵌主题。 */
  themeCss?: string;
  /**
   * 写进 `<title>`。也是**导出**对话框的默认文件名（`默认导出名`）。
   *
   * ⚠️ 是「导出」不是「另存为」——这两个概念不一样，别混：**另存为**换的是
   * *这份文档自己*的路径（存的是 Markdown 源文，落盘后当前文档就变成新路径了）；
   * **导出**产出的是一份**别的文件**（HTML/PDF/Word…），当前文档一个字节都不动。
   * 所以这个 title 只是个"文件名从哪来"的来源，导出**不会**回写文档状态。
   */
  title: string;
}

/**
 * 摆正文外面那几层用的 class。**必须和 `EditorPane.tsx` / `editor.css` 一致**
 *（那边是 `div.editor-mount > div.milkdown > div.ProseMirror`）。
 */
const 外壳开头 = '<div class="editor-mount"><div class="milkdown"><div class="ProseMirror">';
const 外壳结尾 = "</div></div></div>";

/**
 * 本仓插进编辑区 DOM 的**装饰**——挂在正文元素上的类名。
 *
 * 判据收成一条：**类名以 `nota-` 开头的一律不算内容**。这条规则好记也好核，
 * 而且比"逐个列清楚"耐腐蚀——将来再加一个 `nota-xxx` 装饰时它自动生效，
 * 不会因为忘了来这儿登记而漏进导出。代价是**正文自己不能带 `nota-` 开头的
 * class**（用户写的 Markdown 里不可能有 class，所以这条代价是零）。
 *
 * ⚠️⚠️ **它只管类名，管不了元素**——容器型零件必须登记在下面 `整块删掉` 里。
 * 见那段注释：这条边界是用户打了一份带行号和语言选择器的 PDF 才划清的。
 */
const nota类前缀 = /^nota-/;

/**
 * 摘掉的那些属性：全是"编辑时才成立"的。`data-srcmark` 是块标记的文字。
 *
 * ⚠️ **属性没有"前缀规则"这一层，只能逐个登记**（类名那条 `nota-` 前缀的
 * 自动兜底在这儿不管用）。所以新加一个 `data-nota-xxx` 式的装饰时，除了
 * 类名，**这个数组也要来看一眼**——漏了的症状是导出文件里留下一条谁也不认识的
 * 属性（不报错、不影响排版，但它是本仓的私货，不该进用户的文件）。
 *
 * ⚠️ 2026-09-30 删掉了 `data-lax-level`（"宽松档标题"挂的那个级数）。它跟着
 * `heading-on-enter.ts` 里那组 `.nota-lax-heading` 规则一起来（2026-09-29），
 * 又跟着它们一起走——那套"宽松档按标题字号排"的长相被用户当天那句
 *「回车变成标题」推翻，两条路并成了同一条（只加粗，回车才成块）。
 * 于是**现在整棵树上一个 `data-nota-*` 式属性都没有了**，只剩 `data-srcmark`
 * 那一颗（它是标记的文字，不是装饰参数）。下一个加进来的记得回这儿登记。
 */
const 摘掉的属性 = [
  "data-srcmark",
  "contenteditable",
  "spellcheck",
  "translate",
  // ── 2026-10-10 补的三条（**本仓自己的记号**，别的工具不认识）────────────
  //
  // 它们挂在公式 / 图表 / 裸 HTML 那几种**节点视图**的外壳上，值是源码或状态
  //（`data-value="\frac{1}{2}"`、`data-state="loading"`…）。留着的症状：导出的
  // HTML 里那些 `<span>` / `<div>` 各带着一串自家属性，Pandoc 转 markdown 时
  // 会原样写成 `[..]{data-type="math_inline" data-value="…"}`。
  //
  // ⚠️ **只列名，别写成"凡是 `data-` 开头的都摘"**：正文里可以有用户自己写的
  // 裸 HTML（`html-block.ts` 那一路原样进导出），他写 `<div data-x="1">` 是他的
  // 内容，不是我们的零件。摘掉的只能是这张名单上这几个**我们自己造的名字**。
  "data-state",
  "data-type",
  "data-value",
];

/**
 * 整段删掉的元素：**它们的存在本身就是一件编辑时的交互**，不是"带个类名的正文"。
 *
 * ⚠️⚠️ **这份名单和上面那条前缀规则是两件事，别混。** `nota-` 前缀只能摘掉
 * **类名**，元素还留在原地；对"挂在正文上的装饰"（`nota-dim` / `nota-find-hit` /
 * `nota-review-add`）摘掉类名就等于删干净了，对**容器**一点用都没有——摘掉
 * `.nota-code-gutter` 的类名，留下的还是那个装着 `1 2 3` 的 `<div>`。
 *
 * 这条边界是 **2026-09-27 用户报上来的**：他打了一份 PDF，代码块里带着行号和
 * 右上角那颗语言选择器（连带里面那张几十 KB 的 base64 语言图标）。原先这份名单
 * 只有 `.nota-code-bar` 一条，所以"复制 / 折叠"那两颗按钮没漏，而**同一条路子上
 * 的另外两件漏了**——漏的从来不是"忘了登记某一个"，是**以为那条前缀规则会兜住**。
 * 所以：新加一个 `nota-xxx` 零件时先问一句**它是不是元素**，是就登记到这儿来。
 *
 * ⚠️ 只登记**住在编辑区里的**那些。语言下拉弹层（`.nota-lang-popup`）挂在
 * `document.body` 上（`lang-picker.ts`，为了不被代码块的 `overflow` 切掉），
 * 根本不在本文要遍历的这棵树里，写在这儿是一条永远不会命中的死规则。
 */
const 整块删掉 = [
  // ── 代码块（`code-block.ts`）──────────────────────────────────────────
  /** 行号。内容就是 `1\n2\n3`，不带类名之后看着像正文里混进去的一串数字。 */
  ".nota-code-gutter",
  /** 右上角"折叠 / 复制"。 */
  ".nota-code-bar",
  /** 语言选择器那一格。⚠️ 它**不住在 `.nota-code-bar` 里**（2026-09-25 移出，
   *  见 `code-block.ts`），所以这前两条谁都盖不住它，必须单独登记。 */
  ".nota-code-lang-wrap",
  // ── 公式（`math-view.ts`）────────────────────────────────────────────
  // ⚠️ 这两条在**只读**实例里其实挂不上去（那边 `if (view.editable)` 才 append），
  //    所以今天导不出问题；登记它们是为了"这份名单描述的是**什么东西不该进导出**，
  //    不是**今天漏没漏**"——哪天导出换成一个可编辑实例，漏的就是这些。
  /** 源码面板：`$$` 分隔符 ＋ 那个 textarea ＋ 量宽用的尺子。 */
  ".nota-math-panel",
  /** 悬浮实时预览（`top: 100%` 那张），是渲染区的**副本**。 */
  ".nota-math-preview",
  // ── 图表（`diagram-view.ts`）────────────────────────────────────────
  /** 右上角"编辑源码 / 预览"。 */
  ".nota-diagram-bar",
  /** 装 Mermaid 源码的 textarea。⚠️ 源码是 `value` 不是文本节点，所以它进不了
   *  `innerHTML`——但一个空的 `<textarea>` 在导出的 HTML 里照样是个框。 */
  ".nota-diagram-source",
  /** 说明卡上那颗"编辑源码"按钮。⚠️ 卡片本身（`.nota-diagram-note`）**留着**：
   *  图渲染失败时它是唯一还说得清话的东西。 */
  ".nota-diagram-note-btn",
];

/**
 * 等**异步**渲染落定。今天只有图表那一块是异步的（mermaid 画图走一条串行
 * 队列，见 `diagram-view.ts` 的 `渲染`），但它偏偏是"不吭声就少东西"的那种：
 * 不等的话导出的是一张**"正在渲染图表…"的说明卡**，而屏幕上那块图是好好的
 * ——用户只会觉得导出坏了，且一眼看不出坏在哪（2026-09-27 实测到的）。
 *
 * ⚠️ 判据用图表块自己那个 `data-state`（`diagram-view.ts` 的 `画中()` 摆的是
 * `"loading"`），**不是**"里面有没有 `<svg>`"：渲染失败时永远不会有 svg，
 * 而那种情况下我们要的正是那张说明卡（它至少写了"这张图画不出来"），
 * 用 svg 当判据就会一直傻等到超时。
 *
 * ⚠️ 有**上限**。图在导出这一刻还没画完是完全可能的（源码很长、机器正忙），
 * 那时候交出去的是一张写着"正在渲染"的卡片——不理想，但**不能为它把导出
 * 卡死**：`摘正文` 是点一下就要出东西的那条路，而它的调用方（打印 / 导出 PDF）
 * 没有任何"进度"可言，一个转圈的导出比一张不好看的图更糟。
 *
 * ⚠️ 用 `setTimeout` 而不是 `requestAnimationFrame` 来让出主线程：mermaid
 * 那一步是纯 DOM 计算（不是"等下一帧再画"），而 rAF 在窗口被遮住 / 最小化时
 * 会被浏览器压到几秒一次——那会让这里的上限变成"上限 ÷ 帧率"。
 */
async function 等异步渲染(pm: Element): Promise<void> {
  const 上限毫秒 = 5000;
  const 起点 = performance.now();
  while (performance.now() - 起点 < 上限毫秒) {
    if (!pm.querySelector('.nota-diagram-preview[data-state="loading"]')) return;
    await new Promise((r) => setTimeout(r, 30));
  }
}

/**
 * 把 Markdown 渲染成 HTML 正文片段，并**把编辑时的零件摘干净**。
 *
 * ⚠️ 那个挂载点是**挂在文档里但屏幕外**的（`left: -99999px` + `visibility:
 * hidden`），不是 `display: none`：ProseMirror 建实例时要量 DOM
 *（`coordsAtPos`、行高），`display: none` 下量出来全是 0，某些插件会当场
 * 走岔路。`visibility: hidden` 保留布局、不占屏，两头都对。
 */
async function 摘正文(markdown: string): Promise<string> {
  const root = document.createElement("div");
  root.setAttribute(
    "style",
    "position:fixed;left:-99999px;top:0;width:800px;visibility:hidden;pointer-events:none",
  );
  // ⚠️ **把这棵离屏子树钉成浅色**（`theme/base.css` 里 `[data-ui-mode="light"]`
  // 那一条会匹配任何带这个属性的元素，不只是 `<html>`）。
  //
  // 钉它的理由是**图表**：mermaid 的配色是渲染时烤进 SVG 的，而挑哪一套靠
  // `diagram-view.ts::读明暗` 读 `--doc-bg` 的**计算值**。这个离屏节点挂在
  // 应用自己的文档里，深色界面下会把深色的 `--doc-bg` 读进去，于是**白纸上
  // 画出一张深色图**（2026-09-27 实测：深色界面下导出的 PDF 里，节点是深底
  // 浅字的）。导出文件本身没有 `data-ui-mode`（落 `:root` = 浅色），所以这里
  // 钉浅色，正是让"离屏这一棵"和"导出那一份"用同一套变量。
  root.setAttribute("data-ui-mode", "light");
  document.body.appendChild(root);

  let 片段 = "";
  try {
    const handle = await createEditor({
      root,
      initialMarkdown: markdown,
      readOnly: true,
    });
    const pm = root.querySelector(".ProseMirror");
    if (pm) {
      // ⚠️ **先等，后摘**。反过来（先摘再等）会连 mermaid 拿去比对的那棵树都
      // 一起改了，而它的渲染是异步的——那一头拿的就是我们摘过的 DOM。
      await 等异步渲染(pm);

      // ⚠️ 在**还挂着的 DOM 上**摘零件，不是先把 HTML 拼成字符串再拿正则洗：
      // 正则会碰到正文里恰好出现 `contenteditable` 这几个字之类的意外，
      // 而遍历 DOM 只认真正的元素和真正的属性。
      for (const sel of 整块删掉) pm.querySelectorAll(sel).forEach((n) => n.remove());

      // ── 代码块：把编辑时那一层 DOM **换回** `<pre><code>` ──────────────
      //
      // ⚠️⚠️ 2026-10-06 代码块换成 CodeMirror 之后，一个 `pre` 里装的是：
      //
      //     <code class="nota-code-text">…</code>   ← ProseMirror 的 contentDOM（零尺寸藏着）
      //     <div class="cm-editor">…</div>          ← CM 那一层，用户真正看着的
      //     <div class="nota-code-gutter">…</div>   ← 行号
      //     <div class="nota-code-bar">…</div>      ← 折叠 / 复制
      //     <span class="nota-code-lang-wrap">…</span> ← 语言选择器
      //
      // 中间那三层零件由上面 `整块删掉` 收走，但**下面两件事它管不了**：
      //
      // ① `.cm-editor` 那一层是**内容**、不是零件，删不得；可它的 CSS
      //    （`code-block.css`）**不在导出的那三份里**。于是导出的文件里那一段
      //    是一堆没有样式的 `<div class="cm-line">`——**看着像纯文本，其实不是**。
      // ② 更硬的一条：**`<pre>` 里装着 `<div>`**。别的工具读这份 HTML 时认出的是
      //    "一个 pre、里面若干 div"，不是"一段代码"——用户 2026-10-10 那句
      //    「**Pandoc不识别**」就是它（Pandoc 的 HTML 读入器按块级元素切，
      //    切出来的是几段段落，代码块的围栏语言也丢了）。
      //
      // 所以这里**重建**：`pre` 只留那个 `<code>`（它本来就揣着文本，还带着
      // prism 的行内 token span——那些 span 没有 CSS 也就是普通文字），
      // 语言补成**标准写法** `class="language-xxx"`（Pandoc / GitHub / 各家
      // 高亮器都认这个），`data-language` 那是本仓自己的记号，不给出去。
      // ⚠️ 标准写法里**空语言不写 class**：`language-` 后面没东西是无效值。
      for (const pre of pm.querySelectorAll("pre")) {
        const 代码 = pre.querySelector("code");
        if (!代码) continue;
        const 语言 = pre.getAttribute("data-language") ?? "";
        if (语言) 代码.setAttribute("class", `language-${语言}`);
        pre.removeAttribute("data-language");
        // ⚠️ `replaceChildren`：那一层 CM 的 DOM、行号、工具条、语言选择器
        // **一起**出局——不用逐个删（逐个删就是再抄一遍上面那份名单）。
        pre.replaceChildren(代码);
      }

      // ── 「内容目录」那两颗标记（`editor/toc.ts`）────────────────────────
      // 它们**没法靠上面的前缀规则兜住**（不是 `nota-` 开头的类名，是自造节点
      // 画出来的一个 `<div data-type="html-block">`），而留着的话症状很显眼：
      // 导出文件里会出现一行**看得见的** `<!-- nota:toc -->`——因为
      // `innerHTML` 把文本节点里的 `<` 转义成 `&lt;`，浏览器不再当它是注释。
      //
      // ⚠️ 只删**本仓自己那两条**，不是"删掉所有注释"：用户写的 HTML 注释在
      // 导出里长什么样是另一件事（`docs/10` §3「注释」那一格），不在这儿顺手改。
      for (const n of pm.querySelectorAll('[data-type="html-block"]')) {
        if (是目录标记(n.getAttribute("data-value") ?? "")) n.remove();
      }

      // ── 空段落里那颗占位 `<br>`（`ProseMirror-trailingBreak`，2026-10-10）──
      //
      // ⚠️ 它是 ProseMirror 塞给空文本块的**交互占位**（没有它，文档最后那个
      // 空段落点不进去）。屏幕上它不可见，可**进了 HTML 就是一颗真 `<br>`**：
      // Pandoc 拿它当一次换行，于是导出的 LaTeX 末尾多出一句 `\hfill\break`。
      // 实测（2026-10-10，用真应用写出来的 `.nota-print.html`）：
      //
      //   `<p>a</p><p><br class="ProseMirror-trailingBreak"></p>` → `a` ＋ `\hfill\break`
      //   `<p>a</p><p></p>`（那颗 br 拿掉之后）                  → 只有 `a`
      //
      // ⚠️ 只删这一类：`<br>` 本身是**正当内容**（Shift+Enter 换行就是它），
      // 删整族会连用户的换行一起吃掉。
      for (const br of pm.querySelectorAll("br.ProseMirror-trailingBreak")) br.remove();

      for (const n of [pm, ...pm.querySelectorAll("*")]) {
        const 留着 = [...n.classList].filter((c) => !nota类前缀.test(c));
        if (留着.length) n.setAttribute("class", 留着.join(" "));
        else n.removeAttribute("class");
        for (const a of 摘掉的属性) n.removeAttribute(a);
      }

      // ── 标题补锚点 ────────────────────────────────────────────────────
      // 「内容目录」里那些 `[甲](#甲)` 要落到**真的**元素上，导出的 HTML 才点得动
      // （编辑区里点不动是**有意的**，见 `docs/10` §1 那一格）。
      // 判据与生成目录时**同一个函数**（`editor/toc.ts::锚点`）——两处各写一遍的话，
      // 症状是"文件里的目录点过去是页面顶部"，而且不报错。
      //
      // ⚠️ 文档顺序扫（`querySelectorAll` 就是文档顺序），与生成目录那次**同一顺序**，
      // 所以重名标题的 `-1` / `-2` 后缀也对得上。
      const 已用锚点 = new Set<string>();
      for (const h of pm.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
        h.setAttribute("id", 锚点(h.textContent ?? "", 已用锚点));
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
  const 正文 = await 摘正文(markdown);

  const 样式块: string[] = [];
  if (opts.styled) {
    // ⚠️ 动态 import：这几份 CSS 只有"含样式导出"才用得上，不该压在主包里
    //（编辑区那几份是通过 `main.tsx` 正常加载的，跟这里无关）。
    //
    // ⚠️ **三份缺一不可**，各自缺了会少什么，都是"看着不对但不报错"的那种：
    //
    //  · `theme/base.css` —— 变量那一层（`--doc-bg` / `--fg-muted` / `--border`
    //    / `--code-keyword` …）。**2026-09-27 补的**：在这之前导出只带
    //    `editor.css`，于是文件里每一条 `var(--x)` 都是**未定义**——代码块没有
    //    底色、token 没有配色（`color: var(--code-keyword)` 整条失效）、任务项的
    //    方框（`border: … var(--fg-faint)`）整个消失。⚠️ 只取 `theme/base.css`
    //    这一份、不取同目录的 `color.css`/`shape.css`/`extras.css`：那三份是
    //    **逐风格**的覆盖（`[data-ui-style="…"]`），而导出文件的 `<html>` 上
    //    没有 `data-ui-style`。base.css 里那三段（`:root` ＋ 明/暗两段）正好是
    //    "与风格无关"的全部，也就是这里要的那一份。
    //    ⚠️ 不带 `data-ui-mode` ⇒ 落在 `:root` 那一段 ⇒ **浅色**。这是有意的：
    //    三套文档主题全是浅色，打印也是白纸（下面那条 `@media print`），
    //    一份"深色界面下导出的 PDF"没人要得。代价是深色界面下导出 ≠ 屏幕，
    //    见 `docs/07` 第 69 项那条待定。
    //  · `editor.css` —— 正文自己的长相（这一段原本就有）。
    //  · `katex.min.css` —— 公式。**2026-09-27 补的**：KaTeX 画一棵公式是
    //    **两棵树**（好看的 `katex-html` ＋ 给读屏器/无 CSS 环境用的 MathML
    //    `katex-mathml`），平时靠这一份里那句 `.katex-mathml { position:
    //    absolute; clip: … }` 把后一棵藏起来。少了它，导出的公式在页面上
    //    **画两遍**（一遍好看的、一遍 MathML 的原样），打印出来像排错了版。
    const [主题基, 编辑区, 公式] = await Promise.all([
      import("@/styles/theme/base.css?inline"),
      import("@/styles/editor.css?inline"),
      import("katex/dist/katex.min.css?inline"),
    ]);
    样式块.push(主题基.default, 编辑区.default, 公式.default);
    if (opts.themeCss) {
      // ⚠️ **必须限域**，理由和界面上完全一样（否则主题里那句 `body { … }`
      // 会跑到导出文件的页面上、而不是正文上）。见 `styles/doc-theme.ts`。
      const 限域后 = scopeDocThemeCss(opts.themeCss);
      // ⚠️ 压在 `editor.css` **之后**，与界面上一致：`applyDocTheme` 是往
      // `document.head` **末尾**追加一个 `<style>`，而主题那几条选择器与
      // `editor.css` 的**权重相同**（都是 `.… .ProseMirror xxx`）——所以
      // "谁在后面谁赢"。原来这里把它放在最前面（等于让 `editor.css` 盖住主题），
      // 那样导出的正文与屏幕上就不一样了。
      if (限域后) 样式块.push(限域后);
    }
  }
  // ⚠️ 导出专用那几条**永远在最后**：它们是"为了导出而做的让步"
  //（页面由整页滚、打印回黑纸白字），必须压得住前面所有的东西。
  样式块.push(导出基础样式);

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
  return `${底 || t("Untitled")}.${ext}`;
}
