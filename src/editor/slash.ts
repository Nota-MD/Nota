/**
 * 斜杠菜单：**在行首敲 `/`，弹出"想插入什么"的列表**。
 *
 * 用户 2026-09-27 的原话是那句总的「**所有的未开始全部写完**」——
 * `docs/10` §3「编辑与格式化」里「斜杠菜单（`/` 唤起插入菜单）」一格 ⬜
 * 是这一批结的（结完那格，全表只剩两格未开始，都在"大方向"那一类里）。
 *
 * # ⚠️ 为什么**没有**装 `@milkdown/plugin-slash`
 *
 * `create.ts` 的文件头从 2026-09-23 起就写着这条理由："没有 `slash`、没有
 * `block`、没有 `tooltip`——这些是交互糖，先装它们会在交互口径还没定下来时
 * 就被它们的默认行为绑住"。那句话里的"先"字是有期限的：**口径定了就可以装**。
 * 本批定的口径里没有一条是那个包做不到的，但也没有一条**需要**它——
 * 它给的两样东西（一个 `$ctx` 槽位 ＋ 一个 `SlashProvider` 浮层）加起来
 * 大约一百行，而它另外拖进来 `@floating-ui/dom` 与 `lodash-es` 两条依赖链。
 * 本仓在 `lang-picker.ts`（自绘下拉）、`emoji.ts`（候选面板）、`code-block.ts`
 * 上已经连着走了三次"自己画一块浮层"的路，**用同一套手法画第四块**比引一个新包
 * 更容易看懂。所以本文件是自绘的：`$prose` ＋ `PluginKey` ＋ `document.body`
 * 上一块 `position: fixed` 的浮层，与 `emoji.ts` 的面板逐行同构。
 *
 * ⚠️ 代价如实记：**没有 `flip()` 那类中间件**，所以"会不会跑到视口外面"
 * 得自己算（`摆位置` 里那两行 `Math.min` / `Math.max`，与 `lang-picker.ts`
 * 同一手法）。换来的是一处能读懂的定位逻辑，而不是一份要查文档的配置。
 *
 * # 三段：触发、筛选、执行
 *
 * | 段 | 判据 | 在哪 |
 * |---|---|---|
 * | 触发 | 光标所在**段落**的**行首**是一个 `/`，后面到光标为止没有空白 | `认查询` |
 * | 筛选 | 查询串是**每一条关键词的子串**（大小写无关），空查询命中全部 | `筛项` |
 * | 执行 | 先删掉 `/查询` 那一段，再跑那条命令 | `采用` |
 *
 * # ⚠️ 面板是"只画不改"，直到你点下去
 *
 * 与 `emoji.ts` 那条口径一字不差：`/` 出现的那一刻用户还没决定，面板若真往
 * 文档里写点什么，**猜错了就是改用户的字节**。所以整块面板挂在 `document.body`
 * 上、走 `Plugin.view` 自己管，文档树里**一个字都不动**——认查询只是读
 * `$from.parent.textBetween()`。
 *
 * # ⚠️⚠️ 执行是**两笔**，而且顺序不能反
 *
 * ① 先派一笔事务把 `/查询` 删掉（`insertText("", 起, 光标)`），② 再调那条命令。
 * ②读的是①派完之后的状态——`create.ts` 给过来的执行函数走的是
 * `editor.action()`，它取 `editorViewCtx` 的那一刻就是当下，所以看到的是
 * **删干净之后那个空段落**。反过来的话，`/标题` 那三个字会被标题命令当成正文
 * 带进去，变成 `# /标题`——一个不报错、只是内容不对的结果。
 *
 * ⚠️ 两笔**不是一笔事务**，所以撤销要按两下。这是有意的：把两笔合成一笔要
 * 让命令自己会"追加到给定的事务上"，而 `command-table.ts` 那张 `COMMANDS` 表的签名
 * 是给菜单用的（`(editor, payload) => void`），为斜杠菜单改一遍等于给那张表
 * 加一个只有一处用得上的参数。取舍见 `docs/07` 第 79 项。
 *
 * # ⚠️ 哪些命令**故意不在**这张表里
 *
 * - **链接与图片**：它们要一个地址，而地址是界面层问用户要的
 *   （`ui/PromptDialog.tsx`）。斜杠菜单里放一条"点了什么都不问、插一个空链接"
 *   比不放更坏。⚠️ 判据是**这条命令需不需要用户再给一个信息**，不是"它复不复杂"。
 * - **加粗/斜体/行内代码那一族**：它们是**行内**动作，作用在选区上；
 *   而斜杠菜单出现在一个空段落里，那一瞬间没有选区可作用。
 * - **撤销 / 重做 / 复制 / 粘贴**：它们是"对上一件事的操作"，不是"插入什么"。
 *   这一条是这张表**名字**的判据——表叫"插入菜单"，那就只放插入。
 * - **表格那十条**（加行加列、对齐、删表）：都要求光标在表格里，而斜杠菜单
 *   出现的地方**恰好不可能在表格里**（它要求光标在一个段落里）。
 *
 * # ⚠️ 面板不吃中文输入法的组合键
 *
 * `handleKeyDown` 第一句是 `if (event.isComposing) return false;`
 * ——与 `emoji.ts` 同一条硬要求：输入法选字时也发上下键与回车，
 * 吃掉它们用户就选不了字了。
 */

import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { EditorCommand } from "./create-types";
import { t } from "@/i18n";

/** 表里的一行。 */
export interface 斜杠项 {
  /**
   * 与 `command-table.ts` 那张 `COMMANDS` 表的键**同名**——执行时原样交给它。
   *
   * ⚠️ 类型是 `EditorCommand`（那张**白名单**联合类型）而不是 `string`：
   * 表里写一个不存在的 id 就**编译不过**，不必等运行起来发现"选了没反应"。
   * 这是本文件唯一一处依赖 `create-types.ts` 的地方，而那个文件是纯类型、
   * 运行时会被整个擦掉。
   */
  id: EditorCommand;
  /** 面板上显示的名字。⚠️ **存的是键**（英文原文，2026-09-28 起），显示时才 `t()`。 */
  名称: string;
  /**
   * 检索词，**ASCII**。
   *
   * ⚠️ 与 `名称` 分开是必须的：用户敲的是键盘上的字母，而 `名称` 是中文。
   * 拿中文当关键词的话 `/h1` 一条都筛不出来，而"斜杠菜单敲出来的东西"
   * 恰恰以英文短词为主（`h1` / `ul` / `toc`）。
   * ⚠️ 词之间用空格分隔，**筛的是子串不是词**（`/head` 命中 `heading`）。
   */
  关键词: string;
}

/**
 * 这张表**就是**这个功能的全部内容——面板是它的视图，筛选是它的查询。
 *
 * ⚠️ 加一条之前先读上面文件头里"哪些命令故意不在"那一段：判据是
 * **这条命令是不是"往文档里插一块东西"**。
 */
export const 斜杠表: 斜杠项[] = [
  { id: "h1", 名称: "Heading 1", 关键词: "h1 heading title biaoti" },
  { id: "h2", 名称: "Heading 2", 关键词: "h2 heading title biaoti" },
  { id: "h3", 名称: "Heading 3", 关键词: "h3 heading title biaoti" },
  { id: "ul", 名称: "Bullet List", 关键词: "ul bullet list liebiao" },
  { id: "ol", 名称: "Ordered List", 关键词: "ol ordered list liebiao" },
  { id: "task", 名称: "Task List", 关键词: "task todo checkbox renwu" },
  { id: "quote", 名称: "Blockquote", 关键词: "quote blockquote yinyong" },
  { id: "codeBlock", 名称: "Code Block", 关键词: "code fence daimakuai" },
  { id: "mathBlock", 名称: "Math Block", 关键词: "math formula latex gongshi" },
  { id: "table", 名称: "Table", 关键词: "table grid biaoge" },
  { id: "hr", 名称: "Divider", 关键词: "hr line divider fengexian" },
  { id: "footnote", 名称: "Footnote", 关键词: "footnote note jiaozhu" },
  { id: "toc", 名称: "Table of Contents", 关键词: "toc outline contents mulu" },
];

/**
 * 敲 `/` 之后、光标之前那一段的形状。
 *
 * ⚠️ **只认行首那个斜杠**：正则锚在 `^`，而且串里不许有空白——所以
 * `3/4`（不在行首）与 `/我 想 说`（有空格）都不会弹面板。
 * 空白这条尤其要紧：用户敲完 `/` 发现不对、接着打字，**空格是最自然的放弃动作**
 * （`emoji.ts` 的 `认前缀` 用同一条判据）。
 */
export const 查询正则 = /^\/([^\s/]*)$/;

/** 面板此刻该显示什么。`null` = 不显示。 */
export interface 斜杠状态 {
  /** 那个 `/` 的文档坐标——删除范围的左端。 */
  起: number;
  /** 已经打出来的查询（不含 `/`）。 */
  查询: string;
  /** 筛出来的行（顺序照表）。 */
  候选: 斜杠项[];
  /** 高亮第几条。 */
  选中: number;
}

/**
 * 按查询串筛表。
 *
 * ⚠️ **空查询命中全部**（不是命中零条）：刚敲下 `/` 的那一瞬间查询是空串，
 * 而那一下**恰恰最需要看到整张表**——用户还不一定知道自己要什么。
 * 这条与 `emoji.ts` 的 `找Emoji` 不同（那边空前缀返回空），因为那边是
 * "接着打字母"，这边是"先看看有什么"。
 *
 * ⚠️ 大小写无关（`/H1` 与 `/h1` 一样）。
 */
export function 筛项(查询: string): 斜杠项[] {
  const 词 = 查询.trim().toLowerCase();
  if (词 === "") return 斜杠表;
  return 斜杠表.filter((项) => 项.关键词.toLowerCase().includes(词));
}

/**
 * 从光标处认一段"正在敲的斜杠查询"。
 *
 * ⚠️ **只看当前文本块，而且只认 `paragraph`**：标题、代码块、表格格里敲 `/`
 * 不该弹这个面板——那里能插的东西不一样（代码块里插的是字面文本），
 * 而且"把当前块换成别的块"这件事在那些地方本来就没有意义。
 * 判据放宽成"任何 textblock"的话，最典型的坏结果是在**标题里敲 `/`，
 * 选「标题 1」**——用户会以为菜单坏了。
 *
 * ⚠️ 用的偏移是**块内偏移**（`textBetween(0, $from.parentOffset)`），
 * 换算成文档坐标时加 `$from.start()`（与 `emoji.ts::认前缀` 同一个换算）。
 */
export function 认查询(state: EditorState): 斜杠状态 | null {
  const 选 = state.selection;
  if (!选.empty) return null;
  const $from = 选.$from;
  if (!$from.parent.isTextblock) return null;
  if ($from.parent.type.name !== "paragraph") return null;
  const 文 = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
  const 匹配 = 查询正则.exec(文);
  if (!匹配) return null;
  const 查询 = 匹配[1]!;
  const 候选 = 筛项(查询);
  // 一条都不命中就收起面板（同 `emoji.ts`）：留一块空面板在那儿，
  // 用户只会以为卡住了。
  if (候选.length === 0) return null;
  return {
    查询,
    起: $from.start(),
    候选,
    // ⚠️ 每次重算都回到第 0 条。方向键改 `选中` 走的是**另一条路**
    //（下面 `apply` 里那个 meta），不走这里——理由见那段注释。
    选中: 0,
  };
}

/** 插件键。⚠️ 单独导出：测试要据此读插件状态。 */
export const 斜杠键 = new PluginKey<斜杠状态 | null>("notaSlash");

/**
 * 斜杠菜单插件。
 *
 * ⚠️ **只读实例不挂**（`create.ts` 那边传 `false`）：分屏预览、导出、审查
 * 那几个实例都是只读的，在那儿弹一块"插入什么"的面板纯属噪声
 * （与 `emoji.ts` 的面板同一条判据）。
 *
 * `执行` 是 `create.ts` 交给它的一条路：本文件**不认识**那张 `COMMANDS` 表，
 * 它只知道"用户选了 id 是 `h1` 的那一条"。这样分是有意的——命令表是
 * `command-table.ts` 的事，斜杠菜单只是它的**第二个入口**（第一个是菜单栏，
 * 见 `docs/04`）。⚠️ 这也意味着**这张表里的 id 必须与 `COMMANDS` 的键对齐**，
 * 而这件事由**类型**兜着（`斜杠项.id` 是 `EditorCommand`，写错就编译不过），
 * 不是靠人记着。
 */
export function 斜杠菜单(开: boolean, 执行: (id: EditorCommand) => void) {
  if (!开) return [];
  return [$prose(() => 斜杠插件(执行))];
}

/**
 * 插件本体。
 *
 * ⚠️ **与 `斜杠菜单` 分开是有意的**：`$prose` 那层壳只有在 Milkdown 的
 * `Ctx` 里才跑得起来，而本仓的测试**不建 Editor、不碰真 DOM**（`docs/06` §6.3）。
 * 拆开之后，`tests/slash.test.ts` 可以拿这颗**裸 `Plugin`** 建一颗真的
 * `EditorState`，把状态机（`init` / `apply` 那条 meta 分支）与键盘那几条
 * **真跑一遍**——那几处恰恰是"写错了不报错、只是按下去没反应"的地方。
 * 只留 `斜杠菜单` 一层壳的话，"装配对了"就是测试能碰到的最深处。
 *
 * ⚠️ 面板那一块**是懒建的**（`建面板`，第一次 `view()` 才调）：插件**建出来的
 * 那一刻不碰 `document`**，所以 `tests/slash.test.ts` 可以拿它建一颗真的
 * `EditorState` 去跑 `state` 与 `handleKeyDown`，**不必铺 `document` 桩**
 * （`tests/emoji.test.ts` 到现在也没铺过）。面板那段 DOM 逻辑照旧不验
 * ——它是"画出来给眼睛看的"，本来也不该由这层测试兜。
 */
export function 斜杠插件(执行: (id: EditorCommand) => void): Plugin<斜杠状态 | null> {
  /** 面板。⚠️ `null` ＝ 还没建（见上面那段）。 */
  let 面板: HTMLElement | null = null;
  /** 当前面板上画的是哪一版状态——用来判断要不要重画。 */
  let 画过: 斜杠状态 | null = null;

  function 收起() {
    if (面板 && !面板.hidden) 面板.hidden = true;
    画过 = null;
  }

  function 建面板(): HTMLElement {
    const 板 = document.createElement("div");
    板.className = "nota-slash-pop";
    板.setAttribute("role", "listbox");
    // ⚠️ `contenteditable="false"` ＋ mousedown 那条 `preventDefault`：
    // 面板挂在 body 上、不在编辑器 DOM 里，但 WebKit 仍可能把它当成可聚焦的
    // 东西——点它的时候把焦点从编辑器抢走，**没有焦点就没有光标**
    // （同 `emoji.ts` 面板那两条注释）。
    板.contentEditable = "false";
    板.hidden = true;
    document.body.appendChild(板);
    面板 = 板;
    return 板;
  }

  function 摆位置(view: EditorView, 板: HTMLElement) {
    const 坐标 = view.coordsAtPos(view.state.selection.from);
    const 高 = 板.offsetHeight;
    const 下 = 坐标.bottom + 4;
    const 上 = 坐标.top - 高 - 4;
    // ⚠️ 左边不许溢出右边缘（`Math.min`），上边不许跑到视口外（`Math.max`）：
    // 没有 `@floating-ui` 的中间件，这两下就是全部的"翻边"逻辑。
    板.style.left = `${Math.min(坐标.left, Math.max(8, window.innerWidth - 板.offsetWidth - 8))}px`;
    板.style.top = `${下 + 高 > window.innerHeight - 8 ? Math.max(8, 上) : 下}px`;
  }

  function 画(view: EditorView, 板: HTMLElement, 状: 斜杠状态) {
    if (画过 && 画过.起 === 状.起 && 画过.查询 === 状.查询 && 画过.选中 === 状.选中) {
      摆位置(view, 板);
      return;
    }
    板.replaceChildren(
      ...状.候选.map((项, i) => {
        const 行 = document.createElement("div");
        行.className = "nota-slash-item" + (i === 状.选中 ? " is-on" : "");
        行.setAttribute("role", "option");
        行.setAttribute("aria-selected", String(i === 状.选中));
        const 名 = document.createElement("span");
        名.className = "nota-slash-name";
        // ⚠️ **显示时才翻**：表里存的是键（`commands.ts` 那套"表存键、
        // 渲染时翻"），import 那一刻语言还没定。
        名.textContent = t(项.名称);
        行.append(名);
        // ⚠️ 用**闭包里的 `i`**，不是 `状.选中`：点的那一条才是要选的那一条，
        // 而 `状` 在这一次重画里是快照。
        行.addEventListener("mousedown", (e) => {
          e.preventDefault();
          采用(view, 状, i, 执行);
        });
        return 行;
      }),
    );
    板.hidden = false;
    画过 = 状;
    摆位置(view, 板);
  }

  return new Plugin<斜杠状态 | null>({
    key: 斜杠键,

    state: {
      init: (_配, state) => 认查询(state),
      apply(tr, _旧, _旧state, 新state) {
        // ⚠️⚠️ **先看这一笔事务带没带面板自己的 meta**，带的话直接采用它。
        // 与 `emoji.ts` 同一处坑、同一条理由：上下键改的只是"高亮第几条"，
        // 它们没有改文档，所以在重算这条路上会**原样算回来**——上一版把
        // `选中` 从 0 改成 1，下一秒被 `认查询` 重置成 0，表现为"按 ↓ 没反应"。
        const 指定 = tr.getMeta(斜杠键) as 斜杠状态 | null | undefined;
        if (指定 !== undefined) return 指定 ?? null;
        return 认查询(新state);
      },
    },

    props: {
      handleKeyDown(view, event) {
        // ⚠️⚠️ 输入法组合期间一律不接管（硬要求，见文件头）。
        if (event.isComposing) return false;
        const 状 = 斜杠键.getState(view.state);
        if (!状) return false;
        switch (event.key) {
          case "ArrowDown":
            view.dispatch(
              view.state.tr.setMeta(斜杠键, { ...状, 选中: (状.选中 + 1) % 状.候选.length }),
            );
            return true;
          case "ArrowUp":
            view.dispatch(
              view.state.tr.setMeta(斜杠键, {
                ...状,
                选中: (状.选中 - 1 + 状.候选.length) % 状.候选.length,
              }),
            );
            return true;
          case "Enter":
          case "Tab": {
            采用(view, 状, 状.选中, 执行);
            return true;
          }
          case "Escape":
            // ⚠️ Esc 只收面板，不退出别的。⚠️ **它同时要删掉那个 `/` 吗？**
            // 不删。用户按 Esc 的语义是"我不想用菜单了"，而已经敲下去的那个
            // `/` 是他自己敲的字；替他把斜杠删掉又是一次"程序改用户写的东西"
            // （与 `lax-heading.ts` 那条立场同源）。⚠️ 代价如实记：面板收起
            // 之后，接着打一个空格就会让那个 `/` 彻底变成普通字符
            //（`查询正则` 不再命中），这条路是通的。
            收起();
            return true;
          default:
            return false;
        }
      },
    },

    view() {
      const 板 = 建面板();
      return {
        update(view) {
          const 状 = 斜杠键.getState(view.state);
          if (状) 画(view, 板, 状);
          else 收起();
        },
        destroy() {
          板.remove();
          面板 = null;
        },
      };
    },
  });
}

/**
 * 采用第 `第几条` 个候选。
 *
 * ⚠️ 顺序不能反：**先删 `/查询`，再跑命令**（理由在文件头"执行是两笔"那一段）。
 * ⚠️ 删除范围的右端取**当前光标**而不是"起 ＋ 查询长度＋1"——
 * `认查询` 走的是 `textBetween`，它对被替换过的字符有特殊处理，用光标位置
 * 就不必再假设两者一致（与 `emoji.ts::采用候选` 同一条）。
 *
 * ⚠️ **导出成函数是给测试用的**（`tests/slash.test.ts` 直接喂一颗假 view
 * 看它派了什么），面板那几条路走的是同一个函数。
 */
export function 采用(
  view: EditorView,
  状: 斜杠状态,
  第几条: number,
  执行: (id: EditorCommand) => void,
): void {
  const 项 = 状.候选[第几条];
  if (!项) return;
  const 到 = view.state.selection.from;
  if (到 < 状.起) return;
  view.dispatch(view.state.tr.insertText("", 状.起, 到));
  执行(项.id);
}
