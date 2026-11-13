/**
 * 代码块的语言选择器：**单一可编辑输入框**，不是原生 `<select>`。
 *
 * # 为什么非自己画不可
 *
 * 原生 `<select>` 的弹层里**放不了图标**，而用户要求候选行带语言图标。
 * 这里把触发器和搜索框合并成一个输入框：收起时显示当前语言，聚焦后可直接
 * 改写并筛选；候选列表只负责展示与键盘导航，不再重复一颗搜索框。
 *
 * # 弹层为什么挂在 `document.body` 上
 *
 * 挂在 `pre` 里的话，它会被编辑区的滚动容器算进**可滚动范围**——在靠近文档
 * 底部的地方打开一次，整篇会被顶出去一段。挂 body ＋ `position: fixed` 没这问题。
 * ⚠️ 挂在 body 上还白得一条好处：它在**编辑器 DOM 之外**，所以 ProseMirror 的
 * `stopEvent` / `ignoreMutation` 根本看不到它，不必再去扩 `code-block.ts`
 * 里那条 `inChrome` 判据。
 * ⚠️ 代价是**必须自己收尾**：NodeView 销毁时要把它摘掉（`destroy()` 里调
 * `销毁()`），否则每开一次就留一个孤儿弹层在 `body` 上。
 *
 * # ⚠️ 400 项是"每次打开现建"，不是常驻
 *
 * 建 400 行约 800 个节点是几毫秒的事；反过来，常驻就等于"每个代码块身上挂着
 * 一份 400 项的隐藏列表"，十个代码块就是 8000 个节点。所以这里是**打开时建、
 * 关上时删**——这也顺带把"懒填充"那套（`code-block.ts` 里原先的 `filled`）
 * 整个省掉了。
 */

import { t } from "@/i18n";

import { languageIcon, hasDedicatedBelongIcon } from "./lang-icon";

/** 下拉第一项：不指定语言。与 `code_block` 的 `language` 默认值一致。 */
const NO_LANGUAGE = "";

/** 「纯文本」——空语言的显示名。⚠️ 与 `code-block.ts` 同一个词，别改单边。 */
function plainText(): string {
  // ⚠️ 这里**不能**做成模块级常量：`t` 在 import 时就求值，那时语言还没定，
  // 而且之后没人通知它重画（见 `i18n/index.ts`）。字面量必须写在这儿。
  return t("Plain Text");
}

/** 弹层最多这么高，超了内部滚动。 */
const popupMostLargeHeight = 360;

/**
 * 开场要从按钮身上抄到弹层上的 token。**只列真正用到的那些**，别整份抄——
 * 抄一份完整的主题变量等于把弹层变成一个"主题快照"，将来主题加了变量、
 * 弹层却没抄，就会出现"某一条规则跟着界面主题走"这种半明半暗的状态。
 *
 * ⚠️ 这张表必须和 `editor.css` 里 `.nota-lang-popup` 用到的变量对齐。
 * 加一条 CSS 用了新变量却忘了往这里补，弹层就会在浅色文档 + 深色界面时
 * 露出界面主题的颜色——**只在那个组合下看得出来**。
 */
const continueCarryOftoken = [
  "--bg-raised",
  "--bg-subtle",
  "--doc-bg",
  "--fg",
  "--fg-muted",
  "--border-strong",
  "--accent",
  "--accent-fg",
  "--radius-sm",
  "--font-ui",
] as const;

export type languagePicker = {
  /** 放进 `.nota-code-lang-wrap` 里的唯一输入框。 */
  dom: HTMLElement;
  /** 外部改了节点属性（比如源码模式里改的）时，把显示同步过来。 */
  setLanguage2(lang: string): void;
  /** 摘掉弹层与全局监听。NodeView 销毁时必须调。 */
  cancelDestroy(): void;
};

export function createLanguagePicker(option: {
  /** 全部语言名（调用方算好并缓存，这里每次都取一遍）。 */
  allLanguages: () => string[];
  /** 输入查询时可搜索的完整语言表；允许比默认下拉更多。 */
  searchSearchLanguage: () => string[];
  /** 打开弹层时按需准备的扩展语言表；完成后重画当前列表。 */
  prepare?: () => Promise<void>;
  /**
   * 这一门语言的**全部写法**（含别名），用于搜索。
   *
   * ⚠️ 2026-10-16 加：下拉里现在**一行一个语言族**（`armasm`/`arm-asm` 只剩一行，
   * 见 `code-block.ts::allLanguages`），而用户可能按别名找——`别名` 让"打
   * `armasm` 也能筛出那一行"。⚠️ 它**只用于匹配**，选项的标签与值仍然是
   * `全部语言` 给的那个代表名。
   */
  distinguishName: (lang: string) => readonly string[];
  /** 当前语言，用于开场定位。 */
  currentLanguage: () => string;
  /** 用户选定了某个语言。 */
  selectLanguage: (lang: string) => void;
  /** 选择完成、弹层移除后，把焦点交回代码编辑器。 */
  restoreFocus?: () => void;
}): languagePicker {
  // The field is both the collapsed label and the live search input.
  const field = document.createElement("input");
  field.type = "text";
  field.className = "nota-code-lang-input";
  field.title = t("Code Language");
  field.setAttribute("role", "combobox");
  field.setAttribute("aria-haspopup", "listbox");
  field.setAttribute("aria-expanded", "false");
  field.autocomplete = "off";
  field.spellcheck = false;

  /** 闭合状态显示什么（空语言显示「纯文本」）。 */
  function drawCloseCombine(lang: string) {
    field.value = lang === NO_LANGUAGE ? plainText() : lang;
  }
  drawCloseCombine(option.currentLanguage());

  // ── 弹层 ────────────────────────────────────────────────────────────
  let popup: HTMLElement | null = null;
  /** 当前打开的输入框。关着时是 `null`。 */
  let input: HTMLInputElement | null = null;
  let currentItem = 0;

  /**
   * 弹层里**此刻**的选项，按 DOM 顺序。
   *
   * ⚠️ **现查、不能缓存**：`刷新()` 每次敲键都把选项整批删掉重建（见那儿），
   * 缓存下来的那份下一秒就是一堆已经脱离文档的元素。
   */
  function options(): HTMLElement[] {
    if (!popup) return [];
    return [...popup.querySelectorAll<HTMLElement>(".nota-lang-opt")];
  }

  /** 取此刻第 i 项（越界给 null）。 */
  function getItem2(i: number): HTMLElement | null {
    const plural = options();
    return i >= 0 && i < plural.length ? (plural[i] ?? null) : null;
  }

  function heightBright(i: number, rollPassGo = true) {
    getItem2(currentItem)?.classList.remove("nota-lang-opt-on");
    currentItem = i;
    const newValueOf = getItem2(i);
    newValueOf?.classList.add("nota-lang-opt-on");
    if (newValueOf && rollPassGo) rollToCanSee(newValueOf);
  }

  /** 造一行选项。⚠️ 事件挂在每一行上（列表是重建的，没法用委托到 `弹层`
   *  上以外的方式省——委托反而要多记一个"这行是哪来的"）。 */
  function createValueItem(lang: string, label: string, isCustom = false): HTMLElement {
    const opt = document.createElement("div");
    opt.className = isCustom ? "nota-lang-opt nota-lang-opt-custom" : "nota-lang-opt";
    opt.setAttribute("role", "option");
    opt.dataset.lang = lang;
    // ⚠️ 自定义那一行**也要给图标**，哪怕它是颗灰色的首字母徽章：那一列图标
    // 是各行对齐的基准，这一行空着会让它整行往左缩一格——看着像"这行不是
    // 选项"。而且闭合那颗按钮走的也是同一个 `languageIcon`，这里是同一个长相。
    const optionName = document.createElement("span");
    optionName.className = "nota-lang-option-name";
    optionName.textContent = label;
    opt.append(languageIcon(lang), optionName);
    if (isCustom) {
      const tail = document.createElement("span");
      tail.className = "nota-lang-custom-note";
      tail.textContent = t("Custom");
      opt.appendChild(tail);
    }
    const isEmpty = option.currentLanguage();
    opt.setAttribute("aria-selected", String(lang === isEmpty));
    if (lang === isEmpty) opt.classList.add("nota-lang-opt-on");
    // ⚠️ `mousedown` 上 preventDefault：不这样做，焦点会从输入框上掉下来，
    // 键盘上下就没得接了（而且点选项会先让输入框失焦、再收到 click）。
    opt.addEventListener("mousedown", (e) => e.preventDefault());
    opt.addEventListener("click", () => {
      option.selectLanguage(lang);
      drawCloseCombine(lang);
      close(false);
      queueMicrotask(() => {
        if (option.restoreFocus) option.restoreFocus();
        else field.focus();
      });
    });
    return opt;
  }

  /**
   * 按输入框里的字**重建**整份选项列表。每次敲键都调。
   *
   * ⚠️ **整批重建**（而不是"逐项显示/隐藏"）：那些被隐藏的行仍然在 DOM 里，
   * `选项们()` 会数到它们，于是键盘上下会停在**看不见的行**上——症状是
   * "按几下方向键没反应，再按一下跳到老远"。整批重建就没有这个中间态。
   *
   * 列表三块，顺序固定：
   * 1. **不指定语言**（「纯文本」）——**恒在最前**，不能用输入筛掉它。
   *    它是"把语言改回空"的唯一入口，筛掉之后就再也回不去了。
   * 2. **有专属图标的语言**里匹配输入的那些（`code-block.ts::allLanguages`
   *    已经把没图标的滤掉了，用户 2026-09-26 要的）。
   * 3. **自定义那一行**——只在输入非空、且与上面任何一项**都不完全相同**时出现。
   *    它是用户"输入自己的答案"那条路：`refractor` 认识 400 个语言，而下拉里
   *    只摆得下带图标的那 90 来个，剩下三百多个全靠这一行。
   */
  function refreshNewValue() {
    if (!popup || !input) return;
    for (const el of options()) el.remove();
    const source = input.value.trim();
    const ask = source.toLowerCase();
    // 空查询才显示「纯文本」；开始输入后只保留命中的语言，和常见代码编辑器的
    // 语言补全一致。需要清空语言时把输入框删空即可。
    if (ask === "") popup.appendChild(createValueItem(NO_LANGUAGE, plainText()));
    const candidate = ask === "" ? option.allLanguages() : option.searchSearchLanguage();
    const match = candidate
      .filter((lang) => ask === "" || option.distinguishName(lang).some((name3) => name3.toLowerCase().includes(ask)))
      .sort((a, b) => {
        if (ask === "") return 0;
        const aBefore = a.toLowerCase().startsWith(ask) ? 1 : 0;
        const bBefore = b.toLowerCase().startsWith(ask) ? 1 : 0;
        const aImage = hasDedicatedBelongIcon(a) ? 1 : 0;
        const bImage = hasDedicatedBelongIcon(b) ? 1 : 0;
        return bBefore - aBefore || bImage - aImage || a.length - b.length || a.localeCompare(b);
      });
    for (const lang of match) {
      // ⚠️ **连别名一起匹配**（2026-10-16，朋友报的「代码块语言类型重复」那一批）：
      // 下拉里现在**一行一个语言族**（`armasm`/`arm-asm` 只留下一行，见
      // `code-block.ts::allLanguages`）。用户按 `armasm` 找的时候得找得到那一行，
      // 不然他会以为"这个语言被删了"。`选项.别名` 给的是这一族的所有写法。
      popup.appendChild(createValueItem(lang, lang));
    }
    if (ask !== "" && match.length === 0) {
      popup.appendChild(createValueItem(source, source, true));
    }
    const current = option.currentLanguage();
    const preciseConfirmItem = options().findIndex(
      (el) => el.dataset.lang === (ask === "" ? current : source),
    );
    heightBright(preciseConfirmItem >= 0 ? preciseConfirmItem : 0);
  }

  /**
   * 把某一项滚进弹层的可视区（等价于 `block: "nearest"`）。
   *
   * ⚠️ **不能用 `新的.scrollIntoView()`**——这是 2026-09-25 实测踩出来的：
   * 它会**连带滚动所有能滚的祖先**，而祖先一动就触发下面那条「滚动就关」
   * 的监听，于是弹层**刚打开就被自己关掉**。更阴的是它只在"当前语言排在
   * 列表靠后、确实需要滚"时才发生——语言排前面时一切正常。症状是
   * "选某些语言打不开下拉、选另一些就正常"。
   *
   * 手写这一段只动弹层自己的 `scrollTop`：选项是弹层的直接子元素、弹层又是
   * `position: fixed`（就是它们的 `offsetParent`），所以 `offsetTop`
   * 天然是相对弹层内容顶的。
   */
  function rollToCanSee(item5: HTMLElement) {
    if (!popup) return;
    const top = item5.offsetTop;
    const bottom = top + item5.offsetHeight;
    if (top < popup.scrollTop) popup.scrollTop = top;
    else if (bottom > popup.scrollTop + popup.clientHeight) {
      popup.scrollTop = bottom - popup.clientHeight;
    }
  }

  /** 关掉弹层。⚠️ 幂等：没开的时候调它什么也不做。 */
  function close(reset = true) {
    if (reset) drawCloseCombine(option.currentLanguage());
    if (!popup) return;
    popup.remove();
    popup = null;
    input = null;
    field.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", pointExternalSurface, true);
    document.removeEventListener("keydown", allLayoutKeypress, true);
    window.removeEventListener("resize", closeOnResize);
    // ⚠️ 滚动也要关：弹层是 `position: fixed`，跟着滚动走的话它会**脱开**
    // 代码块飘在半空。关掉比"跟着挪"简单得多，而且不会挪错。
    window.removeEventListener("scroll", rollActionDone, true);
  }

  function pointExternalSurface(e: Event) {
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (popup?.contains(t) || field.contains(t)) return;
    close();
  }

  /**
   * 页面滚动 → 关弹层。⚠️ **弹层自己内部的滚动不算**。
   *
   * 这是个真的踩过的坑（2026-09-25）：`scroll` 事件不冒泡，但**捕获阶段照走**，
   * 所以挂在 `window` 上的这条捕获监听能收到"弹层自己滚了一下"。
   * 开场滚到当前语言那一项就是一次弹层内部滚动——不排掉的话，
   * 打开与关闭在同一帧里发生，**表现是"点了没反应"**，而且只在当前语言排得
   * 靠后（需要滚）时出现。
   */
  function rollActionDone(e: Event) {
    const t = e.target;
    if (t instanceof Node && (t === popup || popup?.contains(t))) return;
    close();
  }

  const closeOnResize = () => close();

  /** 打开候选列表。输入框本身就是触发器与搜索框。 */
  function open() {
    if (popup) return;

    const isEmpty = option.currentLanguage();

    const pop = document.createElement("div");
    pop.className = "nota-lang-popup";
    pop.setAttribute("role", "listbox");
    input = field;

    popup = pop;
    document.body.appendChild(pop);

    // 完整语言表只在这里需要。加载完成后若弹层仍开着，就原地重画；
    // 用户已经关掉或换了另一个代码块时，不能把旧弹层复活。
    if (option.prepare) {
      const openedPopup = pop;
      void option
        .prepare()
        .then(() => {
          if (popup === openedPopup && input) refreshNewValue();
        })
        .catch((error: unknown) => {
          console.warn("[nota] 完整代码语言表加载失败；保留基础语言列表：", error);
        });
    }

    // ── 把文档主题的 token 抄过来 ──────────────────────────────────────
    // ⚠️ 这一步不能省。弹层挂在 `document.body` 上，**在 `.editor-pane` 之外**
    // ——而文档主题的 token 是写在 `.editor-pane` 上的（`doc-theme.ts` 会把主题
    // 里的 `:root` 改写成它，就是为了"选个浅色文档主题、整个应用跟着变亮"那件
    // 事不再发生）。于是弹层默认只能拿到**界面**主题的值，结果是
    // "闭合的框跟文档主题、打开的弹层跟界面主题"——浅色文档配深色界面时，
    // 一打开就是两块对不上的颜色。
    // 办法是开场从输入框身上（它在编辑区里，算出来的是文档主题的值）把要用的
    // 那几个 token 抄到弹层上。⚠️ 抄的是**算完的值**，所以用户中途换主题时
    // 已经开着的那个弹层不会跟着变——它下一秒就关了，不值得为它挂监听。
    const borrowComeOf = getComputedStyle(field);
    for (const t of continueCarryOftoken) {
      const v = borrowComeOf.getPropertyValue(t).trim();
      if (v) pop.style.setProperty(t, v);
    }

    // ⚠️ **填列表必须在量高之前**：`刷新()` 是建选项那一步，而下面要按
    // "这么高放得下吗"决定往上翻还是往下开。空列表的高度是错的。
    refreshNewValue();

    // ── 定位 ──────────────────────────────────────────────────────────
    // ⚠️ `max-height` 要在**量高之前**设好：反过来的话，量到的是"四百项全铺开"
    // 的那个高（几千像素），下面翻转那一步就判错了。设完之后 `offsetHeight`
    // 本身就是夹过的值。
    // ⚠️ 现在列表最多 90 来项（`code-block.ts::allLanguages` 滤过图标），
    // 但这条判断**照旧不能省**：用户输一个字筛出来两项时，弹层就该矮下去。
    pop.style.maxHeight = `${popupMostLargeHeight}px`;
    // ⚠️ 必须在**入 DOM 之后**量，否则拿不到弹层自己的高（下面要用它判翻转）。
    const r = field.getBoundingClientRect();
    const height = pop.offsetHeight;
    // The candidates are a continuation of the field, not a second control.
    // Reuse both horizontal edges instead of applying an independent minimum.
    pop.style.width = `${r.width}px`;
    pop.style.minWidth = "0";
    const width = pop.offsetWidth;
    const edgeDistance = 4;
    let left = r.left;
    left = Math.max(edgeDistance, Math.min(left, window.innerWidth - width - edgeDistance));
    pop.style.left = `${left}px`;
    // 下面装不下就翻到输入框上方。
    const belowSurfaceEnough = window.innerHeight - r.bottom > height + 8;
    if (belowSurfaceEnough) pop.style.top = `${r.bottom + 2}px`;
    else pop.style.top = `${Math.max(4, r.top - height - 2)}px`;

    field.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", pointExternalSurface, true);
    document.addEventListener("keydown", allLayoutKeypress, true);
    window.addEventListener("resize", closeOnResize);
    window.addEventListener("scroll", rollActionDone, true);

    // 开场滚到当前语言那一项（找不到就回到第一项）。
    const i = options().findIndex((el) => el.dataset.lang === isEmpty);
    heightBright(i >= 0 ? i : 0);
  }

  /** 键盘导航。⚠️ 挂在 `document` 的捕获阶段：焦点在输入框上时它也能收到，
   *  万一焦点跑到别处（比如用户点了别的地方又没触发关闭）也还接得住。 */
  function allLayoutKeypress(e: KeyboardEvent) {
    if (!popup) return;
    // ⚠️ **右键菜单开着时整个让路**（2026-10-04，见 `ui/ContextMenu.tsx`）。
    //
    // 本监听挂在 `document` 的**捕获**阶段，比菜单那一层（React，监听在根容器、
    // 冒泡阶段）**先**收到按键。两者一起开着的时候（最常见的一处：在**这个**语言
    // 搜索框里右键），同一个键会被两边各处理一次，量到过两个后果：
    //   ① `Enter`：选择器先收下语言、`关闭()` 把输入框**卸载**掉，菜单那条
    //      「全选」才轮到自己——焦点还不成，`execCommand("selectAll")` 于是选中
    //      **整篇文档**（那是会毁文档的一条，`ui/ContextMenu.tsx::还焦` 里记着）；
    //   ② `Escape`：选择器和菜单**一起关掉**（用户以为只关掉最上面那层）。
    //
    // 判据是 `data-context-menu`：那是这一族浮层的统一标记，`ui/useModalTrap.ts`
    // 认的也是同一个（子菜单 portal 到 `body`，"这一层开着吗"只能靠属性问）。
    if (document.querySelector("[data-context-menu]")) return;
    // ⚠️ **输入法组字当中一律不管**：那会儿的回车是"上屏"、方向键是"在
    // 候选词里挪"、退格是"改拼音"。放过它们，输入法才用得成。
    if (e.isComposing) return;
    const totalNumber = options().length;
    switch (e.key) {
      case "Escape":
        close();
        field.focus();
        e.preventDefault();
        return;
      case "ArrowDown":
        heightBright(Math.min(currentItem + 1, totalNumber - 1));
        e.preventDefault();
        return;
      case "ArrowUp":
        heightBright(Math.max(currentItem - 1, 0));
        e.preventDefault();
        return;
      case "Home":
        heightBright(0);
        e.preventDefault();
        return;
      case "End":
        heightBright(totalNumber - 1);
        e.preventDefault();
        return;
      case "Enter": {
        // ⚠️ **`" "`（空格）不在这里**。原来它和 Enter 一起提交，那时焦点在
        // 按钮上、空格本来就是"按下这颗按钮"。现在焦点在输入框里，空格是
        // **要打进语言名里的**（`visual basic`、`common lisp` 都带空格），
        // 再把它当成提交，用户就永远打不出带空格的语言。
        const item5 = getItem2(currentItem);
        const lang = item5?.dataset.lang;
        if (lang !== undefined) {
          option.selectLanguage(lang);
          drawCloseCombine(lang);
        }
        close(false);
        queueMicrotask(() => {
          if (option.restoreFocus) option.restoreFocus();
          else field.focus();
        });
        e.preventDefault();
        return;
      }
    }
    // ⚠️ 这里原来还有一段"打字跳转"（原生 `<select>` 白送的那条，手写的）。
    // **2026-09-26 删掉了**：它和顶上那个输入框抢同一批按键——焦点在输入框里
    // 时按字母，用户要的是"打进框里筛列表"，而那段代码会 `preventDefault()`
    // 把字符**吃掉**。筛选现在归输入框管（见 `刷新()`）。
  }

  field.addEventListener("focus", () => {
    field.select();
    open();
  });
  field.addEventListener("click", () => open());
  field.addEventListener("input", () => {
    if (!popup) open();
    refreshNewValue();
  });

  return {
    dom: field,
    setLanguage2: (lang) => {
      if (document.activeElement !== field || !popup) drawCloseCombine(lang);
    },
    cancelDestroy: close,
  };
}
