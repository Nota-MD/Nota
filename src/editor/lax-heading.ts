/**
 * 宽松模式：把 `#标题`（井号后面没空格）**按标题排版**，而**一个字节都不动**。
 *
 * # 为什么要这么绕
 *
 * 宽松模式（默认，见 `atx.ts`）要认得 `#你好` 是标题。最省事的做法是解析前
 * 把文本补成 `# 你好`，让解析器自己去认——第一版就是这么干的，被用户否了：
 * 「**如果关闭，存盘不要自动修复。**」所见即所得那一侧是**整篇重新序列化**
 * 的，文本一旦被补过，存盘存下去的就是带空格那份：用户写的字被改了。
 *
 * 所以这里反过来：**文档树里它就是个普通段落**（解析器一个字都不碰，
 * 存盘必然存回原文），我们只给它在**显示上**套一层标题的样子。
 *
 * ⚠️ 这条分工是**结构性**的：从"段落"到"文件"那条路上没有任何一步会改字。
 * 想给这里加"顺手把井号补个空格"的念头，先回去读 `atx.ts` 文件头那段。
 *
 * # 为什么是 `Decoration.node` + `nodeName`
 *
 * - 文档树里是段落 ⇒ 存盘不改字；
 * - DOM 上要**真是一个 `h1`** ⇒ 文档主题的排版规则写的是 `h1 { font-size: … }`
 *   （`src/styles/themes/*.css`），只有换成真标签，**内置的六套和用户自己写的
 *   主题**才一视同仁地生效。反过来"给段落加个 class、再让每套主题各写一条
 *   同款规则"的话，主题（含用户主题）得逐个补，补漏一套就长得不一样。
 *
 * ⚠️ `nodeName` 是**包一层**（`<h1><p>#你好</p></h1>`），不是替换标签——
 * 这是 prosemirror-view 的既有行为（`computeOuterDeco`）。包一层在这里正好：
 * 主题里写着 `p { margin: 0 }`，不会叠出双份外边距。
 *
 * # 严格模式根本不挂这个插件
 *
 * `create.ts` 只在**宽松**时 `.use()` 它（严格时连挂都不挂），所以严格模式下
 * 这份装饰不存在，`#你好` 就是一段普通正文。装饰**只看文档、不看光标**，
 * 于是可以按"文档对象没换就不重算"来缓存（见下面那个 `cache`）。
 */

import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { 宽松标题层数 } from "./atx";

/**
 * 挂在包装元素上的 class。**样式不靠它**（靠它是真 `h1`），它只负责让
 * "这一块是宽松认出来的标题"在人读 DOM、写测试、目检时看得见。
 */
const 宽松标题类名 = "nota-lax-heading";

/** 按文档算一遍装饰。返回 `DecorationSet.empty` 表示这篇里一个都没有。 */
function 算装饰(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];

  doc.descendants((node, pos) => {
    // ⚠️ 只认**段落**。围栏代码块是 `code_block`，压根不在这条路上——
    // 旧版那份"补空格"的预处理要自己扫 ```` ``` ```` 就是为了这个，
    // 换成按节点判之后，那种守卫结构性地不需要了。
    if (node.type.name !== "paragraph") return true;

    // ⚠️ 第一个孩子必须是**纯文本**节点：`#` 在行内代码（`` `#你好` ``）或
    // 强调里的时候它不是标题的井号，`textContent` 分不出来（都是 `#你好`），
    // 节点的类型分得出来。
    const first = node.firstChild;
    if (!first || !first.isText || !first.text) return true;

    const 层数 = 宽松标题层数(first.text);
    if (层数 === 0) return true;

    decos.push(
      Decoration.node(pos, pos + node.nodeSize, {
        // 值就是标签名：一级 → `h1`。
        nodeName: `h${层数}`,
        class: 宽松标题类名,
      }),
    );
    return true;
  });

  return decos.length ? DecorationSet.create(doc, decos) : DecorationSet.empty;
}

/**
 * 插件本体。
 *
 * ⚠️ 装饰**只取决于文档**，所以按"`state.doc` 还是不是同一个对象"来缓存：
 * 纯光标移动也会让 ProseMirror 重新问一次 `decorations`，而这里要遍历整篇，
 * 不缓存的话每按一次方向键都要全篇走一遍。文档一改，对象就换了，缓存自然失效
 * （不需要自己判断"这次变化影响不影响结果"）。
 */
export const 宽松标题显示 = $prose(() => {
  let cache: { doc: PMNode; set: DecorationSet } | null = null;

  return new Plugin({
    key: new PluginKey("nota-lax-heading"),
    props: {
      decorations: (state) => {
        if (cache && cache.doc === state.doc) return cache.set;
        const set = 算装饰(state.doc);
        cache = { doc: state.doc, set };
        return set;
      },
    },
  });
});

/* ── 第二件事：序列化时**别把行首的井号转义掉** ─────────────────────────────
 *
 * 上面那个装饰解决了"显示"，但存盘还会**改字**——另一半在这个函数里。
 *
 * # 病灶
 *
 * `#标签` 在文档树里是**段落**（这正是"不改字"的前提），而 markdown 的序列化
 * 器有个保守习惯：段落里**行首**的 `#` 一律转义成 `\#`
 * （`mdast-util-to-markdown` 的 unsafe 表里那条 `{atBreak: true, character: '#'}`，
 * 注释写的是"A number sign could start an ATX heading if it starts a line"）。
 * 于是 `#标签 不是标题` 存盘变成 `\#标签 不是标题`。**用户没打那个反斜杠**，
 * 这就是"自动修复"，只不过换了副面孔。
 *
 * # 为什么可以放心不管这一条
 *
 * CommonMark 认的 ATX 标题是**井号后面必须有空白**。所以"井号后面直接跟正文"
 * 这种行首井号，**在任何 CommonMark 解析器眼里都当不成标题**，转义纯属多余：
 * 把 `\#标签` 写成 `#标签` 在任何解析器里都解析成同一段文字。⚠️ 所以这条规则
 * 收得很紧——**必须**是 `#{1,6}` 后面紧跟一个非空白、非井号的字符：
 *
 * - `# 有空格`（用户显式写的转义）→ **不动**，它本来就得转义，转义了才不会
 *   在重新打开时变成标题；
 * - `\#标签`（用户显式写了反斜杠）→ 反斜杠会被去掉，剩下 `#标签`。
 *   ⚠️ 这是**已知的、可接受的**一处残留改字：转义过的井号和裸井号在文档树里
 *   是**同一个东西**（都是文本 `#标签`），要区分就只能记住源码——那是另一个
 *   量级的工程（见 `docs/03` 的"往返会改字"）。差别也只在字节上，两边的
 *   解析结果、以及 Nota 里的显示**完全一样**。
 *
 * # 挂在哪
 *
 * `create.ts` 的 `.config()` 里改这个处理器，**两种模式都改**。
 *
 * ⚠️ 一开始我只在宽松模式改（想着"严格模式就该照 CommonMark 来"），
 * 但那条转义只在"井号后面有空白"时才**有用**，而那种写法这条规则一个字
 * 都不碰。既然如此，两种模式都不改，用户看到的规律才简单一句话：
 * 「**Nota 不会往你写的井号上加反斜杠**」。严格模式下 `#标签` 本来就只是
 * 普通段落，少了这个反斜杠照样是普通段落——两边的解析结果一模一样。
 */

/**
 * remark 序列化选项的类型：**从 ctx 反推出来**。
 *
 * ⚠️ 别为了这几个字把 `remark-stringify` 列进 `package.json`——它只是
 * `@milkdown/core` 的间接依赖，真正需要它的类型定义的是那边。这里顺着
 * `SliceType` 上那个 `_typeInfo` 把类型拿回来，一分钱不多花。
 */
type 串化选项 = ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>;
/** mdast 的文本处理器（`handlers.text` 那一条）。 */
type 文本处理器 = NonNullable<NonNullable<串化选项["handlers"]>["text"]>;

/**
 * 行首（或整串开头）被转义掉的那个井号。`m[2]` 是井号本身。
 *
 * ⚠️ 收得紧是故意的：`(?=[^\s#])` 要求紧跟的是**非空白非井号**，
 * 也就是"CommonMark 里当不成标题"的那种。见上面那一段。
 */
const 被转义的行首井号 = /(^|\n)\\(#{1,6})(?=[^\s#])/g;

/**
 * 包一层：把这个文本节点输出里的 `\#` 放回 `#`。
 *
 * `原文` 是 Milkdown 自己那条文本处理器（`remarkStringifyOptionsCtx` 的默认值里
 * 就有）；**没有它就原样返回**，不自己造一条——序列化器是核心路径，宁可什么都不做。
 */
export function 不转义行首井号(原文?: 文本处理器): 文本处理器 {
  return (node, parent, state, info) => {
    if (!原文) return node.value ?? "";
    return 原文(node, parent, state, info).replace(被转义的行首井号, "$1$2");
  };
}
