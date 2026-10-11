/**
 * 右键菜单的**内容表**与**落点判据**——纯数据、纯函数，**不 import React**。
 *
 * # 为什么和弹层分成两份
 *
 * `ContextMenu.tsx` 那份要真开窗口、真右键才照得出来；这一份是"这张表里
 * 到底写了什么"。分开之后 `tests/context-menu.test.ts` 能在 node 里直接读它
 * （本仓没有 vitest / jsdom，见 `docs/06` §6.3），于是**最容易静默坏掉的那一点**
 * 才有闸门：
 *
 * ⚠️ **id 写错一个字符不会报错**。命令表是按 id 认的（`App.tsx` 的
 * `menuHandlers`），查不到就是"这条没实现"——菜单里那条**永远灰着**。
 * 肉眼扫一遍菜单很难发现少了一条能点的，所以这一份里出现的每一个 id 都要被
 * 测试逐条对账（`docs/06` §6.3 里那份 `context-menu`）。
 *
 * # 为什么是整个接管，而不是"改改 WebKit 那份"
 *
 * 用户 2026-10-04 报的：右键弹出来的是英文的 `Cut / Copy / Paste / Paste As
 * Plain Text / … / Inspect Element`，很割裂。那份菜单是 **WebKitGTK 自己画的**，
 * 文案来自它自己的 gettext 目录、受**进程 locale** 控制——**和 Nota 的语言设置
 * 没有半点关系**（`src/i18n/` 里那几张表管不着它）。所以它改不动，只能整个
 * 拦掉重画：`contextmenu` 事件里 `preventDefault()`。
 *
 * ⚠️ **「拦得住」这件事已经有先例，不是猜的**：`ui/TabBar.tsx` 早就这么干过
 * （标签上那个菜单），那边的注释写着"不拦的话 WebKitGTK 会弹出它自己那份默认菜单"。
 *
 * # 三档
 *
 * | 档 | 判据 | 表现 |
 * |---|---|---|
 * | 不弹 | 目标在 `.tabbar` 里（标签栏自己认领了） | **连拦都不拦**，让 `TabBar` 那一份照旧 |
 * | 输入框 | `input` / `textarea` | 短菜单（撤销 / 重做 / 剪切 / 复制 / 粘贴 / 全选） |
 * | 编辑器 | 在 `.ProseMirror` / `.cm-editor` / `.editor-pane` 里 | 全量菜单（三排图标 ＋ 两栏子菜单） |
 * | 外壳 | 其余 | **只拦不弹** |
 *
 * ⚠️ **「不弹」那一档不能省**：`TabBar` 是在**冒泡阶段**自己 `preventDefault` 的
 * （`ui/TabBar.tsx` 那一段），而本仓这一个是挂在 **window 的捕获阶段**——它会
 * **先**跑。那一档要是也一律拦下、再按"外壳"处理，右键一个标签就**什么都不弹**，
 * 标签上那份菜单（连同"新窗口打开"）从此消失，而且不报错。
 * 所以判据里必须有它，而且那一档**不许 `preventDefault`**。
 *
 * ⚠️ **「输入框」排在「编辑器」前面**，这条顺序是反直觉的、也是必须的：
 * 编辑区里**真的有输入框**——公式源码框、图表源码框、代码块的语言框都在
 * `.editor-pane` 里（`ui/accel.ts` 那条 2026-09-26 的教训就记着它们，那边甚至
 * 为此**故意**把它们算作"编辑区里面"）。顺序反过来的话，在公式源码框里右键
 * 会拿到整份 markdown 菜单，而菜单里那些 `run(...)` 打的是**文档**、不是那个
 * 框——用户会以为"在框里加粗"没反应。
 *
 * ⚠️ 别把这个判据和 `accel.ts::isOutsideEditor` 合并：那两个问的是**两件事**。
 * 那边问"这条快捷键该不该归编辑器管"（答案：公式框里也算编辑器，否则框里
 * `Ctrl+S` 会失效），这边问"右键该画哪份菜单"。同一个位置、两个相反的答案，
 * 都是有意的。
 *
 * ⚠️ **「外壳只拦不弹」是用户 2026-10-04 明确选的**（另两个选项是"弹一份大半
 * 置灰的最小菜单"与"顺带把文件树的重命名/删除做出来"）。**代价要如实说**：
 * 右键侧栏/文件树**什么都不发生**——那里现在确实没有任何右键动作可给
 * （文件树那一族是另一个功能，见 `docs/07` 第 77 项）。这一条写进了 `docs/04`。
 */

import { isMenuItem, 取条目, 右键插入项, 右键段落项, type MenuEntry, type MenuItemSpec } from "@/ui/commands";

/** 右键落在哪儿。四档的表现完全不同，见文件头那张表。 */
export type 落点 = "编辑器" | "输入框" | "外壳" | "不弹";

/** 落点判据吃的那几件事。**都不碰 DOM**：调用方查完再传进来（这样才测得了）。 */
export interface 落点线索 {
  /** 目标是不是 `input` / `textarea`。 */
  是输入框: boolean;
  /** 目标在不在编辑区里（`.ProseMirror` / `.cm-editor` / `.editor-pane`）。 */
  在编辑器里: boolean;
  /** 已经有别人认领了这一下（标签栏）。 */
  已被认领: boolean;
}

/**
 * 判落点。**顺序要紧**：认领 → 输入框 → 编辑器 → 外壳（理由见文件头那张表）。
 */
export function 判落点(线索: 落点线索): 落点 {
  if (线索.已被认领) return "不弹";
  if (线索.是输入框) return "输入框";
  if (线索.在编辑器里) return "编辑器";
  return "外壳";
}

/** 一个空灰名单。见 {@link 这一档的灰}——只读，共用一份没有风险。 */
const 一个都不灰: ReadonlySet<string> = new Set<string>();

/**
 * 这一档该拿哪份灰名单。
 *
 * ⚠️ **输入框那一档一个都不灰**，2026-10-04 开窗口检抓出来的缺陷：
 * 那六条（撤销/重做/剪切/复制/粘贴/全选）的实现住在
 * `ui/ContextMenu.tsx::落到输入框`，**根本不经过命令表**；而菜单栏那份
 * `disabledCommands`（`ui/useMenus.ts`）的第一条判据就是"`menuHandlers` 里
 * 有没有这一条"。两把尺子量的是两件事，套上去的后果是量到的那一条：
 *
 * `edit.select`（全选）**按设计**没接进命令表——编辑区里的全选走 ProseMirror
 * 原生那套（`tests/context-menu.test.ts` 里那条测试专门钉着"别顺手接"）——
 * 于是它永远在灰名单里，于是**输入框里那条有实现、点得动的「全选」被画成灰的**。
 * 用户看到的是一行淡字，键盘也走不到它（`findEdgeEnabled` 会跳过灰的，
 * `End` 落在倒数第二项 `Paste` 上）。**不是"少了一条功能"，是"有功能却看不出来"**。
 *
 * ⚠️ 同一个道理还有第二种情形，只是今天还没撞上：`edit.undo` / `edit.copy`
 * 那一族带 `needsDoc`，**没有打开文档时整族都是灰的**——可是那时候设置面板里
 * 的输入框照样打得开、照样该能撤销。拿命令表的账去管输入框，迟早要在这儿再摔一次。
 *
 * ⚠️ **反过来不成立**：编辑器那一档（以及菜单栏）必须原样用它。那份灰名单是
 * "命令表里这一条能不能用"的**唯一**真相源，菜单自己不判第二遍（`ui/useMenus.ts`
 * 文件头那张表）。
 */
export function 这一档的灰(位置: 落点, 灰: ReadonlySet<string>): ReadonlySet<string> {
  return 位置 === "输入框" ? 一个都不灰 : 灰;
}

/**
 * 编辑器那一档的**第一排**：剪贴板四件。
 *
 * ⚠️ 这四条**不在 `FormatBar` 那张表里**（那边是格式按钮），图标名也就不在
 * 那张 `图标表` 里——它们由 `ui/ContextMenu.tsx` 里一张小表单独给。
 * 分界是"这是不是一条格式命令"，不是"长得像不像按钮"。
 */
export const 剪贴图标: readonly string[] = [
  "edit.cut",
  "edit.copy",
  "edit.paste",
  "edit.delete",
];

/**
 * 第二排：行内标记四件（加粗 / 斜体 / 行内代码 / 链接）。
 *
 * ⚠️ 这四条**与格式化工具栏是同一批 id**，图标名也从那边的那张表取
 * （`FormatBar.tsx` 导出的 `图标表`）——那正是"同一个命令两个入口不该各写一份"
 * 那条规矩（见 `FormatBar.tsx` 文件头）。
 */
export const 行内图标: readonly string[] = ["fmt.bold", "fmt.italic", "fmt.code", "fmt.link"];

/** 第三排：块级四件（引用 / 无序 / 有序 / 任务）。见 {@link 行内图标}。 */
export const 块图标: readonly string[] = ["para.quote", "para.ul", "para.ol", "para.task"];

/**
 * 输入框那一档的条目。
 *
 * ⚠️ **走的是 `MENUS` 里现成的 id**（`edit.undo` / `edit.copy`…），但**实现
 * 完全是另一套**：那些命令的实现是给编辑区（ProseMirror）写文档的，而这里
 * 要作用在一个 DOM 输入框上。所以 `ui/ContextMenu.tsx` 对这几条**另挂了一组
 * 处理器**，不经过 `menuHandlers`。
 *
 * ⚠️ 借 id 不是偷懒：id 一样、**译文就一样**。另起一组 id 的话，同一个
 * "Paste" 要在译文表里出现两次，两处迟早会漂。
 */
export const 输入框条目: readonly string[] = [
  "edit.undo",
  "edit.redo",
  "sep",
  "edit.cut",
  "edit.copy",
  "edit.paste",
  "sep",
  "edit.select",
];

/** 右键菜单渲染用的行。**比 `MenuEntry` 多一种 `icons`**（那是一排按钮格子）。 */
export type 行 =
  | { kind: "icons"; key: string; ids: readonly string[] }
  | { kind: "item"; key: string; spec: MenuItemSpec }
  | { kind: "spell"; key: string; id: string; label: string }
  | { kind: "sep"; key: string };

/**
 * 拼写那一段的三个动作 id（**现场造出来的，不在命令表里**）。
 *
 * ⚠️ 它们**故意不写进 `ui/commands.ts` 的 `MENUS`**：那三条命令的前提是
 * "用户右键点在**哪一个**错词上"，而命令表的形状是 `id → () => void`
 * （`App.tsx` 的 `menuHandlers`）——它**说不出来"哪一个"**，塞进去只会多出
 * 一个永远不知道自己在说哪个词的处理器。所以实现就在 `ui/ContextMenu.tsx`
 * 自己身上（与"输入框那一档"同一个先例，见文件头那张表）。
 *
 * ⚠️ 建议那几条的 id 是 **`spell.replace:<下标>`**：下标指的是**这一刻**那一列
 * 建议里的第几条（菜单是从 `nota_spell_suggest` 现拉的，每次都不一样），
 * 所以它只能是运行时的。
 */
export const 拼写加词典 = "spell.add";
export const 拼写忽略 = "spell.ignore";
export const 拼写替换前缀 = "spell.replace:";

/**
 * 错词那一段要的三样东西。
 *
 * ⚠️ 那两个动作名**是调用方翻好了递进来的**（`t("Add to dictionary")` 写在
 * `ContextMenu.tsx` 里）：这一份是**纯的、不 import React**（见文件头那段），
 * 拿不到 `useT()`。
 * ⚠️ 而建议那几条**原样用**（不过 `t()`）——它们是从词典里查出来的真词，
 * 不是文案：哪天某个建议恰好等于一条界面原文（`Ignore` 这种真词完全可能存在），
 * 过一遍翻译就会把它**翻成别的**。
 */
export interface 拼写线索 {
  建议们: readonly string[];
  加词典: string;
  忽略: string;
}

/**
 * 错词上右键时挂在**最前面**的那一段：建议（可能一条都没有）＋ 两个动作。
 *
 * ⚠️ 拼错的那个词本身**不画出来**：菜单就弹在它上面，再写一遍是废话——
 * Typora 与常见编辑器也都是这么画的。
 * ⚠️ 建议一条都没有时**不画那一格空行**（底下空空如也看着像坏了）：
 * `spell/mod.rs` 那句"拿不到建议就给空表"在这里的落点就是"少一段，
 * 不影响下面两个动作"。
 * ⚠️ 每条建议**各占一行漫游落点**（不像图标那样整排算一个）：这一列是文本、
 * 长短不一，"排里翻格"那套左右键语义在这儿没有意义，↑↓ 一路走过去最自然。
 */
export function 拼写行(线索: 拼写线索): 行[] {
  const 行们: 行[] = 线索.建议们.map((建议, i) => ({
    kind: "spell",
    key: `spell-${i}`,
    id: `${拼写替换前缀}${i}`,
    label: 建议,
  }));
  if (行们.length > 0) 行们.push({ kind: "sep", key: "spell-sep-1" });
  行们.push({ kind: "spell", key: "spell-add", id: 拼写加词典, label: 线索.加词典 });
  行们.push({ kind: "spell", key: "spell-ignore", id: 拼写忽略, label: 线索.忽略 });
  行们.push({ kind: "sep", key: "spell-sep-2" });
  return 行们;
}

/**
 * 这一档的菜单长什么样。
 *
 * ⚠️ 形状是用户 2026-10-04 定的（拿 Typora 那份当参照）：
 * **三排图标 →「复制为…」→ 两栏子菜单**。
 *
 * ⚠️ 「段落」/「插入」两栏住在 `ui/commands.ts`（`右键段落项` / `右键插入项`），
 * 不在这里——不是因为它们更"基础"，是因为 `tools/i18n-check.sh` 只在那几份
 * 文件里认 `label:` 那种写法，搬过来的话 `"Insert"` 会被当成废键报 FAIL。
 *
 * ⚠️ **开发模式多一条「开发者工具」**（`view.devtools`，视图菜单里本来就有）。
 * 理由：原生菜单里那条 `Inspect Element` 被我们拦掉了，开发时得留个门。
 * 判据用 `import.meta.env.DEV`——**正式构建里这一条不存在**。
 */
export function 给行(
  位置: 落点,
  开发模式: boolean,
  /**
   * 这一下右键落在**一个错词**上时给的那一段（`ContextMenu.tsx` 从
   * `.nota-spell-error` 那个元素上认出来，见 `editor/spell-check.ts`）。
   * `null` = 没落在错词上，菜单照旧。
   */
  拼写: 拼写线索 | null = null,
): 行[] {
  if (位置 === "输入框") {
    // ⚠️ **摊平**（见 `条目行` 那第三个参数）：`edit.select` 在编辑菜单里
    // 2026-10-07 起是一个**子菜单的壳**（选行/词/句那四条），但输入框这一档
    // 要的是**全选**那一条（`ContextMenu.tsx::落到输入框` 里那个
    // `document.execCommand("selectAll")`）。放着一层子菜单渲染出去的话，
    // 输入框上右键会飞出一层"选当前词"这种**编辑区命令**——点了什么也不会
    // 发生（那几个处理函数只认编辑区）。
    return 条目行(输入框条目, "输入框", true);
  }
  if (位置 !== "编辑器") return []; // 外壳：只拦不弹（见文件头那张表）

  const 行们: 行[] = [
    ...(拼写 ? 拼写行(拼写) : []),
    { kind: "icons", key: "icons-clip", ids: 剪贴图标 },
    ...条目行(["edit.copyAs"], "复制为"),
    { kind: "sep", key: "sep-1" },
    { kind: "icons", key: "icons-inline", ids: 行内图标 },
    { kind: "icons", key: "icons-block", ids: 块图标 },
    { kind: "sep", key: "sep-2" },
    { kind: "item", key: "ctx.paragraph", spec: 右键段落项 },
    { kind: "item", key: "ctx.insert", spec: 右键插入项 },
  ];
  if (开发模式) 行们.push({ kind: "sep", key: "sep-3" }, ...条目行(["view.devtools"], "工具"));
  return 行们;
}

/**
 * 一串 id → 渲染行。`"sep"` 变分隔线，取不到的 id **整条跳过**。
 *
 * ⚠️ 键（`key`）是 `名字 + 下标`，不是 id：同一个 id 在一份菜单里只会出现
 * 一次，但重复写它不会被 React 报错——只会让某一行认错身份。拼下标最省事。
 *
 * ⚠️ `摊平`（第三个参数）＝"**把子菜单的壳摘掉，只留它自己那一条**"。
 * 目前只有输入框那一档用（那条的理由写在 `给行` 里）。⚠️ 标签与 id 仍然
 * **从 `MENUS` 里取**（`取条目`）——摊平的是结构，不是名字：另起一条平行
 * 的条目表就意味着同一个 "Select" 要写两遍、两处迟早会漂（这一段的上文）。
 */
function 条目行(ids: readonly string[], 名字: string, 摊平 = false): 行[] {
  const out: 行[] = [];
  ids.forEach((id, i) => {
    if (id === "sep") {
      out.push({ kind: "sep", key: `${名字}-sep-${i}` });
      return;
    }
    const spec = 取条目(id);
    if (!spec) return;
    // 摘壳：只留"点一下执行"用得着的那几格（`accel` 留着——输入框那一档
    // 虽然不吃快捷键，但显示出来是对的，用户按 Ctrl+Shift+V 会看到它）。
    const 一条 = 摊平 && spec.submenu
      ? {
          id: spec.id,
          label: spec.label,
          accel: spec.accel,
          needsDoc: spec.needsDoc,
          checkable: spec.checkable,
          danger: spec.danger,
        }
      : spec;
    out.push({ kind: "item", key: `${名字}-${id}`, spec: 一条 });
  });
  return out;
}

/**
 * 这一行灰不灰。
 *
 * ⚠️ **判据不在这里**——灰名单是 `ui/useMenus.ts` 算的（命令表里有没有
 * 处理器 / 要不要文档 / 光标条件），原样传进来。这里只负责另一种情况：
 * **一排图标、一栏子菜单，是"整条"灰才算灰**。两边各判一遍必然有一天对不上，
 * 而"灰错了"不报错，只是那条点不动或看着点不动（`useMenus` 那一节写着）。
 *
 * ⚠️ 子菜单的父项**不在** `灰名单` 里：`ctx.paragraph` / `ctx.insert` 根本
 * 不在 `MENUS` 里（见 `ui/commands.ts` 那两条），而 `edit.copyAs` 虽然在里面，
 * `useMenus` 判它时用的也是"子项全灰才灰"这条一样的规矩。所以这里自己算一遍
 * 是必须的，不是重复。
 */
export function 整行灰(r: 行, 灰: ReadonlySet<string>): boolean {
  if (r.kind === "sep") return true;
  if (r.kind === "icons") return r.ids.every((id) => 灰.has(id));
  // ⚠️ 拼写那一段**永远不灰**：它不在 `灰名单` 里（那份名单是命令表的账，
  // 而这几条是现场造出来的 id），照下面那两行去查会一律命中"不在名单里 ⇒
  // 当灰的看"——那正是"加了一条菜单、它却永远灰着"那个老毛病。
  if (r.kind === "spell") return false;
  const 子 = r.spec.submenu;
  if (子) {
    const 真条目 = 子.filter(isMenuItem);
    return 真条目.length === 0 || 真条目.every((c) => 灰.has(c.id));
  }
  return 灰.has(r.spec.id);
}

/**
 * 图标行里往一个方向找下一颗**能用**的。
 *
 * ⚠️ **不绕回**（和上下键那个 `findNextEnabled` 有意不同）：上下键在一列里
 * 从头绕到尾是"回到开头"，用户认得出；而一排图标里按 `→` 从最后一颗跳到
 * 第一颗**看着像卡了一下又跳回去**。到头了就**停在原地**——这也是
 * `findNextEnabled` 那条注释里"移动不是定位"的同一句话。
 *
 * ⚠️ 返回 `当前` 表示"没处去"。调用方据此决定要不要重画焦点（对照
 * `findEdgeEnabled` 返回 -1 的语义：那边是"这里根本没有能落的地方"）。
 */
export function 行内下一格(
  可用: readonly { disabled?: boolean }[],
  当前: number,
  方向: 1 | -1,
): number {
  for (let i = 当前 + 方向; i >= 0 && i < 可用.length; i += 方向) {
    if (!可用[i]?.disabled) return i;
  }
  return 当前;
}

/**
 * 这一份表里写到的全部 id（含子菜单里的、含输入框那一档）。
 *
 * ⚠️ **存在的唯一理由是给测试用**：它要逐条对账"这些 id 在 `MENUS` 里都找得到
 * 吗"。手写一遍清单就等于第二份真相源，所以让它自己摊——`给行` 走哪条路，
 * 它就收哪条路。
 */
export function 表里全部id(): string[] {
  const 收: string[] = [];
  const 摊 = (ids: readonly string[]) => {
    for (const id of ids) if (id !== "sep") 收.push(id);
  };
  for (const 档 of ["编辑器", "输入框"] as const) {
    // ⚠️ 循环变量**不叫 `行`**：上面有个同名的类型，叫一样了读的人要愣一下。
    for (const 项 of 给行(档, true)) {
      if (项.kind === "icons") 摊(项.ids);
      else if (项.kind === "item") 收.push(项.spec.id);
    }
  }
  // 两栏子菜单里的条目（`给行` 只给出父项本身）。
  摊子(右键段落项.submenu, 收);
 摊子(右键插入项.submenu, 收);
  return 收;
}

function 摊子(entries: readonly MenuEntry[] | undefined, 收: string[]): void {
  for (const e of entries ?? []) {
    if (e === "sep") continue;
    收.push(e.id);
    // 目前只一层，写递归是防哪天加了第二层——那时这里不该悄悄漏掉。
    摊子(e.submenu, 收);
  }
}
