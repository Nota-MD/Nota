/**
 * 源码模式的**命令落点**：一条 `EditorCommand` 落到 CodeMirror 文本上的那一下。
 *
 * 2026-10-07 从 `source.ts` 整块搬出来的（`docs/07` 第 89 项）——那边那天 1048 行，
 * 而这一块（`applyCommand` 那张 `switch` ＋ 它下面那七八个文本小工具）本来就是
 * **一件事**："把菜单/快捷键发来的命令，翻译成对文本的改动"。搬出来之后
 * `source.ts` 只留编辑器本身（扩展、主题、句柄、查找/写作模式的接线）。
 *
 * # 边界（搬的时候按这条切的，别往外扩）
 *
 * **对外只有一个名字**：`applyCommand`。下面的 `LINE_PREFIXES`、`selectedLines`、
 * `setLinePrefix`、`wrapSelection`、`切换行内标记`、`清除行内标记`、`insertAtCursor`、
 * `insertBlock` 全是它的私房工具——只在本文件里用，一个都不导出。将来若要给
 * 它们写测试，那时再按那份测试的需要开出口（先例：`source-mark.ts` 的
 * `试摘定界符` 就是这么单开一个文件的）。
 *
 * ⚠️ **这里不 import `source.ts`**（一句都不许）：那边 import 本文件，
 * 反过来就是环。本文件要的东西全是"纯文本"那一档——`EditorView` 只借类型，
 * 判据（`atxPrefixRe` / `试摘定界符` / 脚注编号 / front matter 那三个）各自
 * 在别的文件里，本来就不是编辑器实例的一部分。
 *
 * ⚠️ **一处的判据在两处**：行内标记的"开关"（BUG-57）在 `source-mark.ts`，
 * 这里只负责把纯函数算好的改动派发下去——理由写在那个文件头，**别在这里
 * 再讲一遍**，两处讲同一件事就是两处会漂。
 */

import { redo, undo } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";

import { atxPrefixRe } from "@/editor/atx";
import type { CommandPayload, EditorCommand } from "@/editor/create";
// 脚注的**编号分配**与所见即所得那边共用一份（`editor/footnote.ts`）——
// 两处各写一份的话，"最小未用数"这种规则迟早漂开。
import { 下一个脚注标签, 扫源文标签 } from "@/editor/footnote";
// 开头那段 front matter（`docs/07` 第 64 项）。⚠️ 与所见即所得那一侧**同一个
// 判据文件**：两处各切一刀的话，"哪几行算 front matter"就有了两个答案。
import { 拆前置块, 换前置块, 新建前置块模板 } from "@/editor/front-matter";
// 行内标记的**开关**判据（纯函数，2026-09-30 分出来的，BUG-57）。判据是纯
// 字符串的事，与视图无关，所以单开一个文件好让 `tests/source-mark.test.ts` 直接测。
import { 试摘定界符 } from "@/editor/source-mark";
// 界面文案。⚠️ 源码模式里有几处**写进文档的占位词**（`t("Bold")` 那几串：
// 空选区按下加粗时插进正文的就是它），见下面用到的那些行——
// 用户自己的正文当然不进翻译。
import { t } from "@/i18n";

/* ── 文本操作 ────────────────────────────────────────────────────────────
 *
 * ⚠️ 全部走 `view.dispatch({ changes })`，**不直接改 DOM**。
 * CM 的文档是它自己的数据结构，绕过去写 DOM 会被下一次重绘冲掉——
 * 和 ProseMirror 那边同一条纪律。 */

/**
 * 行首可以"独占"的标记族。切换时先清掉同族旧标记，再写新的。
 *
 * ⚠️ **标题那一族不在这里**：它的正则随「严格模式」变（宽松模式里 `#你好`
 * 也已经算标题），所以由 `atx.ts` 的 `atxPrefixRe(strict)` 现算。表里只剩
 * 与模式无关的四族。
 */
const LINE_PREFIXES: Record<string, RegExp> = {
  // 引用：允许嵌套，所以 `> > ` 也算
  quote: /^(?:> ?)+/,
  // 无序列表：`- ` / `* ` / `+ `
  bullet: /^[-*+] +/,
  // 有序列表：`1. ` / `12) `
  ordered: /^\d+[.)] +/,
  // 任务项。⚠️ 两条可选写法**在一条正则里按长短排**：`- [x] 文字` 同时匹配
  // "任务"和"无序"，短的先试就会把 `[x]` 留下，转出来是个内容为 `[x] 文字`
  // 的普通列表项。正则的 `|` 从左往右试，所以长的写在左边就够了。
  task: /^(?:[-*+] +\[[ xX]\] +|[-*+] +)/,
};

/** 选区覆盖到的每一行的起止位置（含边界行）。 */
function selectedLines(
  view: EditorView,
): Array<{ from: number; to: number }> {
  const { from, to } = view.state.selection.main;
  const out: Array<{ from: number; to: number }> = [];
  const doc = view.state.doc;
  let line = doc.lineAt(from);
  const last = doc.lineAt(to);
  for (;;) {
    out.push({ from: line.from, to: line.to });
    if (line.number >= last.number) break;
    line = doc.line(line.number + 1);
  }
  return out;
}

/** 把每一行的行首标记换成 `prefix`（`prefix` 为 `null` 表示只清不写）。 */
function setLinePrefix(
  view: EditorView,
  family: string,
  prefix: string | null,
  strict: boolean,
): void {
  // 标题那一族现算（见 `LINE_PREFIXES` 的注释）。
  const re = family === "heading" ? atxPrefixRe(strict) : LINE_PREFIXES[family];
  if (!re) return;
  const changes: Array<{ from: number; to: number; insert: string }> = [];
  for (const line of selectedLines(view)) {
    const text = view.state.doc.sliceString(line.from, line.to);
    const hit = re.exec(text);
    const stripped = hit ? text.slice(hit[0].length) : text;
    const want = prefix === null ? stripped : prefix + stripped;
    if (want === text) continue;
    // ⚠️ 空行不写标记：给一个空行加 `# ` 会凭空造出一个标题。
    // 但**清标记**要照做（否则"转成正文"在空标题行上不生效）。
    if (prefix !== null && stripped.trim() === "") continue;
    changes.push({ from: line.from, to: line.to, insert: want });
  }
  if (changes.length === 0) return;
  view.dispatch({ changes });
}

/** 把选区包进 `before`/`after`；没选东西就插一个占位词并选中它。 */
function wrapSelection(
  view: EditorView,
  before: string,
  after: string,
  placeholderText: string,
): void {
  const { from, to } = view.state.selection.main;
  const picked = view.state.sliceDoc(from, to);
  const body = picked || placeholderText;
  view.dispatch({
    changes: { from, to, insert: `${before}${body}${after}` },
    // 选中正文那段，用户可以直接接着改。空选区时就是选中占位词。
    selection: { anchor: from + before.length, head: from + before.length + body.length },
  });
}

/**
 * 行内标记的**开关**：选中的文字已经带着这一对定界符就**摘掉**，否则才包一层。
 *
 * ⚠️ 用户 2026-09-30 报的（BUG-57）：选中已经加粗的文字再按 `Ctrl+B`，原来是
 * **再包一层**（`****甲****`），应当是**去掉**。理由、边界与那三种结果全在
 * `source-mark.ts` 的文件头（判据在那儿，这里只管把结果派下去）——**两处不要
 * 各讲一遍**，那是会漂的。一句话：`null` 去包一层、`"不动"`（嵌套认不出来）
 * 一颗字都不改、其余按纯函数算好的改动与选区派发。
 *
 * ⚠️ 分栏模式（`Split`）与源码模式是**同一条路**（左窗格就是
 * `createSourceEditor`），所以这一处一改两边一起好。
 *
 * ⚠️ 链接（`case "link"`）**不走这一条**：它的右定界符里带着地址
 * （`](地址)`），"再插一次链接"该不该算开关得单独拍板，不是这里顺手决定的。
 * 它仍旧走 `wrapSelection`。
 */
function 切换行内标记(
  view: EditorView,
  before: string,
  after: string,
  placeholderText: string,
): void {
  const { from, to } = view.state.selection.main;
  const 摘 = 试摘定界符(view.state.doc.toString(), from, to, before, after);
  if (摘 === null) {
    // 没带着这一对 ⇒ 照旧包一层（空选区插占位词也在这一支里）。
    wrapSelection(view, before, after, placeholderText);
    return;
  }
  if (摘.结果 === "不动") return;
  // 选区也在纯函数里算好了：摘掉之后要盖住**原来那段正文**，否则光标会落在
  // 定界符原来的位置上，接着敲一个字就把刚摘干净的地方又弄脏。
  view.dispatch({ changes: 摘.改动, selection: 摘.选区 });
}

/**
 * 把选区里的**行内标记**去掉，文字一个字不动（对应「格式 → 清除样式」）。
 *
 * ⚠️ 这是个**文本级**的近似，不是文档树级的操作（源码模式本来就没有文档树）。
 * 它只认几种最常见的写法，认不出来的一律**原样留着**——宁可少清一点，
 * 也不要把用户正文里的 `*` 或 `_` 当成标记吃掉。
 *
 * ⚠️ 正则里的 `[\s\S]` 而不是 `.`：选区里**可能跨行**，而 `.` 默认不匹配
 * 换行；用 `.` 的话跨行的粗体会整段漏掉。
 */
function 清除行内标记(view: EditorView): void {
  const { from, to } = view.state.selection.main;
  if (from === to) return;
  const 原 = view.state.sliceDoc(from, to);
  const 净 = 原
    // ⚠️ **图片必须排在链接前面**：`![替代文字](地址)` 里也含着一个
    // `[替代文字](地址)`，链接那条先跑的话会把它削成 `!替代文字`，
    // 多出一个叹号——而叹号再也回不去了。
    .replace(/!\[([\s\S]*?)\]\([^)\s]*\)/g, "$1")
    // 链接：`[文字](地址)` → `文字`。⚠️ 也排在最前面那一批——地址里的字符
    // （比如 `*`）先被后面的规则吃掉的话，这条就再也匹配不上了。
    .replace(/\[([\s\S]*?)\]\([^)\s]*\)/g, "$1")
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/~~([\s\S]+?)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    // 三种扩展标记。⚠️ **顺序**：`==` 与 `<u>` 跟谁都不抢，放哪儿都行；
    // 下标那条**必须排在删除线（`~~`）后面**——它认的是**单个**波浪号，
    // 两条都还在的话，`~~x~~` 会被下标那条从第二个 `~` 开始咬掉一层。
    // 那条 `(?<!~)…(?!~)` 断言就是为这件事写的（与 `inline-marks.ts`
    // 的解析规则同一份口径，那边有完整的推导）。
    .replace(/==([\s\S]+?)==/g, "$1")
    .replace(/<u>([\s\S]+?)<\/u>/gi, "$1")
    .replace(/\^([^\^\n]+?)\^/g, "$1")
    .replace(/(?<!~)~([^~\n]+?)~(?!~)/g, "$1")
    // 单星号/单下划线**放在最后**：上面几条都是成对的，先跑完它们，
    // 剩下的单星号才可能是斜体。顺序反了会把 `**x**` 拆成 `*x*` 再拆成 `x`
    // 是没错，但也会把 `***x***` 拆坏。
    .replace(/\*([^*\n]+?)\*/g, "$1")
    .replace(/(^|[\s(])_([^_\n]+?)_(?=[\s).,，。]|$)/g, "$1$2");
  if (净 === 原) return;
  view.dispatch({ changes: { from, to, insert: 净 } });
}

/** 在光标处插一段文字（图片用：它没有"包一层"这种形态）。 */
function insertAtCursor(view: EditorView, text: string): void {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
  });
}

/** 在光标处另起一块，把光标放到内容位置。`$0` 是落点。 */
function insertBlock(view: EditorView, text: string): void {
  const { from, to } = view.state.selection.main;
  const at = view.state.doc.lineAt(from);
  // 光标不在行首时先补一个换行，免得插进半句话中间。
  const needsBreak = at.from !== from;
  const body = (needsBreak ? "\n" : "") + text;
  const offset = body.indexOf("$0");
  const insert = offset >= 0 ? body.replace("$0", "") : body;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: offset >= 0 ? from + offset : from + insert.length },
  });
}

/**
 * 把一条 `EditorCommand` 落到文本上。
 *
 * # 哪些能做、哪些不能
 *
 * **绝大多数能**——源码模式下每条命令都表达成一个纯文本操作（加粗就是包两个
 * 星号），所以这里**尽量做全**。若动不动就返回 `false`，`App.tsx` 就得为源码
 * 模式单独维护一张"哪些能用"的表，那又是一份会漂移的清单。
 *
 * ⚠️ **但表格那十条（插行/插列/删行/删列/删表/对齐）是真的做不到**，
 * 理由不是工作量，是**语义对不上**：`**粗体**` 在文本上就是四个字符，
 * 而"删掉这一行"要先知道"哪一行、这一行有几个格子、表格从哪到哪"——
 * 那等于在文本模式里把 markdown 表格重新解析一遍，而解析出来之后
 * **改哪个字符**又取决于对齐写法（`| :--- |` 那一段也要跟着动）。
 * 不完整的实现会**静默改坏用户的表格**，那比拒绝处理差得多。
 *
 * 所以返回 `false` 的含义是：**这条命令在这条通路上没有对应的文本操作**。
 * 调用方（`ui/EditorPane.tsx`）据此给用户一句提示，而不是让按钮按下去
 * 毫无反应。⚠️ 名字拼错（代码写错了）走的也是这一条，两者在返回值上
 * **不区分**——区分不了，也不必区分：对用户来说都是"这一下没生效"。
 */
export function applyCommand(
  view: EditorView,
  name: EditorCommand,
  strict: boolean,
  payload?: CommandPayload,
): boolean {
  switch (name) {
    case "undo":
      undo(view);
      return true;
    case "redo":
      redo(view);
      return true;
    // ⚠️ 这四家与下面四种扩展标记走的都是 `切换行内标记`（**开关**，不是
    // "只会包"）：选中的文字已经带着这一对就摘掉。理由与边界见它那段注释。
    case "bold":
      切换行内标记(view, "**", "**", t("Bold"));
      return true;
    case "italic":
      切换行内标记(view, "*", "*", t("Italic"));
      return true;
    case "strike":
      切换行内标记(view, "~~", "~~", t("Strikethrough"));
      return true;
    case "inlineCode":
      切换行内标记(view, "`", "`", t("Code"));
      return true;
    // 三种**扩展**行内标记（`editor/inline-marks.ts`）。源码模式手里就是
    // Markdown 原文，所以"包一层符号"就是这条命令的全部——所见即所得那边
    // 要改文档树，这里只改字符，两边的**结果字节一致**（包出来的就是那四串）。
    // ⚠️ 下划线的写法是**裸 HTML** `<u>x</u>`，与 Typora 一致（没有 `__`
    // 那种歧义写法：`__` 在 CommonMark 里是加粗）。
    case "highlight":
      切换行内标记(view, "==", "==", t("Highlight"));
      return true;
    case "superscript":
      切换行内标记(view, "^", "^", t("Superscript"));
      return true;
    case "subscript":
      切换行内标记(view, "~", "~", t("Subscript"));
      return true;
    case "underline":
      切换行内标记(view, "<u>", "</u>", t("Underline"));
      return true;
    // 标题：`text` 是"正文段落"，也就是清掉标题标记。
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = Number(name.slice(1));
      setLinePrefix(view, "heading", "#".repeat(level) + " ", strict);
      return true;
    }
    case "text":
      setLinePrefix(view, "heading", null, strict);
      return true;
    case "quote":
      setLinePrefix(view, "quote", "> ", strict);
      return true;
    case "ul":
      setLinePrefix(view, "bullet", "- ", strict);
      return true;
    case "ol":
      setLinePrefix(view, "ordered", "1. ", strict);
      return true;
    case "task":
      setLinePrefix(view, "task", "- [ ] ", strict);
      return true;
    case "hr":
      insertBlock(view, "\n---\n$0");
      return true;
    // 脚注：与所见即所得那边插出来的东西**同形**（光标处一个 `[^N]`、文末一条
    // `[^N]: `，光标落到定义上），编号也共用同一套规则。两边不一致的话，同一条
    // 菜单在两种模式下插出来的东西不一样——用户多半不会想到"脚注还跟模式有关"。
    case "footnote": {
      const { from, to } = view.state.selection.main;
      const 标签 = 下一个脚注标签(扫源文标签(view.state.doc.toString()));
      const 片段 = `[^${标签}]`;
      const 末 = view.state.doc.length;
      // ⚠️ 文档空的时候**不补那个空行**：一整篇只有一条脚注定义时，前面顶着
      // 两个空行是纯垃圾（所见即所得那边的序列化器也不会写它）。
      const 定义片段 = (末 === 0 ? "" : "\n\n") + `[^${标签}]: `;
      if (to === 末) {
        // ⚠️ **光标（或选区）一直顶到文末**时两段合并成一笔：分开写的话两段
        // 插入落在同一个位置上，CodeMirror 会判"改动重叠"。
        const 合 = 片段 + 定义片段;
        view.dispatch({
          changes: { from, to, insert: 合 },
          selection: { anchor: from + 合.length },
        });
      } else {
        // 两处改动**一笔事务**：分两笔的话按一次 Ctrl+Z 只会退掉"补定义"那半步
        // （与 `insert.ts` 的 `转成任务列表` 同一条理由）。`[^N]` 落在一大段
        // 选区的左端，所以第一处改动的坐标不会因为第二处而被推移。
        view.dispatch({
          changes: [
            { from, to, insert: 片段 },
            { from: 末, insert: 定义片段 },
          ],
          selection: { anchor: 末 + 定义片段.length },
        });
      }
      return true;
    }
    case "codeBlock":
      insertBlock(view, "\n```\n$0\n```\n");
      return true;
    // 公式块：与所见即所得那边插出来的东西**同形**（一个空的 `$$` 块，
    // 光标停在中间那行）。两边不一致的话，同一条菜单在两种模式下插出来的
    // 东西不一样——用户多半不会想到"公式块还跟模式有关"。
    case "mathBlock":
      insertBlock(view, "\n$$\n$0\n$$\n");
      return true;
    case "table":
      // 与所见即所得那边插出来的表**同形**（三行三列，表头 + 两行正文，
      // 与 `create.ts` 里 `insertTableCommand` 的 `{ row: 3, col: 3 }` 对齐）。
      // 两边不一致的话，同一条菜单在两种模式下插出来的东西不一样——
      // 而用户多半不会想到"表格形状还跟模式有关"。
      insertBlock(
        view,
        t("\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| $0 |  |  |\n|  |  |  |\n"),
      );
      return true;
    // 链接与图片：地址**从外面进来**（界面先问用户，见 `ui/PromptDialog.tsx`）。
    // 真的没有地址时插一个空壳（`[文字]()`）没有意义，所以这里也放弃、返回
    // `false`——与下面那十条（表格）同一个出口。
    case "link": {
      if (!payload?.href) return false;
      wrapSelection(view, "[", `](${payload.href})`, t("Link Text"));
      return true;
    }
    case "image": {
      if (!payload?.src) return false;
      insertAtCursor(view, `![${payload.alt ?? ""}](${payload.src})`);
      return true;
    }
    case "clearFormat":
      清除行内标记(view);
      return true;
    // 用文本替换选区（空串 = 删掉选区）。「粘贴」把剪贴板文本插进来、
    // 「剪切」复制成功之后删掉选中那段，都走这一条。
    // ⚠️ 这里是**纯文本**插入：源码模式手里就是 Markdown 原文，所以剪贴板里
    // 那份文本原样落到字符上，不会被解析成块。这正是源码模式该有的行为——
    // 所见即所得那边才会按段落拆开（见 `create.ts` 的 `insertText`）。
    case "insertText": {
      view.dispatch(view.state.replaceSelection(payload?.text ?? ""));
      return true;
    }
    // 开头那段 front matter（`docs/07` 第 64 项）。⚠️ **这一侧简单得多**：
    // 源码模式手里就是 Markdown 原文，那几行本来就看得见也改得动，换掉开头
    // 那几个字符就是一笔普通事务——撤销栈里**有**它，而所见即所得那边没有
    //（那一段不在文档树里，见 `front-matter.ts` 文件头）。
    //
    // ⚠️ 判据、空模板、"空 = 删掉"这三样**与那边共用同一份**（同一个
    // `front-matter.ts`）：菜单里点一下，两种模式放出来的东西要一样。
    // ⚠️ 界面上的编辑框只在所见即所得那一侧有（源码模式自己就是编辑框），
    // 所以这里实际只有菜单那一条路进来。
    case "frontMatter": {
      const 原块 = 拆前置块(view.state.doc.toString()).前置块;
      const 要 = payload?.frontMatter;
      const 新块 =
        要 === undefined
          ? 原块 ?? 换前置块(null, 新建前置块模板)
          : 换前置块(原块, 要 ?? "");
      if (新块 === 原块) return true; // 一个字都不会变，别派空事务
      // ⚠️ 只换开头那一段，别处的字符一个都不动（`from: 0, to: 原块.length`）。
      // 光标与滚动由 CodeMirror 自己按位置映射，这里不另设选区——设了反而会
      // 把用户正在别处看的位置拽回来。
      view.dispatch({ changes: { from: 0, to: 原块?.length ?? 0, insert: 新块 ?? "" } });
      return true;
    }
    // 表格那十条：见上面那段"语义对不上"。
    case "tableRowAbove":
    case "tableRowBelow":
    case "tableColLeft":
    case "tableColRight":
    case "tableDelRow":
    case "tableDelCol":
    case "tableDel":
    case "tableAlignLeft":
    case "tableAlignCenter":
    case "tableAlignRight":
      return false;
    default:
      return false;
  }
}
