/**
 * 脚注：**插一条引用 ＋ 在文末补一条定义**。
 *
 * # 这一格此前只缺"怎么插"
 *
 * `docs/10-feature-matrix.md` §3 的「脚注」在 2026-09-27 之前是 ⬜，但节点本身
 * **一直是通的**：`@milkdown/preset-gfm` 自带 `footnote_reference`（`group:"inline"`
 * ＋ atom）与 `footnote_definition`（`group:"block"` ＋ `content:"block+"`）两颗规格，
 * 解析靠 `remark-gfm`，序列化也跟着它，`src/editor/create.ts` 里 `.use(gfm)`
 * 早就挂了。也就是说——**打开一份带脚注的 .md，它画得出来、存回去也还是脚注**。
 *
 * 缺的是"从零写一条出来"：用户手打 `[^1]` 要被 `remark-parse` 认成引用
 * （打错了就只是六个字面字符），而定义那一行还得自己记住"要写在文末"、
 * "编号别跟已有的撞"。这个文件就是那一步。
 *
 * ⚠️ **长相不在这里**，在 `src/styles/editor.css` 的「脚注」那一节（2026-09-27
 * 与行内标记那批同批写的）。角标与定义都按 Typora 的意思画：角标是小小的
 * `[1]` 上标，定义排在正文流里、字号小一档、左边一条竖线。
 *
 * # 三条刻意的边界
 *
 * 1. **不重排编号**。删掉第 2 条脚注之后，第 3 条**仍然是 3**。理由：markdown 里
 *    `[^1]` 的 `1` 是**标识符**，不是序号——重排等于替用户改他写的字节。想重排
 *    得先有一套"哪些引用指向哪条定义"的索引，而那正是这个文件**故意不做**的事。
 * 2. **不跳转**。点角标不会滚到定义那儿（`editor.css` 里那句 `cursor: pointer`
 *    只表示"这里能点"，是给将来留的位置）。做跳转要同一套索引，另加一层
 *    点击拦截——不在这一格里。
 * 3. **定义一律补在文末**。用户自己写在文档中间的 `[^1]: 说明` 一个字节不动
 *    （markdown 允许定义出现在任意位置，`docs/05` 记着这一条），但**新插的
 *    那条**总落在最后——因为那是最常见的写法，也是 Typora 的做法。
 *
 * ⚠️ `/` 那条斜杠菜单如果将来也提供"脚注"，**必须复用这里的 `脚注事务`**：
 * 编号分配只有一处实现，两处各写一份的话，"最小未用数"这种规则迟早漂开。
 */

import { editorViewCtx } from "@milkdown/kit/core";
import type { Editor } from "@milkdown/kit/core";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";

/**
 * 两颗节点的**名字**（PM schema 的节点名，不是 HTML 标签）。
 *
 * ⚠️ 与 preset 那边**逐字相同**（`preset-gfm/lib/index.js:686` 与 `:742`），
 * 拼错了的话 `state.schema.nodes[…]` 取到 `undefined`，症状是"插脚注点了没反应"
 * ——一个不报错的失败。所以名字只在这里写一次，全仓从这里引。
 */
export const footNoteReferenceUseName = "footnote_reference";
export const footNoteFixedMeaningName = "footnote_definition";

/**
 * 从一段 markdown **源文**里把用掉的标签全捞出来（引用与定义都算）。
 *
 * ⚠️ **不去重**：`甲[^1]乙` 加文末的 `[^1]: 注` 会给出 `["1", "1"]`。
 * 调用方一律把它喂给 `下一个脚注标签`，那边用 `Set` 收口；这里去掉重反而会让
 * "数一数引用了几个"这种用法拿不到真数。
 *
 * ⚠️ 正则**不要求 `]` 后面跟 `:`**：引用那半没有冒号，定义那半有，两个都要认。
 * 标签里不许有空白与 `]`（`[^goo bar]` 不是脚注，是普通方括号文字）。
 */
export function scanSourceTextLabel(sourceText: string): string[] {
  const output2: string[] = [];
  for (const match of sourceText.matchAll(/\[\^([^\]\s]+)\]/g)) {
    if (match[1]) output2.push(match[1]);
  }
  return output2;
}

/** 从一棵 **ProseMirror 文档树**里把用掉的标签全捞出来（引用与定义都算，同样不去重）。 */
export function scanFootNoteLabel(doc: PMNode): string[] {
  const output2: string[] = [];
  doc.descendants((node) => {
    if (node.type.name !== footNoteReferenceUseName && node.type.name !== footNoteFixedMeaningName) return true;
    const label = node.attrs.label;
    if (typeof label === "string" && label !== "") output2.push(label);
    return true;
  });
  return output2;
}

/**
 * **最小未用正整数**——新脚注该叫什么。
 *
 * ⚠️ 规则取"最小的没用过的那个"，不是"最大的加一"。两者只在**删过脚注**之后
 * 分道扬镳：文档里有 1、3 时，前者给 2、后者给 4。选前者是因为用户删掉第 2 条
 * 之后，那条编号就是**空出来的**，补上它让编号连续——而"最大加一"会让编号
 * 留一个洞，用户看着像漏了一条。
 *
 * ⚠️ 非数字的标签（`[^note]`）在这条规则里**只占位、不参与计数**：它们进了
 * `Set`，所以不会被撞上；但它们也不影响答案（`[^note]` 存在时下一条仍是 1）。
 *
 * 循环一定会停：`已用` 是有限集合，最多试 `|已用| + 1` 次就有一个空位。
 */
export function belowValueItemFootNoteLabel(alreadyUse: Iterable<string>): string {
  const collection = new Set(alreadyUse);
  for (let n = 1; ; n++) {
    const candidate = String(n);
    if (!collection.has(candidate)) return candidate;
  }
}

/**
 * 插一条脚注的**全部动作**（纯粹从 `state` 算出一个事务，不碰 DOM）。
 *
 * 三件事，一笔事务：
 * 1. 用 `[^N]` 的引用节点换掉当前选区（`N` = 最小未用编号）；
 * 2. 在**文档末尾**追加一条同编号的定义，里面放一个空段落（用户接着打字）；
 * 3. 把光标落进那条定义的空段落里。
 *
 * 返回 `null` 表示**这条通路上做不了**，两种情形：
 * - schema 里没有那两颗节点（没挂 `gfm`）；
 * - 光标在**代码块**里——`code_block` 的 content 是 `text*`，塞一个行内节点
 *   进去会被 ProseMirror 拒（`canReplace` 不过就**抛错**），而且"代码里插个
 *   脚注角标"本身也没有意义。
 *
 * ⚠️ 第 2 步那个**空段落不能省**：`footnote_definition` 的 content 是
 * `block+`，"一条没有内容的定义"是它表达不了的形状。实测（2026-09-27）：
 * 文件里真出现**空的** `[^1]:` 时，milkdown 的解析器会用 `createAndFill` 那一路
 * 补一个空段落，**不抛错**；但那是上游的兜底，本仓自己插的时候没理由留这个空子。
 *
 * ⚠️ 光标**会跟着跳到文末**（`scrollIntoView`）。这是有意的：脚注的定义要
 * 用户接着写，把光标留在原处的话，用户得自己滚到底下去——而"刚插的东西在哪"
 * 比"刚才写到哪"更急。Typora 同此。
 */
export function footNoteTransaction(state: EditorState): Transaction | null {
  const referenceUseType = state.schema.nodes[footNoteReferenceUseName];
  const fixedMeaningType = state.schema.nodes[footNoteFixedMeaningName];
  const paragraphType2 = state.schema.nodes.paragraph;
  if (!referenceUseType || !fixedMeaningType || !paragraphType2) return null;
  if (state.selection.$from.parent.type.name === "code_block") return null;

  const label = belowValueItemFootNoteLabel(scanFootNoteLabel(state.doc));
  const referenceUse = referenceUseType.create({ label: label });
  const fixedMeaning = fixedMeaningType.create({ label: label }, paragraphType2.create());

  const tr = state.tr.replaceSelectionWith(referenceUse);

  // ⚠️ 位置在**替换之后**取：替换可能改动了文档长度（选中一段文字再插时），
  // 用替换前的 `state.doc.content.size` 会落错地方。
  const fixedMeaningPosition = tr.doc.content.size;
  tr.insert(fixedMeaningPosition, fixedMeaning);

  // 进定义（+1）、进里面那个空段落（+1）。`near` 而不是硬造一个坐标：越界时
  // 它自己会找最近的合法位置，不会抛。
  tr.setSelection(TextSelection.near(tr.doc.resolve(fixedMeaningPosition + 2)));
  tr.scrollIntoView();
  return tr;
}

/**
 * 菜单/快捷键那条命令的**唯一入口**。
 *
 * ⚠️ 与 `insert.ts` 里那几条同一条纪律：界面层不许自己 `ctx.get(editorViewCtx)`
 * 派事务，一律走 `command-table.ts` 的 `COMMANDS` 表派进来（那张表 2026-09-28 从
 * `create.ts` 搬了出去，见那个文件的头）。
 */
export function insertFootNote(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const tr = footNoteTransaction(view.state);
    if (!tr) return;
    view.dispatch(tr);
    view.focus();
  });
}
