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
 * ⚠️ 这也是为什么按钮**不用任何自绘的"我记得我按过"状态**：
 * 亮/不亮直接等于 `state` 里那一位。本地记的话，光标移走之后那颗按钮还亮着。
 *
 * # 图标
 *
 * 2026-09-24 起有一半按钮画的是图标（`ui/Icon.tsx` 里那套从 Folio 搬来的）。
 * **另一半仍是文字字形**（`H1`/`引`/`任`），理由写在 `按钮.icon` 那段注释里。
 * 两种长相共用一套按钮样式，高亮/悬停的颜色也是同一条 `color` 链。
 */

import type { CommandState } from "@/editor/command-state";
import type { EditorCommand } from "@/editor/create";
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
}

/** 菜单 id → 快捷键文本。**从 `MENUS` 派生，不手写**（见文件头）。 */
const 键位表 = (() => {
  const m = new Map<string, string>();
  walkMenuItems(MENUS, (item) => {
    if (item.accel) m.set(item.id, item.accel);
  });
  return m;
})();

/** 菜单 id + 名字 → 提示语。菜单里没这一条（或没配键）时只给名字。 */
function 提示(menu: string, 名字: string): string {
  const a = 键位表.get(menu);
  return a ? `${名字}（${formatAccel(a)}）` : 名字;
}

/**
 * 行内标记那四个字段。
 *
 * ⚠️ **不能写成 `keyof CommandState`**：那个类型里还有 `block`（是个字符串
 * 联合）、`inTable`、`hasSelection`，`state[b.on]` 于是会是
 * `boolean | BlockKind`——直接喂给 `aria-pressed` 就是编译错。收窄成这四个，
 * "行内按钮只能看行内那几位"这件事就由类型钉住了。
 */
type 行内位 = "bold" | "italic" | "strike" | "inlineCode";

/**
 * 一颗按钮。`menu` 是它在菜单表里的对应条目——**只用来取快捷键提示**，
 * 点了跑的还是 `cmd`。
 */
interface 按钮 {
  cmd: EditorCommand;
  menu: string;
  label: string;
  /**
   * 有它就用图标，没有就用 `label` 那个文字字形。
   *
   * ⚠️ **混着用是有意的**：Folio 那套（`src/ui/Icon.tsx`）里**没有**
   * H1/H2/H3、引用、任务列表这些图标——`H1` 这个字形比任何小图标都清楚。
   * 为了"整条都是图标"去现画几枚，等于自己又开一套图标库，
   * 那正是这套搬运想避免的事。
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
];

/** 链接与图片。它们要弹框问地址，所以没有"亮不亮"这一说。 */
const 链接组: 按钮[] = [
  { cmd: "link", menu: "fmt.link", label: "链", icon: "folio-insert-link-symbolic" },
  { cmd: "image", menu: "fmt.image", label: "图", icon: "folio-insert-image-symbolic" },
];

/**
 * 块级那一组。**同一时刻只亮一颗**（`state.block` 是个单值，见
 * `command-state.ts` 里为什么不用一排布尔）。
 *
 * ⚠️ `task` 与 `ul` 都是列表，但**不能合成一颗**：Typora 的工具栏上
 * 任务列表和无序列表是分开的两颗，而它们的文档树节点也不同
 * （`list_item.checked` 是不是 `null`）。合成一颗的话，光标在任务项里
 * 时亮的是"无序列表"，用户会以为自己没转成功。
 */
const 块组: 按钮[] = [
  { cmd: "h1", menu: "para.h1", label: "H1", block: "h1" },
  { cmd: "h2", menu: "para.h2", label: "H2", block: "h2" },
  { cmd: "h3", menu: "para.h3", label: "H3", block: "h3" },
  { cmd: "quote", menu: "para.quote", label: "引", block: "quote" },
  { cmd: "ul", menu: "para.ul", label: "•", icon: "folio-view-list-bullet-symbolic", block: "ul" },
  { cmd: "ol", menu: "para.ol", label: "1.", icon: "folio-view-list-ordered-symbolic", block: "ol" },
  { cmd: "task", menu: "para.task", label: "任", block: "task" },
  { cmd: "codeBlock", menu: "para.codeBlock", label: "{ }", icon: "folio-insert-code-symbolic", block: "codeBlock" },
  { cmd: "clearFormat", menu: "fmt.clear", label: "清", icon: "folio-eraser-symbolic" },
];

export function FormatBar({ state, onCommand }: Props) {
  /** 一颗按钮。三组共用这一处渲染，免得三份 JSX 各自漂移。 */
  const 画 = (b: 按钮) => {
    // ⚠️ 高亮的两种来源**互斥**：`on` 是行内标记（粗体 + 斜体可以同时亮），
    // `block` 是块级（同一时刻只亮一颗）。一颗按钮只属于其中一组。
    const 亮 = b.on ? (state?.[b.on] ?? false) : b.block ? state?.block === b.block : false;
    const 可亮 = Boolean(b.on || b.block);
    return (
      <button
        key={b.cmd}
        type="button"
        className="format-btn"
        data-on={亮}
        // ⚠️ `aria-pressed` 只在**已知状态**时给：源码模式下给 `false`
        // 等于断言"现在不是粗体"——而我们并不知道。
        aria-pressed={state && 可亮 ? 亮 : undefined}
        title={提示(b.menu, TITLES[b.cmd] ?? b.label)}
        // ⚠️ 图标按钮**必须**再给一个 `aria-label`：`.icon` 是 `aria-hidden` 的，
        // 按钮里于是没有一个字，读屏只拿 `title`（最弱的那种可读名字）。
        // 给的和 `title` 同一句，所以念出来也带着快捷键。
        aria-label={b.icon ? 提示(b.menu, TITLES[b.cmd] ?? b.label) : undefined}
        // ⚠️ `onMouseDown` 里 `preventDefault`：不拦的话，按钮会把编辑区的
        // 选区**先抢走**（浏览器的默认行为是让被点的元素获得焦点），于是命令
        // 跑在一个已经塌掉的光标上——「加粗」会变成"在原地插两个星号"。
        // 菜单栏那边没这个问题（原生弹层不抢焦点），工具栏有。
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onCommand(b.cmd)}
      >
        {b.icon ? <Icon name={b.icon} /> : <span className={`format-glyph format-glyph-${b.cmd}`}>{b.label}</span>}
      </button>
    );
  };

  return (
    <div className="format-bar" role="toolbar" aria-label="格式化">
      {行内组.map(画)}
      <span className="format-sep" />
      {链接组.map(画)}
      <span className="format-sep" />
      {块组.map(画)}
    </div>
  );
}

/**
 * 提示语里的名字部分。**只用中文词，不用快捷键**（那是 `提示` 拼上去的）。
 *
 * ⚠️ 单开一张表而不是把名字塞进上面那几组：上面那几组还要按组遍历，
 * 多一个字段就多一处"抄错一个字"。这里是纯文案，改文案只碰这一处。
 */
const TITLES: Partial<Record<EditorCommand, string>> = {
  bold: "加粗",
  italic: "斜体",
  strike: "删除线",
  inlineCode: "行内代码",
  link: "超链接",
  image: "图像",
  h1: "一级标题",
  h2: "二级标题",
  h3: "三级标题",
  quote: "引用",
  ul: "无序列表",
  ol: "有序列表",
  task: "任务列表",
  codeBlock: "代码块",
  clearFormat: "清除样式",
};
