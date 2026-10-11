/**
 * 格式化工具栏（`docs/07` backlog 第 2 项）。
 *
 * # 它和菜单栏的关系
 *
 * **同一个命令面，两个入口**。工具栏上每一颗按钮都只做一件事：
 * 把一条 `EditorCommand` 交给 `EditorPaneHandle.runCommand`。它**不认识**
 * ProseMirror，也不认识 Markdown——命令的实现只在 `editor/create.ts`
 * （所见即所得）与 `editor/source.ts`（源码）那两处。
 *
 * 所以「工具栏」和「格式/段落菜单里那几条」是**同一批 id**，不是两套。两边
 * 各写一份实现的话，症状会是"菜单里加粗了、工具栏里没有"——而两份都不会报错。
 *
 * ⚠️ **连快捷键提示也是从菜单表派生的**（`键位表`）。把 `Ctrl+B` 直接写在
 * `title` 里就是**第二份真相源**：哪天菜单上那条键位改了，工具栏的提示还
 * 停在旧值上，而且不报错。这个仓库已经为"两套键位表"栽过一次
 * （见 `ui/commands.ts` 顶上那段），不再来第二次。
 *
 * # 高亮从哪来
 *
 * `editor/command-state.ts` 那条只读插件。⚠️ **源码模式下一颗都不亮**：
 * CodeMirror 手里是文本，没有"当前选区是不是粗体"这回事，那份状态是
 * `null`。空着比如实说"不知道"要诚实——猜一个亮起来才是撒谎。
 *
 * ⚠️ 这也是为什么按钮**不用任何自绘的"按过没有"状态**：
 * 亮/不亮直接等于 `state` 里那一位。本地记的话，光标移走之后那颗按钮还亮着。
 *
 * # 图标
 *
 * 2026-09-24 起有一半按钮画的是图标（`ui/Icon.tsx` 里那套从 Folio 搬来的）。
 * **另一半仍是文字字形**（`H1`/`引`/`任`），理由写在 `按钮.icon` 那段注释里。
 * 两种长相共用一套按钮样式，高亮/悬停的颜色也是同一条 `color` 链。
 */

import type { Ref } from "react";

import type { CommandState } from "@/editor/command-state";
import type { EditorCommand } from "@/editor/create";
import { useT, 语言 } from "@/i18n";
import { formatAccel } from "@/ui/accel";
import { MENUS, walkMenuItems } from "@/ui/commands";
import { Icon, type 图标名 } from "@/ui/Icon";

interface Props {
  /**
   * 当前光标状态。`null` = **这条通路读不出来**（源码模式、或还没有文档）。
   *
   * ⚠️ 与"空状态"不同：`null` 时一颗都不高亮，而空状态时"正文段落"
   * 那颗**是亮的**（光标真的在普通段落上）。
   */
  state: CommandState | null;
  /** 跑一条命令。返回值同 `EditorPaneHandle.runCommand`（有没有实现）。 */
  onCommand: (name: EditorCommand) => void;
  /**
   * 那一整条 DOM（`.format-bar` 自己）。
   *
   * ⚠️ 外壳拿它**量位置**，不拿它做别的事：设置里选了「鼠标悬停时显示」
   * 之后，"指针还在工具栏下沿以上吗"要的是它的真实下沿，而那个位置随
   * 查找条开没开、界面风格、缩放而变（见 `ui/useChromeVisibility.ts`）。
   *
   * ⚠️ 写成 `ref` 而不是 `rootRef` 是 React 19 的写法：函数组件的 `ref`
   * 现在就是一个普通 prop，不再需要 `forwardRef`（同 `ui/EditorPane.tsx`）。
   */
  ref?: Ref<HTMLDivElement>;
  /**
   * 收起这一条（**右端那颗 ×**，2026-10-04 补，`docs/07` 第 49 项）。
   *
   * ⚠️ **与「视图 → 格式化工具栏 → 始终不显示」是同一个 setter**
   * （`App.tsx` 那颗传下来的是 `setChrome({ toolbar: "never" })`）：
   * 三档那个设置仍然是唯一真相源，这颗 × **不是第二份状态**
   * （同 `ui/Sidebar.tsx` 那颗 × 的口径，那边写着"自己 `useState` 一份的症状
   * 是用 × 关掉、菜单里那一项还勾着"）。
   *
   * ⚠️ 收起来之后**这一条自己就没了**，"怎么再打开"在菜单里（视图 → 格式化
   * 工具栏）与设置里（外观 → 工具栏）各有入口——所以这里**不发提示**，
   * 与菜单栏那条不同（`ui/useChromeVisibility.ts` 头上写着为什么菜单栏必须发）。
   */
  onHide: () => void;
}

/** 菜单 id → 快捷键文本。**从 `MENUS` 派生，不手写**（见文件头）。 */
const 键位表 = (() => {
  const m = new Map<string, string>();
  walkMenuItems(MENUS, (item) => {
    if (item.accel) m.set(item.id, item.accel);
  });
  return m;
})();

/**
 * 菜单 id + 名字 → 提示语。菜单里没这一条（或没配键）时只给名字。
 *
 * ⚠️ **名字要由调用方先翻好再传进来**（`t(TITLES[b.cmd] ?? b.label)`）：
 * 这个函数是模块级的纯函数，拿不到也订阅不上语言。这里只有括号随语言变
 * ——中文界面上照旧是全角 `（Ctrl+B）`，英文界面上是半角 ` (Ctrl+B)`。
 * 那是**排版**，不是文案，所以不走表（表里没有"半个括号"这种东西）。
 *
 * ⚠️ **2026-10-04 起也导出给右键菜单用**（`ui/ContextMenu.tsx`）。那边图标
 * 按钮的 `title` 和 `aria-label` 要的是**同一句话**；各自拼一份的话，中文界面
 * 上会出现半角括号，而且是那种没人会当成 bug 报上来的不一致。
 */
export function 提示(menu: string, 名字: string): string {
  const a = 键位表.get(menu);
  if (!a) return 名字;
  const 键 = formatAccel(a);
  return 语言() === "zh-CN" ? `${名字}（${键}）` : `${名字} (${键})`;
}

/**
 * 行内标记那八个字段。
 *
 * ⚠️ **不能写成 `keyof CommandState`**：那个类型里还有 `block`（是个字符串
 * 联合）、`inTable`、`hasSelection`，`state[b.on]` 于是会是
 * `boolean | BlockKind`——直接喂给 `aria-pressed` 就是编译错。收窄成这八个，
 * "行内按钮只能看行内那几位"这件事就由类型钉住了。
 *
 * ⚠️ 后四个（高亮 / 上标 / 下标 / 下划线）来自 `editor/inline-marks.ts`。
 * 它们的按钮**不受设置里那三个开关影响**：关掉的是"解析与输入"，不是这条
 * 能力（见 `command-table.ts` 的 `COMMANDS` 那四条注释）。
 */
type 行内位 =
  | "bold"
  | "italic"
  | "strike"
  | "inlineCode"
  | "highlight"
  | "superscript"
  | "subscript"
  | "underline";

/**
 * 一颗按钮。`menu` 是它在菜单表里的对应条目——**只用来取快捷键提示**，
 * 点了跑的还是 `cmd`。
 */
export interface 按钮 {
  cmd: EditorCommand;
  menu: string;
  label: string;
  /**
   * 有它就用图标，没有就用 `label` 那个文字字形。
   *
   * ⚠️ **"文字字形"只留给拉丁字母**（`H1`/`H2`/`H3`、`</>`）：
   * `H1` 这个字形比任何小图标都清楚，而且它本来就是两个字母，16px 下不糊。
   *
   * ⚠️ **汉字不许当图标**。原先引用和任务列表写的是 `引`/`任`——汉字笔画密，
   * 缩到 16px 是一团黑，而且和左右两边真正的图形摆在一起像是没对齐。
   * 现在这两枚是 Nota 自己画的（`nota-quote-symbolic` / `nota-task-symbolic`，
   * 见 `src/assets/icons/`）。Folio 那 96 枚里没有现成的，但为这一处开两枚
   * 是值得的：工具栏是**整条一起看**的，混着文字和图形最扎眼。
   */
  icon?: 图标名;
  /** 块级那一组用：`state.block` 等于它时高亮。 */
  block?: CommandState["block"];
  /** 行内那一组用：`state[key]` 为真时高亮。 */
  on?: 行内位;
}

/** 行内标记。可以同时亮（粗体 + 斜体是真的同时成立的）。 */
const 行内组: 按钮[] = [
  { cmd: "bold", menu: "fmt.bold", label: "B", icon: "folio-format-text-bold-symbolic", on: "bold" },
  { cmd: "italic", menu: "fmt.italic", label: "I", icon: "folio-format-text-italic-symbolic", on: "italic" },
  { cmd: "strike", menu: "fmt.strike", label: "S", icon: "folio-format-text-strikethrough-symbolic", on: "strike" },
  { cmd: "inlineCode", menu: "fmt.code", label: "</>", on: "inlineCode" },
  // 扩展语法四条（`editor/inline-marks.ts`）。**四枚都有现成图标**
  // （`folio-marker-symbolic` 那枚的注释就写着"标记（高亮）：记号笔 + 底部
  // 高亮色条"），所以一个文字字形都不用——工具栏是整条一起看的。
  { cmd: "highlight", menu: "fmt.highlight", label: "==", icon: "folio-marker-symbolic", on: "highlight" },
  { cmd: "superscript", menu: "fmt.superscript", label: "x²", icon: "folio-format-text-superscript-symbolic", on: "superscript" },
  { cmd: "subscript", menu: "fmt.subscript", label: "x₂", icon: "folio-format-text-subscript-symbolic", on: "subscript" },
  { cmd: "underline", menu: "fmt.underline", label: "U", icon: "folio-format-text-underline-symbolic", on: "underline" },
];

/** 链接与图片。它们要弹框问地址，所以没有"亮不亮"这一说。 */
const 链接组: 按钮[] = [
  { cmd: "link", menu: "fmt.link", label: "Link", icon: "folio-insert-link-symbolic" },
  { cmd: "image", menu: "fmt.image", label: "Image", icon: "folio-insert-image-symbolic" },
];

/**
 * 块级那一组。**同一时刻只亮一颗**（`state.block` 是个单值，见
 * `command-state.ts` 里为什么不用一排布尔）。
 *
 * ⚠️ `task` 与 `ul` 都是列表，但**不能合成一颗**：两者的文档树节点不同
 * （`list_item.checked` 是不是 `null`）。合成一颗的话，光标在任务项里
 * 时亮的是"无序列表"，用户会以为自己没转成功。
 */
const 块组: 按钮[] = [
  { cmd: "h1", menu: "para.h1", label: "H1", block: "h1" },
  { cmd: "h2", menu: "para.h2", label: "H2", block: "h2" },
  { cmd: "h3", menu: "para.h3", label: "H3", block: "h3" },
  { cmd: "quote", menu: "para.quote", label: "Quote", icon: "nota-quote-symbolic", block: "quote" },
  { cmd: "ul", menu: "para.ul", label: "•", icon: "folio-view-list-bullet-symbolic", block: "ul" },
  { cmd: "ol", menu: "para.ol", label: "1.", icon: "folio-view-list-ordered-symbolic", block: "ol" },
  { cmd: "task", menu: "para.task", label: "Task", icon: "nota-task-symbolic", block: "task" },
  { cmd: "codeBlock", menu: "para.codeBlock", label: "{ }", icon: "folio-insert-code-symbolic", block: "codeBlock" },
  { cmd: "clearFormat", menu: "fmt.clear", label: "Clear", icon: "folio-eraser-symbolic" },
];

/**
 * 这一颗按钮现在亮不亮。**两处（工具栏、右键菜单）共用这一份**。
 *
 * ⚠️ 高亮的两种来源**互斥**：`on` 是行内标记（粗体 + 斜体可以同时亮），
 * `block` 是块级（同一时刻只亮一颗）。一颗按钮只属于其中一组。
 *
 * ⚠️ `state` 为 `null`（源码模式 / 还没有文档）时**一颗都不亮**——那时候
 * 「当前选区是不是粗体」这件事根本读不出来，见 `editor/command-state.ts`。
 */
export function 按钮亮着(b: 按钮, state: CommandState | null): boolean {
  if (!state) return false;
  return b.on ? state[b.on] === true : b.block ? state.block === b.block : false;
}

/** 菜单 id → 那一颗按钮。 */
export const 按钮表: ReadonlyMap<string, 按钮> = (() => {
  const m = new Map<string, 按钮>();
  for (const b of [...行内组, ...链接组, ...块组]) m.set(b.menu, b);
  return m;
})();

/**
 * 没有图标时那个字形的 class。
 *
 * ⚠️ **抽出来是为了让右键菜单和工具栏逐字画成一样**：`</>` 的等宽体不在
 * `.format-glyph` 上，而在 `format-glyph-${cmd}` 这个**修饰类**上
 * （`styles/bars.css`）。两边各自拼一次的话，迟早有一边忘了带修饰类——
 * 症状是同一个 `</>` 在菜单里是衬线体、在工具栏里是等宽体，而这种"两处长得
 * 不太一样"没人会当成 bug 报上来。
 *
 * ⚠️ 这里读的是 `按钮.cmd`，但**只拿来拼 class 名**，不是拿去执行
 * （执行那条禁令见 `按钮表` 上面那段）。
 */
export function 字形类(menu: string): string {
  const b = 按钮表.get(menu);
  return b ? `format-glyph format-glyph-${b.cmd}` : "format-glyph";
}

/**
 * 上面那张表的**用法约定**，写给右键菜单那一侧（`ui/ContextMenu.tsx`）：
 *
 * ⚠️ **只准用它取 `icon` 和 `按钮亮着`**，**不许用它取 `cmd`**。
 * 那边每一条命令都按 id 走 `menuHandlers`（`ui/context-menu.ts` 里写着为什么），
 * 而 `cmd` 是"过 `onCommand` 直接喂 `EditorCommand`"那条路——两条路混在
 * 一个文件里，早晚有人接错，而接错的症状是"点了没反应"或"点错了命令"。
 *
 * ⚠️ 导出整张表（而不只是图标名）是**为了让高亮只有一份判据**：
 * 只导图标的话，"哪一条算粗体"这个映射就要在右键菜单那边再写一遍，
 * 而那正是本文件头上骂的那种"两套真相源"——加一条新命令时只改一处，
 * 另一处静默地不亮。
 *
 * ⚠️ `TITLES`（提示语里的名字）**没有**跟着导出，它必须留在组件体里，
 * 理由见下面那一段。右键菜单要显示名字时**从 `MENUS` 按 id 取 `label`**
 * （`ui/context-menu.ts` 的 `取条目`）——同一批键、同一份译文，不是第二份。
 */
export function FormatBar({ state, onCommand, ref, onHide }: Props) {
  // 订阅语言：宿主报来语言之后这一条要重画（见 `i18n/index.ts::useT`）。
  const t = useT();

  /**
   * 提示语里的名字（键表 → 渲染时翻）。
   *
   * ⚠️ **2026-09-26 从模块级搬进组件体**（原来住在文件末尾）。两条理由，
   * 缺一条都会坏：
   *
   * 1. 这些词要拿去 `t(...)` 查表，而模块级求值时语言还没定、之后也没人
   *    通知它重画（同 `i18n/index.ts::useT` 那段）。搬进来之后每次渲染
   *    按当前语言查。
   * 2. `tools/i18n-check.sh` 数的是源码里**字面写出来**的 `t("…")`。留在
   *    模块级就只能写成 `t(表[cmd])` 这种变量形式，那几条不算"被调用"，
   *    表里对应的英文会被判成**废键**（FAIL）——`PluginDock.tsx::能力名`
   *    那张表踩过同一条（那边注释里写着）。
   *
   * ⚠️ 这些词**和「格式」/「段落」菜单里那几条是同一批键**（`加粗`、`斜体`…），
   * 共用一个译文。工具栏提示和菜单项必须字面一致，否则同一条命令在两个入口
   * 会叫两个名字。加新键之前先 `grep -rn 't("那句原文")' src/`。
   */
  const TITLES: Partial<Record<EditorCommand, string>> = {
    bold: t("Bold"),
    italic: t("Italic"),
    strike: t("Strikethrough"),
    inlineCode: t("Inline Code"),
    highlight: t("Highlight"),
    superscript: t("Superscript"),
    subscript: t("Subscript"),
    underline: t("Underline"),
    link: t("Link"),
    image: t("Image"),
    h1: t("Heading 1"),
    h2: t("Heading 2"),
    h3: t("Heading 3"),
    quote: t("Blockquote"),
    ul: t("Bullet List"),
    ol: t("Ordered List"),
    task: t("Task List"),
    codeBlock: t("Code Block"),
    clearFormat: t("Clear Formatting"),
  };

  /** 一颗按钮。三组共用这一处渲染，免得三份 JSX 各自漂移。 */
  const 画 = (b: 按钮) => {
    // ⚠️ 判据搬去了模块级的 `按钮亮着`（2026-10-04）：右键菜单那边也要问
    // 同一个问题（"这一颗亮不亮"），留在组件体里它就只能是第二份。
    const 亮 = 按钮亮着(b, state);
    const 可亮 = Boolean(b.on || b.block);
    // 提示语与可读名字同**一句**（拼一次，两处用）：名字先翻，括号由 `提示` 拼。
    const 提示语 = 提示(b.menu, TITLES[b.cmd] ?? b.label);
    return (
      <button
        key={b.cmd}
        type="button"
        className="format-btn"
        data-on={亮}
        // ⚠️ `aria-pressed` 只在**已知状态**时给：源码模式下给 `false`
        // 等于断言"现在不是粗体"——而这里并不知道。
        aria-pressed={state && 可亮 ? 亮 : undefined}
        title={提示语}
        // ⚠️ 图标按钮**必须**再给一个 `aria-label`：`.icon` 是 `aria-hidden` 的，
        // 按钮里于是没有一个字，读屏只拿 `title`（最弱的那种可读名字）。
        // 给的和 `title` 同一句，所以念出来也带着快捷键。
        aria-label={b.icon ? 提示语 : undefined}
        // ⚠️ `onMouseDown` 里 `preventDefault`：不拦的话，按钮会把编辑区的
        // 选区**先抢走**（浏览器的默认行为是让被点的元素获得焦点），于是命令
        // 跑在一个已经塌掉的光标上——「加粗」会变成"在原地插两个星号"。
        // 菜单栏那边没这个问题（原生弹层不抢焦点），工具栏有。
        onMouseDown={(e) => e.preventDefault()}
        // ⚠️⚠️ **要弹框的那两颗走 `menu`，不走 `cmd`**（2026-10-11 修，用户：
        // 「现在工具栏没法插入图片」）。
        //
        // 根因：`onCommand` 是**编辑器命令**那条出口（`ui/useEditorCommands.ts::run`）。
        // 「链接 / 图片」这两颗的 `cmd`（`link` / `image`）在命令表里确实有实现，
        // 但它们要的是**参数**：`image` 那条会拿 `p?.src ?? ""` 去 `insertImageCommand`——
        // 工具栏点下去**一个参数都不带**，于是插进去的是一张 `src=""` 的空图，
        // 屏幕上看着就是"点了没反应"。它们真正的入口是菜单那条（`fmt.image` →
        // `ui/useImageInsert.ts::插入图像`，弹框问地址/文件）。
        // 所以：**有 `menu` 的走菜单那条路，没有的照旧走编辑器命令那条路**
        //（`fmt.link` / `fmt.image` 那两条在 `useCommandTable` 里就是弹框）。
        onClick={() => onCommand(b.cmd)}
      >
        {b.icon ? <Icon name={b.icon} /> : <span className={字形类(b.menu)}>{b.label}</span>}
      </button>
    );
  };

  return (
    <div className="format-bar" role="toolbar" aria-label={t("Formatting")} ref={ref}>
      {行内组.map(画)}
      <span className="format-sep" />
      {链接组.map(画)}
      <span className="format-sep" />
      {块组.map(画)}
      {/* 右端那颗 ×（2026-10-04，第 49 项）。
          ⚠️ **在 `.format-bar` 里面**（不是外面另起一条）：这一条是
          `overflow-x: auto` 的，而 `.format-bar-close` 靠 `position: sticky;
          right: 0` 钉在右端——窄窗口下按钮超宽时，**正是这种时候最需要它**
          （那时它要是跟着滚出去就白加了）。
          ⚠️ 与那三颗开关按钮**不同**：它不走 `onCommand`（没有这条命令），
          直接调 `onHide`。 */}
      <button
        type="button"
        className="format-bar-close"
        title={t("Hide the formatting toolbar")}
        aria-label={t("Hide the formatting toolbar")}
        onClick={onHide}
      >
        <Icon name="folio-close-symbolic" />
      </button>
    </div>
  );
}

/**
 * 提示语里的名字部分（`TITLES`，**住在组件里**，见那边那段注释）。
 *
 * ⚠️ 单开一张表而不是把名字塞进上面那几组：上面那几组还要按组遍历，
 * 多一个字段就多一处"抄错一个字"。这里是纯文案，改文案只碰这一处。
 */
