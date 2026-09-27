/**
 * 左侧栏：**文件树** / **文档列表** / **大纲** 三页。
 *
 * 快捷键 Ctrl+Shift+1/2/3 分别切大纲 / 文档列表 / 文件树（键位表在
 * `ui/commands.ts`，这里只是照它排页签的次序）。
 *
 * ⚠️ **「文档列表」是 2026-09-27 补上的**（在那之前菜单里写着这一项、它是灰的，
 * 而这一栏只有两页）。它列的是**最近打开过的文件**——内容与「文件」页那棵树
 * 完全无关（那棵树跟着工作区走），见 `RecentList` 的注释。
 *
 * ⚠️ **「插件」那一页 2026-09-22 搬到了右边**，见 `ui/PluginDock.tsx`——
 * 这一栏只管**文档导航**，工具面板不跟它挤。
 *
 * # 两处都能折（2026-09-24）
 *
 * 用户原话「**侧边栏的标题应当可以折叠**」。这句话在这一栏里有**两个落点**，
 * 两个都做了（少做一个就会得到"还是不能折"的回音）：
 *
 * | 折什么 | 在哪儿 | 折的是 |
 * |---|---|---|
 * | **标题**（大纲里的 H1–H6） | 大纲页 | 它下面那些更深的标题 |
 * | **目录**（文件树里的文件夹） | 文件页 | 那一层子节点 |
 *
 * ⚠️ **两处的折叠状态都住在本地 state 里，不进 `Settings`。** 它是"这一眼
 * 怎么看"，不是"这个应用怎么配"——写进设置就要跟着落盘、跟着同步，
 * 而下次打开文档时"上次折了哪几个标题"几乎没有价值。
 *
 * ⚠️ 文件树是**按需取子目录**的（`nota_workspace_tree` 的 `subPath`/`depth`），
 * 不是一次拉整棵树——几万个文件的仓库那样会卡住界面。见 `commands/workspace.rs`。
 *
 * # 右上角那个 × （2026-09-24 补）
 *
 * 用户原话「**那个侧边栏不能通过一个叉关掉**」。在那之前这一栏只有一个出口：
 * 「视图 → 显示/隐藏侧边栏」（`Ctrl+Shift+L`，见 `ui/commands.ts`），
 * 而那是个**菜单项**——手在鼠标上的人不会去翻菜单，只会盯着栏子找那个叉。
 *
 * 所以这里补一个 ×，**照右侧插件栏那颗做**（`ui/PluginDock.tsx` 的 `.dock-close`，
 * 连样式值都是同一套）：两栏并排站着，一颗有叉一颗没有，本身就是个说不通的地方。
 *
 * ⚠️ **× 只是同一个开关的第二个入口，不是第二份状态。** 开合状态住在 `App.tsx`
 * 的 `sidebarOpen` 里，菜单项、快捷键、这颗 × 三条路都调同一个 setter。
 * 在这里自己 `useState` 一份的话，症状是"用 × 关掉、菜单里那一项还勾着"。
 *
 * ⚠️ 关掉之后**不在这里留"怎么再打开"的提示**，也不在栏子外面挂一条竖标签：
 * 「视图」菜单里那一项带着勾、写着快捷键，它才是权威入口。真要找不着，
 * 那条路比任何自造的把手稳。
 */

import { useMemo, useState } from "react";

import type { TreeNode } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { Icon } from "@/ui/Icon";
// ⚠️ 2026-09-27 起在 `editor/headings.ts`（原来挂在 `ui/outline.ts`）：
// 「内容目录」那条命令要**同一份判据**，见那份文件头。
import { extractOutline, type OutlineItem } from "@/editor/headings";
import { 父目录名, 文件名 } from "@/ui/useSession";

export type SidebarTab = "tree" | "outline" | "docs";

interface Props {
  workspace: string | null;
  tree: TreeNode[];
  /**
   * 最近打开过的文件（新的在前）。**第三页「文档列表」的内容**
   *（`ui/useSession.ts` 从宿主那份侧车读回来的）。
   *
   * ⚠️ 它和「文件」页那棵树是两码事：那棵树是**磁盘上现在有什么**（跟着
   * 工作区走），这一份是**用户最近碰过什么**（跟工作区无关，可以是任何一个
   * 角落里的文件）。合成一页的话，换一次工作区就会把最近记录一起换掉。
   */
  最近: readonly string[];
  /** 点一条最近记录 → 打开它（`ui/useSession.ts::打开最近`）。 */
  onOpenRecent: (path: string) => void;
  /** 把一条最近记录摘掉（那一行右边的 ×）。**只清记录，不删文件。** */
  onForgetRecent: (path: string) => void;
  /** 当前文档正文，用来抽大纲。 */
  docText: string;
  /**
   * **严格模式**（`Settings.strict_markdown`）。大纲是**从正文猜**的，而
   * `#你好` 算不算标题取决于它——不传就会出现"侧栏和正文各说各的"。
   */
  strict: boolean;
  /**
   * 当前是哪一页。**由 App 持有，不由这里自己存。**
   *
   * ⚠️ 原来这里是 `useState`。改成受控是因为「视图 → 大纲 / 文件树」那两个
   * 菜单项要能切它——菜单在 App 里，够不着这里的局部状态。同样的理由让
   * `dockOpen` 一开始就放在 App 上。
   */
  tab: SidebarTab;
  onTab: (t: SidebarTab) => void;
  onOpenFile: (path: string) => void;
  /**
   * 点大纲里的一个标题 → 跳到正文里那一处（第 48 项）。
   *
   * ⚠️ 两个坐标都给出去：`line` 是原文行号（源码模式用），`index` 是它在大纲
   * 里的**序号**（所见即所得用，ProseMirror 的文档树里没有"行"）。
   * 这一层**不替调用方挑**——两种坐标在两种模式下各自精确，挑错了就是跳错地方。
   */
  onJumpOutline: (目标: { line: number; index: number }) => void;
  /** 展开某个子目录时按需取它那一层（`depth = 1`）。 */
  loadDir: (path: string) => Promise<TreeNode[]>;
  /**
   * 收起这一栏（右上角那颗 ×）。
   *
   * ⚠️ **只收，不"切换"**：传进来的东西只管关。要做成开关的话，用户
   * 点一个 × 却把它点开了——那种行为不合预期。开关语义留在 App 那边。
   */
  onClose: () => void;
  /**
   * 打开文件夹。**只在"还没打开工作区"那个空态里用**（2026-09-24 补）——
   * 那里原本只有一句话：界面提示要打开一个文件夹，
   * 却没有任何可点的地方（用户得自己想到「文件」菜单）。
   *
   * ⚠️ 与「文件 → 打开文件夹…」是**同一个回调**（`App.tsx` 的 `openFolder`），
   * 不是这里另开一条通路。
   */
  onOpenFolder: () => void;
  /**
   * 摊着改动预览时把整栏锁掉（`inert`：点不动、也聚焦不了）。
   *
   * ⚠️ 锁**由 `App` 决定**（它才知道有没有预览），这里只把那个属性落到根节点
   * 上。理由与写法同 `ui/TabBar.tsx` 那一条：判据散开就会出现"三处里漏一处"，
   * 那处的症状是"预览开着还能从文件树里换掉文档"。
   */
  inert?: boolean;
}

export function Sidebar({
  workspace,
  tree,
  最近,
  onOpenRecent,
  onForgetRecent,
  docText,
  strict,
  tab,
  onTab,
  onOpenFile,
  onJumpOutline,
  loadDir,
  onClose,
  onOpenFolder,
  inert,
}: Props) {
  // 订阅语言（宿主报来语言之后这一块要重画，见 `i18n/index.ts::useT`）。
  const t = useT();
  const outline = useMemo(() => extractOutline(docText, strict), [docText, strict]);

  return (
    <aside className="sidebar" inert={inert || undefined}>
      {/* ⚠️ 页签与外层的 `role="tablist"` 之间**不能夹别的按钮**：tablist 的
          子元素按规矩只能是 tab，把 × 塞进去会让读屏把"关闭"念成一个页签。
          所以 × 在 tablist **外面**，两个一起装进这条 `sidebar-head`。 */}
      <div className="sidebar-head">
        <nav className="sidebar-tabs" role="tablist">
          <TabButton id="tree" current={tab} onSelect={onTab} label={t("文件")} />
          {/* ⚠️ 顺序照「视图」菜单里那三条（`Ctrl+Shift+3` 文件树、
              `Ctrl+Shift+2` 文档列表、`Ctrl+Shift+1` 大纲）：菜单里从上往下
              是文件树 → 文档列表 → 大纲，这里也照这个次序排。 */}
          <TabButton id="docs" current={tab} onSelect={onTab} label={t("文档列表")} />
          <TabButton id="outline" current={tab} onSelect={onTab} label={t("大纲")} />
        </nav>
        <button
          type="button"
          className="sidebar-close"
          title={t("收起侧边栏")}
          aria-label={t("收起侧边栏")}
          onClick={onClose}
        >
          <Icon name="folio-close-symbolic" />
        </button>
      </div>

      <div className="sidebar-body">
        {tab === "tree" &&
          (workspace ? (
            <FileTree nodes={tree} workspace={workspace} onOpenFile={onOpenFile} loadDir={loadDir} />
          ) : (
            // ⚠️ 这一块**必须有那颗按钮**（2026-09-24 补）：只有一句话的话，
            // 用户盯着的就是这个死胡同——界面说"去打开一个文件夹"，
            // 而唯一的路藏在菜单里。
            <div className="sidebar-empty">
              <p className="sidebar-empty-lead">
                {t("还没打开文件夹。打开一个文件夹后，这里会列出其中的 Markdown。")}
              </p>
              <button type="button" className="btn btn-with-icon" onClick={onOpenFolder}>
                <Icon name="folio-document-open-symbolic" />
                {t("打开文件夹…")}
              </button>
            </div>
          ))}

        {tab === "docs" && (
          <RecentList items={最近} onOpen={onOpenRecent} onForget={onForgetRecent} />
        )}

        {tab === "outline" && <Outline items={outline} onJump={onJumpOutline} />}
      </div>
    </aside>
  );
}

function TabButton(props: {
  id: SidebarTab;
  current: SidebarTab;
  onSelect: (t: SidebarTab) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.current === props.id}
      className={`sidebar-tab ${props.current === props.id ? "sidebar-tab-active" : ""}`}
      onClick={() => props.onSelect(props.id)}
    >
      {props.label}
    </button>
  );
}

/* ── 文档列表：最近打开过的文件 ─────────────────────────────────────────── */

/**
 * 第三页：**最近打开过的文件**（`docs/10` §5「最近文件列表」「文章列表」两格）。
 *
 * ⚠️ **顺序由宿主决定，这里不排序**：侧车那份 `recent` 就是"新的在前"
 *（`session.rs::推入最近` 每开一次就把那条挪到最前）。在这里再排一次的话，
 * "最近"这个词就有了两个判据——而它们迟早会不一致（一边按时间、一边按名字）。
 *
 * ⚠️ **每一条右边那颗 × 只是"忘掉它"，不是"删掉文件"**。所以它**不弹确认框**：
 * 一句"确定要从列表里去掉吗"会把这件事说得比它重得多，而真按错了的代价只是
 * 下次再打开一次这个文件。危险动作才要确认，这条不是。
 *
 * ⚠️ 路径整个进 `title`，列表里只显示"文件名 — 上一层目录"：两个同名的
 * `笔记.md` 在这一页里必须分得开，而完整路径横着排会挤成一条看不清的乱码。
 */
function RecentList({
  items,
  onOpen,
  onForget,
}: {
  items: readonly string[];
  onOpen: (path: string) => void;
  onForget: (path: string) => void;
}) {
  // 订阅语言（同 `Outline`：这是另一个组件，`Sidebar` 里那个 `t` 它够不着）。
  const t = useT();

  if (items.length === 0) {
    return (
      <div className="sidebar-empty">
        <p className="sidebar-empty-lead">
          {t("还没有最近打开的文件。打开过的文件会列在这里。")}
        </p>
      </div>
    );
  }

  return (
    <ul className="sidebar-list">
      {items.map((路径) => (
        <li key={路径} className="sidebar-item">
          <button
            type="button"
            className="sidebar-item-open"
            // ⚠️ 完整路径进 tooltip：列表里那一行是"文件名 — 上一层目录"，
            // 两个不同目录下的同名文件靠它才分得开。
            title={路径}
            onClick={() => onOpen(路径)}
          >
            <span className="sidebar-item-name">{文件名(路径)}</span>
            <span className="sidebar-item-dir">{父目录名(路径)}</span>
          </button>
          <button
            type="button"
            className="sidebar-item-x"
            title={t("从列表里去掉")}
            aria-label={t("从列表里去掉")}
            onClick={() => onForget(路径)}
          >
            <Icon name="folio-close-symbolic" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ── 大纲：标题可以逐个折叠 ─────────────────────────────────────────────── */

/**
 * 大纲的一行。
 *
 * `hasKids` 是**算出来的**，不是数据里带的：markdown 的标题是**扁平的**，
 * "谁是谁的子标题"只能靠"下一个标题的层级更深"推出来。
 */
interface OutlineRow {
  item: OutlineItem;
  hasKids: boolean;
  hidden: boolean;
}

/**
 * 折哪个标题，用**行号**记（`OutlineItem.line`）。
 *
 * ⚠️ 不用数组下标：正文一改，索引会整体平移，而"折着的那个标题"会跳到
 * 另一个标题上——症状是"折的是'三'，实际把'四'折了"。行号只在
 * **上面插了几行**时才失效，那比每次打字都失效好得多。
 */
function Outline({
  items,
  onJump,
}: {
  items: OutlineItem[];
  /** 点一个标题跳过去。坐标口径见 `Props.onJumpOutline`。 */
  onJump: (目标: { line: number; index: number }) => void;
}) {
  // 订阅语言。⚠️ 这是**另一个组件**，`Sidebar` 里那个 `t` 它够不着，得自己订阅一次
  //（`useT` 是 hook，不能在两个组件之间借用）。
  const t = useT();
  const [folded, setFolded] = useState<ReadonlySet<number>>(() => new Set());

  const rows = useMemo<OutlineRow[]>(() => {
    const hasKids = items.map(
      (h, i) => i + 1 < items.length && items[i + 1]!.level > h.level,
    );

    return items.map((h, i) => {
      // 往上找**整条祖先链**：从 i 往前，遇到层级更小的就记一个祖先，
      // 然后以它为新的基准继续往前。链上**任何一个**折着，这一行就看不见。
      // ⚠️ 只检查"最近的那一个祖先"是不够的——外层的折着、内层那个
      // 也被折过一次时，展开外层会连带把内层那棵也露出来。
      let hidden = false;
      let level = h.level;
      for (let j = i - 1; j >= 0 && level > 1; j--) {
        const prev = items[j]!;
        if (prev.level < level) {
          if (folded.has(prev.line)) {
            hidden = true;
            break;
          }
          level = prev.level;
        }
      }
      return { item: h, hasKids: hasKids[i]!, hidden };
    });
  }, [items, folded]);

  if (!items.length) return <p className="sidebar-empty">{t("这份文档还没有标题。")}</p>;

  const toggle = (line: number) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });

  return (
    <ul className="outline">
      {rows.map(({ item, hasKids, hidden }, i) => {
        if (hidden) return null;
        let childCount = 0;
        for (let j = i + 1; j < items.length && items[j]!.level > item.level; j++) childCount++;
        return (
          <li
            key={`${item.line}-${i}`}
            className="outline-row"
            style={{ paddingLeft: `${(item.level - 1) * 12 + 4}px` }}
          >
            {hasKids ? (
              <button
                type="button"
                className="outline-twisty"
                data-folded={folded.has(item.line)}
                aria-expanded={!folded.has(item.line)}
                title={folded.has(item.line) ? t("展开这一节") : t("折叠这一节")}
                onClick={() => toggle(item.line)}
              >
                ▸
              </button>
            ) : (
              // 没有子标题时**留一个同宽的占位**：不留的话叶子和父标题的
              // 文字起点就差 14px，扫一列标题时看着像缩进乱了。
              <span className="outline-twisty outline-twisty-leaf" aria-hidden="true" />
            )}
            {/* ⚠️ 是 `button` 不是加了 `onClick` 的 `span`：键盘用户要能
                Tab 过来、回车跳过去。用 `span` 的话这个功能对键盘等于不存在，
                而侧栏其余可点的东西（三角、页签、×）本来就都是按钮。 */}
            <button
              type="button"
              className="outline-item"
              title={item.text}
              onClick={() => onJump({ line: item.line, index: i })}
            >
              {item.text}
            </button>
            {folded.has(item.line) && <span className="outline-folded-count">{childCount}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/* ── 文件树：目录可以展开 ─────────────────────────────────────────────── */

function FileTree(props: {
  nodes: TreeNode[];
  workspace: string;
  onOpenFile: (path: string) => void;
  loadDir: (path: string) => Promise<TreeNode[]>;
}) {
  // 订阅语言（同 `Outline`：每个组件各自订阅一次）。
  const t = useT();
  /**
   * 已经取回来的子目录：`目录的相对路径 → 那一层节点`。
   *
   * ⚠️ 收着取回来的东西、**不回写 App 那棵树**：`tree` 是"工作区打开时
   * 那一次快照"，往里合并就要在 App 里做一棵可变的树。展开状态本来
   * 就是这一栏自己的事，缓存在这一层最直接。
   */
  const [kids, setKids] = useState<Record<string, TreeNode[]>>({});
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const toggle = (path: string) => {
    if (open.has(path)) {
      setOpen((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      return;
    }

    // ⚠️ 先展开再取：目录是空的还是"正在取"在界面上没有区别，而等回来
    // 再展开会让点击有一拍延迟（本地目录通常快到看不出来，网络盘就看出来了）。
    setOpen((prev) => new Set(prev).add(path));
    if (kids[path]) return;

    void props
      .loadDir(path)
      .then((nodes) => setKids((prev) => ({ ...prev, [path]: nodes })))
      .catch((e: unknown) => {
        // 读不了就**如实写在那一行下面**，不要静默成"这个目录是空的"——
        // 那会让"权限不够"看起来像"文件夹里没东西"。
        setErrors((prev) => ({ ...prev, [path]: String(e) }));
      });
  };

  if (!props.nodes.length) {
    return <p className="sidebar-empty">{t("这个文件夹里没有 Markdown 文件。")}</p>;
  }

  /**
   * 树里存的是**相对工作区**的路径，打开文件要绝对路径。
   *
   * ⚠️ 这个前缀**只拼一次、只在这一处**：早先是每个行组件自己
   * `${workspace}/${node.path}`，于是"谁拼路径"散在渲染树里，
   * 展开子目录时很容易漏掉（子节点也是相对路径，不是相对父目录）。
   */
  const openFile = (rel: string) => props.onOpenFile(`${props.workspace}/${rel}`);

  return (
    <ul className="tree">
      {props.nodes.map((n) => (
        <TreeRow
          key={n.path}
          node={n}
          workspace={props.workspace}
          depth={0}
          open={open}
          kids={kids}
          errors={errors}
          onToggleDir={toggle}
          onOpenFile={openFile}
        />
      ))}
    </ul>
  );
}

function TreeRow(props: {
  node: TreeNode;
  workspace: string;
  depth: number;
  open: ReadonlySet<string>;
  kids: Record<string, TreeNode[]>;
  errors: Record<string, string>;
  onToggleDir: (path: string) => void;
  onOpenFile: (rel: string) => void;
}) {
  const { node, workspace, depth, open, kids, errors, onToggleDir, onOpenFile } = props;
  // 订阅语言（同 `Outline`：每个组件各自订阅一次）。
  const t = useT();
  const pad = { paddingLeft: `${depth * 12 + 4}px` };

  if (node.is_dir) {
    const expanded = open.has(node.path);
    const children = kids[node.path];
    return (
      <li className="tree-dir">
        <button
          type="button"
          className="tree-dir-btn"
          style={pad}
          data-open={expanded}
          aria-expanded={expanded}
          title={node.path}
          onClick={() => onToggleDir(node.path)}
        >
          <span className="tree-twisty" data-open={expanded}>
            ▸
          </span>
          {node.name}
        </button>

        {expanded && children && (
          <ul className="tree">
            {children.map((c) => (
              <TreeRow
                key={c.path}
                node={c}
                workspace={workspace}
                depth={depth + 1}
                open={open}
                kids={kids}
                errors={errors}
                onToggleDir={onToggleDir}
                onOpenFile={onOpenFile}
              />
            ))}
          </ul>
        )}

        {expanded && errors[node.path] && (
          <p className="tree-error" style={{ paddingLeft: `${(depth + 1) * 12 + 4}px` }}>
            {t("读不了这个文件夹：{0}", errors[node.path] ?? "")}
          </p>
        )}
      </li>
    );
  }

  return (
    <li className="tree-file">
      <button
        type="button"
        className="tree-file-btn"
        style={pad}
        title={`${workspace}/${node.path}`}
        onClick={() => onOpenFile(node.path)}
      >
        {node.name}
      </button>
    </li>
  );
}
