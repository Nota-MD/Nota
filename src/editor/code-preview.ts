/**
 * **HTML 代码块下面那块预览**（2026-10-16 新建，用户点名：
 * 「还有一个小修改：**如果代码框语言是html的话，在下面可以直接显示预览，
 * 类似流程图那样**」）。
 *
 * # 为什么单独一份，而不是塞进 `code-block.ts`
 *
 * 那一份已经 639 行、而且它自己那份文件头写着"三件事为什么放在一个文件里"是
 * **因为它们要的是同一块 chrome**（语言选择器 / 复制 / 折叠，都挂在 `pre` 的
 * 右下角那一条上）。这一块不一样：它**长在 `pre` 之外**、是一棵独立的子树、
 * 还带一份去抖状态。所以按 `docs/09` §4 那条尺子（一个文件一个理由）单独一份，
 * 顺带让"什么算 HTML"这条判据能被 `tests/code-preview.test.ts` 直接测。
 *
 * # 三条口径
 *
 * 1. **只在语言是 HTML 时出现**（`html` / `htm` / `xhtml`，大小写与空格都不算），
 *    其余语言一个字都不占——不给所有代码块都塞一个 240px 的空框。
 * 2. **`sandbox` 只开 `allow-scripts`、不开 `allow-same-origin`**：预览里那段
 *    HTML 多半带脚本（不带脚本的静态页反而少），所以脚本得让它跑；而**不给
 *    `allow-same-origin`** 意味着它拿到的是一个**不透明来源**——碰不到 Nota 的
 *    DOM、`localStorage`、也不能调我们注入的那几个接口。⚠️ 这两条**必须一起
 *    判**：`allow-scripts` ＋ `allow-same-origin` 同时给等于**没沙箱**（那个
 *    组合下 iframe 能自己把 `sandbox` 属性摘掉），是这条 API 上最经典的一个坑。
 * 3. **写进 iframe 走 `srcdoc`，而且去抖**：`srcdoc` 一写就是一个新文档
 *    （滚动位置、表单里填了一半的字、`<video>` 的播放进度全没了），所以不能
 *    每敲一个字就写一次——打字的这一段攒 300ms 再写。
 *
 * ⚠️ **HTML 导出保留它，PDF / 打印删掉它**：HTML 导出的预览是可交互内容；
 * PDF 只需要文档本身，不能把同一段 HTML 的源码和结果各印一遍。
 */

import type { Node as PMNode } from "@milkdown/kit/prose/model";

/** 认哪些语言（`code_block` 的 `language` 属性，已经是小写、去空格之后的）。 */
const hTMLLanguage = new Set(["html", "htm", "xhtml"]);

/**
 * 这段语言算不算 HTML。
 *
 * ⚠️ **归一化在这里做，不在调用方**：语言选择器写进节点的是它那张表里的值
 *（`HTML` 这种写法在别处也可能出现），而 `refractor` 那边认的是小写短名。
 * 判据只有这一处，别在 `code-block.ts` 里再写一遍 `=== "html"`。
 */
export function isHtml(language: string): boolean {
  return hTMLLanguage.has(language.trim().toLowerCase());
}

/** 打字这一段的攒批时长。⚠️ 见文件头第 3 条：写 `srcdoc` 是一次"换文档"。 */
const accumulateBatchMilliSeconds = 300;

export interface HTMLPreview {
  /** 挂在 `pre` **下面**的那一块。 */
  readonly element: HTMLElement;
  /** 节点变了就喊一声：语言不是 HTML 时整块收起来。 */
  sameStep: (node: PMNode, standaloneMoment?: boolean) => void;
  /** ⚠️ **必须收**：那一个 `setTimeout` 不撤掉的话，块被删掉之后它还会
   * 去写一个已经不在文档里的 iframe（不崩，但白白留着一条待跑的定时器）。 */
  cancelDestroy: () => void;
}

/**
 * 建那一块。⚠️ 返回的是**一棵已经建好的子树**，调用方负责把它挂到 `dom` 上
 * （这一层不认识 ProseMirror 的 NodeView，只认识"给我一个节点、我画它"）。
 */
export function createHTMLPreview(): HTMLPreview {
  const element = document.createElement("div");
  element.className = "nota-code-preview";
  // ⚠️ 与 `pre` 上那条同理：这一段是**非编辑孤岛**，ProseMirror 不该把光标
  // 放进来（也让里面那些表单控件拿得到焦点）。
  element.contentEditable = "false";
  element.hidden = true;

  const box2 = document.createElement("iframe");
  box2.className = "nota-code-preview-frame";
  // ⚠️ 见文件头第 2 条：只开 `allow-scripts`。
  box2.setAttribute("sandbox", "allow-scripts");
  // 读屏器与"这是谁的框"：不写的话它是一颗没有名字的 `iframe`。
  box2.setAttribute("title", "HTML preview");
  element.append(box2);

  let pendingWrite: number | null = null;

  const undoRemovePendingWrite = () => {
    if (pendingWrite !== null) {
      clearTimeout(pendingWrite);
      pendingWrite = null;
    }
  };

  return {
    element,
    sameStep: (node, standaloneMoment = false) => {
      const isValue = isHtml(language(node));
      element.hidden = !isValue;
      if (!isValue) {
        // ⚠️ 语言被改成别的（`html` → `python`）时**也要把待写撤掉**：
        // 留着的话 300ms 之后它会再写一次，而那时这一块已经收起来了——
        // 界面上看不出来，但那是"藏起来的东西还在偷偷干活"。
        undoRemovePendingWrite();
        return;
      }
      const body2 = node.textContent;
      undoRemovePendingWrite();
      if (standaloneMoment) {
        box2.srcdoc = body2;
        return;
      }
      pendingWrite = window.setTimeout(() => {
        pendingWrite = null;
        box2.srcdoc = body2;
      }, accumulateBatchMilliSeconds);
    },
    cancelDestroy: undoRemovePendingWrite,
  };
}

/** 取节点的语言属性。⚠️ 缺省是空串（与 `code-block.ts::languageOf` 同一条口径）。 */
function language(node: PMNode): string {
  const raw = node.attrs.language;
  return typeof raw === "string" ? raw : "";
}
