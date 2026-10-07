/**
 * 一颗**只够跑逻辑**的假 DOM，给 `tests/math-view.test.ts` 与
 * `tests/math-wiring.test.ts` 用（2026-10-07 之前只写着一份文件的名字——
 * 那天 `math-view.test.ts` 拆成两份、工装抽去 `math-fixture.ts`，
 * **假 DOM 是两份都用的那一层**，所以那两份的名字都得在这儿）。
 *
 * ⚠️ `math-fixture.ts`（真 Schema ＋ `建`）也建在这颗假 DOM 上，
 * 而它是**第三个**消费者——所以别把本文件的"给谁用"读成"只有测试文件直接用"。
 *
 * # 为什么需要它
 *
 * `src/editor/math-view.ts` 的 NodeView 一建出来就要 `document.createElement`，
 * 而本仓**没有装 jsdom / vitest / happy-dom**（`package.json` 里一个都没有，
 * 也不许为这件事装包）。所以这里手搓一颗最小的：元素、类名、子节点、
 * 事件监听、焦点、`value`。Node 24 直接跑 `node --test` 之外的东西也一样能跑，
 * 因为它只是往 `globalThis.document` 上塞一个普通对象。
 *
 * # ⚠️ 它证明不了什么、别拿它当目检
 *
 * 它能证明的只有**逻辑**：谁把源码写回哪个字段、面板什么时候开、按键之后
 * 文档变成什么样。它**证明不了**：CSS 长什么样、KaTeX 画成什么样、真实浏览器
 * 里的焦点/选区/拖拽行为、ProseMirror 与真实 DOM 的同步。那些一律算**未验**
 * （报告里如实记着）。
 *
 * # 两处故意"与浏览器不一样"
 *
 * - `isConnected` 恒为真。假树上没有真正的挂载过程，而 `math-view.ts` 判它是
 *   为了躲"DOM 还没插进文档"那一帧（那个时序只有真 `renderDescs` 才有）。
 * - `focus()` / `blur()` **会派发同名事件**（这一点与浏览器一致，NodeView 靠
 *   那两个事件更新"框里有焦点"），但不会真的移动系统焦点——系统里没有焦点。
 */

/** 一颗假元素。只实现被测代码真的用过的那几样。 */
export class 假元素 {
  readonly tagName: string;
  readonly nodeType = 1;
  readonly namespaceURI: string | null = null;
  parentNode: 假元素 | null = null;
  childNodes: 假元素[] = [];

  className = "";
  contentEditable = "";
  /** `hidden` —— 公式的命令候选弹窗靠它开合（`math-suggest.ts`）。 */
  hidden = false;
  spellcheck = true;
  placeholder = "";
  rows = 0;
  type = "";
  /** 表单控件用（`<input>` / `<textarea>`）。 */
  value = "";
  /** `setSelectionRange` 记下来的光标位置，供测试读。 */
  选区: [number, number] = [0, 0];

  /**
   * 表单控件的光标位置。⚠️ 真 DOM 里这两条是**只读**属性，所以这里写成
   * getter（`math-view.ts` 的按键补全要读 `selectionStart` 才知道该在哪替换）。
   */
  get selectionStart(): number | null {
    return this.选区[0];
  }

  get selectionEnd(): number | null {
    return this.选区[1];
  }

  readonly style: Record<string, string> & { setProperty: (k: string, v: string) => void } = (() => {
    const 表: Record<string, string> = {};
    return Object.assign(表, {
      setProperty: (k: string, v: string) => {
        表[k] = v;
      },
    });
  })();

  readonly dataset: Record<string, string> = {};
  readonly attributes: Record<string, string> = {};
  private readonly listeners = new Map<string, ((事件: 假事件) => void)[]>();
  /** 文本节点（`tagName === "#TEXT"`）的内容。 */
  文本 = "";

  constructor(tagName: string, namespaceURI: string | null = null) {
    this.tagName = tagName.toUpperCase();
    this.namespaceURI = namespaceURI;
  }

  readonly classList = {
    add: (...类名: string[]): void => {
      const 有 = new Set(this.className.split(/\s+/).filter(Boolean));
      for (const c of 类名) 有.add(c);
      this.className = [...有].join(" ");
    },
    remove: (...类名: string[]): void => {
      const 有 = new Set(this.className.split(/\s+/).filter(Boolean));
      for (const c of 类名) 有.delete(c);
      this.className = [...有].join(" ");
    },
    contains: (类名: string): boolean => this.className.split(/\s+/).includes(类名),
    toggle: (类名: string, 加?: boolean): void => {
      const 要加 = 加 ?? !this.classList.contains(类名);
      if (要加) this.classList.add(类名);
      else this.classList.remove(类名);
    },
  };

  /** ⚠️ 恒真，理由见文件头。 */
  get isConnected(): boolean {
    return true;
  }

  get firstChild(): 假元素 | null {
    return this.childNodes[0] ?? null;
  }

  get textContent(): string {
    if (this.tagName === "#TEXT") return this.文本;
    return this.childNodes.map((c) => c.textContent).join("");
  }

  set textContent(值: string) {
    this.childNodes = [];
    if (值 === "") return;
    const 节点 = new 假元素("#text");
    节点.文本 = 值;
    this.appendChild(节点);
  }

  appendChild<T extends 假元素>(子: T): T {
    子.parentNode?.removeChild(子);
    子.parentNode = this;
    this.childNodes.push(子);
    return 子;
  }

  insertBefore<T extends 假元素>(子: T, 参照: 假元素 | null): T {
    const i = 参照 ? this.childNodes.indexOf(参照) : -1;
    if (i < 0) return this.appendChild(子);
    子.parentNode?.removeChild(子);
    子.parentNode = this;
    this.childNodes.splice(i, 0, 子);
    return 子;
  }

  removeChild<T extends 假元素>(子: T): T {
    const i = this.childNodes.indexOf(子);
    if (i >= 0) this.childNodes.splice(i, 1);
    子.parentNode = null;
    return 子;
  }

  remove(): void {
    this.parentNode?.removeChild(this);
  }

  append(...孩子: (假元素 | string)[]): void {
    for (const 孩 of 孩子) {
      if (typeof 孩 === "string") {
        const 节点 = new 假元素("#text");
        节点.文本 = 孩;
        this.appendChild(节点);
      } else {
        this.appendChild(孩);
      }
    }
  }

  replaceChildren(...孩子: 假元素[]): void {
    for (const 旧 of [...this.childNodes]) 旧.parentNode = null;
    this.childNodes = [];
    for (const 孩 of 孩子) this.appendChild(孩);
  }

  contains(目标: 假元素 | null): boolean {
    if (!目标) return false;
    for (let 现在: 假元素 | null = 目标; 现在; 现在 = 现在.parentNode) {
      if (现在 === this) return true;
    }
    return false;
  }

  setAttribute(名: string, 值: string): void {
    this.attributes[名] = 值;
  }

  getAttribute(名: string): string | null {
    return this.attributes[名] ?? null;
  }

  removeAttribute(名: string): void {
    delete this.attributes[名];
  }

  addEventListener(类型: string, 函数: (事件: 假事件) => void): void {
    const 有 = this.listeners.get(类型) ?? [];
    有.push(函数);
    this.listeners.set(类型, 有);
  }

  removeEventListener(类型: string, 函数: (事件: 假事件) => void): void {
    this.listeners.set(类型, (this.listeners.get(类型) ?? []).filter((f) => f !== 函数));
  }

  /** 派发一个事件（测试自己调，模拟浏览器）。 */
  派发(类型: string, 事件: Partial<假事件> = {}): 假事件 {
    const 真 = {
      type: 类型,
      target: this as 假元素,
      defaultPrevented: false,
      preventDefault(): void {
        真.defaultPrevented = true;
      },
      ...事件,
    } as 假事件;
    for (const f of this.listeners.get(类型) ?? []) f(真);
    return 真;
  }

  focus(): void {
    假焦点 = this;
    this.派发("focus");
  }

  blur(): void {
    if (假焦点 === this) 假焦点 = null;
    this.派发("blur");
  }

  setSelectionRange(起: number, 止: number): void {
    this.选区 = [起, 止];
  }

  getBoundingClientRect(): Record<string, number> {
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }

  querySelectorAll(): 假元素[] {
    return [];
  }

  cloneNode(): 假元素 {
    return new 假元素(this.tagName, this.namespaceURI);
  }
}

/** 假事件。`key` 那一类字段由测试自己塞。 */
export type 假事件 = {
  type: string;
  target: 假元素;
  preventDefault: () => void;
  defaultPrevented: boolean;
  key?: string;
};

/** 现在拿着假焦点的那颗元素（`focus()` / `blur()` 会改它）。 */
let 假焦点: 假元素 | null = null;

/** 读现在拿着假焦点的那颗元素（不导出变量本身：跨模块读的是快照，不是活的）。 */
export function 当前焦点(): 假元素 | null {
  return 假焦点;
}

/** 清掉假焦点（每个用例起手调一次）。 */
export function 清焦点(): void {
  假焦点 = null;
}

/**
 * 把假 `document` 装到 `globalThis` 上。**每个测试文件开头调一次**，
 * 之后 `src/editor/math-view.ts` 里的裸 `document` 就指到它。
 */
export function 装假document(): void {
  const 造 = (tag: string): 假元素 => new 假元素(tag);
  (globalThis as unknown as { document: unknown }).document = {
    createElement: 造,
    createElementNS: (ns: string, tag: string) => new 假元素(tag, ns),
    createTextNode: (文本: string) => {
      const 节点 = new 假元素("#text");
      节点.textContent = 文本;
      return 节点;
    },
  };
}

/* ── 找一颗 / 数几颗（2026-10-07 从 `math-view.test.ts` 搬来）─────────────
 *
 * ⚠️ 搬家的理由：这份测试要拆成两份（`math-view.test.ts` 拆出
 * `math-wiring.test.ts`），而这两个小工具**两份都要用**；它们走的又是
 * `假元素` 的 `childNodes`／`classList`，与数学那一摊没有任何关系——
 * 放在 `fake-dom.ts` 里才是它们该在的地方。
 */

/** 在假 DOM 树上按类名找一颗元素（假 DOM 没有 CSS 选择器）。 */
export function 找(根: 假元素, 类名: string): 假元素 | null {
  if (根.classList.contains(类名)) return 根;
  for (const 孩 of 根.childNodes) {
    const 命中 = 找(孩, 类名);
    if (命中) return 命中;
  }
  return null;
}

/** 数一数假 DOM 树上某个类名有几颗。 */
export function 数(根: 假元素, 类名: string): number {
  let n = 根.classList.contains(类名) ? 1 : 0;
  for (const 孩 of 根.childNodes) n += 数(孩, 类名);
  return n;
}
