/**
 * 公式源码框的**命令候选弹窗**（敲 `\` 弹出来那一列，2026-10-04）。
 *
 * 判据与表在 `math-commands.ts`（`找当场` / `挑候选` / `套用`）；**这一份只管画**：
 * 建元素、跟着输入换内容、方向键与回车怎么走、点一下怎么收。
 *
 * # 为什么挂在**公式自己的那棵树里**，不像 `lang-picker.ts` 那样挂到 `document.body`
 *
 * `lang-picker.ts`（代码块的``` ``` ```语言选择）是挂在 `body` 上的，因为它要在
 * 表格/代码块那种"被 ProseMirror 到处搬"的树上定位，只能自己算屏幕坐标。
 * 这一格**不必**：公式的 NodeView 本来就是一棵**自己的、不动的**树
 * （`math-view.ts` 那个 `dom` 里已经有一格绝对定位的悬浮预览），
 * 弹窗挂在同一棵树里就白拿三样东西：
 *
 * 1. **主题变量跟着走**——`--nota-*` 那一套在 `.editor-mount` 上，
 *    挂进这棵树就是后代，不必像 `lang-picker.ts` 那样拿 `getComputedStyle`
 *    把十几个 token 一个个抄过来；
 * 2. **不必算屏幕坐标、也不必听 `window` 的滚动/尺寸**——父元素一动它跟着动，
 *    没有"滚动之后弹层留在原地"这种失配；
 * 3. **假 DOM 跑得动**——`tests/fake-dom.ts` 没有 `document.body`、没有
 *    `window`、没有 `getComputedStyle`（那个文件头上写得清清楚楚），
 *    挂 body 的那条路在测试里**一步都走不了**。挂在这里，`math-view.test.ts`
 *    那颗假 `document` 就够。
 *
 * ⚠️ 代价一处：弹窗**只在自己那块公式旁边**，不能像 `body` 那样盖住别的块。
 * 对"命令补全"这件事没影响（它是贴着输入框往下弹的），但记在明处。
 *
 * # 谁负责把内容塞进文档
 *
 * **这一层不碰文档**：它算出"源码框该换成什么"（`math-commands.ts::套用` 的结果），
 * 通过 `收下后` 交回给 `math-view.ts`——那边才有 `派发()`（写回节点的唯一入口）。
 * 这样这一层能在假 DOM 里被完整地量（`tests/math-suggest.test.ts`），
 * 而"写回"这件事仍然只有一条路。
 */

import type { KatexOptions } from "katex";

import { t } from "@/i18n";
import { 渲染公式 } from "./katex-runtime";
import {
  找当场,
  套用,
  挑候选,
  候选上限,
  type 候选,
  type 收下,
} from "./math-commands";

/** 弹窗根元素的 class。样式在 `src/styles/math.css`。 */
const 框类 = "nota-math-suggest";

/** 一条候选的 class。 */
const 条类 = "nota-math-suggest-item";

/** 名字那一格（`\frac`）的 class。 */
const 名类 = "nota-math-suggest-name";

/** 渲染预览那一格的 class。 */
const 样类 = "nota-math-suggest-sample";

/** 说明那一格的 class。 */
const 说明类 = "nota-math-suggest-desc";

/** physics 那个小角标的 class。 */
const 角类 = "nota-math-suggest-tag";

/** 当前选中那一条的 class。 */
const 选中类 = "nota-math-suggest-on";

/** 最多几条。⚠️ 与 `math-commands.ts::候选上限` 同源，别在两处各写一个数。 */
const 上限 = 候选上限;

/** 给 `aria-activedescendant` 用的元素 id 前缀。 */
const id前缀 = "nota-math-suggest-item-";

export type 建议选项 = {
  /** 候选表（`math-commands.ts::建命令表` 的产物）。 */
  表: readonly 候选[];
  /**
   * 往预览格里画一次。⚠️ **可注入**：默认走 KaTeX，测试里换成空的。
   * 假 DOM 里 `katex.render` 会炸（它要真的量尺寸、建一堆 span），
   * 而这一层的判据是"挑中了哪一条、源码框变成什么"，不是"KaTeX 画得对不对"。
   */
  画预览?: (样本: string, 目标: HTMLElement) => void;
  /** 用户收下一条（回车／Tab／点）之后要做什么。**写回文档是这一层之外的事**。 */
  收下后?: (结果: 收下) => void;
  /**
   * "现在指的是哪一条"变了。**可注入**，因为它要落在**别人家的元素**上。
   *
   * ⚠️ 焦点从头到尾都在**源码框**（`<input>`／`<textarea>`，那是 `math-view.ts`
   * 造的，不在这一层），读屏器要听到"现在指着第几条"，得在**那个**元素上写
   * `aria-activedescendant`。这一层碰不到它，所以把 id 交回去让调用方去写。
   * 传 `null` 就是"不指任何一条了"（关掉时）。
   */
  报活动?: (id: string | null) => void;
  /**
   * 用行内元素（`span`）还是块级元素（`div`）建这棵树。
   *
   * ⚠️ 不是审美问题：**行内公式的 NodeView 整个活在一个 `<span>` 里**
   * （`math-view.ts` 那棵树，`div` 会把段落劈成两半）。弹窗是绝对定位、不占流，
   * 但把 `div` 塞进 `span` 终究是**非法嵌套**——真浏览器按 DOM 建树不会重排它，
   * 可这一棵是要被 ProseMirror 的 DOM 观察器扫过去的，留个非法结构没必要。
   */
  行内?: boolean;
};

/** 弹窗本体。⚠️ 名字与 `lang-picker.ts` 的 `建语言选择器` 同一套写法。 */
export type 建议框 = {
  /** 挂进公式那棵树里的根元素。 */
  元素: HTMLElement;
  /** 跟着输入框的内容与光标走一次：该开的开、该关的关。 */
  喂: (源: string, 光标: number) => void;
  /** 直接关掉（丢焦点、跑开、面板收起来时用）。 */
  关: () => void;
  /** 现在开着没有（`feed` 之后的真实状态）。 */
  开着: () => boolean;
  /** 当前选中的是第几条（给测试看，也给 `aria-activedescendant` 用）。 */
  选中序: () => number;
  /**
   * 处理一次按键。**返回"这个键归不归我"**。
   *
   * ⚠️ 与 `lang-picker.ts` 那条"挂在 `window` 上的全局按键"不同：这一层不管全局，
   * 键是从**源码框的 keydown** 递进来的（`math-view.ts` 里那一处），因为弹窗只
   * 服务于那个框。收的是**键名那个字符串**（不是事件对象）：`preventDefault`
   * 由调用方按 `吃了` 决定——这一层不碰事件，才能在假 DOM 里被直接量。
   * ⚠️ 收下某一条时**这一层会喊 `收下后`**（同鼠标点那条路），返回值里不再
   * 带一份（理由见 [`按键结果`]）。
   */
  按键: (键: string) => 按键结果;
};

/**
 * [`建议框.按键`] 的出口。
 *
 * ⚠️ **只有"吃没吃"**——"收下了哪一条"不走返回值，走选项里的 `收下后`。
 * 理由：收下这件事有**两条路**（键盘与鼠标），鼠标那一条（事件回调）**没有**
 * 返回值可以给。两处各交一次的话，`math-view.ts` 就得写两份"写进源码框"的
 * 代码，改一处漏一处。（这条是写测试时才发现的：原先键盘那一路只返回了值、
 * 没喊 `收下后`，于是它安安静静什么都没做——测试里 `吃了` 是真、源码框却
 * 一个字没变。）
 */
export type 按键结果 = {
  /** 这个键被我吃掉了（调用方应 `preventDefault` 且不要再往下判）。 */
  吃了: boolean;
};

/**
 * 建一个建议框。
 *
 * ⚠️ 建出来**是关着的**：用户得先敲一个 `\` 它才露脸（`喂` 说了算）。
 */
export function 建建议框(选项: 建议选项): 建议框 {
  const 画预览 = 选项.画预览 ?? 默认画预览;
  /** 两种元素名：行内那棵树里全用 `span`，块级用 `div`（理由见选项 `行内`）。 */
  const 标签 = 选项.行内 ? "span" : "div";

  const 根 = document.createElement(标签);
  根.className = 框类;
  // ⚠️ 这两条是**给浏览器看的**（同 `math-view.ts` 那几格）：弹窗不是正文，
  //    不该被当成可编辑内容，也不该参与拼写检查。
  根.contentEditable = "false";
  根.setAttribute("role", "listbox");
  根.setAttribute("aria-label", t("LaTeX commands"));

  /** 现在显示着哪几条。 */
  let 当前: 候选[] = [];
  /** 选中第几条（`当前` 里的下标）。 */
  let 选中 = 0;
  /** 上一次 `喂` 时框里的内容与光标——收下时要按它算。 */
  let 源 = "";
  let 光标 = 0;
  /** 缓存：命令名 → 那一格已经画好的预览元素（同一条命令来回出现不必重画）。 */
  const 画过的 = new Map<string, HTMLElement>();

  /** 取（必要时现画）一条候选的预览元素。 */
  function 取预览(条: 候选): HTMLElement {
    const 有 = 画过的.get(条.命令);
    // ⚠️ 缓存的是**元素**，直接复用到新一行上（`appendChild` 会把它从旧行摘下来）。
    //    同一条命令在一次会话里重复出现太常见了（删一个字又打回来），
    //    每敲一个键把 8 条各画一次 KaTeX 是没必要的。
    if (有) return 有;

    const 格 = document.createElement("span");
    格.className = 样类;
    try {
      画预览(条.样本, 格);
    } catch {
      // ⚠️ 预览画不出来**不是**错误路径（`\sqrt[3]{}` 那种半截样本就画不出来）。
      //    这里绝不能让它冒出去：那会打断输入框上的那一次 `input`，
      //    用户看到的是"敲一个字母，字没进去"。
      格.textContent = "";
    }
    画过的.set(条.命令, 格);
    return 格;
  }

  /** 把 `当前` 那几条画成 DOM。⚠️ 每次重建（条数少，且省得跟增删对齐）。 */
  function 重画列表(): void {
    根.replaceChildren();
    if (当前.length === 0) return;

    当前.forEach((条, 第) => {
      const 行 = document.createElement(标签);
      行.className = 条类;
      if (第 === 选中) 行.classList.add(选中类);
      行.setAttribute("role", "option");
      行.setAttribute("aria-selected", 第 === 选中 ? "true" : "false");
      // ⚠️ 这一行的 id 是给 `aria-activedescendant` 用的：焦点一直在**源码框**
      //    里（那是真焦点），读屏器靠"框上的 activedescendant 指向哪一行"知道
      //    现在指着谁。往框上写那一笔在调用方（见选项 `报活动`）。
      行.setAttribute("id", `${id前缀}${第}`);

      const 名 = document.createElement("span");
      名.className = 名类;
      名.textContent = 条.命令;

      const 说明 = document.createElement("span");
      说明.className = 说明类;
      说明.textContent = 条.说明;

      行.append(名, 取预览(条));
      if (条.族 === "physics") {
        const 角 = document.createElement("span");
        角.className = 角类;
        角.textContent = t("physics");
        行.append(角);
      }
      行.append(说明);

      // ⚠️ 必须 `preventDefault`：不拦的话浏览器会把焦点从源码框拿走，
      //    这一下点完面板就收起来了（同 `math-view.ts` 面板 mousedown 那条）。
      行.addEventListener("mousedown", (e) => {
        (e as unknown as { preventDefault: () => void }).preventDefault?.();
        选中 = 第;
        收下当前();
      });

      根.append(行);
    });
  }

  /** 把"现在指着哪一条"报给调用方（它去写源码框上的 `aria-activedescendant`）。 */
  function 报活动现在(): void {
    const 开着 = !根.hidden && 当前.length > 0;
    选项.报活动?.(开着 ? `${id前缀}${选中}` : null);
  }

  /**
   * 把选中那一条交给调用方（写回文档由它做），然后关掉。
   *
   * ⚠️ **键盘与鼠标都走这一个口子**（`按键` 里的回车／Tab 与下面那条
   * `mousedown`）。两处各写一遍的话，`math-view.ts` 那边要维护两份"写回"，
   * 迟早岔开——早先键盘那一路就漏喊了 `收下后`，症状是"按回车没反应"。
   */
  function 收下当前(): void {
    const 条 = 当前[选中];
    if (!条) return;
    const 场 = 找当场(源, 光标);
    if (!场) return;
    关();
    选项.收下后?.(套用(源, 光标, 场, 条));
  }

  /** 关起来（内容也清掉：下次开是新的列表）。 */
  function 关(): void {
    当前 = [];
    选中 = 0;
    根.replaceChildren();
    // ⚠️ 类名留着，靠 `hidden` 收——CSS 那边不必再写一条"空列表也藏起来"。
    根.hidden = true;
    报活动现在();
  }

  /** 选中动一格（到头就停，不绕回去）。 */
  function 动(步: number): void {
    if (当前.length === 0) return;
    const 新 = 选中 + 步;
    if (新 < 0 || 新 >= 当前.length) return;
    选中 = 新;
    重画列表();
    报活动现在();
  }

  /** 现在开着没有。⚠️ 写成局部函数，`按键` 里用 `this` 的话拆开就散了。 */
  function 开着(): boolean {
    return !根.hidden && 当前.length > 0;
  }

  // ⚠️ 起手就收起来（真 DOM 里新元素默认是**看得见**的）。这里不走 `关()`：
  //    那会顺手调一次 `报活动(null)`，而调用方这时候多半还没接上。
  根.hidden = true;

  return {
    元素: 根,

    喂(新源: string, 新光标: number): void {
      源 = 新源;
      光标 = 新光标;

      const 场 = 找当场(新源, 新光标);
      const 列 = 场 ? 挑候选(选项.表, 场.词, 上限) : [];
      if (列.length === 0) {
        关();
        return;
      }

      // ⚠️ 列表**没变**时不重画：用户接着敲字母会一条条筛下去，重画会让
      //    屏幕上那一列闪一下（`replaceChildren` 之后浏览器要重排）。
      //    判据是"命令名序列一样"，不管顺序——顺序由 `挑候选` 定，它只看词。
      const 同 = 列.length === 当前.length && 列.every((条, 第) => 条.命令 === 当前[第]?.命令);
      if (!同) {
        当前 = 列;
        选中 = 0;
        重画列表();
      }
      根.hidden = false;
      报活动现在();
    },

    关,

    开着,

    选中序: () => 选中,

    按键(键: string): 按键结果 {
      if (!开着()) return { 吃了: false };

      if (键 === "Escape") {
        关();
        // ⚠️ 吃掉：不拦的话这一下会一路走到 `math-view.ts` 那条 Escape（退出编辑），
        //    用户想"关掉提示"结果整个面板收走了。
        return { 吃了: true };
      }
      if (键 === "ArrowDown") {
        动(1);
        return { 吃了: true };
      }
      if (键 === "ArrowUp") {
        动(-1);
        return { 吃了: true };
      }
      if (键 === "Enter" || 键 === "Tab") {
        // ⚠️ 先判"这一下收得了吗"再吃键：收不了（词里已经没有当场了）就把这个
        //    键放回去——那时回车该干它本来那件事（行内公式是"退出编辑"）。
        if (!当前[选中] || !找当场(源, 光标)) return { 吃了: false };
        收下当前();
        return { 吃了: true };
      }
      // ⚠️ 左右方向键／Home／End 会让**光标**动，而这一次动**不派发 `input`**
      //    （`input` 只在内容变了才响），于是 `喂` 不会再来一次、这一列就成了
      //    按旧光标算出来的东西。收起来最省事，下一个字母敲下去它自己会再开。
      if (键 === "ArrowLeft" || 键 === "ArrowRight" || 键 === "Home" || 键 === "End") {
        关();
        return { 吃了: false };
      }
      // 别的键（字母、退格…）照旧交给输入框：字进去了会派发 `input`，
      // 那边再 `喂` 一次。
      return { 吃了: false };
    },
  };
}

/**
 * 默认的预览画法：拿**同一份 KaTeX 选项**（宏表跟着 `enable_physics` 走）
 * 画那一小段样本。
 *
 * ⚠️ `throwOnError: false` 由 `katexOptionsFor` 那边保证（它盖掉了 KaTeX 的默认
 * `true`）。万一传进来的选项里没有这一条，这里再兜一层——弹窗里画不出预览
 * **不该**把用户的输入打断。
 */
function 默认画预览(样本: string, 目标: HTMLElement, 选项?: KatexOptions): void {
  void 渲染公式(样本, 目标, { throwOnError: false, ...选项 }).catch(() => {
    目标.textContent = "";
  });
}

/** 造一个"用某份选项画预览"的 `画预览`（`math-view.ts` 里就是这么接的）。 */
export function 用选项画预览(选项: KatexOptions): (样本: string, 目标: HTMLElement) => void {
  return (样本, 目标) => 默认画预览(样本, 目标, 选项);
}
