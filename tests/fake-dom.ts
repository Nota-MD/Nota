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
export class fakeElement {
  readonly tagName: string;
  readonly nodeType = 1;
  readonly namespaceURI: string | null = null;
  parentNode: fakeElement | null = null;
  childNodes: fakeElement[] = [];

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
  selection: [number, number] = [0, 0];

  /**
   * 表单控件的光标位置。⚠️ 真 DOM 里这两条是**只读**属性，所以这里写成
   * getter（`math-view.ts` 的按键补全要读 `selectionStart` 才知道该在哪替换）。
   */
  get selectionStart(): number | null {
    return this.selection[0];
  }

  get selectionEnd(): number | null {
    return this.selection[1];
  }

  readonly style: Record<string, string> & { setProperty: (k: string, v: string) => void } = (() => {
    const table2: Record<string, string> = {};
    return Object.assign(table2, {
      setProperty: (k: string, v: string) => {
        table2[k] = v;
      },
    });
  })();

  readonly dataset: Record<string, string> = {};
  readonly attributes: Record<string, string> = {};
  private readonly listeners = new Map<string, ((event: FakeEvent) => void)[]>();
  /** 文本节点（`tagName === "#TEXT"`）的内容。 */
  text2 = "";

  constructor(tagName: string, namespaceURI: string | null = null) {
    this.tagName = tagName.toUpperCase();
    this.namespaceURI = namespaceURI;
  }

  readonly classList = {
    add: (...className2: string[]): void => {
      const has = new Set(this.className.split(/\s+/).filter(Boolean));
      for (const c of className2) has.add(c);
      this.className = [...has].join(" ");
    },
    remove: (...className2: string[]): void => {
      const has = new Set(this.className.split(/\s+/).filter(Boolean));
      for (const c of className2) has.delete(c);
      this.className = [...has].join(" ");
    },
    contains: (className2: string): boolean => this.className.split(/\s+/).includes(className2),
    toggle: (className2: string, add?: boolean): void => {
      const wantAdd = add ?? !this.classList.contains(className2);
      if (wantAdd) this.classList.add(className2);
      else this.classList.remove(className2);
    },
  };

  /** ⚠️ 恒真，理由见文件头。 */
  get isConnected(): boolean {
    return true;
  }

  get firstChild(): fakeElement | null {
    return this.childNodes[0] ?? null;
  }

  get textContent(): string {
    if (this.tagName === "#TEXT") return this.text2;
    return this.childNodes.map((c) => c.textContent).join("");
  }

  set textContent(value2: string) {
    this.childNodes = [];
    if (value2 === "") return;
    const node = new fakeElement("#text");
    node.text2 = value2;
    this.appendChild(node);
  }

  appendChild<T extends fakeElement>(child3: T): T {
    child3.parentNode?.removeChild(child3);
    child3.parentNode = this;
    this.childNodes.push(child3);
    return child3;
  }

  insertBefore<T extends fakeElement>(child3: T, parameterAccording: fakeElement | null): T {
    const i = parameterAccording ? this.childNodes.indexOf(parameterAccording) : -1;
    if (i < 0) return this.appendChild(child3);
    child3.parentNode?.removeChild(child3);
    child3.parentNode = this;
    this.childNodes.splice(i, 0, child3);
    return child3;
  }

  removeChild<T extends fakeElement>(child3: T): T {
    const i = this.childNodes.indexOf(child3);
    if (i >= 0) this.childNodes.splice(i, 1);
    child3.parentNode = null;
    return child3;
  }

  remove(): void {
    this.parentNode?.removeChild(this);
  }

  append(...child: (fakeElement | string)[]): void {
    for (const child2 of child) {
      if (typeof child2 === "string") {
        const node = new fakeElement("#text");
        node.text2 = child2;
        this.appendChild(node);
      } else {
        this.appendChild(child2);
      }
    }
  }

  replaceChildren(...child: fakeElement[]): void {
    for (const oldValue of [...this.childNodes]) oldValue.parentNode = null;
    this.childNodes = [];
    for (const child2 of child) this.appendChild(child2);
  }

  contains(target: fakeElement | null): boolean {
    if (!target) return false;
    for (let now: fakeElement | null = target; now; now = now.parentNode) {
      if (now === this) return true;
    }
    return false;
  }

  setAttribute(name3: string, value2: string): void {
    this.attributes[name3] = value2;
  }

  getAttribute(name3: string): string | null {
    return this.attributes[name3] ?? null;
  }

  removeAttribute(name3: string): void {
    delete this.attributes[name3];
  }

  addEventListener(type: string, functionNumber: (event: FakeEvent) => void): void {
    const has = this.listeners.get(type) ?? [];
    has.push(functionNumber);
    this.listeners.set(type, has);
  }

  removeEventListener(type: string, functionNumber: (event: FakeEvent) => void): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== functionNumber));
  }

  /** 派发一个事件（测试自己调，模拟浏览器）。 */
  dispatch(type: string, event: Partial<FakeEvent> = {}): FakeEvent {
    const assertValue = {
      type: type,
      target: this as fakeElement,
      defaultPrevented: false,
      preventDefault(): void {
        assertValue.defaultPrevented = true;
      },
      stopPropagation(): void {},
      ...event,
    } as FakeEvent;
    for (const f of this.listeners.get(type) ?? []) f(assertValue);
    return assertValue;
  }

  focus(): void {
    fakeFocusPoint = this;
    this.dispatch("focus");
  }

  blur(): void {
    if (fakeFocusPoint === this) fakeFocusPoint = null;
    this.dispatch("blur");
  }

  setSelectionRange(start5: number, end2: number): void {
    this.selection = [start5, end2];
  }

  getBoundingClientRect(): Record<string, number> {
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }

  querySelectorAll(): fakeElement[] {
    return [];
  }

  cloneNode(): fakeElement {
    return new fakeElement(this.tagName, this.namespaceURI);
  }
}

/** 假事件。`key` 那一类字段由测试自己塞。 */
export type FakeEvent = {
  type: string;
  target: fakeElement;
  preventDefault: () => void;
  stopPropagation: () => void;
  defaultPrevented: boolean;
  key?: string;
};

/** 现在拿着假焦点的那颗元素（`focus()` / `blur()` 会改它）。 */
let fakeFocusPoint: fakeElement | null = null;

/** 读现在拿着假焦点的那颗元素（不导出变量本身：跨模块读的是快照，不是活的）。 */
export function currentFocusPoint(): fakeElement | null {
  return fakeFocusPoint;
}

/** 清掉假焦点（每个用例起手调一次）。 */
export function clearFocusPoint(): void {
  fakeFocusPoint = null;
}

/**
 * 把假 `document` 装到 `globalThis` 上。**每个测试文件开头调一次**，
 * 之后 `src/editor/math-view.ts` 里的裸 `document` 就指到它。
 */
export function installFakedocument(): void {
  const create2 = (tag: string): fakeElement => new fakeElement(tag);
  (globalThis as unknown as { document: unknown }).document = {
    createElement: create2,
    createElementNS: (ns: string, tag: string) => new fakeElement(tag, ns),
    createTextNode: (text2: string) => {
      const node = new fakeElement("#text");
      node.textContent = text2;
      return node;
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
export function find(root: fakeElement, className2: string): fakeElement | null {
  if (root.classList.contains(className2)) return root;
  for (const child2 of root.childNodes) {
    const match = find(child2, className2);
    if (match) return match;
  }
  return null;
}

/** 数一数假 DOM 树上某个类名有几颗。 */
export function number2(root: fakeElement, className2: string): number {
  let n = root.classList.contains(className2) ? 1 : 0;
  for (const child2 of root.childNodes) n += number2(child2, className2);
  return n;
}
