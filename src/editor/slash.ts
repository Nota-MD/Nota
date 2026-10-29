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
export interface SlantBarItem {
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
  label: string;
  /**
   * 检索词，**ASCII**。
   *
   * ⚠️ 与 `名称` 分开是必须的：用户敲的是键盘上的字母，而 `名称` 是中文。
   * 拿中文当关键词的话 `/h1` 一条都筛不出来，而"斜杠菜单敲出来的东西"
   * 恰恰以英文短词为主（`h1` / `ul` / `toc`）。
   * ⚠️ 词之间用空格分隔，**筛的是子串不是词**（`/head` 命中 `heading`）。
   */
  closeKeyWord: string;
}

/**
 * 这张表**就是**这个功能的全部内容——面板是它的视图，筛选是它的查询。
 *
 * ⚠️ 加一条之前先读上面文件头里"哪些命令故意不在"那一段：判据是
 * **这条命令是不是"往文档里插一块东西"**。
 */
export const slashTable: SlantBarItem[] = [
  { id: "h1", label: "Heading 1", closeKeyWord: "h1 heading title biaoti" },
  { id: "h2", label: "Heading 2", closeKeyWord: "h2 heading title biaoti" },
  { id: "h3", label: "Heading 3", closeKeyWord: "h3 heading title biaoti" },
  { id: "ul", label: "Bullet List", closeKeyWord: "ul bullet list liebiao" },
  { id: "ol", label: "Ordered List", closeKeyWord: "ol ordered list liebiao" },
  { id: "task", label: "Task List", closeKeyWord: "task todo checkbox renwu" },
  { id: "quote", label: "Blockquote", closeKeyWord: "quote blockquote yinyong" },
  { id: "codeBlock", label: "Code Block", closeKeyWord: "code fence daimakuai" },
  { id: "mathBlock", label: "Math Block", closeKeyWord: "math formula latex gongshi" },
  { id: "table", label: "Table", closeKeyWord: "table grid biaoge" },
  { id: "hr", label: "Divider", closeKeyWord: "hr line divider fengexian" },
  { id: "footnote", label: "Footnote", closeKeyWord: "footnote note jiaozhu" },
  { id: "alertNote", label: "GitHub Note", closeKeyWord: "alert note github tishi" },
  { id: "alertTip", label: "GitHub Tip", closeKeyWord: "alert tip github tishi" },
  { id: "alertImportant", label: "GitHub Important", closeKeyWord: "alert important github zhongyao" },
  { id: "alertWarning", label: "GitHub Warning", closeKeyWord: "alert warning github jinggao" },
  { id: "alertCaution", label: "GitHub Caution", closeKeyWord: "alert caution github zhuyi" },
  { id: "toc", label: "Table of Contents", closeKeyWord: "toc outline contents mulu" },
];

/**
 * 敲 `/` 之后、光标之前那一段的形状。
 *
 * ⚠️ **只认行首那个斜杠**：正则锚在 `^`，而且串里不许有空白——所以
 * `3/4`（不在行首）与 `/我 想 说`（有空格）都不会弹面板。
 * 空白这条尤其要紧：用户敲完 `/` 发现不对、接着打字，**空格是最自然的放弃动作**
 * （`emoji.ts` 的 `认前缀` 用同一条判据）。
 */
export const queryCorrectRule = /^\/([^\s/]*)$/;

/** 面板此刻该显示什么。`null` = 不显示。 */
export interface SlantBarState {
  /** 那个 `/` 的文档坐标——删除范围的左端。 */
  start5: number;
  /** 已经打出来的查询（不含 `/`）。 */
  query: string;
  /** 筛出来的行（顺序照表）。 */
  candidate: SlantBarItem[];
  /** 高亮第几条。 */
  selected: number;
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
export function filterItem(query: string): SlantBarItem[] {
  const word = query.trim().toLowerCase();
  if (word === "") return slashTable;
  return slashTable.filter((item5) => item5.closeKeyWord.toLowerCase().includes(word));
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
export function recognizeQuery(state: EditorState): SlantBarState | null {
  const select = state.selection;
  if (!select.empty) return null;
  const $from = select.$from;
  if (!$from.parent.isTextblock) return null;
  if ($from.parent.type.name !== "paragraph") return null;
  const text4 = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
  const match2 = queryCorrectRule.exec(text4);
  if (!match2) return null;
  const query = match2[1]!;
  const candidate = filterItem(query);
  // 一条都不命中就收起面板（同 `emoji.ts`）：留一块空面板在那儿，
  // 用户只会以为卡住了。
  if (candidate.length === 0) return null;
  return {
    query,
    start5: $from.start(),
    candidate,
    // ⚠️ 每次重算都回到第 0 条。方向键改 `选中` 走的是**另一条路**
    //（下面 `apply` 里那个 meta），不走这里——理由见那段注释。
    selected: 0,
  };
}

/** 插件键。⚠️ 单独导出：测试要据此读插件状态。 */
export const slashKey = new PluginKey<SlantBarState | null>("notaSlash");

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
export function slantBarMenu(open2: boolean, executeLine: (id: EditorCommand) => void) {
  if (!open2) return [];
  return [$prose(() => slantBarPlugin(executeLine))];
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
export function slantBarPlugin(executeLine: (id: EditorCommand) => void): Plugin<SlantBarState | null> {
  /** 面板。⚠️ `null` ＝ 还没建（见上面那段）。 */
  let panel: HTMLElement | null = null;
  /** 当前面板上画的是哪一版状态——用来判断要不要重画。 */
  let rendered: SlantBarState | null = null;

  function collapse() {
    if (panel && !panel.hidden) panel.hidden = true;
    rendered = null;
  }

  function createPanel(): HTMLElement {
    const board = document.createElement("div");
    board.className = "nota-slash-pop";
    board.setAttribute("role", "listbox");
    // ⚠️ `contenteditable="false"` ＋ mousedown 那条 `preventDefault`：
    // 面板挂在 body 上、不在编辑器 DOM 里，但 WebKit 仍可能把它当成可聚焦的
    // 东西——点它的时候把焦点从编辑器抢走，**没有焦点就没有光标**
    // （同 `emoji.ts` 面板那两条注释）。
    board.contentEditable = "false";
    board.hidden = true;
    document.body.appendChild(board);
    panel = board;
    return board;
  }

  function arrangePosition(view: EditorView, board: HTMLElement) {
    const coordinate = view.coordsAtPos(view.state.selection.from);
    const height = board.offsetHeight;
    const below = coordinate.bottom + 4;
    const above = coordinate.top - height - 4;
    // ⚠️ 左边不许溢出右边缘（`Math.min`），上边不许跑到视口外（`Math.max`）：
    // 没有 `@floating-ui` 的中间件，这两下就是全部的"翻边"逻辑。
    board.style.left = `${Math.min(coordinate.left, Math.max(8, window.innerWidth - board.offsetWidth - 8))}px`;
    board.style.top = `${below + height > window.innerHeight - 8 ? Math.max(8, above) : below}px`;
  }

  function draw(view: EditorView, board: HTMLElement, state3: SlantBarState) {
    if (rendered && rendered.start5 === state3.start5 && rendered.query === state3.query && rendered.selected === state3.selected) {
      arrangePosition(view, board);
      return;
    }
    board.replaceChildren(
      ...state3.candidate.map((item5, i) => {
        const line3 = document.createElement("div");
        line3.className = "nota-slash-item" + (i === state3.selected ? " is-on" : "");
        line3.setAttribute("role", "option");
        line3.setAttribute("aria-selected", String(i === state3.selected));
        const name3 = document.createElement("span");
        name3.className = "nota-slash-name";
        // ⚠️ **显示时才翻**：表里存的是键（`commands.ts` 那套"表存键、
        // 渲染时翻"），import 那一刻语言还没定。
        name3.textContent = t(item5.label);
        line3.append(name3);
        // ⚠️ 用**闭包里的 `i`**，不是 `状.选中`：点的那一条才是要选的那一条，
        // 而 `状` 在这一次重画里是快照。
        line3.addEventListener("mousedown", (e) => {
          e.preventDefault();
          adoptUse(view, state3, i, executeLine);
        });
        return line3;
      }),
    );
    board.hidden = false;
    rendered = state3;
    arrangePosition(view, board);
  }

  return new Plugin<SlantBarState | null>({
    key: slashKey,

    state: {
      init: (_Configure, state) => recognizeQuery(state),
      apply(tr, _OldValue, _OldValuestate, newValuestate) {
        // ⚠️⚠️ **先看这一笔事务带没带面板自己的 meta**，带的话直接采用它。
        // 与 `emoji.ts` 同一处坑、同一条理由：上下键改的只是"高亮第几条"，
        // 它们没有改文档，所以在重算这条路上会**原样算回来**——上一版把
        // `选中` 从 0 改成 1，下一秒被 `认查询` 重置成 0，表现为"按 ↓ 没反应"。
        const pointFixed = tr.getMeta(slashKey) as SlantBarState | null | undefined;
        if (pointFixed !== undefined) return pointFixed ?? null;
        return recognizeQuery(newValuestate);
      },
    },

    props: {
      handleKeyDown(view, event) {
        // ⚠️⚠️ 输入法组合期间一律不接管（硬要求，见文件头）。
        if (event.isComposing) return false;
        const state3 = slashKey.getState(view.state);
        if (!state3) return false;
        switch (event.key) {
          case "ArrowDown":
            view.dispatch(
              view.state.tr.setMeta(slashKey, { ...state3, selected: (state3.selected + 1) % state3.candidate.length }),
            );
            return true;
          case "ArrowUp":
            view.dispatch(
              view.state.tr.setMeta(slashKey, {
                ...state3,
                selected: (state3.selected - 1 + state3.candidate.length) % state3.candidate.length,
              }),
            );
            return true;
          case "Enter":
          case "Tab": {
            adoptUse(view, state3, state3.selected, executeLine);
            return true;
          }
          case "Escape":
            // ⚠️ Esc 只收面板，不退出别的。⚠️ **它同时要删掉那个 `/` 吗？**
            // 不删。用户按 Esc 的语义是"我不想用菜单了"，而已经敲下去的那个
            // `/` 是他自己敲的字；替他把斜杠删掉又是一次"程序改用户写的东西"
            // （与 `lax-heading.ts` 那条立场同源）。⚠️ 代价如实记：面板收起
            // 之后，接着打一个空格就会让那个 `/` 彻底变成普通字符
            //（`查询正则` 不再命中），这条路是通的。
            collapse();
            return true;
          default:
            return false;
        }
      },
    },

    view() {
      const board = createPanel();
      return {
        update(view) {
          const state3 = slashKey.getState(view.state);
          if (state3) draw(view, board, state3);
          else collapse();
        },
        destroy() {
          board.remove();
          panel = null;
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
export function adoptUse(
  view: EditorView,
  state3: SlantBarState,
  ordinalHowManyItem: number,
  executeLine: (id: EditorCommand) => void,
): void {
  const item5 = state3.candidate[ordinalHowManyItem];
  if (!item5) return;
  const to2 = view.state.selection.from;
  if (to2 < state3.start5) return;
  view.dispatch(view.state.tr.insertText("", state3.start5, to2));
  executeLine(item5.id);
}
