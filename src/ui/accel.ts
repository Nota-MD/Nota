/**
 * 快捷键：把 `commands.ts` 里那句**显示文本**（`"Ctrl+Shift+S"`）解析成
 * 能真正驱动按键分发的东西。
 *
 * # 为什么要有这个文件
 *
 * 2026-09-23 之前，快捷键是**两套真相源**：`commands.ts` 里的 `accel` 只管显示，
 * 真正的绑定是 `App.tsx` 里一条手写的 if-else 长链（`key === "s"` … `key === "n"` …）。
 * 两处之间**没有任何东西保证一致**，而它们确实已经不一致了：
 *
 * - 「偏好设置」写着 `Ctrl+,`——这一项**是实现了的**（菜单里是亮的），可按下去没反应；
 * - `Ctrl+Shift+N` 是「新建窗口」的键位，但那条 `key === "n"` **不看 Shift**，
 *   于是按下去会**新建一篇文档**：菜单上写着 A，做的是 B。
 *
 * 这一类的共同点是**不报错**：按下去什么都不发生，和"这个功能还没做"长得一模一样。
 * 所以这里把它扳成一套——**`accel` 文本是唯一真相源，按键分发反过来查这张表**
 * （见 `buildAccelIndex`）。改键位只需改 `commands.ts` 一处。
 *
 * # 代价：`accel` 写错从此**有后果**了
 *
 * 以前写错只是显示得不对；现在写错 = 那个键位真的不存在。所以
 * `buildAccelIndex` 对**认不出来**和**撞车**两种情况都当场 `console.warn`，
 * 不静默放过——静默失效正是这个文件要消灭的东西。
 *
 * # 平台：`Ctrl` 在 macOS 上指的是 ⌘
 *
 * 标签一律写 `Ctrl`，但它在 macOS 上必须是 ⌘——那不是"额外的
 * 兼容"，是那边的**唯一**命令键。`Cmd` / `Meta` / `Super` 这几个写法一律**归到
 * `ctrl` 这一维**，不另立一维：它们在 mac 上本来就是同一个键，分成两维的话
 * `Ctrl+X` 和 `Meta+X` 会变成两条互不相干的绑定。
 *
 * `parseAccel` / `accelSig` 是纯函数、**与平台无关**；只有 `eventAccel` 和
 * `formatAccel` 需要知道平台，而平台是**参数**（默认取 `IS_MAC`），
 * 于是两边都能在试验台里直接验（见 `tools/menu-harness`）。
 */

import { walkMenuItems, type MenuSpec } from "@/ui/commands";

/** 一条已解析的快捷键。 */
export interface Accel {
  /** 标签里的 `Ctrl`。⚠️ macOS 上指 ⌘。 */
  ctrl: boolean;
  shift: boolean;
  /** 标签里的 `Alt`。macOS 上是 ⌥。 */
  alt: boolean;
  /** 规范化之后的键名，见 `normalizeKey`。 */
  key: string;
}

/** 认平台只看这一处。`navigator.platform` 虽然被标了废弃，但 WebView 里它最准。 */
function detectMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const s = `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
  return /mac|iphone|ipad/i.test(s);
}

/** 模块加载时定一次。⚠️ 它是 `eventAccel` / `formatAccel` 的**默认值**，不是唯一来源。 */
export const IS_MAC = detectMac();

/**
 * 键名的别名表。左边是**怎么写都行**的写法（小写后比对），右边是规范化键名。
 *
 * ⚠️ 箭头键要认**字形**（`↑`）：`commands.ts` 里写的就是 `Alt+↑`。
 * 而浏览器给的是 `e.key === "ArrowUp"`，
 * 不折一道的话这两条永远配不上。
 */
const KEY_ALIASES: Record<string, string> = {
  "↑": "arrowup",
  "↓": "arrowdown",
  "←": "arrowleft",
  "→": "arrowright",
  up: "arrowup",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
  esc: "escape",
  escape: "escape",
  return: "enter",
  enter: "enter",
  space: " ",
  spacebar: " ",
  tab: "tab",
  home: "home",
  end: "end",
  pageup: "pageup",
  pagedown: "pagedown",
  backspace: "backspace",
  del: "delete",
  delete: "delete",
  comma: ",",
  period: ".",
  slash: "/",
  semicolon: ";",
  quote: "'",
  bracketleft: "[",
  bracketright: "]",
  backslash: "\\",
  backquote: "`",
  minus: "-",
  equal: "=",
  plus: "=",
};

/**
 * 修饰键的写法，三种归一到三维。
 *
 * ⚠️ `cmd` / `meta` / `super` / `win` 全部**归到 `ctrl`**，理由见文件头。
 */
const MOD_ALIASES: Record<string, "ctrl" | "shift" | "alt"> = {
  ctrl: "ctrl",
  control: "ctrl",
  cmd: "ctrl",
  command: "ctrl",
  meta: "ctrl",
  super: "ctrl",
  win: "ctrl",
  shift: "shift",
  alt: "alt",
  option: "alt",
  opt: "alt",
};

/** 键名规范化：`"S"` → `"s"`，`"↑"` → `"arrowup"`，`"F11"` → `"f11"`。 */
function normalizeKey(token: string): string {
  const t = token.trim();
  if (!t) return "";
  // 字母、数字、F1..F24 直接小写就是规范形；别名表管剩下的。
  return KEY_ALIASES[t.toLowerCase()] ?? t.toLowerCase();
}

/**
 * 解析一条显示文本。**认不出来返回 `null`**，绝不"尽力而为"。
 *
 * ⚠️ 认不出的**修饰键**会让整条作废，而不是被跳过。跳过的话 `"Ctrl+Foo+S"`
 * 会静默退化成 `Ctrl+S`——一个**写错的键位冒充了另一个能用的键位**，
 * 那比"这条快捷键不存在"难查得多（按下去真的有反应，只是反应错了）。
 */
export function parseAccel(text: string): Accel | null {
  // ⚠️ 字面的加号键写不出来（`"Ctrl++"` 会被切成 `["Ctrl","",""]`）。
  // 要用它得写 `Plus`——上面别名表里 `plus` 和 `equal` 都指向 `=`。
  // 不改词法：真让 `"Ctrl++"` 成立就得写一套带引号的词法，
  // 而全仓库一条这样的键位都没有。
  const parts = text
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean);
  const last = parts.pop();
  if (!last) return null;

  const accel: Accel = { ctrl: false, shift: false, alt: false, key: "" };
  for (const part of parts) {
    const mod = MOD_ALIASES[part.toLowerCase()];
    if (!mod) return null;
    accel[mod] = true;
  }

  const key = normalizeKey(last);
  if (!key) return null;
  accel.key = key;
  return accel;
}

/**
 * 一条快捷键的**签名**，用来当查表的键。
 *
 * ⚠️ 格式不重要，**稳定**才重要：同一个键位必须永远算出同一个字符串。
 * 三个布尔各占一格（`-` 表示没有），免得 `Ctrl+Shift+S` 和 `Ctrl+S` 撞上。
 */
export function accelSig(a: Accel): string {
  return `${a.ctrl ? "c" : "-"}${a.shift ? "s" : "-"}${a.alt ? "a" : "-"}:${a.key}`;
}

/**
 * 物理键位 → 规范键名。浏览器给 `e.code`，但它的拼法（`KeyS` / `Digit1`）
 * 和本仓的规范键名不是一回事，所以要一张对照表。
 */
const CODE_TO_KEY: Record<string, string> = {
  Minus: "-",
  Equal: "=",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Backquote: "`",
  ArrowUp: "arrowup",
  ArrowDown: "arrowdown",
  ArrowLeft: "arrowleft",
  ArrowRight: "arrowright",
  Escape: "escape",
  Enter: "enter",
  NumpadEnter: "enter",
  Space: " ",
  Tab: "tab",
  Backspace: "backspace",
  Delete: "delete",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
};
// `Digit0`..`Digit9`、`KeyA`..`KeyZ`、`F1`..`F24` 都有规律，生成比手抄少一个错字的机会。
//
// ⚠️⚠️ **数字那一行漏过，而且是静默的。** 试验台第一次跑 `#accel` 就抓到了：
// 少了 `Digit1` 之后 `e.code` 查不到，代码退回 `e.key`——**不带 Shift 时
// `e.key` 恰好就是 `"1"`**，于是 `Ctrl+1` 照样能用，窟窿被盖住了；
// 只有 `Ctrl+Shift+1` 这种会露馅（那边 `e.key` 是上档字符 `"!"`），
// 而它正是历史上踩过的那两条。**"多数用例能过"不等于"对"。**
for (let i = 0; i <= 9; i++) CODE_TO_KEY[`Digit${i}`] = String(i);
for (let i = 0; i < 26; i++) {
  const upper = String.fromCharCode(65 + i);
  CODE_TO_KEY[`Key${upper}`] = upper.toLowerCase();
}
for (let i = 1; i <= 24; i++) CODE_TO_KEY[`F${i}`] = `f${i}`;

/**
 * 事件上的键名。
 *
 * ⚠️⚠️ **物理键位（`e.code`）优先，`e.key` 只是兜底。**
 *
 * 这条是有来历的，不是洁癖：按着 Shift 敲数字排，`e.key` 拿到的是**上档字符**——
 * Shift+1 是 `"!"`、Shift+3 是 `"#"`。仓库里曾经有两条快捷键
 * （`Ctrl+Shift+1` 大纲、`Ctrl+Shift+3` 文件树）判的就是 `key === "1"`，
 * 于是**永远不成立**，变成了"按了没反应"的死代码（`docs/07` 2026-09-23 那条）。
 * `e.code` 是物理键位，不随 Shift 变，也不随输入法的中英状态变。
 *
 * 取不到 `code` 才退回 `e.key`（某些输入法合成的按键没有 `code`）。
 */
function eventKey(e: KeyboardEvent): string {
  return CODE_TO_KEY[e.code] ?? e.key.toLowerCase();
}

/**
 * 把一次 `keydown` 归一成 `Accel`，好拿去查表。
 *
 * `mac` 是参数而不是直接读 `IS_MAC`，是为了让试验台能在 Linux 上把两条平台
 * 分支都跑一遍——这个模块里唯一"在另一台机器上才走得到"的就是这里。
 */
export function eventAccel(e: KeyboardEvent, mac: boolean = IS_MAC): Accel {
  return {
    // ⚠️ mac 上命令键是 ⌘（`metaKey`），不是 `ctrlKey`。
    // 反过来，mac 上单独按 Control+N 不该触发「新建」——那边的 `Ctrl` 是另一个键。
    ctrl: mac ? e.metaKey : e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    key: eventKey(e),
  };
}

/** macOS 菜单里有专门符号的键。顺序按 Apple 的惯例：⌥ ⇧ ⌘ 排在字符前。 */
const MAC_GLYPH: Record<string, string> = {
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  escape: "esc",
  enter: "↩",
  backspace: "⌫",
  delete: "⌦",
  tab: "⇥",
  " ": "Space",
  pageup: "⇞",
  pagedown: "⇟",
  home: "↖",
  end: "↘",
};

/**
 * 显示用的键位文本。**在 macOS 上换成符号写法**（`Ctrl+Shift+S` → `⇧⌘S`）。
 *
 * 不换的话，mac 用户看到菜单写着 `Ctrl+S` 会去按 Control+S——那边那是另一个键，
 * 按下去不会有反应。菜单写着做不到的事，正是这个仓库最不愿意留的东西。
 *
 * ⚠️ 兜底那一步是 `toUpperCase()` 而不是原样：`"F11"` 规范化之后是 `"f11"`，
 * 原样显示会变成小写的 `f11`，看着像个错字。规矩是**先查符号表，查不到就大写**——
 * `"f11"` → `"F11"`、`","` → `","`、`` "`" `` → `` "`" ``，三类都对。
 *
 * 认不出来就**原样返回**：显示成原文至少还是用户自己写的那串，
 * 瞎猜一个反而会显示成一条错误的键位。
 */
export function formatAccel(text: string, mac: boolean = IS_MAC): string {
  if (!mac) return text;
  const a = parseAccel(text);
  if (!a) return text;

  let out = "";
  if (a.alt) out += "⌥";
  if (a.shift) out += "⇧";
  if (a.ctrl) out += "⌘";
  out += MAC_GLYPH[a.key] ?? a.key.toUpperCase();
  return out;
}

/**
 * 键位签名 → 命令 id。**按键分发的全部依据。**
 *
 * 从 `MENUS` 派生（含子菜单，走 `walkMenuItems`——只扫顶层会把子菜单里的
 * `edit.copyAsMarkdown` 漏掉，那条 `Ctrl+Shift+C` 就在里面）。
 *
 * 两种病态都当场喊出来，不静默：
 * 1. **解析不出来**——写了 `"Ctrl+Foo+S"` 这种，那个键位实际不存在；
 * 2. **撞车**——两个命令写了同一个键位。先到先得，但要说清谁生效。
 *
 * ⚠️ 这里**不**管命令实现没实现、有没有活动文档。那是 `disabledCommands`
 * 的事（`App.tsx`），两件事分开：这张表回答"这个键位归谁"，
 * 那张表回答"这个命令现在能不能跑"。
 */
export function buildAccelIndex(menus: readonly MenuSpec[]): Map<string, string> {
  const index = new Map<string, string>();

  walkMenuItems(menus, (item) => {
    if (!item.accel) return;

    const accel = parseAccel(item.accel);
    if (!accel) {
      console.warn(
        `[nota] 菜单项 ${item.id} 的快捷键 "${item.accel}" 认不出来，这个键位不会被绑定`,
      );
      return;
    }

    const sig = accelSig(accel);
    const prev = index.get(sig);
    if (prev) {
      console.warn(
        `[nota] 快捷键 "${item.accel}" 同时给了 ${prev} 和 ${item.id}，${prev} 生效`,
      );
      return;
    }
    index.set(sig, item.id);
  });

  return index;
}

/**
 * 事件是不是发生在**编辑器之外**的输入控件里（设置对话框的输入框、搜索框……）。
 *
 * 有它才敢把 `Ctrl+Z` 这类键位交给菜单表：没有它的话，在设置里那个文本框里
 * 按 Ctrl+Z，撤的会是**文档**，而不是刚打的字——文本框自己的撤销被抢走了。
 *
 * ⚠️ 编辑器本身也是 `contenteditable`，所以要**先**把它排除掉，
 * 否则文档里一条快捷键都用不了。
 *
 * ⚠️ **别把"编辑器里的 `input` / `textarea`"也塞进这一档**（2026-09-26 试过、
 * 当天撤销）：公式源码框与图表源码框都在 `.editor-pane` 里，让它们"算外面"
 * 之后，源码框里的 **`Ctrl+S` 会一起失效**——在框里改完公式按保存，文件根本
 * 没写下去（无头窗口实测：状态栏停在"已修改"、磁盘字节不变）。
 * 编辑器内的 `Ctrl+A` 另有其人（见 `docs/07` §2 BUG-37），不归这里管。
 */
export function isOutsideEditor(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  if (el.closest(".editor-pane")) return false;
  return el.closest("input, textarea, select, [contenteditable='true']") !== null;
}
