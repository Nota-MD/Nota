/**
 * 就地改动预览在**源码模式**这一侧的适配层。
 *
 * # 为什么从 `source.ts` 里分出来（2026-09-26）
 *
 * `source.ts` 当时一千行出头（`docs/09` §4 的上限）。判据是"这一块与其余部分
 * 之间有没有共用状态"：改动预览只跟文档的**行**打交道，与查找、写作模式、
 * 发命令三条都不交换任何东西，所以它能整块搬走——搬完两边都还剩几十行余量。
 *
 * ⚠️ 与所见即所得那一侧（`review-prose.ts`）是**两份**适配层，别合并：
 * 这边手里是**原文**（平的行），那边手里是**文档树**（块）。共同的部分
 * （差异算法、两种看法、类名、那几件 DOM）在 `editor/review.ts` 里，两边都引那一份。
 *
 * 对外只有两样：{@link 预览扩展集}（建实例时接上）与 {@link 预览效果}
 * （切预览时派事务用）。
 */

import {
  EditorState,
  Prec,
  StateEffect,
  StateField,
  type Extension,
  type Range,
} from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, WidgetType, keymap } from "@codemirror/view";

import { 按行差异, 造增框, 删类, type 改动预览 } from "@/editor/review";

/* ── 与所见即所得那一侧的差别（`review-prose.ts`）────────────────────────
 *
 * ⚠️ 差别只有两点，都是"这边手里是原文"带来的：
 *
 * 1. **按行比，不按块比**。源码模式下"行"就是文档的真实结构，比块准也便宜。
 * 2. **新增那些不画 DOM，就画原文**。这边屏幕上本来就是 markdown 原文
 *    （`**粗体**` 是带星号的），所以新增块里贴原文才是**与上下文一致**的画法；
 *    那边要是也贴原文就成了"渲染好的正文里冒出一段带星号的字"，很突兀。
 */

/** 改预览那一格状态用的效果。 */
export const 预览效果 = StateEffect.define<改动预览 | null>();

/**
 * 一个"新增"块的 widget。
 *
 * ⚠️ `eq` 必须写：CodeMirror 靠它判断"这次和上次是不是同一个 widget"，
 * 判等的那些**不会重建 DOM**。不写的话默认是引用比较，每次重算装饰都会把
 * 整段新增 DOM 拆了重建——预览期间每敲一次键（比如按方向键）都重建一遍。
 */
class 增件 extends WidgetType {
  constructor(readonly 行: string[]) {
    super();
  }
  eq(别的: 增件): boolean {
    return (
      别的.行.length === this.行.length &&
      别的.行.every((x, i) => x === this.行[i])
    );
  }
  toDOM(): HTMLElement {
    return 造增框(this.行);
  }
  /** 这个 widget 里的东西不参与编辑器的鼠标/键盘处理（它不在文档里）。 */
  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * 按行算出整套装饰。
 *
 * ⚠️ 删掉的行发的是 `Decoration.line`（挂在 `行.from` 上，长度为零）——
 * CodeMirror 的行装饰**只能**落在行首那一个位置，这跟"整行变色"的效果是一回事。
 */
function 算预览装饰(state: EditorState, 预览: 改动预览 | null): DecorationSet {
  if (!预览) return Decoration.none;
  const 单元 = 按行差异(state.doc.toString(), 预览.text);
  const 装饰: Range<Decoration>[] = [];
  /** 上一个 `同` / `删` 的行号（0 起）。`-1` = 新增落在最前面。 */
  let 落点 = -1;

  for (const 项 of 单元) {
    if (项.类 === "同") {
      落点 = 项.位;
    } else if (项.类 === "删") {
      const 行 = state.doc.line(项.位 + 1);
      装饰.push(Decoration.line({ class: 删类 }).range(行.from));
      落点 = 项.位;
    } else {
      // ⚠️ 锚在**锚点那一行的行尾**（`行.to` 不含换行符），不是下一行的行首：
      // 锚点已经是最后一行时（`to === doc.length`）行首那种算法就没有下一行了。
      const 位 = 落点 < 0 ? 0 : state.doc.line(落点 + 1).to;
      装饰.push(
        Decoration.widget({ widget: new 增件(项.行), block: true, side: 1 }).range(位),
      );
    }
  }

  // ⚠️ `sort: true`：`Decoration.set` 要求区间按位置排好，而行装饰与 widget
  // 是交替产生的（`writing-modes.ts` 那边发查找装饰时也用了它）。
  return 装饰.length ? Decoration.set(装饰, true) : Decoration.none;
}

/**
 * 建一份**这个实例专属**的预览字段、装饰与 `Esc` 键位（同 `写作模式扩展`
 * 那条理由：初值来自建实例那一刻，不能写成模块级常量）。
 *
 * ⚠️ `Esc` 那条**必须给最高优先级**（`Prec.highest`）。CodeMirror 的
 * `defaultKeymap` 里 `Escape` 绑着 `simplifySelection`，而键位是按扩展在数组
 * 里的**先后**抢的——这一套是最后推进去的，不给优先级就永远轮不到它，
 * 症状是"按 `Esc` 什么都不发生"，而且看起来跟"没接这个键"一模一样。
 */
export function 预览扩展集(初始: 改动预览 | null, 退出?: () => void) {
  const 字段 = StateField.define<改动预览 | null>({
    create: () => 初始,
    update(v, tr) {
      let 出 = v;
      for (const e of tr.effects) if (e.is(预览效果)) 出 = e.value;
      return 出;
    },
  });

  // ⚠️ 依赖里除字段外**还有 `"doc"`**：那两个装订位置的坐标是相对文档算的，
  // 文档一变它们就全错位了。正常路径上文档变之前预览已经收掉（插件接受改动
  // 时先 `set_text`、随后 `review(nil)`），但那是**两条**消息，中间有一帧
  // 是"文档换了、预览还在"——不加这一条，那一帧里发出去的就是一批越界的
  // 装饰（CodeMirror 会当成烂装饰集抛出来）。
  const 装饰 = EditorView.decorations.compute([字段, "doc"], (state) =>
    算预览装饰(state, state.field(字段)),
  );

  const 扩展: Extension[] = [字段, 装饰];
  if (退出) {
    扩展.unshift(
      Prec.highest(
        keymap.of([
          {
            key: "Escape",
            // ⚠️ `stopPropagation: true`：应用层的壳在 `window` 上以冒泡收
            // `Esc`（`useImmersive.ts` 的"退出沉浸"）。不拦住的话，预览里
            // 按一下 `Esc` 会**同时**退出沉浸模式。同 `review-prose.ts` 那条。
            stopPropagation: true,
            run: (view) => {
              const 现 = view.state.field(字段, false);
              if (!现) return false;
              退出();
              return true;
            },
          },
        ]),
      ),
    );
  }
  return { 字段, 扩展 };
}
