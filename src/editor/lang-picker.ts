/**
 * 代码块的语言选择器：**自绘的下拉**，不是原生 `<select>`。
 *
 * # 为什么非自己画不可
 *
 * 原生 `<select>` 的弹层里**放不了图标**——HTML 规定 `<option>` 的内容模型是
 * 纯文字，`<img>` 塞进去不渲染（WebKit 下连 `background-image` 也不认）。
 * 用户 2026-09-25 明确要「连弹层里也要图标」，所以这是一条硬约束，
 * 不是审美偏好。⚠️ **代价要认**：原生弹层白送的东西全得自己补回来——
 * 打字跳转、键盘上下、开场滚到当前项、Escape 关、点外面关（下面都补了）。
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

import { languageIcon, 有专属图标 } from "./lang-icon";

/** 下拉第一项：不指定语言。与 `code_block` 的 `language` 默认值一致。 */
const NO_LANGUAGE = "";

/** 「纯文本」——空语言的显示名。⚠️ 与 `code-block.ts` 同一个词，别改单边。 */
function 纯文本(): string {
  // ⚠️ 这里**不能**做成模块级常量：`t` 在 import 时就求值，那时语言还没定，
  // 而且之后没人通知它重画（见 `i18n/index.ts`）。字面量必须写在这儿。
  return t("Plain Text");
}

/** 弹层最多这么高，超了内部滚动。 */
const 弹层最大高 = 260;

/**
 * 开场要从按钮身上抄到弹层上的 token。**只列真正用到的那些**，别整份抄——
 * 抄一份完整的主题变量等于把弹层变成一个"主题快照"，将来主题加了变量、
 * 弹层却没抄，就会出现"某一条规则跟着界面主题走"这种半明半暗的状态。
 *
 * ⚠️ 这张表必须和 `editor.css` 里 `.nota-lang-popup` 用到的变量对齐。
 * 加一条 CSS 用了新变量却忘了往这里补，弹层就会在浅色文档 + 深色界面时
 * 露出界面主题的颜色——**只在那个组合下看得出来**。
 */
const 继承的token = [
  "--bg-raised",
  "--bg-subtle",
  "--fg",
  "--fg-muted",
  "--border-strong",
  "--accent",
  "--accent-fg",
  "--radius-sm",
  "--font-ui",
] as const;

export type 语言选择器 = {
  /** 放进 `.nota-code-lang-wrap` 里的那颗按钮。 */
  dom: HTMLElement;
  /** 外部改了节点属性（比如源码模式里改的）时，把显示同步过来。 */
  设语言(lang: string): void;
  /** 摘掉弹层与全局监听。NodeView 销毁时必须调。 */
  销毁(): void;
};

export function 创建语言选择器(选项: {
  /** 全部语言名（调用方算好并缓存，这里每次都取一遍）。 */
  全部语言: () => string[];
  /** 输入查询时可搜索的完整语言表；允许比默认下拉更多。 */
  搜索语言: () => string[];
  /**
   * 这一门语言的**全部写法**（含别名），用于搜索。
   *
   * ⚠️ 2026-10-16 加：下拉里现在**一行一个语言族**（`armasm`/`arm-asm` 只剩一行，
   * 见 `code-block.ts::allLanguages`），而用户可能按别名找——`别名` 让"打
   * `armasm` 也能筛出那一行"。⚠️ 它**只用于匹配**，选项的标签与值仍然是
   * `全部语言` 给的那个代表名。
   */
  别名: (lang: string) => readonly string[];
  /** 当前语言，用于开场定位。 */
  当前语言: () => string;
  /** 用户选定了某个语言。 */
  选语言: (lang: string) => void;
}): 语言选择器 {
  // ── 闭合状态那颗按钮 ────────────────────────────────────────────────
  // ⚠️ 用 `<button>` 而不是 `<div>`：键盘 Tab 能到、Enter/Space 天然可点。
  // ⚠️ `.nota-code-lang` 这个 class **留着**，它是外观的载体（尺寸、边框、
  // 颜色都在 CSS 里挂着它）——从 `<select>` 换成 `<button>` 是元素变了，
  // 不是那颗框的视觉变了。
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nota-code-lang";
  btn.title = t("Code Language");
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", "false");

  const 名字 = document.createElement("span");
  名字.className = "nota-lang-name";

  /** 闭合状态显示什么（空语言显示「纯文本」）。 */
  function 画闭合(lang: string) {
    btn.replaceChildren(languageIcon(lang), 名字);
    名字.textContent = lang === NO_LANGUAGE ? 纯文本() : lang;
  }
  画闭合(选项.当前语言());

  // ── 弹层 ────────────────────────────────────────────────────────────
  let 弹层: HTMLElement | null = null;
  /** 弹层顶上那个输入框（重建列表时要用它的值）。关着时是 `null`。 */
  let 输入: HTMLInputElement | null = null;
  let 当前项 = 0;

  /**
   * 弹层里**此刻**的选项，按 DOM 顺序。
   *
   * ⚠️ **现查、不能缓存**：`刷新()` 每次敲键都把选项整批删掉重建（见那儿），
   * 缓存下来的那份下一秒就是一堆已经脱离文档的元素。
   */
  function 选项们(): HTMLElement[] {
    if (!弹层) return [];
    return [...弹层.querySelectorAll<HTMLElement>(".nota-lang-opt")];
  }

  /** 取此刻第 i 项（越界给 null）。 */
  function 取项(i: number): HTMLElement | null {
    const 们 = 选项们();
    return i >= 0 && i < 们.length ? (们[i] ?? null) : null;
  }

  function 高亮(i: number, 滚过去 = true) {
    取项(当前项)?.classList.remove("nota-lang-opt-on");
    当前项 = i;
    const 新的 = 取项(i);
    新的?.classList.add("nota-lang-opt-on");
    if (新的 && 滚过去) 滚到可见(新的);
  }

  /** 造一行选项。⚠️ 事件挂在每一行上（列表是重建的，没法用委托到 `弹层`
   *  上以外的方式省——委托反而要多记一个"这行是哪来的"）。 */
  function 造一项(lang: string, 标签: string, 是自定义 = false): HTMLElement {
    const opt = document.createElement("div");
    opt.className = 是自定义 ? "nota-lang-opt nota-lang-opt-custom" : "nota-lang-opt";
    opt.setAttribute("role", "option");
    opt.dataset.lang = lang;
    // ⚠️ 自定义那一行**也要给图标**，哪怕它是颗灰色的首字母徽章：那一列图标
    // 是各行对齐的基准，这一行空着会让它整行往左缩一格——看着像"这行不是
    // 选项"。而且闭合那颗按钮走的也是同一个 `languageIcon`，这里是同一个长相。
    opt.append(languageIcon(lang), document.createTextNode(标签));
    if (是自定义) {
      const 尾 = document.createElement("span");
      尾.className = "nota-lang-custom-note";
      尾.textContent = t("Custom");
      opt.appendChild(尾);
    }
    const 是空 = 选项.当前语言();
    opt.setAttribute("aria-selected", String(lang === 是空));
    if (lang === 是空) opt.classList.add("nota-lang-opt-on");
    // ⚠️ `mousedown` 上 preventDefault：不这样做，焦点会从输入框上掉下来，
    // 键盘上下就没得接了（而且点选项会先让输入框失焦、再收到 click）。
    opt.addEventListener("mousedown", (e) => e.preventDefault());
    opt.addEventListener("click", () => {
      选项.选语言(lang);
      画闭合(lang);
      关闭();
      btn.focus();
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
  function 刷新() {
    if (!弹层 || !输入) return;
    for (const el of 选项们()) el.remove();
    const 原文 = 输入.value.trim();
    const 问 = 原文.toLowerCase();
    // 空查询才显示「纯文本」；开始输入后只保留命中的语言，和常见代码编辑器的
    // 语言补全一致。需要清空语言时把输入框删空即可。
    if (问 === "") 弹层.appendChild(造一项(NO_LANGUAGE, 纯文本()));
    const 候选 = 问 === "" ? 选项.全部语言() : 选项.搜索语言();
    const 命中 = 候选
      .filter((lang) => 问 === "" || 选项.别名(lang).some((名) => 名.toLowerCase().includes(问)))
      .sort((a, b) => {
        if (问 === "") return 0;
        const a前 = a.toLowerCase().startsWith(问) ? 1 : 0;
        const b前 = b.toLowerCase().startsWith(问) ? 1 : 0;
        const a图 = 有专属图标(a) ? 1 : 0;
        const b图 = 有专属图标(b) ? 1 : 0;
        return b前 - a前 || b图 - a图 || a.length - b.length || a.localeCompare(b);
      });
    for (const lang of 命中) {
      // ⚠️ **连别名一起匹配**（2026-10-16，朋友报的「代码块语言类型重复」那一批）：
      // 下拉里现在**一行一个语言族**（`armasm`/`arm-asm` 只留下一行，见
      // `code-block.ts::allLanguages`）。用户按 `armasm` 找的时候得找得到那一行，
      // 不然他会以为"这个语言被删了"。`选项.别名` 给的是这一族的所有写法。
      弹层.appendChild(造一项(lang, lang));
    }
    if (问 !== "" && 命中.length === 0) {
      弹层.appendChild(造一项(原文, 原文, true));
    }
    const 当前 = 选项.当前语言();
    const 精确项 = 选项们().findIndex(
      (el) => el.dataset.lang === (问 === "" ? 当前 : 原文),
    );
    高亮(精确项 >= 0 ? 精确项 : 0);
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
  function 滚到可见(项: HTMLElement) {
    if (!弹层) return;
    // ⚠️ 顶上那个输入框是 `position: sticky` 的（`editor.css`），滚上去之后
    // 它会**盖住**弹层最前面那几十像素。不把这几十像素算进来的话，高亮项会被
    // 正好停在输入框底下——看着像"按了方向键但高亮没了"。
    const 头 = 弹层.querySelector<HTMLElement>(".nota-lang-search")?.offsetHeight ?? 0;
    const 顶 = 项.offsetTop;
    const 底 = 顶 + 项.offsetHeight;
    if (顶 < 弹层.scrollTop + 头) 弹层.scrollTop = Math.max(0, 顶 - 头);
    else if (底 > 弹层.scrollTop + 弹层.clientHeight) 弹层.scrollTop = 底 - 弹层.clientHeight;
  }

  /** 关掉弹层。⚠️ 幂等：没开的时候调它什么也不做。 */
  function 关闭() {
    // ⚠️ 卸载这个 class 要放在**提前返回之前**：它是幂等的，而提前返回那条路上
    // 也得保证它不在（宁可多删一次，也别留一颗"框一直亮着"的残状态）。
    btn.classList.remove("nota-lang-open");
    if (!弹层) return;
    弹层.remove();
    弹层 = null;
    输入 = null;
    btn.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", 点外面, true);
    document.removeEventListener("keydown", 全局按键, true);
    window.removeEventListener("resize", 关闭);
    // ⚠️ 滚动也要关：弹层是 `position: fixed`，跟着滚动走的话它会**脱开**
    // 代码块飘在半空。关掉比"跟着挪"简单得多，而且不会挪错。
    window.removeEventListener("scroll", 滚动了, true);
  }

  function 点外面(e: Event) {
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (弹层?.contains(t) || btn.contains(t)) return;
    关闭();
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
  function 滚动了(e: Event) {
    const t = e.target;
    if (t instanceof Node && (t === 弹层 || 弹层?.contains(t))) return;
    关闭();
  }

  /** 打开弹层。已经开着就先关（按钮再点一次＝收起）。 */
  function 打开() {
    if (弹层) {
      关闭();
      return;
    }

    const 是空 = 选项.当前语言();

    const pop = document.createElement("div");
    pop.className = "nota-lang-popup";
    pop.setAttribute("role", "listbox");

    // ── 顶上那个输入框（用户 2026-09-26 要的）──────────────────────────
    // ⚠️ 它**替掉了原先的"打字跳转"**（原生 `<select>` 白送的那条，本文件
    // 之前手写补过）。两条路不能并存：那一条靠"焦点在按钮上、按字母跳项"，
    // 而输入框一出现，焦点就在输入框里、字母当然要落进框里。
    // 输入框这条路更好：它既筛列表（原来那条只能跳、不能筛），又能**装下
    // 用户自己写的语言**——那正是 `refractor` 那 400 个里没图标的三百来个的入口。
    const 搜索 = document.createElement("div");
    搜索.className = "nota-lang-search";
    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "nota-lang-input";
    inp.placeholder = t("Search or type a language");
    inp.setAttribute("aria-label", t("Code Language"));
    // ⚠️ `autocomplete/spellcheck` 都关掉：语言名不是自然语言，浏览器的
    // 拼写红线与历史下拉在这里只会挡住列表。
    inp.autocomplete = "off";
    inp.spellcheck = false;
    // 选择框本身也承担输入框：打开后可直接改写当前语言，再按输入内容筛选。
    inp.value = 是空;
    搜索.appendChild(inp);
    pop.appendChild(搜索);
    输入 = inp;

    inp.addEventListener("input", 刷新);
    inp.addEventListener("keydown", (e) => {
      // ⚠️ 中文/日文输入法**组字当中**的回车不是"选中"——那是"上屏"。
      // 不挡这一下，用户打完字按回车选词，语言就被当场定成了半截拼音。
      if (e.isComposing) return;
      if (e.key === "Escape") {
        关闭();
        btn.focus();
      }
    });

    弹层 = pop;
    document.body.appendChild(pop);

    // ── 把文档主题的 token 抄过来 ──────────────────────────────────────
    // ⚠️ 这一步不能省。弹层挂在 `document.body` 上，**在 `.editor-pane` 之外**
    // ——而文档主题的 token 是写在 `.editor-pane` 上的（`doc-theme.ts` 会把主题
    // 里的 `:root` 改写成它，就是为了"选个浅色文档主题、整个应用跟着变亮"那件
    // 事不再发生）。于是弹层默认只能拿到**界面**主题的值，结果是
    // "闭合的框跟文档主题、打开的弹层跟界面主题"——浅色文档配深色界面时，
    // 一打开就是两块对不上的颜色。
    // 办法是开场从按钮身上（它在编辑区里，算出来的是文档主题的值）把要用的
    // 那几个 token 抄到弹层上。⚠️ 抄的是**算完的值**，所以用户中途换主题时
    // 已经开着的那个弹层不会跟着变——它下一秒就关了，不值得为它挂监听。
    const 借来的 = getComputedStyle(btn);
    for (const t of 继承的token) {
      const v = 借来的.getPropertyValue(t).trim();
      if (v) pop.style.setProperty(t, v);
    }

    // ⚠️ **填列表必须在量高之前**：`刷新()` 是建选项那一步，而下面要按
    // "这么高放得下吗"决定往上翻还是往下开。空列表的高度是错的。
    刷新();

    // ── 定位 ──────────────────────────────────────────────────────────
    // ⚠️ `max-height` 要在**量高之前**设好：反过来的话，量到的是"四百项全铺开"
    // 的那个高（几千像素），下面翻转那一步就判错了。设完之后 `offsetHeight`
    // 本身就是夹过的值。
    // ⚠️ 现在列表最多 90 来项（`code-block.ts::allLanguages` 滤过图标），
    // 但这条判断**照旧不能省**：用户输一个字筛出来两项时，弹层就该矮下去。
    pop.style.maxHeight = `${弹层最大高}px`;
    // ⚠️ 必须在**入 DOM 之后**量，否则拿不到弹层自己的高（下面要用它判翻转）。
    const r = btn.getBoundingClientRect();
    const 高 = pop.offsetHeight;
    pop.style.minWidth = `${r.width}px`;
    pop.style.left = `${r.left}px`;
    // 下面装不下就翻到按钮上方（按弹层底部对齐按钮上沿）。
    const 下面够 = window.innerHeight - r.bottom > 高 + 8;
    if (下面够) pop.style.top = `${r.bottom + 2}px`;
    else pop.style.top = `${Math.max(4, r.top - 高 - 2)}px`;

    btn.setAttribute("aria-expanded", "true");
    // ⚠️ 这一条是给**闭合框**用的，不是给弹层用的：弹层挂在 `body` 上，鼠标
    // 从按钮往弹层里走时会离开代码块，`.nota-code-lang-wrap` 那两条 `:hover`
    // 就都不成立了，框会淡出——而弹层还在，看着像"没有主"的一块浮在纸上。
    // `editor.css` 里那条 `:has()` 靠这个 class 把框按住。
    btn.classList.add("nota-lang-open");
    document.addEventListener("pointerdown", 点外面, true);
    document.addEventListener("keydown", 全局按键, true);
    window.addEventListener("resize", 关闭);
    window.addEventListener("scroll", 滚动了, true);

    // 开场滚到当前语言那一项（找不到就回到第一项）。
    // ⚠️ 找的时候要**跳过前一项**：`选项们()` 里没有输入框（它不带
    // `.nota-lang-opt`），但 `高亮(0)` 是"第一项"，而第一项恒是「纯文本」
    // ——列表顺序就是 `刷新()` 里那个顺序，这里不重复一遍。
    const i = 选项们().findIndex((el) => el.dataset.lang === 是空);
    高亮(i >= 0 ? i : 0);

    // ⚠️ **焦点交给输入框**（放在最后）：这是"打开就是要打字"的那个交互，
    // 而 `全局按键` 挂在 `document` 的捕获阶段，焦点在哪儿都收得到方向键与
    // 回车。⚠️ 与按钮上那条 `mousedown → preventDefault` 不冲突：那条管的是
    // **点按钮**别把编辑器选区弄丢，这条是**弹层已经开好之后**才聚焦。
    inp.focus();
  }

  /** 键盘导航。⚠️ 挂在 `document` 的捕获阶段：焦点在按钮上时它也能收到，
   *  万一焦点跑到别处（比如用户点了别的地方又没触发关闭）也还接得住。 */
  function 全局按键(e: KeyboardEvent) {
    if (!弹层) return;
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
    const 总数 = 选项们().length;
    switch (e.key) {
      case "Escape":
        关闭();
        btn.focus();
        e.preventDefault();
        return;
      case "ArrowDown":
        高亮(Math.min(当前项 + 1, 总数 - 1));
        e.preventDefault();
        return;
      case "ArrowUp":
        高亮(Math.max(当前项 - 1, 0));
        e.preventDefault();
        return;
      case "Home":
        高亮(0);
        e.preventDefault();
        return;
      case "End":
        高亮(总数 - 1);
        e.preventDefault();
        return;
      case "Enter": {
        // ⚠️ **`" "`（空格）不在这里**。原来它和 Enter 一起提交，那时焦点在
        // 按钮上、空格本来就是"按下这颗按钮"。现在焦点在输入框里，空格是
        // **要打进语言名里的**（`visual basic`、`common lisp` 都带空格），
        // 再把它当成提交，用户就永远打不出带空格的语言。
        const 项 = 取项(当前项);
        const lang = 项?.dataset.lang;
        if (lang !== undefined) {
          选项.选语言(lang);
          画闭合(lang);
        }
        关闭();
        btn.focus();
        e.preventDefault();
        return;
      }
    }
    // ⚠️ 这里原来还有一段"打字跳转"（原生 `<select>` 白送的那条，手写的）。
    // **2026-09-26 删掉了**：它和顶上那个输入框抢同一批按键——焦点在输入框里
    // 时按字母，用户要的是"打进框里筛列表"，而那段代码会 `preventDefault()`
    // 把字符**吃掉**。筛选现在归输入框管（见 `刷新()`）。
  }

  // ── 按钮自己的事件 ──────────────────────────────────────────────────
  btn.addEventListener("mousedown", (e) => e.preventDefault()); // 别把编辑器选区弄丢
  btn.addEventListener("click", () => {
    // ⚠️ 先取一次当前语言：源码模式里改过属性之后，闭合显示可能是旧的。
    画闭合(选项.当前语言());
    打开();
  });

  return {
    dom: btn,
    设语言: (lang) => 画闭合(lang),
    销毁: 关闭,
  };
}
