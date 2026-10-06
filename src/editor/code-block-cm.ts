/**
 * 代码块里那个 **CodeMirror 实例**（backlog 第 101 项）。
 *
 * 用户 2026-10-06 定的做法：「**引入开源项目：CodeMirror。解决代码框。记得鸣谢。**」
 * ——也就是说，代码块不再靠给 ProseMirror 的 `code_block` 打补丁去凑手感
 * （`auto-pair.ts` 那边只能补"配对"这一件，缩进与 `Tab` 补不进去），
 * 而是**换一个真的编辑器来管那一段文本**。
 *
 * # 为什么这就不是"新引一个库"
 *
 * `@codemirror/state` / `view` / `commands` / `language` 本仓**早就在用**
 * （源码模式 `editor/source.ts`，2026-09 起）。这一批只多了一个
 * `@codemirror/autocomplete`——它是**唯一**新登记的依赖，为的是它里面的
 * `closeBrackets()`（真正的代码编辑器那套配对：成对补右半边、再打闭符号跨过去、
 * 夹在空对中间退格两颗一起删）。⚠️ 那一份不许自己手写：配对看着简单，
 * 但"选中一段再打括号""引号里的引号""退格删一对"三件事的边界条件很碎，
 * 手写的版本一定会在某个语言上出洋相。
 *
 * # 谁拥有这段文本（**这是本文件最要紧的一条**）
 *
 * **ProseMirror 仍然是文档的唯一真相**——`.md` 存的是它序列化出来的东西，
 * 撤销栈、脏标记、"改了没有"全归它。CodeMirror 在这里只是**这一段文本的
 * 输入面**：用户按键落在 CM 上，CM 把改动**推回** PM 一笔真事务。
 *
 * ⚠️ 因此撤销**归 PM**（CM 那一侧**刻意不装 `history()`**）：代码块里按
 * `Ctrl+Z` 走的是 `code-block.ts` 转给 PM 的那条路，于是"在代码块里改一个字
 * → 点到正文 → 再按 Ctrl+Z"撤销的是同一件事，不会出现两套栈互相看不见对方。
 *
 * # 三个坑（`docs/07` 第 101 项点名要盯的）
 *
 * ① **防回声**：CM 一改就推 PM，PM 一改又推回 CM——不收口的话光标会跳、
 *    撤销栈会被拆碎。收口靠**两把锁**：本文件的 `同步中`（CM 那一侧）
 *    与 `code-block.ts` 里同名的那把（PM 那一侧）。判定文本相不相同时，
 *    两把锁都要在。
 * ② **不抖**：推给 PM 的**不是"整块换掉"**，而是 `算最小改动` 算出来的
 *    那一段（只换真正变了的那几个字）。整块换的话每敲一个字都记一笔
 *    "整块替换"，撤销一下会把一整段吞掉。
 * ③ **不要两套高亮**：代码着色的**唯一来源**仍是 `refractor`（本仓 297 种语言
 *    的那一份，原来是 `@milkdown/plugin-prism` 在读）。这里把它**接过来**：
 *    `分色()` 拿 refractor 的分词结果算出区间，再交给 CM 的 `Decoration.mark`。
 *    ⚠️ 类名**逐字沿用** `token xxx`（`editor-blocks.css` 里那一整段
 *    `.token.keyword` 配色就是这么写的），所以配色**一个新常量都没加**。
 */

import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import {
  Compartment,
  EditorSelection,
  EditorState,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  drawSelection,
  keymap,
  type Command,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { refractor } from "refractor";

/**
 * 一级缩进的宽度。
 *
 * ⚠️ **这是本批自己定的一个数，不是抄来的**：CM 的出厂值是 2 个空格，
 * 而代码块里常见的那几门语言（Rust / Python / C 系）的通行口径是 4，
 * 参考对象 Typora 也是 4。将来要做成设置项的话，**改这一处就够**——
 * `Tab`、`Shift+Tab`、回车续行三条路读的都是它。
 */
const 缩进宽度 = "    ";

/* ── 纯函数：给测试读的那三个 ─────────────────────────────────────────────
 *
 * ⚠️ 这三件（改动的边界、着色的区间、回车续多少格）**都是纯字符串运算**，
 * 与 CM/PM 的视图无关，所以单独放在这儿让 `tests/code-block-editing.test.ts`
 * 直接测——开窗目检只能证"这一条看着对"，边界条件（半个 emoji、空行、
 * 括号配对）得靠用例钉。
 */

function 是高位(c: number): boolean {
  return c >= 0xd800 && c <= 0xdbff;
}

function 是低位(c: number): boolean {
  return c >= 0xdc00 && c <= 0xdfff;
}

/**
 * 两版文本之间**最小的那一段改动**（只用一处替换表达）。
 *
 * 算法是"抠掉公共前缀、再抠掉公共后缀"，看着朴素，但**两条边界必须处理**，
 * 否则会切出半个字符来：
 *
 * - **代理对**：`"😀"` 与 `"😁"` 的高位是同一个码元（`0xD83D`），
 *   逐码元比前缀会停在**两个码元中间**——照那个位置切，切完剩下一个孤立的
 *   高位代理，文本就坏了。所以两条边界都要往回退到**完整的字符**上。
 * - **前后缀重叠**：前缀和后缀都别越过对方（`前 + 尾 <= 短`），
 *   否则 `"aa"` → `"a"` 这种会被算成"删掉一个 a 又插回一个 a"。
 *
 * 判据在 `tests/code-block-editing.test.ts`：相等、纯插入、纯删除、中间替换、
 * 整段替换、以及上面那两种边界。
 */
export function 算最小改动(
  旧文: string,
  新文: string,
): { 删起: number; 删到: number; 插入: string } {
  const 短 = Math.min(旧文.length, 新文.length);

  let 前 = 0;
  while (前 < 短 && 旧文.charCodeAt(前) === 新文.charCodeAt(前)) 前++;
  // ⚠️ 退到完整字符上：`前` 若正好落在（高位, 低位）之间，两边一起退一格。
  while (前 > 0 && (是低位(旧文.charCodeAt(前)) || 是低位(新文.charCodeAt(前)))) {
    if (是高位(旧文.charCodeAt(前 - 1)) || 是高位(新文.charCodeAt(前 - 1))) 前--;
    else break;
  }

  const 还能退 = () => 尾 < 短 - 前;
  const 尾断在字符里 = (文: string) => {
    const i = 文.length - 尾;
    return i > 0 && i < 文.length && 是高位(文.charCodeAt(i - 1)) && 是低位(文.charCodeAt(i));
  };

  let 尾 = 0;
  while (还能退() && 旧文.charCodeAt(旧文.length - 1 - 尾) === 新文.charCodeAt(新文.length - 1 - 尾))
    尾++;
  while (还能退() && (尾断在字符里(旧文) || 尾断在字符里(新文))) 尾++;

  return { 删起: 前, 删到: 旧文.length - 尾, 插入: 新文.slice(前, 新文.length - 尾) };
}

/** hast 里我们要用到的那几个字段。⚠️ refractor 的类型很宽，这里自己收窄。 */
type 分词节点 = {
  type: string;
  value?: string;
  children?: 分词节点[];
  properties?: { className?: unknown };
};

export type 色块 = { 从: number; 到: number; 类: string };

/**
 * 把一段代码按语言分成着色区间（`{从, 到, 类}`）。
 *
 * 类名与 `@milkdown/plugin-prism` 的产物**逐字相同**（`token` + 若干修饰类，
 * 嵌套的那几层合并成一串）——`editor-blocks.css` 里那一整段配色照旧管用，
 * 一个颜色常量都不用新加。
 *
 * ⚠️ 三条安静的失败都走"不上色"（返回空），**不抛**：语言为空、
 * refractor 不认识这个语言、分词器自己抛（`refractor/all` 里个别语言就是会抛）。
 * 代码块变成纯文本**不好看**，但比"整块渲染不出来"好得多。
 */
export function 分色(文本: string, 语言: string): 色块[] {
  if (!文本 || !语言) return [];
  if (!refractor.listLanguages().includes(语言)) return [];

  let 树: 分词节点;
  try {
    树 = refractor.highlight(文本, 语言) as unknown as 分词节点;
  } catch {
    return [];
  }

  const 出: 色块[] = [];
  let 位 = 0;
  const 走 = (节点们: 分词节点[], 类: string[]): void => {
    for (const 节点 of 节点们) {
      if (节点.type === "element") {
        const 名 = Array.isArray(节点.properties?.className)
          ? (节点.properties.className as string[])
          : [];
        走(节点.children ?? [], [...类, ...名]);
      } else if (typeof 节点.value === "string") {
        const 到 = 位 + 节点.value.length;
        if (类.length && 节点.value.length) 出.push({ 从: 位, 到, 类: 类.join(" ") });
        位 = 到;
      }
    }
  };
  走(树.children ?? [], []);
  return 出;
}

/** 三种括号的配对表（与 `closeBrackets` 那份表同源）。 */
const 开括号 = "([{";
const 闭括号 = ")]}";

/**
 * 回车那一刻该插什么、光标落在哪。
 *
 * 三条口径（照真编辑器）：
 * ① **延续上一行的缩进**；
 * ② 上一行以 `{` / `(` / `[` 结尾时**再进一级**；
 * ③ 光标正好夹在一对空括号中间（`{|}`）时**展开成三行**（中间那行再进一级）。
 *
 * ⚠️ `删多少` 那一项是给"光标停在一行纯空白后面"这一格用的：真编辑器在
 * 这种情况下会把那截空白**并进新行**（上一行不留尾随空白）。CM 自带的
 * `insertNewlineAndIndent` 也是这么做的，这里对齐它。
 *
 * 返回的是**相对光标**的三个数，命令层照抄即可。
 */
export function 回车续行(
  前文: string,
  后文: string,
  单位: string,
): { 删多少: number; 插入: string; 光标: number } {
  const 纯空白 = /^[ \t]*$/.test(前文);
  const 缩进 = /^[ \t]*/.exec(前文)?.[0] ?? "";

  const 非空白尾 = 前文.replace(/[ \t]+$/, "");
  const 末字符 = 非空白尾.slice(-1);
  // ⚠️ `末字符` 为空时**不能直接 `indexOf`**：`"([{".indexOf("")` 回的是 `0`
  //（空串是任何字符串的子串），于是"光标停在一行纯空白后面"这一格会被当成
  // "上一行以 `(` 结尾"，凭空多进一级。**这一条是 `tests/code-block-editing.test.ts`
  // 当场抓出来的**（见那一组最后一条）。
  const 位置 = 末字符 === "" ? -1 : 开括号.indexOf(末字符);
  const 期望闭 = 位置 >= 0 ? 闭括号.charAt(位置) : "";

  const 后文头 = /^[ \t]*/.exec(后文)?.[0] ?? "";
  const 后文首 = 后文.charAt(后文头.length);
  const 收尾 = 期望闭 !== "" && 后文首 === 期望闭;

  if (收尾) {
    const 内缩进 = 缩进 + 单位;
    return { 删多少: 纯空白 ? 前文.length : 0, 插入: `\n${内缩进}\n${缩进}`, 光标: 1 + 内缩进.length };
  }

  const 新缩进 = 期望闭 !== "" ? 缩进 + 单位 : 缩进;
  return { 删多少: 纯空白 ? 前文.length : 0, 插入: `\n${新缩进}`, 光标: 1 + 新缩进.length };
}

/* ── CM 扩展 ──────────────────────────────────────────────────────────── */

/** 语言靠一个 `StateField` 记着：代码块的 NodeView 改语言时发这条效果。 */
const 设语言效果 = StateEffect.define<string>();

const 语言字段 = StateField.define<string>({
  create: () => "",
  update(值, 事务) {
    for (const 效果 of 事务.effects) if (效果.is(设语言效果)) return 效果.value;
    return 值;
  },
});

/** "请重新算一遍着色"。⚠️ 只给**长尾语言那一份表异步到货**时用（见下）。 */
const 重算效果 = StateEffect.define<null>();

function 算装饰(state: EditorState): DecorationSet {
  const 文本 = state.doc.toString();
  const 语言 = state.field(语言字段, false) ?? "";
  const 区间 = 分色(文本, 语言).map((块) =>
    Decoration.mark({ class: 块.类 }).range(块.从, 块.到),
  );
  // ⚠️ 第二个参数 `true` 是"排一下序"：CM 要求装饰按起点有序，
  // 而 refractor 的叶子是**嵌套展平**出来的（父的类名会并进子串），
  // 自己排不如让它排。
  return Decoration.set(区间, true);
}

const 分色插件 = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = 算装饰(view.state);
    }
    update(u: ViewUpdate) {
      const 语言变了 = u.startState.field(语言字段, false) !== u.state.field(语言字段, false);
      const 要重算 = u.transactions.some((事务) =>
        事务.effects.some((效果) => 效果.is(重算效果)),
      );
      if (u.docChanged || 语言变了 || 要重算) this.decorations = 算装饰(u.state);
    }
  },
  { decorations: (v) => v.decorations },
);

/**
 * 外观。⚠️ **一个色值都不写**：颜色全走 `var(--…)`（和 `source.ts` 那条
 * 同一个理由——写死了之后换文档主题就会得到"深底深字"）。
 *
 * ⚠️ 这里只补 CM 自己的盒模型（内边距、行距、光标、选区），
 * **字体与字号不在这条里**：它们从 `pre` 继承（`.88em` 那一档），
 * 改在那边改。
 */
const 主题 = EditorView.theme({
  "&": { backgroundColor: "transparent", color: "inherit", height: "auto", outline: "3px solid lime" },
  "&.cm-focused": { outline: "3px solid red" },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "inherit",
    // ⚠️ `pre` 那边才是滚动的那一层（它 `overflow: visible` 是**必须的**：
    // 块外那三样挂件——围栏标记、工具栏、语言框——都要画到框外去，见
    // `editor-blocks.css` 那条注释）。所以这里不能自己开一个滚动区。
    overflow: "visible",
  },
  ".cm-content": { padding: "0", minHeight: "0", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--bg-active)",
  },
});

/** 配对表。⚠️ CM 出厂那份**没有反引号**，代码块里必须有（`` ` `` 是常用符号）。 */
const 配对表 = EditorState.languageData.of(() => [
  { closeBrackets: { brackets: ["(", "[", "{", "'", '"', "`"], before: ")]}:;>`" } },
]);

export type 代码块编辑器 = {
  /** CM 的根元素，加进 `pre` 里当可见的那一层。 */
  视图: EditorView;
  取文本: () => string;
  取光标: () => number;
  /** 从外面换掉整段文本（PM→CM 那条路）。⚠️ 走最小改动，所以光标不会跳。 */
  设文本: (文: string) => void;
  设语言: (语: string) => void;
  设选区: (锚: number, 头: number) => void;
  聚焦: () => void;
  有焦点: () => boolean;
  销毁: () => void;
};

export type 代码块编辑器选项 = {
  初始文本: string;
  初始语言: string;
  /** CM 里的文本变了（**已经去掉了回声**：由调用方的 `同步中` 那把锁保证）。 */
  文本变化: (新文: string) => void;
  聚焦: () => void;
  失焦: () => void;
  /** 代码块里按了 Ctrl+Z / Ctrl+Shift+Z。⚠️ 撤销归 ProseMirror，见文件头。 */
  撤销: () => void;
  重做: () => void;
};

export function 创建代码块编辑器(选项: 代码块编辑器选项): 代码块编辑器 {
  let 已销毁 = false;

  /**
   * 回车。
   *
   * ⚠️ **自己写一条，而不是直接用 CM 的 `insertNewlineAndIndent`**：那条在没有
   * 语言文法时（代码块就是这种情况——本仓只装了 markdown 一门 CM 文法）
   * 只会**照抄上一行的缩进**，不会"上一行以 `{` 结尾就再进一级"。
   * 这里把它换成 `回车续行`（纯函数，有用例）＋ 同一个"夹在空括号里就展开"的
   * 口径。写进 keymap 的第一位，压住 `defaultKeymap` 里那一条。
   */
  const 回车带缩进: Command = ({ state, dispatch }) => {
    const 主 = state.selection.main;
    const 行 = state.doc.lineAt(主.from);
    const 前文 = state.sliceDoc(行.from, 主.from);
    const 后文 = state.sliceDoc(主.to, 行.to);
    const { 删多少, 插入, 光标 } = 回车续行(前文, 后文, 缩进宽度);
    const 从 = 主.from - 删多少;
    dispatch(
      state.update({
        changes: { from: 从, to: 主.to, insert: 插入 },
        selection: EditorSelection.cursor(从 + 光标),
        scrollIntoView: true,
        userEvent: "input",
      }),
    );
    return true;
  };

  const 撤销键 = { key: "Mod-z", run: () => (选项.撤销(), true) };
  const 重做键 = [
    { key: "Shift-Mod-z", run: () => (选项.重做(), true) },
    { key: "Mod-y", run: () => (选项.重做(), true) },
  ];

  // 自动换行那一格（设置 → 编辑器 → 「代码块 → 自动换行」，默认开）。
  // ⚠️ **必须走 CM 自己的开关，不能只靠 CSS**：`pre` 上那条
  // `html[data-code-wrap="off"] { white-space: pre }` 管不到 CM 内部
  //（它的 `.cm-content` 有自己的 `white-space`）。做成一个舱，设置一变就重配，
  // 这样那颗开关在代码块里**真的**是活的——不然就是又一个"拨了不生效的开关"。
  const 换行舱 = new Compartment();
  const 要换行 = () => document.documentElement.dataset.codeWrap !== "off";

  const 视图 = new EditorView({
    state: EditorState.create({
      doc: 选项.初始文本,
      extensions: [
        配对表,
        // ⚠️ 顺序既管优先级也管"谁先试"：我们自己那两条撤销键要在最前
        //（`defaultKeymap` 里没有 `Mod-z`，但先写能保证将来它加了也不打架）。
        keymap.of([
          { key: "Enter", run: 回车带缩进 },
          { key: "Shift-Enter", run: 回车带缩进 },
          撤销键,
          ...重做键,
          ...closeBracketsKeymap,
          ...defaultKeymap,
          indentWithTab,
        ]),
        closeBrackets(),
        indentUnit.of(缩进宽度),
        EditorState.tabSize.of(缩进宽度.length),
        语言字段.init(() => 选项.初始语言),
        分色插件,
        drawSelection(),
        换行舱.of(要换行() ? EditorView.lineWrapping : []),
        主题,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) 选项.文本变化(u.state.doc.toString());
          if (u.focusChanged) (u.view.hasFocus ? 选项.聚焦 : 选项.失焦)();
        }),
      ],
    }),
  });

  const 盯设置 = new MutationObserver(() => {
    if (已销毁) return;
    视图.dispatch({ effects: 换行舱.reconfigure(要换行() ? EditorView.lineWrapping : []) });
  });
  盯设置.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-code-wrap"],
  });

  // ⚠️ 长尾语言那一份表（`refractor/all`，~500 kB）是**异步**到的（见
  // `code-block.ts` 顶上那段）。本插件只在文档变化时重算，所以"开机时正开着
  // 一份长尾语言的文档"这一格要靠这条通知补上。⚠️ `import()` 有缓存，
  // 每个代码块各挂一次不会重复下载。
  void import("refractor/all").then(() => {
    if (已销毁) return;
    try {
      视图.dispatch({ effects: 重算效果.of(null) });
    } catch {
      // 视图可能在 resolve 之前就被销毁了（整块被删掉）。不理它。
    }
  });

  return {
    视图,
    取文本: () => 视图.state.doc.toString(),
    取光标: () => 视图.state.selection.main.head,
    设文本: (文) => {
      const 旧 = 视图.state.doc.toString();
      if (旧 === 文) return;
      const { 删起, 删到, 插入 } = 算最小改动(旧, 文);
      视图.dispatch({ changes: { from: 删起, to: 删到, insert: 插入 } });
    },
    设语言: (语) => {
      if (视图.state.field(语言字段) === 语) return;
      视图.dispatch({ effects: 设语言效果.of(语) });
    },
    设选区: (锚, 头) => {
      const 长 = 视图.state.doc.length;
      const 夹 = (n: number) => Math.max(0, Math.min(长, n));
      const 新 = EditorSelection.range(夹(锚), 夹(头));
      const 旧 = 视图.state.selection.main;
      if (旧.anchor === 新.anchor && 旧.head === 新.head) return;
      视图.dispatch({ selection: 新 });
    },
    聚焦: () => 视图.focus(),
    有焦点: () => 视图.hasFocus,
    销毁: () => {
      已销毁 = true;
      盯设置.disconnect();
      视图.destroy();
    },
  };
}
