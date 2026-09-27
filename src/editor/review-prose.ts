/**
 * 就地改动预览，**所见即所得那一侧**的适配层（ProseMirror 装饰 + 块级 widget）。
 *
 * 算法、类名、两种看法都在 `review.ts` 里，**这个文件只做一件事**：把那份
 * 单元表翻译成 ProseMirror 认得的东西。源码那一侧的同名对应物在 `source.ts`
 * 的 `预览扩展`。
 *
 * # 为什么单元是"块"而不是"行"
 *
 * 源码模式手里就是原文，**行**是天然单位；所见即所得手里是文档树，树里
 * 根本没有"行"这个东西（一个段落折成几行全看窗口多宽）。所以这一侧按
 * **顶层块**比：把每个顶层节点单独序列化成 markdown 当它的"文本"，再按那份
 * 文本做差异。
 *
 * ⚠️ 序列化**只按顶层**切。嵌套的东西（列表项里的段落、引用里的列表）不单独
 * 参与比较——它们跟着父块一起动。理由：单序列化一个 `list_item` 拿不到它
 * 在列表里的缩进层级，出来的文本和"它在文中的样子"对不上；而按顶层切，
 * 每一块都是自洽的。
 *
 * # 新增那些块是**画出来的**，不是贴原文
 *
 * 删除侧是装饰（原文一个字不动），新增侧是块级 widget。widget 里塞什么？
 * 塞**渲染好的 DOM**（`DOMSerializer`）——用户要看的是"改完长什么样"，
 * 贴一坨 `**粗体**` 的原文不叫那个效果。这也是 Folio 那条做法的对应物：
 * 它那边新增侧同样是**真的节点**（`innerHTML` + `insertBefore` 插进正文流）。
 *
 * ⚠️ **有一处画不出来的地方**：NodeView 那一份（公式 `math-view.ts`、图表
 * `diagram-view.ts`、代码高亮的行内装饰）是**视图层插件**给的，不在节点的
 * `toDOM` 里，`DOMSerializer` 拿到的只是兜底 DOM。所以预览里新增的公式块
 * 显示成它的源码样子。
 *
 * 这是取舍不是遗漏：要看真正的效果，走「改后」那条看法 + 接受，为预览再建
 * 一个真编辑器实例不值（那要挂第二个 Milkdown，还得处理它的异步建实例）。
 */

import type { Node as PM节点 } from "@milkdown/kit/prose/model";
import { DOMSerializer } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { parserCtx, serializerCtx } from "@milkdown/kit/core";
import { $prose } from "@milkdown/kit/utils";

import { 删类, 差异, 造增框, type 改动预览 } from "./review";

/**
 * 插件状态那一格。
 *
 * ⚠️ **装饰算一次就存住**（不是每次事务现算）：算一遍要序列化整篇、再解析
 * 整篇目标文本，那是几十毫秒的活儿，而 `props.decorations` 是**每笔事务**
 * 都会被问一次的。预览期文档是锁住的（下面 `filterTransaction`），所以存住的
 * 那份不会过期；真变了也有一道防御（`apply` 里 `tr.docChanged` 就作废）。
 */
interface 预览态 {
  预览: 改动预览 | null;
  /** `null` = 没有预览，或预览里一处改动都没有。 */
  装饰: DecorationSet | null;
}

const 空态: 预览态 = { 预览: null, 装饰: null };

/** 改预览那一格状态用的元。走事务而不是改闭包变量：状态的东西就该在状态里。 */
export const 预览元 = "nota-review";

export const 预览键 = new PluginKey<预览态>("nota-review");

/** 现在是不是在预览中。`editable` 与 `filterTransaction` 都要问它。 */
export function 预览中吗(state: EditorState): boolean {
  return Boolean(预览键.getState(state)?.预览);
}

/* ── 算装饰 ───────────────────────────────────────────────────────────── */

/** 一串顶层块，连同它们在文档里的坐标。 */
interface 带位块 {
  节点: PM节点;
  起: number;
  止: number;
}

/**
 * 顶层块各自在文档里的坐标。
 *
 * ⚠️ `forEach` 给的 `偏移` 是**相对父节点内容起点**的，而顶层节点的父就是 doc
 * （内容起点是 0），所以它就是文档坐标。别拿它去套嵌套节点——那样会差一层。
 */
function 顶层块(文档: PM节点): 带位块[] {
  const 出: 带位块[] = [];
  文档.forEach((节点, 偏移) => {
    出.push({ 节点, 起: 偏移, 止: 偏移 + 节点.nodeSize });
  });
  return 出;
}

/** 一个节点单独序列化成 markdown。⚠️ 得先包进一个 doc，序列化器只认 doc。 */
function 块文本(序列化: (n: PM节点) => string, 节点: PM节点): string {
  try {
    const 单块 = 节点.type.schema.topNodeType.create(null, 节点);
    return 序列化(单块).trim();
  } catch {
    // ⚠️ 序列化器认不出的节点（第三方 schema 加的怪节点）不该把整次预览
    // 带下来。降级成"用它的纯文本当身份"——比拿一个空串强：空串会让它跟
    // 别的怪块"看起来一样"，于是差异表把它们错配成没变。
    return 节点.textContent.trim();
  }
}

/**
 * 掐掉尾部的空块。**两边的数组都要过一遍，而且掐得一样多。**
 *
 * 来由：编辑器里恒挂着 `trailing` 那条插件（`create.ts` 的插件清单），它保证
 * 文档末尾总有一个空段落；而目标文本是**解析**出来的，解析器不补这一块。
 * 不掐的话，每次预览都会在末尾多出一条"删掉了一个空段落"——屏幕上什么都
 * 看不到，但那一条装饰是真的在那儿。
 *
 * ⚠️ 掐尾**只按"文本为空"判**，不管那是不是 `trailing` 补的：真要分清是谁
 * 补的，得去问文档自己，而"空块在末尾"这件事在差异里本来就没有信息量。
 */
function 掐尾空块(块: 带位块[], 序列化: (n: PM节点) => string): 带位块[] {
  let 尾 = 块.length;
  while (尾 > 0 && 块文本(序列化, 块[尾 - 1]!.节点) === "") 尾--;
  return 块.slice(0, 尾);
}

/**
 * 把「文档 + 目标文本」算成一整套装饰。
 *
 * `序列化` / `解析` 由调用方从 `ctx` **现取**（`serializerCtx` / `parserCtx`）——
 * 不在建插件那一刻捕获：那两个东西是 Milkdown 在 Init 阶段填进 ctx 的，
 * 建插件时可能还没有。
 */
function 算装饰(
  序列化: (n: PM节点) => string,
  解析: (md: string) => PM节点,
  文档: PM节点,
  预览: 改动预览,
): DecorationSet | null {
  const 旧 = 掐尾空块(顶层块(文档), 序列化);
  const 新 = 掐尾空块(顶层块(解析(预览.text)), 序列化);
  if (旧.length === 0 && 新.length === 0) return null;

  const 单元 = 差异(
    旧.map((b) => 块文本(序列化, b.节点)),
    新.map((b) => 块文本(序列化, b.节点)),
  );

  const 装饰: Decoration[] = [];
  /** 上一个 `同` / `删` 在**旧侧**的下标。`-1` = 新增落在最前面。 */
  let 落点 = -1;
  /** 已经消费到**新侧**的第几个块。理由见 `review.ts` 的 `差异单元` 那段。 */
  let 新游标 = 0;

  for (const 项 of 单元) {
    if (项.类 === "同") {
      落点 = 项.位;
      新游标++;
    } else if (项.类 === "删") {
      const 块 = 旧[项.位];
      if (块) 装饰.push(Decoration.node(块.起, 块.止, { class: 删类 }));
      落点 = 项.位;
    } else {
      const 数 = 项.行.length;
      const 要画的 = 新.slice(新游标, 新游标 + 数);
      新游标 += 数;
      const 位 = 落点 < 0 ? 0 : (旧[落点]?.止 ?? 文档.content.size);
      装饰.push(
        Decoration.widget(位, () => 画增框(要画的), {
          // `side: 1` = 这个 widget 认**它后面**那一段（新增内容紧跟着锚点，
          // 长得像"插在锚点后面"而不是"挂在锚点前面"）。
          side: 1,
          // 块级 widget 不该被选区的边界吃进去——它不在文档里。
          ignoreSelection: true,
          // ⚠️ `key` 只是给 PM 复用 DOM 用的（同一个 key 不会每次重建 DOM）。
          // 它在一次渲染里**允许重复**（PM 只拿它跟自己上一次比），所以这里
          // 不需要保证全局唯一。
          key: `nota-review-add-${落点}-${新游标}`,
        }),
      );
    }
  }

  return 装饰.length ? DecorationSet.create(文档, 装饰) : null;
}

/** 把新增的块画成 DOM。⚠️ 见文件头"新增那些块是画出来的"那段。 */
function 画增框(块们: 带位块[]): HTMLElement {
  return 造增框(
    块们.map((块) => {
      const dom = DOMSerializer.fromSchema(块.节点.type.schema).serializeNode(
        块.节点,
      );
      if (dom instanceof HTMLElement) return dom;
      const 壳 = document.createElement("div");
      壳.append(dom);
      return 壳;
    }),
  );
}

/* ── 那条插件 ─────────────────────────────────────────────────────────── */

/**
 * 预览那一条插件。
 *
 * 与 `writing-modes.ts` 的写作模式插件同形：状态在插件里、改状态走事务的元、
 * 装饰由 `props.decorations` 读出来。**恒挂**（可编辑那一份）——预览随时可能
 * 被插件喊起来，而"挂不挂插件"一旦绑进 `EditorPane` 的依赖，喊一次就得重建
 * 编辑器（撤销栈和光标都会丢）。
 *
 * `Esc` 在这里收（`handleKeyDown`）：焦点在正文里的时候，这是唯一收得住的地方。
 *
 * ⚠️ 收到之后 `stopPropagation()`。应用层的壳在 `window` 上以**冒泡**收 `Esc`
 * （`useImmersive.ts` 那条"退出沉浸"），不拦住的话按一下 `Esc` 会**同时**退出
 * 沉浸模式。那两个监听都不在捕获阶段（理由写在 `useImmersive.ts` 里），
 * 所以在编辑器这儿拦住有效。
 */
export function 预览插件(
  初始: 改动预览 | null,
  退出: () => void,
): ReturnType<typeof $prose> {
  return $prose(
    (ctx) =>
      new Plugin<预览态>({
        key: 预览键,
        state: {
          // ⚠️ 初值给的是**真的那份预览**（不是空态）：换文档、切模式都会重建
          // 编辑器，而预览可能正开着——给空态的话，那一次重建会把预览吞掉，
          // 用户看到的是"切一下模式，改动预览没了"。
          // ⚠️ `cfg.doc` 在类型上是可选的。真没有时**不画**：宁可这一格空着
          // （下一次 `setReview` 会补上），也不能拿一个空文档去算装饰——
          // 那会算出一批对不上位置的装饰，比不画糟得多。
          init: (cfg): 预览态 => {
            if (!初始 || !cfg.doc) return 空态;
            return {
              预览: 初始,
              装饰: 算装饰(
                (n) => ctx.get(serializerCtx)(n),
                (md) => ctx.get(parserCtx)(md) as unknown as PM节点,
                cfg.doc,
                初始,
              ),
            };
          },
          apply: (tr, prev) => {
            const 载荷 = tr.getMeta(预览元) as 改动预览 | null | undefined;
            if (载荷 === undefined) {
              // ⚠️ 防御：预览期文档是锁住的，正常走不到这一支。真走到了
              // （比如别的插件绕过了过滤）说明存住的装饰已经对不上位置了，
              // 那就作废——宁可什么都不画，也不能画错行。
              return tr.docChanged ? 空态 : prev;
            }
            if (载荷 === null) return 空态;
            return {
              预览: 载荷,
              装饰: 算装饰(
                (n) => ctx.get(serializerCtx)(n),
                (md) => ctx.get(parserCtx)(md) as unknown as PM节点,
                tr.doc,
                载荷,
              ),
            };
          },
        },
        // 预览期**锁住文档**：不接受任何改文档的事务。
        //
        // ⚠️ 光靠 `editable: false` 不够：`editable` 管的是"键盘/鼠标能不能
        // 编辑"，而命令、粘贴、别的插件派的事务都不看它。这一道是**真的**锁——
        // 预览里的位置是算出来的，文档一动那些位置就全错了（错位地划掉几行，
        // 比不画还糟）。要改就先接受或放弃。
        //
        // ⚠️ 它在**插件规格**这一层，不在 `props` 里：`filterTransaction` 是
        // `PluginSpec` 的字段（`props` 那份 `EditorProps` 里没有它）。
        filterTransaction: (tr, state) => !(预览中吗(state) && tr.docChanged),
        props: {
          decorations(state) {
            return 预览键.getState(state)?.装饰 ?? null;
          },
          handleKeyDown(view, event) {
            if (event.key !== "Escape") return false;
            if (!预览中吗(view.state)) return false;
            // 组字期间一概不接（同 `useMenus` / `useImmersive` 里那条判据）。
            if (event.isComposing || event.keyCode === 229) return false;
            event.preventDefault();
            event.stopPropagation();
            退出();
            return true;
          },
        },
      }),
  );
}

/** 设/清预览。走事务，插件那一格状态跟着变，装饰随之重画。 */
export function 设预览(view: EditorView, 预览: 改动预览 | null): void {
  view.dispatch(view.state.tr.setMeta(预览元, 预览));
}
