/**
 * 右键菜单：**整个接管**，自己画一份中文的。
 *
 * # 为什么要接管
 *
 * 用户 2026-10-04 报的：右键弹出来的是 WebKitGTK **自己那份英文菜单**
 * （`Cut / Copy / Paste / Paste As Plain Text / … / Inspect Element`），很割裂。
 * 那份文案来自 WebKit 自己的 gettext 目录、受**进程 locale** 控制——**和 Nota
 * 的语言设置（`src/i18n/`）没有半点关系**，所以改不动。唯一的路是拦掉重画：
 * `contextmenu` 里 `preventDefault()`，然后自己画。
 *
 * ⚠️ **「拦得住」有先例**：`ui/TabBar.tsx` 早就这么干过（标签上那份菜单），
 * 那边的注释写着"不拦的话 WebKitGTK 会弹出它自己那份默认菜单"。这一份
 * 只是把同一件事做到**全应用**。
 *
 * # 形状是谁定的
 *
 * 用户给了两张图：一张是本应用现在那份英文的，一张是 **Typora 的**，并说
 * "不一定要模仿，但是可以参考"。定下来的形状（三排图标 ＋ 两栏子菜单）写在
 * `ui/context-menu.ts` 的 `给行` 里——**那张表在那边，这里只管画和走**。
 *
 * # 三件事各自住在哪
 *
 * | 住哪 | 管什么 |
 * |---|---|
 * | `ui/context-menu.ts` | 条目表、落点判据、行内翻格。**纯的**，所以有单测 |
 * | 本文件下半（`ContextMenuPanel`） | 画：行的长相、坐标、子菜单、漫游焦点 |
 * | 本文件上半（`ContextMenu`） | 听：全局那一个 `contextmenu`、分流、派发 |
 *
 * # ⚠️ 键盘：为什么图标行整排只算**一个**落点
 *
 * `ui/useMenuRovingFocus.ts` 是**线性**的（↑↓ 走一格），塞不下"一排四颗图标、
 * ←→ 在排里走"。做法是：**整排注册成一个落点**，排里当前那一颗拿 `tabIndex=0`、
 * 其余 `-1`；←→ 由本文件经 `onRight`/`onLeft` 两个回调**在排内翻格**
 * （`context-menu.ts` 的 `行内下一格`），↑↓ 照旧交给那个 hook 在排与排之间走。
 *
 * ⚠️ **没有第二套 keydown**：早先想过"排容器自己吃 ←→ 再 stopPropagation"，
 * 那条路要跟 hook 抢同一个按键、还要自己维护"焦点落在排里哪一颗"，等于把
 * `useMenuRovingFocus` 重写一半。走 `onRight`/`onLeft` 就一个回调的事。
 *
 * ⚠️ **一整排全灰时整排算灰**（`整行灰`），漫游会跳过去——否则焦点会落到一个
 * `disabled` 的按钮上，`focus()` 无声失败、焦点掉到 `<body>`，这个菜单的
 * Esc 就再也关不掉了（`useMenuRovingFocus.ts` 的 `findEdgeEnabled` 那段写着）。
 *
 * # ⚠️ 两个必踩的坑，都照抄了现有写法
 *
 * 1. **`onMouseDown` 里 `preventDefault`**（`ui/FormatBar.tsx` 那一段）：不拦
 *    的话，按钮会把编辑区的选区**先抢走**，于是命令跑在一个已经塌掉的光标上
 *    ——「加粗」会变成"在原地插两个星号"。右键菜单比工具栏更依赖这一条：
 *    用户就是**先选中、再右键**的。
 * 2. **`mousedown` 关菜单要跳过自己**（`ui/MenuBar.tsx` 那一段）：用 `mousedown`
 *    不是 `click`（`click` 要等鼠标抬起，期间菜单还开着）。但子菜单是 portal
 *    到 `document.body` 的，所以判据得是"在**我这套**浮层里"，不能只看面板本身
 *    ——见下面 `data-context-menu` 那个标记。
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { writeClipboard } from "@/editor/code-block";
import type { CommandState } from "@/editor/command-state";
import { useT } from "@/i18n";
import { formatAccel } from "@/ui/accel";
import { getItem } from "@/ui/commands";
import { popupSelfSelfAtRoll } from "@/ui/popup-scroll";
import { api } from "@/bridge/ipc";
import {
  currentLanguageLabel,
  findView,
  replaceReplaceCombineWrite,
  heavyNewValueCheckCombineWrite,
} from "@/editor/spell-check";
import {
  combineWriteAddWordDictionary,
  combineWriteIgnoreOmit,
  combineWriteReplaceReplacePrefix,
  buildRows,
  inlineBelowValueCell,
  determineDropPoint,
  wholeLineDisabled,
  disabledForLocation,
  type line3,
  type DropPoint,
} from "@/ui/context-menu";
import { pressButtonTable, isButtonActive, notice, characterShapeClass } from "@/ui/FormatBar";
import { Icon, type iconName } from "@/ui/Icon";
import { SubMenu } from "@/ui/MenuPopup";
import type { Toast } from "@/ui/Toasts";
import { findEdgeEnabled, useMenuRovingFocus } from "@/ui/useMenuRovingFocus";

/** 翻译函数。`useT()` 的返回值——写在这里免得每处再抄一遍它的类型。 */
type FlipTranslate = ReturnType<typeof useT>;

/**
 * 剪贴板那四颗的图标。
 *
 * ⚠️ 它们**不在** `FormatBar.tsx` 的 `按钮表` 里：那张表是**格式**按钮，
 * 而这四条是剪贴板动作——分界是"是不是一条格式命令"，不是"长得像不像按钮"。
 * 所以这一小张表住在这里，是**唯一**一份，不是第二份。
 */
const cutPasteBoardIcon: Record<string, iconName> = {
  "edit.cut": "folio-edit-cut-symbolic",
  "edit.copy": "folio-edit-copy-symbolic",
  "edit.paste": "folio-edit-paste-symbolic",
  // 「删除」那颗。⚠️ 挑的是**圆圈 + 叉**，不是垃圾桶——那枚文件头上写着
  // 「与垃圾桶图标区分开」。理由：它紧挨着剪切/复制/粘贴，垃圾桶形会让人读成
  // "把这段从剪贴板里扔掉"，而它其实只是删掉选中的字。
  "edit.delete": "folio-delete-symbolic",
};

/**
 * 这颗按钮画什么：先问 `FormatBar` 那张表，再问上面这张剪贴板表。
 *
 * ⚠️ `undefined` 是**正常结果**（`fmt.code` 就是）：那一枚在这套图标里没有对应
 * 形状，而它本来就该画 `</>` 这个**文字字形**（`FormatBar.tsx` 那条写着
 * "文字字形只留给拉丁字母"）。调用方据此退到字形，不是当错误处理。
 */
function getIcon(id: string): iconName | undefined {
  return pressButtonTable.get(id)?.icon ?? cutPasteBoardIcon[id];
}

/**
 * 这颗按钮没有图标时画的那个字形。
 *
 * ⚠️ **先问 `FormatBar` 那张表**（`</>` / `H1` / `•` / `1.` / `{ }` 都在它手里），
 * 拿不到才退到 `MENUS` 的 `label`。反过来的话，`fmt.code` 会画成英文单词
 * "Code"——那个 16px 的方格里塞不下，而且和旁边两颗真图标对不上号。
 */
function getCharacterShape(id: string): string {
  return pressButtonTable.get(id)?.label ?? getItem(id)?.label ?? "?";
}

// ── 输入框那一档 ───────────────────────────────────────────────────────────

/** 右键那一刻的输入框，以及它的选区。 */
interface InputBoxScene {
  element: HTMLInputElement | HTMLTextAreaElement;
  /**
   * 右键那一刻的选区。
   *
   * ⚠️ **必须先记下来**：菜单一开，`useMenuRovingFocus` 会立刻把 DOM 焦点
   * 挪到菜单的第一项上（`useMenuRovingFocus.ts` 那条 `useLayoutEffect`）。
   * 而这一档里有三条（撤销 / 重做 / 全选）要靠 `execCommand`，它作用在
   * **当前聚焦的那个可编辑元素**上——焦点跑了，那三条就作用在菜单按钮上，
   * 等于全废。所以点条目时先把焦点和选区**复原**（`还焦`）。
   */
  start5: number | null;
  end2: number | null;
}

/**
 * 把焦点和选区还回那个输入框。**还成功了没有由返回值说了算**。
 *
 * ⚠️ **返回值不是可选项**，2026-10-04 开窗口检量到过一个**会毁文档**的后果：
 * 在代码块的语言搜索框里让「全选」落地时，那三条 `execCommand` 是作用在
 * **当前聚焦的那个可编辑元素**上的；而焦点要是没还成，它作用的就是**整个
 * 文档**——量到的画面是标题、段落、代码块全被选蓝（再打一个字就是全篇替换）。
 * 所以调用方必须先问这一句，没还成就**什么都别做**。
 *
 * ⚠️ 还**为什么会**没还成：那个框可能已经不在文档里了。最小的一份是语言
 * 搜索框——它的关闭动作挂在 `document` 的**捕获阶段**
 *（`editor/lang-picker.ts::全局按键`），比我们的菜单（React，在根容器上冒泡）
 * **先**收到同一个按键，于是它收下语言、收起自己、把那个输入框**卸载**掉。
 * `focus()` 一个已经从文档里摘掉的节点是空操作，`activeElement` 还停在别处。
 */
function returnFocus(scene2: InputBoxScene): boolean {
  if (!scene2.element.isConnected) return false;
  if (document.activeElement !== scene2.element) scene2.element.focus();
  // ⚠️ 焦点回来了还不够：`blur` 那一下会把输入框里的选区**清掉**，而
  // 剪切/复制要用的正是"用户右键那一刻选中的那一段"（`选中了` 读的是活选区）。
  if (scene2.start5 !== null && scene2.end2 !== null) {
    try {
      scene2.element.setSelectionRange(scene2.start5, scene2.end2);
    } catch {
      // ⚠️ 有些 `type`（number / email…）不支持选中，会**抛**。那不是错误，
      // 只是这一类输入框里没有"选中一段"这回事——上面 `选中了` 也早就返回空了。
    }
  }
  return document.activeElement === scene2.element;
}

/** 现在选中的那一段。没选中返回 `null`（**不是错误**，是"还没选"）。 */
function selectedDone(scene2: InputBoxScene): { text4: string; start5: number; end2: number } | null {
  const a = scene2.element.selectionStart;
  const b = scene2.element.selectionEnd;
  if (a === null || b === null || a === b) return null;
  return { text4: scene2.element.value.slice(a, b), start5: a, end2: b };
}

/**
 * 换掉一段文字，并**通知宿主**。
 *
 * ⚠️ `setRangeText` 是脚本发起的改动，**浏览器不会替我们派 `input` 事件**。
 * 而这个输入框多半是 React 的受控组件（比如设置面板里那些），不派事件的话
 * **值改了、界面不更新**——用户看到的是"点了剪切，字还在"，比不做还糟。
 */
function replaceRemove(scene2: InputBoxScene, text4: string, start5: number, end2: number): void {
  // ⚠️ **还不成焦点就什么都别做**（理由见 `还焦`）：`setRangeText` 本身不会
  // 误伤文档，但同一条路上下面那些 `execCommand` 会——两道口子用同一个守卫，
  // 免得"这条守了、那条忘了"。
  if (!returnFocus(scene2)) return;
  scene2.element.setRangeText(text4, start5, end2, "end");
  scene2.element.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * 输入框那一档的动作。
 *
 * ⚠️ 这些 id **和 `MENUS` 里那几条同名**（`edit.cut` / `edit.copy`…），借用
 * 它们是为了**共用一个译文**（见 `ui/context-menu.ts` 那段）。但**实现是
 * 另一套**：命令表那份是给编辑区（ProseMirror）排文档的，这里要作用在一个
 * DOM 输入框上。所以这一档**不经过** `menuHandlers`。
 *
 * ⚠️ 写剪贴板一律走 `writeClipboard`（`editor/code-block.ts`）——本仓**唯一**
 * 一条写剪贴板的路。另写一条（比如 `execCommand("copy")`）的症状是"同一个
 * 动作两个结果"，而那种毛病极难被当成同一个 bug 报上来（那条头注写着）。
 */
async function dropToInputBox(id: string, scene2: InputBoxScene, t: FlipTranslate, toast: notice): Promise<void> {
  switch (id) {
    case "edit.undo":
    case "edit.redo":
    case "edit.select": {
      // ⚠️ **还不成焦点就什么都别做**：焦点没回来，`execCommand` 作用的是
      // **整个文档**——量到过一次"全篇被选蓝"（见 `还焦` 那段）。
      if (!returnFocus(scene2)) return;
      const command = id === "edit.undo" ? "undo" : id === "edit.redo" ? "redo" : "selectAll";
      // ⚠️ `execCommand` 被标了弃用，但输入框上的撤销/重做/全选**没有替代品**：
      // 那是浏览器自己的编辑历史，JS 侧根本拿不到。仓库里已有先例
      // （`code-block.ts` 的 `writeClipboard` 就靠它兜底，注释写着"它是唯一
      // 不依赖权限的写法"）。⚠️ 这一段是否真能用**必须开窗实测**，见 `docs/06`。
      document.execCommand(command);
      return;
    }
    case "edit.copy": {
      const s = selectedDone(scene2);
      if (!s) {
        toast(t("Select some text first."), "info");
        return;
      }
      const become = await writeClipboard(s.text4);
      toast(become ? t("Copied to clipboard") : t("Could not copy: the system refused to write to the clipboard."), become ? "success" : "error");
      return;
    }
    case "edit.cut": {
      const s = selectedDone(scene2);
      if (!s) {
        toast(t("Select some text first."), "info");
        return;
      }
      // ⚠️ **顺序不能反**：先复制、成功了再删。反过来一旦写剪贴板失败，
      // 用户选中的那段字就没了（`useClipboard.ts::剪切` 那段写着为什么）。
      const become = await writeClipboard(s.text4);
      if (!become) {
        toast(t("Could not copy: the system refused to write to the clipboard."), "error");
        return;
      }
      replaceRemove(scene2, "", s.start5, s.end2);
      return;
    }
    case "edit.paste": {
      if (!returnFocus(scene2)) return;
      let text4: string;
      // ⚠️ 连属性访问都要包在 try 里：不是安全上下文时 `navigator.clipboard`
      // **整个对象都不存在**（同 `useClipboard.ts::粘贴` 那一段）。
      try {
        text4 = await navigator.clipboard.readText();
      } catch {
        toast(t("The system does not allow reading the clipboard from the menu — press Ctrl+V to paste."), "warn");
        return;
      }
      if (!text4) {
        toast(t("There is no text in the clipboard."), "info");
        return;
      }
      replaceRemove(scene2, text4, scene2.element.selectionStart ?? 0, scene2.element.selectionEnd ?? 0);
      return;
    }
    default:
      return;
  }
}

/** `toast` 的形状。写成别名只是为了上面那个函数签名短一点。 */
type notice = (message: string, level?: Toast["level"]) => void;

/**
 * 拼写那一段的三条（建议 / 加入词典 / 忽略）。
 *
 * ⚠️ **它为什么和 `落到输入框` 一样住在这儿**：这几条的 id 是运行时的
 * （`spell.replace:2` 这种东西没法进 `MENUS`），而它们的实现要用到"用户刚才
 * 右键的是哪一个错词"——那是**只有这一层才握着**的现场（见 `拼写现场`）。
 *
 * ⚠️ 「加入词典」与「忽略」**是两件事**，别看着像就合成一条：
 * 前者落盘（`dictionaries/user-words.txt`，以后一直算对），后者只在本次运行里
 * 算对（重开软件照旧标）。并成一个的话用户点哪一次都是猜。
 */
function dropToCombineWrite(id: string, scene: CombineWriteScene | null, toast: notice): void {
  if (!scene) return;
  // ⚠️ 菜单开着这几百毫秒里文档可能被改过（外部改动、自动保存那一路会重画
  // 正文）。节点已经不在文档里时 `posAtDOM` 会抛——先查一下，什么都不做
  // 也比抛出去强（用户看到的是"点了一下没反应"，不是一屏红字）。
  if (!scene.element.isConnected) return;
  const view = findView(scene.element);
  if (!view) return;

  if (id === combineWriteAddWordDictionary || id === combineWriteIgnoreOmit) {
    const doValue2 = id === combineWriteAddWordDictionary ? api.spell.wordAdd(scene.word) : api.spell.wordIgnore(scene.word);
    void doValue2
      // ⚠️ 做完**立刻重查**（不走去抖）：用户要的是"这一下就没了"，
      // 再等 600 毫秒看着像没生效（`重新查拼写` 那段写着）。
      .then(() => heavyNewValueCheckCombineWrite(view))
      .catch((e) => {
        // ⚠️ 写用户词表失败（配置目录只读那种）**要说出来**：静默吞掉的话
        // "加入词典"在用户眼里就是个坏掉的功能。
        toast(String(e), "error");
      });
    return;
  }

  if (!id.startsWith(combineWriteReplaceReplacePrefix)) return;
  const belowMark = Number(id.slice(combineWriteReplaceReplacePrefix.length));
  const createProposal = scene.createProposalPlural[belowMark];
  if (!createProposal) return; // 理论上到不了：那一列的下标就是这一刻刚拉回来的
  // ⚠️ 范围是**这一刻**从 DOM 上算的，不是菜单打开时算的：文档在这之间可能
  // 移过位，而那个 span 是跟着文档重画的——拿现在这个算，画到的才是用户
  // 眼睛看到的那个词。
  const from = view.posAtDOM(scene.element, 0);
  replaceReplaceCombineWrite(view, from, from + scene.word.length, createProposal);
}

// ── 画 ─────────────────────────────────────────────────────────────────────

interface PanelWiring {
  line3: line3[];
  /** 右键那一下的位置（视口坐标）。 */
  DropPoint: { top: number; left: number };
  /** 灰名单，原样从 `ui/useMenus.ts` 来。见 `context-menu.ts::整行灰`。 */
  disabled2: ReadonlySet<string>;
  /** 可勾选项的状态（子菜单里那些带勾的要用）。 */
  check: Record<string, boolean>;
  /** 光标状态。只用来决定图标亮不亮（`null` = 读不出来，源码模式）。 */
  cursor: CommandState | null;
  /** 选中一条真命令。子菜单父项**不会**走到这里。 */
  onPick: (id: string) => void;
  /** 关掉整条链（Esc / Tab / 点到别处）。 */
  onDismiss: () => void;
  /** `aria-label`。 */
  label: string;
}

function ContextMenuPanel(p: PanelWiring) {
  const { line3: rows, DropPoint, disabled2, check, cursor, onPick, onDismiss, label } = p;
  const t = useT();

  /**
   * 把渲染行**摊平**成漫游条目——分隔线不是落点。
   *
   * ⚠️ 摊平之后每条真行**自带**自己的漫游下标（`下标` 那本账），渲染时不必
   * "按行号查一张对照表"。`ui/MenuPopup.tsx::layout` 是同一条理由，那边的
   * 注释把代价说全了（`noUncheckedIndexedAccess` 下每处都得再判一次空）。
   */
  const { item, belowMark } = useMemo(() => {
    const item: line3[] = [];
    const belowMark = new Map<string, number>();
    for (const r of rows) {
      if (r.kind === "sep") continue;
      belowMark.set(r.key, item.length);
      item.push(r);
    }
    return { item, belowMark };
  }, [rows]);

  /** 图标行里当前落在第几颗（按**行的 key** 记，不是按行号）。 */
  const [InlinePosition, setInlinePosition] = useState<Record<string, number>>({});
  /** 哪个子菜单开着（漫游下标）。`null` = 没开。 */
  const [childOpen, setChildOpen] = useState<number | null>(null);
  const [childAnchor, setChildAnchor] = useState<{
    top: number;
    left: number;
    parentLeft: number;
  } | null>(null);

  const panel = useRef<HTMLDivElement>(null);
  const lineButton = useRef(new Map<string, HTMLElement | null>());
  const cellButton = useRef(new Map<string, HTMLButtonElement | null>());
  /**
   * `roving.focusedIndex` 的镜像。
   *
   * ⚠️ **存在的唯一理由**：`useMenuRovingFocus` 的 `onRight` 回调能拿到
   * `(item, index)`，而 `onLeft` **一个参数都没有**（见那个 hook 的签名）。
   * 排内往左翻要问"现在这一排是哪一排"，只能从这里拿。
   */
  const focusPoint = useRef(-1);

  const [position2, setPosition] = useState(DropPoint);
  // 量一下自己多大，再夹回视口里：底下放不下就往上提，右边放不下就往左挪。
  // ⚠️ 必须**量**，不能按"行数 × 行高"算——行高是 CSS 说了算的（跟着界面风格
  // 的 `--control-height` 走）。这段照抄 `MenuPopup.tsx::SubMenu` 那一条。
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    setPosition({
      top: Math.max(8, Math.min(DropPoint.top, window.innerHeight - el.offsetHeight - 8)),
      left: Math.max(8, Math.min(DropPoint.left, window.innerWidth - el.offsetWidth - 8)),
    });
  }, [DropPoint]);

  /** 这一排里当前该落哪一颗。**必落在能用的一颗上**（全灰则 -1）。 */
  function inlineDropPoint(r: line3): number {
    if (r.kind !== "icons") return -1;
    const canUse = r.ids.map((id) => ({ disabled: disabled2.has(id) }));
    const already = InlinePosition[r.key];
    if (already !== undefined && !canUse[already]?.disabled) return already;
    return findEdgeEnabled(canUse, 1);
  }

  /** 把这一排的落点挪到第 `格` 颗，并**真的**把焦点移过去。 */
  function dropCell(r: line3, cell2: number): void {
    if (r.kind !== "icons") return;
    setInlinePosition((m) => ({ ...m, [r.key]: cell2 }));
    // ⚠️ 自己 `focus()`，不指望下面那条跟着 `focusedIndex` 走的 effect：
    // 排内翻格**不改** `focusedIndex`（还是同一排），state 没变 → 不重渲染
    // → effect 根本不跑。同一个坑 `useMenuRovingFocus.ts::focusItem` 记过一次。
    cellButton.current.get(`${r.key}:${cell2}`)?.focus();
  }

  function closeChildren(): void {
    setChildOpen(null);
    setChildAnchor(null);
  }

  /** 展开第 `行下标` 条的子菜单，并把锚点记在**父项右边沿**。 */
  function openChild(rowIndex: number): void {
    const r = item[rowIndex];
    if (!r || r.kind !== "item" || !r.spec.submenu) return;
    const el = lineButton.current.get(r.key);
    if (!el) return;
    const b = el.getBoundingClientRect();
    // 左边缘**减去 4px 叠到父项上**，中间不留缝——留缝的话鼠标从父项移到子菜单
    // 的路上会经过一条"谁都不属于"的带子，菜单自己就关了（`MenuPopup` 那段）。
    setChildAnchor({ top: b.top, left: b.right - 4, parentLeft: b.left });
    setChildOpen(rowIndex);
  }

  const roving = useMenuRovingFocus<{ disabled?: boolean }>({
    items: item.map((r) => ({ disabled: wholeLineDisabled(r, disabled2) })),
    onActivate: (_it, i) => {
      const r = item[i];
      if (!r) return;
      if (r.kind === "icons") {
        const id = r.ids[inlineDropPoint(r)];
        if (id && !disabled2.has(id)) onPick(id);
        return;
      }
      // ⚠️ 这一行不能省：`条目` 的类型里还留着 `sep`（摊平时滤掉的是**运行时**
      // 的分隔线，类型上没法表达"这里没有 sep"），不收窄的话下面 `r.spec`
      // 在 `sep` 那一支上不存在。
      if (r.kind !== "item") return;
      if (r.spec.submenu) {
        // 有子菜单的那条：回车是"展开/收起"，不是"执行"（同 `MenuPopup`）。
        if (childOpen === i) closeChildren();
        else openChild(i);
        return;
      }
      if (!disabled2.has(r.spec.id)) onPick(r.spec.id);
    },
    onDismiss,
    onRight: (_it, i) => {
      const r = item[i];
      if (!r) return;
      if (r.kind === "icons") {
        const canUse = r.ids.map((id) => ({ disabled: disabled2.has(id) }));
        const current = inlineDropPoint(r);
        const belowValueCell = inlineBelowValueCell(canUse, current, 1);
        if (belowValueCell !== current) dropCell(r, belowValueCell);
        return;
      }
      if (r.kind !== "item") return; // 同上：类型上还留着 `sep`
      if (r.spec.submenu) openChild(i);
    },
    onLeft: () => {
      // ⚠️ `onLeft` 收不到下标（hook 的签名就那样），只能照镜子拿。
      const r = item[focusPoint.current];
      if (!r || r.kind !== "icons") return;
      const canUse = r.ids.map((id) => ({ disabled: disabled2.has(id) }));
      const current = inlineDropPoint(r);
      const aboveValueCell = inlineBelowValueCell(canUse, current, -1);
      if (aboveValueCell !== current) dropCell(r, aboveValueCell);
    },
  });
  focusPoint.current = roving.focusedIndex;

  return (
    <div
      ref={panel}
      // ⚠️ `menu-sub` 那一套类名是**借**的（不是 `menu-popup`）：`.menu-sub` 是
      // `position: fixed` ＋ 坐标自己给 ＋ 没有"挂在某个东西下面"的假设，正好是
      // 右键菜单要的；`.menu-popup` 的 `top: calc(100% + 5px)` 是"挂在菜单栏
      // 那一栏下面"，拿过来还得把它按掉。行与分隔线那两条类名是真共用。
      //
      // ⚠️ `data-context-menu` 是给"点到别处就关"那条监听认路的：子菜单
      // portal 到 `document.body`，和面板**没有** DOM 亲缘关系，只看面板本身
      // 会把点在自己子菜单上的那一下当成"点到别处"。所以两边都挂这个标记。
      className="menu-sub context-menu"
      data-context-menu=""
      role="menu"
      aria-label={label}
      style={{ top: position2.top, left: position2.left }}
      onKeyDown={roving.handleKeyDown}
    >
      {rows.map((r) => {
        if (r.kind === "sep") {
          return <div className="menu-sep" key={r.key} role="separator" />;
        }

        const index = belowMark.get(r.key) ?? -1;

        if (r.kind === "icons") {
          const current = inlineDropPoint(r);
          return (
            <div
              className="menu-icon-row"
              key={r.key}
              role="group"
              ref={(n) => {
                lineButton.current.set(r.key, n);
              }}
            >
              {r.ids.map((id, i) => {
                const spec = getItem(id);
                const PressButton = pressButtonTable.get(id);
                const shape = getIcon(id);
                const thisDisabled = disabled2.has(id);
                const isCurrent = i === current;
                // ⚠️ **整排算一个漫游落点，所以"停在哪一颗"得自己画**（见文件头）。
                // 不能借 `bars.css` 给工具栏那条 `:focus-visible` 的焦点圈：菜单一开
                // 是**我们用脚本**把焦点放上去的，WebKit 不把它当"键盘操作"，那一圈
                // 根本不画——2026-10-04 开窗放大 300% 量过，剪刀那颗干干净净，
                // 于是键盘走到这一排上时屏幕上什么都没有。所以自己挂属性（见
                // `styles/menubar.css` 里 `.menu-icon-row .format-btn[data-current]`）。
                // ⚠️ 只在**这一排有漫游焦点**时画：焦点去了别行，这一块就是噪音。
                const isFocusPointLine = roving.focusedIndex === index;
                // ⚠️ 只有**当前那一颗**挂漫游属性：整排算一个落点（见文件头）。
                const roamNavigate = isCurrent ? roving.itemProps(index) : null;
                const name2 = spec ? t(spec.label) : id;
                // ⚠️ 拼法走 `FormatBar` 的 `提示`，**不自己拼**：它管着"括号随
                // 语言变"（中文全角、英文半角）。这里再拼一次的话，中文界面上
                // 这个提示会是半角括号，和隔壁工具栏对不上。
                const noticeLanguage = notice(id, name2);
                return (
                  <button
                    key={id}
                    type="button"
                    className="format-btn"
                    // 亮不亮＝当前光标那一位（`FormatBar.tsx::按钮亮着`，
                    // 和工具栏**同一份判据**，不是各判各的）。
                    data-on={PressButton ? isButtonActive(PressButton, cursor) : false}
                    data-current={isFocusPointLine && isCurrent ? true : undefined}
                    disabled={thisDisabled}
                    tabIndex={roamNavigate ? roamNavigate.tabIndex : -1}
                    title={noticeLanguage}
                    // ⚠️ 图标按钮必须自己带名字：`.icon` 是 `aria-hidden` 的，
                    // 按钮里一个字都没有（`FormatBar.tsx` 那一段同款）。
                    aria-label={noticeLanguage}
                    ref={(n) => {
                      cellButton.current.set(`${r.key}:${i}`, n);
                      if (isCurrent) roving.registerItem(index, n);
                    }}
                    onFocus={roamNavigate?.onFocus}
                    onMouseEnter={() => {
                      if (thisDisabled) return;
                      roving.setFocusedIndex(index);
                      setInlinePosition((m) => ({ ...m, [r.key]: i }));
                      cellButton.current.get(`${r.key}:${i}`)?.focus();
                    }}
                    // ⚠️ 见文件头第 1 条：不拦的话编辑区的选区会被这一下抢走，
                    // 于是"右键 → 加粗"变成"在原地插两个星号"。
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (!thisDisabled) onPick(id);
                    }}
                  >
                    {shape ? (
                      <Icon name={shape} />
                    ) : (
                      // ⚠️ class 走 `字形类`，**不自己拼**：`</>` 的等宽体在
                      // `format-glyph-${cmd}` 那个修饰类上，见那边的注释。
                      <span className={characterShapeClass(id)}>{getCharacterShape(id)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        }

        const thisDisabled = wholeLineDisabled(r, disabled2);
        const isChildOpen = childOpen === index;
        // ⚠️ **键盘走到的那一项必须画出来**，否则 ↑↓ 是一套"看不见的漫游"——
        // 2026-10-04 开窗口检抓到的：菜单开着、按 `↓` 也确实在走（`Esc` 能关掉
        // 就是证据），但屏幕上一格高亮都没有，用户根本不知道自己停在哪儿。
        // 这里把漫游下标也算进 `.menu-item-open`（那一族的注释本来就写着
        // "键盘走到哪一项、以及哪一项的子菜单开着"画同一种底色）。
        const isFocusPoint = roving.focusedIndex === index;
        const roamNavigate = roving.itemProps(index);

        // 拼写那一段（建议 / 加入词典 / 忽略）。⚠️ 形状与上面的 `item` 一致
        //（同一条 `.menu-item`），差的是**标签原样用、不过 `t()`**——那是从
        // 词典里查出来的真词，不是文案（理由见 `context-menu.ts::拼写线索`）。
        if (r.kind === "spell") {
          return (
            <div className="menu-item-root" key={r.key}>
              <button
                type="button"
                role="menuitem"
                className={`menu-item ${isFocusPoint ? "menu-item-open" : ""}`}
                tabIndex={roamNavigate.tabIndex}
                ref={(n) => {
                  lineButton.current.set(r.key, n);
                  roving.registerItem(index, n);
                }}
                onFocus={roamNavigate.onFocus}
                onMouseEnter={() => {
                  roamNavigate.onMouseEnter();
                  closeChildren();
                }}
                // ⚠️ 与上面那一排同一条：不拦的话编辑区的选区会被右键抢走，
                // 于是"换成 hello"作用在一个已经塌掉的光标上（见文件头第 1 条）。
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(r.id)}
              >
                <span className="menu-check" />
                <span className="menu-label">{r.label}</span>
                <span className="menu-arrow" />
              </button>
            </div>
          );
        }

        // ⚠️ 收窄到 `item`：上面那个 `spell` 分支已经把另一种可能接走了，
        // 而类型上还留着 `sep`（摊平时滤掉的是**运行时**的分隔线）。
        if (r.kind !== "item") return null;
        return (
          <div className="menu-item-root" key={r.key}>
            <button
              type="button"
              role="menuitem"
              className={`menu-item ${r.spec.danger ? "menu-item-danger" : ""} ${isChildOpen || isFocusPoint ? "menu-item-open" : ""}`}
              disabled={thisDisabled}
              aria-checked={r.spec.checkable ? !!check[r.spec.id] : undefined}
              aria-haspopup={r.spec.submenu ? "menu" : undefined}
              aria-expanded={r.spec.submenu ? isChildOpen : undefined}
              tabIndex={roamNavigate.tabIndex}
              ref={(n) => {
                lineButton.current.set(r.key, n);
                roving.registerItem(index, n);
              }}
              onFocus={roamNavigate.onFocus}
              onMouseEnter={() => {
                roamNavigate.onMouseEnter();
                // 划过就展开（子菜单是另一层，这里那两条 `openSub` 的规矩照旧）。
                if (r.spec.submenu) openChild(index);
                else closeChildren();
              }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (r.spec.submenu) {
                  if (isChildOpen) closeChildren();
                  else openChild(index);
                  return;
                }
                if (!thisDisabled) onPick(r.spec.id);
              }}
            >
              <span className="menu-check">{r.spec.checkable && check[r.spec.id] ? "✓" : ""}</span>
              <span className="menu-label">{t(r.spec.label)}</span>
              {/* 灰掉的不印快捷键——"看得见快捷键 = 按得动"（`MenuPopup` 那条）。 */}
              {r.spec.accel && !thisDisabled && (
                <span className="menu-accel">{formatAccel(r.spec.accel)}</span>
              )}
              <span className="menu-arrow">{r.spec.submenu ? "▸" : ""}</span>
            </button>

            {r.spec.submenu &&
              isChildOpen &&
              childAnchor &&
              createPortal(
                <div data-context-menu="">
                  <SubMenu
                    entries={r.spec.submenu}
                    disabled={new Set(disabled2) as Set<string>}
                    checks={check}
                    onPick={onPick}
                    onDismiss={onDismiss}
                    onClose={closeChildren}
                    anchor={childAnchor}
                    // ⚠️ 抬层级：子菜单 portal 到 `body`，继承不到本体那个
                    // `z-index`（`styles/menubar.css` 的 `.context-sub`）。
                    className="context-sub"
                  />
                </div>,
                document.body,
              )}
          </div>
        );
      })}
    </div>
  );
}

// ── 听 ─────────────────────────────────────────────────────────────────────

export interface contextMenuWiring {
  /**
   * 命令表**本身**（`App.tsx` 里 `useCommandTable` 那张 `menuHandlers`）。
   *
   * ⚠️ **传表，不传 `(id) => 表[id]?.()` 那种现包的箭头**：那东西每渲染一次
   * 换一个身份，底下那几条 `useCallback` 就全都跟着白重建。
   * 而且分发的写法必须**和 `App.tsx` 里 `onCommand` 那处逐字相同**——那就
   * 是全应用唯一的派发口，两个入口两种写法是"同一个动作两个结果"的老病。
   */
  commandTable: Record<string, (() => void) | undefined>;
  /** 灰名单（`App.tsx` 从 `ui/useMenus.ts` 拿到的 `disabledCommands`）。 */
  disabled2: ReadonlySet<string>;
  /** 勾选状态（同上，`menuChecks`）。 */
  check: Record<string, boolean>;
  /** 光标状态。图标亮不亮看它（`null` ＝ 读不出来，源码模式）。 */
  cursor: CommandState | null;
  /** 提示条。输入框那一档失败时要说话。 */
  toast: notice;
  /** 复制这一下右键命中的图片。不能等到命令表里再猜 DOM 选区。 */
  copyImage: (image: HTMLImageElement) => Promise<void>;
}

/** 现在开着的那一份。`null` = 没开。 */
interface isOpen {
  position2: { top: number; left: number };
  line3: line3[];
  /**
   * 这一份是哪一档。
   *
   * ⚠️ **画的时候要用它挑灰名单**（`context-menu.ts::这一档的灰`）：输入框那
   * 一档一个都不灰。⚠️ **不能靠 `场 !== null` 推**：那是"这一档有没有输入框
   * 现场"，两件事碰巧同源，哪天输入框那一档多条别的入口（比如给
   * `contenteditable` 也做一条），判据就会悄悄错开。
   */
  DropPoint: DropPoint;
  /** 输入框那一档才有。 */
  scene2: InputBoxScene | null;
  /** 这一下右键命中的图片；右键不会替它建立 DOM 选区，必须当场记下。 */
  image: HTMLImageElement | null;
  /**
   * 这一下右键落在**一个拼错的词**上时才有：那个 `<span class="nota-spell-error">`
   * 元素，以及它里面的词、这一刻拿到的那一列建议。
   *
   * ⚠️ **认它是靠 DOM 类名，不是靠编辑器那边的回调**：波浪线是
   * `Decoration.inline(…, { class: "nota-spell-error" })`（`editor/spell-check.ts`），
   * ProseMirror 把它渲染成一个真的 `span`，所以 `e.target.closest("…")` 就问到
   * 了。⚠️ 走回调那条路**在这里行不通**：这个监听挂在 **window 捕获阶段**，
   * 它比编辑器 DOM 上任何监听都先跑——菜单已经开完了，编辑器那边才醒。
   */
  combineWrite: CombineWriteScene | null;
}

/**
 * 一个错词的现场。
 *
 * ⚠️ `元素` 是那一刻那个 `span` 的引用：菜单开着的这几百毫秒里文档可能被改
 * （自动保存、外部改动），所以用它之前要查 `isConnected`——对着一个已经不在
 * 文档里的节点算位置，`posAtDOM` 会抛。
 */
interface CombineWriteScene {
  element: HTMLElement;
  word: string;
  createProposalPlural: string[];
}

/**
 * 全应用共用的那一个右键菜单。**挂在 `App.tsx` 里画一次**，没开时返回 `null`。
 *
 * ⚠️ **它是个组件，不是 hook**——一开始想写成 `useContextMenu()` 让 `App.tsx`
 * 里"连 JSX 都不用加"，但那是错的：hook 返回的元素**不会自己进树**，调用方
 * 照样得找地方渲染它。既然都要占一行，那就写成组件，读的人一眼看得出它画在
 * 哪儿。（分量：`App.tsx` 982 行，加这一行 import ＋ 一行 JSX 共 984，离 1000
 * 硬上限还有富余。）
 *
 * ⚠️ **它自己 portal 到 `document.body`**：菜单要能盖住工具栏、侧栏、状态栏，
 * 留在 `App` 的 DOM 里就得和那几层的层叠上下文缠。`ui/MenuPopup.tsx` 的子菜单
 * 也是这么出去的，同一套。
 *
 * ⚠️ 监听挂在 **window 的捕获阶段**：要抢在别处（`ui/TabBar.tsx` 的
 * `onContextMenu`，那是冒泡阶段）之前判"这一下是不是别人的"，判完立刻放行。
 * 见 `ui/context-menu.ts` 文件头那张表。
 */
export function ContextMenu(wiring: contextMenuWiring) {
  const { commandTable, disabled2, check, cursor, toast, copyImage } = wiring;
  const t = useT();
  const [open2, setOpen] = useState<isOpen | null>(null);

  /**
   * **菜单抢焦点之前**，焦点在谁身上。收起时还给它（见 `收起`）。
   *
   * ⚠️ 这条是 2026-10-04 开窗口检补的，不加的话是**实打实的功能倒退**：
   * 菜单为了键盘漫游会把 DOM 焦点播种到自己第一项上（`useMenuRovingFocus` 那条
   * `useLayoutEffect`），收起时没人还回来，焦点就掉在 `<body>` 上——量到的症状是
   * 「按 `Esc` 关掉菜单之后，打的字一个都进不去正文」（`xdotool type X`，
   * 字数统计一动不动）。**原生那份菜单没有这个毛病**：它关掉之后焦点还在网页里。
   * 也就是说这是我们接管之后自己带出来的，必须自己收干净。
   */
  const originalFocusPoint = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const listen = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (!el || typeof el.closest !== "function") return;

      const drop = determineDropPoint({
        // ⚠️ **顺序见 `context-menu.ts` 文件头**：`.tabbar` 先让路，
        // 输入框排在编辑器前面（编辑区里真有输入框——公式源码框那些）。
        alreadyIsRecognizeLead: Boolean(el.closest(".tabbar")),
        isInputBox: Boolean(el.closest("input, textarea")),
        atEditorInside: Boolean(el.closest(".ProseMirror, .cm-editor, .editor-pane")),
      });

      // ⚠️ 「不弹」那一档**连 `preventDefault` 都不做**：那是标签栏自己认领的
      // 一下，拦了它那份菜单就没了（见 `context-menu.ts` 文件头）。
      if (drop === "不弹") return;

      // 到这儿一律拦下：全接管，WebKit 那份英文菜单从此不再出现。
      e.preventDefault();

      // 这一下是不是落在**一个拼错的词**上（波浪线是 `span.nota-spell-error`，
      // 那一段的来历见 `拼写现场`）。
      const combineWriteElement = el.closest(".nota-spell-error") as HTMLElement | null;
      const combineWriteWord = combineWriteElement?.textContent?.trim() ?? "";
      const CombineWriteLineSearch =
        combineWriteElement && combineWriteWord !== ""
          ? { createProposalPlural: [] as string[], addWordDictionary: t("Add to dictionary"), ignoreOmit: t("Ignore") }
          : null;

      const contextImage = el.closest("img");
      const onImage = contextImage instanceof HTMLImageElement ? contextImage : null;
      const hasSelection = cursor?.hasSelection ?? Boolean(window.getSelection()?.toString());
      const rows = buildRows(drop, import.meta.env.DEV, CombineWriteLineSearch, Boolean(onImage), hasSelection);
      // 外壳：只拦不弹（用户 2026-10-04 选的，见 `context-menu.ts`）。
      if (rows.length === 0) return setOpen(null);

      let scene2: InputBoxScene | null = null;
      if (drop === "输入框") {
        const box2 = el.closest("input, textarea") as HTMLInputElement | HTMLTextAreaElement | null;
        // 把选区**先记下来**：菜单一开焦点就被漫游钩子挪走了（见 `输入框现场`）。
        scene2 = box2 ? { element: box2, start5: box2.selectionStart, end2: box2.selectionEnd } : null;
      }
      // ⚠️ 记下"收起时焦点该还给谁"（见 `原焦点`）。**按落在哪一档挑**，
      // 不要去读 `document.activeElement`：右键**不会**让正文先拿到焦点
      // （ProseMirror 只认左键那一下的 `mousedown`），照 `activeElement` 记，
      // 记到的常常是 `<body>`，还回去等于没还——2026-10-04 就这么错过一次。
      originalFocusPoint.current = scene2
        ? scene2.element
        : ((el.closest(".ProseMirror, .cm-editor") as HTMLElement | null) ?? null);

      const scene: CombineWriteScene | null =
        combineWriteElement && combineWriteWord !== "" ? { element: combineWriteElement, word: combineWriteWord, createProposalPlural: [] } : null;

      setOpen({
        position2: { top: e.clientY, left: e.clientX },
        line3: rows,
        DropPoint: drop,
        scene2,
        image: onImage,
        combineWrite: scene,
      });

      // ⚠️ 建议是**过 IPC 现拉的**（一次词典查询）：菜单先按"没有建议"那一版画出来
      //（两个动作当场就能点），拿到之后**只把这前半段补上**。
      // ⚠️ 用户可能在等待期间把它关掉（或点了别处）：下面那个 `if (旧?.拼写)` 就是在
      // 防这个——`set开` 的回调拿到的是**那一刻**的 state，`null` 就什么都不做。
      if (scene) {
        void api.spell
          .suggest(currentLanguageLabel(), scene.word)
          .then((createProposalPlural) => {
            setOpen((oldValue) => {
              if (!oldValue?.combineWrite) return oldValue;
              const newValueCombineWrite = { ...oldValue.combineWrite, createProposalPlural };
              return {
                ...oldValue,
                combineWrite: newValueCombineWrite,
                line3: buildRows(
                  oldValue.DropPoint,
                  import.meta.env.DEV,
                  { createProposalPlural, addWordDictionary: t("Add to dictionary"), ignoreOmit: t("Ignore") },
                  false,
                  hasSelection,
                ),
              };
            });
          })
          .catch(() => {
            // 拿不到建议：这一栏就这么空着（菜单本身照旧能用）。
          });
      }
    };
    window.addEventListener("contextmenu", listen, true);
    return () => window.removeEventListener("contextmenu", listen, true);
    // ⚠️ 依赖是**空的**（`t` 是模块级那一个稳定的函数，`i18n/index.ts::useT`）：
    // 那两句动作名虽然是在这个监听里翻的，但 `t` **每次被调用时才读当前语言**，
    // 所以不用重挂。⚠️ 别把 `t` 写进依赖数组假装它是个依赖——它永远不会变，
    // 写了只会让人以为这里跟语言有关而漏掉真正该重挂的那一处。
  }, []);

  const collapse = useCallback(() => {
    setOpen(null);
    // ⚠️ **把焦点还回去**（理由与量到的症状见 `原焦点` 那段）。
    // ⚠️ `isConnected` 要查：打开菜单的那个输入框可能在这一段时间里被卸载了
    // （设置面板换页、对话框关掉），focus 一个已经不在文档里的节点是空操作，
    // 但查一下更直白。⚠️ 已经在它身上了就不要再 focus 一次——那会把用户
    // 刚点进去的位置又抢回来。
    const who = originalFocusPoint.current;
    originalFocusPoint.current = null;
    if (who && who.isConnected && document.activeElement !== who) who.focus();
  }, []);

  const select = useCallback(
    (id: string) => {
      const thisOneDocument = open2;
      collapse();
      if (!thisOneDocument) return;
      // 输入框那一档走**另一套**实现（见 `落到输入框` 那段）。
      if (thisOneDocument.scene2) {
        void dropToInputBox(id, thisOneDocument.scene2, t, toast);
        return;
      }
      // 拼写那一段也走自己的实现（理由：它是**现场造出来的 id**，
      // 命令表里没有它们，见 `context-menu.ts::拼写加词典` 那段）。
      if (id.startsWith("spell.")) {
        dropToCombineWrite(id, thisOneDocument.combineWrite, toast);
        return;
      }
      if (id === "edit.copyImage" && thisOneDocument.image) return void copyImage(thisOneDocument.image);
      // ⚠️ 与 `App.tsx` 的 `onCommand` 逐字相同：全应用只此一个派发口。
      commandTable[id]?.();
    },
    [open2, commandTable, collapse, copyImage, t, toast],
  );

  useEffect(() => {
    if (!open2) return;
    // ⚠️ 用 `mousedown` 不是 `click`（`click` 要等鼠标抬起，期间菜单还开着）。
    // ⚠️ 判据是 `data-context-menu`，**不是**面板那个 ref：子菜单 portal 到
    // `document.body`，和面板没有 DOM 亲缘关系（见面板那一段的注释）。
    const pointDistinguishPlace = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (el?.closest?.("[data-context-menu]")) return;
      setOpen(null);
    };
    const close4 = () => setOpen(null);
    /**
     * 底下的东西滚了 → 关掉（同 `ui/TabBar.tsx` 那一段：`fixed` 的菜单会与
     * 它指着的位置脱节，浮在已经滚走的正文上）。
     *
     * ⚠️⚠️ **但弹层自己滚不算**（2026-10-11 与状态栏那个缺陷同一批修的）：
     * 「段落」/「插入」那两栏子菜单**自己就能滚**（`.menu-sub` 那条 `max-height`），
     * 而里面的滚动事件照样冒到 `window` 的捕获相——不判这一下的话，用户在子菜单里
     * 往下拨一下滚轮，整份右键菜单当场消失。判据在 `ui/popup-scroll.ts`。
     */
    const closeRoll = (e: Event) => {
      if (popupSelfSelfAtRoll(e.target)) return;
      close4();
    };
    document.addEventListener("mousedown", pointDistinguishPlace);
    window.addEventListener("resize", close4);
    // ⚠️ `scroll` 要挂**捕获**：编辑区自己的滚动容器也要能关掉菜单。
    window.addEventListener("scroll", closeRoll, true);
    return () => {
      document.removeEventListener("mousedown", pointDistinguishPlace);
      window.removeEventListener("resize", close4);
      window.removeEventListener("scroll", closeRoll, true);
    };
  }, [open2]);

  if (!open2) return;
  return createPortal(
    <ContextMenuPanel
      line3={open2.line3}
      DropPoint={open2.position2}
      // ⚠️ **进来的时候挑一次**（`这一档的灰`）：输入框那一档一个都不灰。
      // 拿外面那份原样的 `灰` 会把它那条**有实现**的「全选」按成灰的
      // ——2026-10-04 开窗口检抓到的，理由与量到的画面见那个函数。
      disabled2={disabledForLocation(open2.DropPoint, disabled2)}
      check={check}
      cursor={cursor}
      onPick={select}
      onDismiss={collapse}
      label={t("Context Menu")}
    />,
    document.body,
  );
}
