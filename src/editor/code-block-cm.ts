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
 *
 * # 2026-10-07 补的两样：选择那几颗键 ＋ 空选区复制/剪切
 *
 * - **`Ctrl+L` / `Ctrl+D` / `Ctrl+Shift+D` 在这里自己接**（`selectLine` 与
 *   `select.ts` 共用那两个判据）。⚠️ **不能指望应用那条路**：那三条命令
 *   （`selectLine` / `selectWord` / `deleteWord`）在所见即所得那一侧**认了
 *   代码块就返回**——代码块的选区归这颗实例管，PM 那边设一个"在代码块里"的
 *   选区**屏幕上什么都不会亮**（那颗实例拿着 DOM 焦点时 PM 的
 *   `editorOwnsSelection()` 就是假，`selectionToDOM` 直接返回回来，所以
 *   NodeView 的 `setSelection` 根本不会被叫到）。见 `select.ts` 文件头。
 *   ⚠️ 因此**菜单里那三条在代码块里点不动**（菜单走的是 PM 那条路），而键位
 *   好用——不是撒谎，是"这一段文本的主人不是它"；这条边界记在 `docs/07`。
 * - **空选区按复制/剪切＝整行**（编辑器里的 `lineWiseCopyCut` 那一条，
 *   判据是 {@link 整行剪贴}）。⚠️ `Mod-e`（选句）**这里不接**：代码里没有
 *   "句子"这个概念，拿句读去扫代码只会切出半截标识符。两头（这里与 PM 那条路）
 *   都**不做**，于是没有"键位与菜单不一致"这回事。
 */

import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, indentWithTab, selectLine } from "@codemirror/commands";
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
  highlightActiveLine,
  keymap,
  type Command,
  type DecorationSet,
  type KeyBinding,
  type ViewUpdate,
} from "@codemirror/view";
import { refractor } from "refractor";

// ⚠️ 「哪个字算一个词」的判据**与所见即所得、源码模式是同一份**（`select.ts`
// 第一组那几个纯函数）：同一颗 `Ctrl+D` 在三处选出来的东西必须一样。
import { 选词区间, type 区间 } from "./select";

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

/**
 * 一段文本里，`位置` 所在那一行的边界（`入` 含、`出` 不含，**都不含换行符**）。
 *
 * ⚠️ 位置**正好落在某个换行符后面**时算作下一行的行首（`lastIndexOf` 的起点
 * 是 `位 - 1`，正好会捡到它前面那个 `\n`）——光标停在行首按 `Ctrl+C` 拿的
 * 该是**光标后面那一行**，不是它上面那一行。
 */
export function 行界(文本: string, 位置: number): { 入: number; 出: number } {
  const 位 = Math.max(0, Math.min(文本.length, 位置));
  const 入 = 文本.lastIndexOf("\n", 位 - 1) + 1;
  let 出 = 文本.indexOf("\n", 入);
  if (出 < 0) 出 = 文本.length;
  return { 入, 出 };
}

/**
 * 「空选区按复制 / 剪切」该拿哪一段——编辑器里管这条叫 `lineWiseCopyCut`
 * （VS Code、Typora 的代码块都有）。**纯字符串运算**，用例在
 * `tests/code-block-editing.test.ts`。
 *
 * 三条口径：
 *
 * ① **带走那个换行符**：`Ctrl+C` 空选区拿到的是整行**连同它的换行**，粘到别处
 *    就是一行，不会和上一行黏在一起。⚠️ **最后一行没有换行可带**（文档末尾），
 *    那时只给这一行的字符——凭空补一个 `\n` 会让粘贴处多出一个空行。
 * ② **剪切要连换行一起删**，但**末尾那一行删的是它前面那个换行**：不这么办的话
 *    "删掉最后一行"会留下一个空行（屏幕上看着像删干净了、文档里还剩一个 `\n`）。
 * ③ 只算**一行**（光标所在那一行）。多光标/"已经有选区"这两种情况**不在这条
 *    命令的范围内**——{@link 落剪贴板} 见到就交回 CM 自己那份默认行为。
 *
 * 返回 `null` 表示"没算出来"（文档为空）——调用方照旧交回默认行为。
 */
export function 整行剪贴(
  文本: string,
  位置: number,
  是剪切: boolean,
): { 文本: string; 删: { from: number; to: number } | null; 光标: number } | null {
  if (!文本) return null;
  const { 入, 出 } = 行界(文本, 位置);
  const 有下行 = 出 < 文本.length;
  const 行文 = 文本.slice(入, 出);
  const 删 = 是剪切
    ? {
        // ⚠️ 末尾那一行（`有下行` 为假）删的是前面那个换行；只有一段的文档
        //（`入` 为 0）没有前面那个换行，就删它自己。
        from: 有下行 ? 入 : Math.max(0, 入 - 1),
        to: 有下行 ? 出 + 1 : 出,
      }
    : null;
  return { 文本: 行文 + (有下行 ? "\n" : ""), 删, 光标: 删 ? 删.from : 入 };
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
  "&": { backgroundColor: "transparent", color: "inherit", height: "auto" },
  "&.cm-focused": { outline: "none" },
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
  // ⚠️⚠️ **第一条选择器要照 CM 自己那条写全**（理由与 `source.ts` 那处一字不差，
  // 2026-10-07 一起量出来的）：写短了权重压不过 CM 出厂的聚焦色，画出来是它的
  // 淡紫而不是这里的 `--bg-active`，且聚焦紫、失焦灰两种色。
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--bg-active)",
  },
  // 当前行那一层淡底。
  //
  // ⚠️ **不能照抄源码模式那条 `--bg-subtle`**：代码块自己的底**就是**
  // `--bg-subtle`（`editor-blocks.css` 里 `pre` 那条 `background`），同一个色
  // 兑上去是一条**隐身规则**——看着像生效了、屏幕上一个像素都不变。
  //
  // 所以这里用**正文色的半透明**兑：`--fg` 按定义就是与底反差最大的那一极
  //（浅色近黑、深色近白），混出来的一层在明暗两套、各套文档主题下都成立，
  // 不用为一个新色号去 `base.css` 那两处再添一个变量。
  // ⚠️ 别改成 `var(--accent)`：强调色在代码块里会被语法配色抢掉，而且那个色
  // 已经归"拖列宽"那条 12% 的规则用着，两处撞脸会让人以为是同一件事。
  //
  // ⚠️⚠️ **两条规则是一对，缺一条就出错**（2026-10-07 开窗量出来的）：
  //
  // - **上面那条（`transparent`）不是多余的**：CM 自己带一条出厂样式
  //   `.cm-activeLine { background: #cceeff44 }`（淡蓝 27%），而**它不看焦点**。
  //   只要装了 `highlightActiveLine()`，**每一个没聚焦的代码块也会被它涂上**
  //   ——文档里几个代码块就亮几行第一行。上面那条按 (0,2,0) 把它压掉。
  //   ⚠️ 这一条**当初是量出来的**：截图上带子是 `rgb(95,104,109)`，
  //   `0.267×#cceeff + 0.733×#383838` 正好等于它——不是"看着像"。
  // - **下面那条（有焦点）挂在 `&.cm-focused` 上**，按 (0,3,0) 压住上面那条。
  //   焦点是判据：没聚焦时**根本没有任何一行是"当前行"**。
  "& .cm-activeLine": { backgroundColor: "transparent" },
  "&.cm-focused .cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--fg) 5%, transparent)" },
});

/** 配对表。⚠️ CM 出厂那份**没有反引号**，代码块里必须有（`` ` `` 是常用符号）。 */
const 配对表 = EditorState.languageData.of(() => [
  { closeBrackets: { brackets: ["(", "[", "{", "'", '"', "`"], before: ")]}:;>`" } },
]);

/**
 * 空选区按复制 / 剪切时**整行进出**（`lineWiseCopyCut`，判据见 {@link 整行剪贴}）。
 *
 * ⚠️ **只做"空选区"这一格**，其余一律 `return false` 交回浏览器/CM 自己：
 * 有选区时原生那套（复制选中那段、剪切掉它）就是对的，另写一份只会和它打架。
 * 多光标同理（本仓虽然没开多光标插件，但 `defaultKeymap` 里那两条
 * `Mod-Alt-ArrowUp/Down` 能加出多个选区来）——那时"哪一行"没有唯一答案。
 *
 * ⚠️ **`cut` 必须自己删**：`preventDefault()` 之后浏览器不会动 DOM，删是我们
 * 这一笔 CM 事务的责任（它随后经 `文本变化` 推回 PM，所以撤销栈归 PM，
 * 与文件头那条一致）。⚠️ 不用 `document.execCommand`——那条已经废弃，而且在
 * WebKitGTK 上的行为还得另测。
 *
 * ⚠️ `clipboardData` 可能为空（个别环境不给）：那时**什么都不做**、放行原生
 * 行为，而不是"标记成处理了却没写剪贴板"——后者会让用户按了 Ctrl+C 之后
 * 剪贴板里还是上一次的东西，而界面看不出任何异常。
 */
/**
 * 按过键、但那次按键的剪贴板事件**还没被消费掉**的实例。
 *
 * 判据的由来见 {@link 记按键}：WebKitGTK 对同一次按键会派发**两遍**
 * `copy` / `cut`，所以要有一份"这一下按键办过没有"的账。
 */
const 按键没办 = new WeakSet<EditorView>();

/**
 * 剪贴板那两条键的"记账"键位（`Mod-c` / `Mod-x`）。
 *
 * ⚠️ **它什么都不做、也要 `return false`**：返回 `false` 才不会 `preventDefault()`
 * 掉按键——`copy` / `cut` 那两个 DOM 事件正是浏览器对这颗键的**默认动作**，
 * 拦了它们就永远发不出来（2026-10-07 开窗量到的第一课，见
 * {@link 整行剪贴处理}）。
 *
 * 记这笔账是因为**同一次按键会派发两遍**：实测 WebKitGTK 按一下 `Ctrl+X`，
 * `cut` 事件来两次（两次都是 `isTrusted`，中间没有任何 keydown；同一支里
 * `paste` 只来一次），而 `Ctrl+C` 也来两次。复制挨两遍没关系，**剪切挨两遍
 * 就是少两行**——第二遍的光标已经落到被删那一行的下一行，于是顺手再删一行。
 * 症状（实测）：按一下 `Ctrl+X`，代码块里连着少两行，而剪贴板里只有一行。
 *
 * ⚠️ 判据用"有没有一次真的按键"，**不是**时间戳/防抖：那两种都是猜，而这种
 * 错法的代价是**删掉用户的字**。⚠️ 账本按实例记（`WeakSet`）：一个文档里
 * 可能有多个代码块，各挂各的 keymap。
 */
const 记按键: Command = (目标) => {
  按键没办.add(目标);
  return false;
};

function 落剪贴板(事件: ClipboardEvent, 视图: EditorView, 是剪切: boolean): boolean {
  // ⚠️ **先认账**，再决定怎么办：不是新按键的那一遍直接咽掉——文档已经删过了、
  // 剪贴板也写好了，再办一遍就是多删一行。咽的时候要 `preventDefault()`：
  // 不拦的话浏览器会拿它自己那份（此时选区是空的）去动剪贴板与 DOM。
  if (!按键没办.has(视图)) {
    事件.preventDefault();
    return true;
  }
  按键没办.delete(视图);

  const 选区们 = 视图.state.selection.ranges;
  if (选区们.length !== 1 || !选区们[0]!.empty) return false;
  const 计划 = 整行剪贴(视图.state.doc.toString(), 选区们[0]!.head, 是剪切);
  if (!计划) return false;
  if (!事件.clipboardData) return false;
  事件.clipboardData.setData("text/plain", 计划.文本);
  事件.preventDefault();
  if (计划.删) {
    视图.dispatch({
      changes: { from: 计划.删.from, to: 计划.删.to },
      selection: EditorSelection.cursor(计划.光标),
      scrollIntoView: true,
    });
  }
  return true;
}

/**
 * {@link 落剪贴板} 的两条挂载。⚠️ CM 自己**不管**复制/剪切（它靠浏览器默认），
 * 所以**这一段就是它们的主人**——但 2026-10-07 开窗量出：光挂上还不够。
 *
 * ⚠️ **它跑不跑，取决于 `ui/useMenus.ts` 那条全局 accel 放不放行**：那条在
 * `window` 上、`Ctrl+C` / `Ctrl+X` / `Ctrl+V` 都在它的表里，默认路径会
 * `preventDefault()`——而 `preventDefault()` 按死的是**浏览器的默认动作**，
 * 于是 `copy` / `cut` 这两个事件**根本不会发出来**，下面挂的 handler 一次都
 * 跑不到（实测：空选区按 `Ctrl+C`，剪贴板里还是上一次在外面复制的那一篇）。
 * 所以那个文件里有一条按 id 的放行（认的是这颗实例根元素上那个
 * `nota-code-cm`）——两处注释互指，改一边要连着看另一边（`docs/06` §5.55）。
 *
 * ⚠️ **跑到了还会跑到两遍**：WebKitGTK 对同一次按键派发两遍 `copy` / `cut`
 * （实测，两次都是 `isTrusted`，中间没有 keydown），于是 handler 里第一件事
 * 是认 {@link 记按键} 记的那笔账——那一笔的由来与"少两行"的症状都写在那儿。
 */
const 整行剪贴处理 = EditorView.domEventHandlers({
  copy: (事件, 视图) => 落剪贴板(事件, 视图, false),
  cut: (事件, 视图) => 落剪贴板(事件, 视图, true),
});


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

  /**
   * 光标那一行的**词区间**（`Ctrl+D` / `Ctrl+Shift+D` 共用）。
   *
   * ⚠️ 判据是 `select.ts` 里那个**与另两种模式共用**的 `选词区间`；⚠️ 只扫
   * **光标所在这一行**（`行界` 那一套与 `source-commands.ts` 同一条口径）：
   * 拿整块代码去扫的话，光标停在行首时会去选**上一行的最后一个词**。
   */
  const 光标处词 = (state: EditorState): 区间 | null => {
    const 头 = state.selection.main.head;
    const 行 = state.doc.lineAt(头);
    const 词 = 选词区间(行.text, 头 - 行.from);
    return 词 && { from: 行.from + 词.from, to: 行.from + 词.to };
  };

  /** 选当前词（`Ctrl+D`）。⚠️ 与所见即所得那条同判据，理由见文件头。 */
  const 选词键: Command = ({ state, dispatch }) => {
    const 区 = 光标处词(state);
    if (!区) return false;
    dispatch(state.update({ selection: EditorSelection.range(区.from, 区.to), scrollIntoView: true }));
    return true;
  };

  /** 选当前词并删（`Ctrl+Shift+D`）。⚠️ 光标落在删掉那一段的**开头**（同 `select.ts::删词`）。 */
  const 删词键: Command = ({ state, dispatch }) => {
    const 区 = 光标处词(state);
    if (!区) return false;
    dispatch(
      state.update({
        changes: { from: 区.from, to: 区.to },
        selection: EditorSelection.cursor(区.from),
        scrollIntoView: true,
      }),
    );
    return true;
  };

  const 选择键: KeyBinding[] = [
    // ⚠️ `Mod-l` / `Mod-d` / `Mod-e` 在 CM 的 `defaultKeymap` 里**都没有**
    //（`Ctrl-e` / `Ctrl-d` 那两条住在 `emacsStyleKeymap`，本仓没装那份），
    // 所以这里不需要"压住谁"——写在这儿是因为**这一段文本的键位归这颗实例**。
    {
      key: "Mod-l",
      run: (目标) => {
        // 直接借 CodeMirror 自己那条（源码模式也用它）——"一行"这个概念在
        // 文本上只有一个答案。⚠️ 它选中的是**整行连同末尾那个换行**，
        // 与所见即所得那边（段落内容、不含分隔）不同，理由见 `select.ts` 那一段。
        selectLine(目标);
        return true;
      },
    },
    { key: "Mod-d", run: 选词键 },
    { key: "Mod-Shift-d", run: 删词键 },
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
          ...选择键,
          // ⚠️ 这两条**只记账、不办事**（`记按键` 里有整段理由）：`return false`
          // 才能让浏览器照旧发出 `copy` / `cut`，那才是这两条键的正文。
          { key: "Mod-c", run: 记按键 },
          { key: "Mod-x", run: 记按键 },
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
        整行剪贴处理,
        // ⚠️ 给这颗实例的根元素挂一个**只属于代码块**的类名：`ui/useMenus.ts`
        // 那条全局 accel 要认它，才知道"剪贴板那几键归里层这个编辑器"
        //（源码模式也是 `.cm-editor`，光按那个认会把源码模式一起放进去）。
        EditorView.editorAttributes.of({ class: "nota-code-cm" }),
        // 当前行那一层淡底（配色在同文件那条 `主题` 里，**与源码模式不是一个色**，
        // 理由见那条注释）。
        highlightActiveLine(),
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
