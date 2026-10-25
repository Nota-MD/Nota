/**
 * 左侧栏：**文件树** / **大纲** 两页。
 *
 * 快捷键 Ctrl+Shift+3 / Ctrl+Shift+1 分别切文件树 / 大纲（键位表在
 * `ui/commands.ts`，这里只是照它排页签的次序）。
 *
 * ⚠️ **2026-09-27 到 2026-09-28 之间这里有过第三页「文档列表」**（列的是
 * **最近打开过的文件**），2026-09-28 用户看图点名「**<文档列表>这一栏可以删了**」，
 * 于是整页连同菜单里的「视图 → 文档列表」（`Ctrl+Shift+2`）一起删掉。
 * ⚠️ **删的只是这一页，不是那份列表**：最近打开过的文件仍然在**「文件」菜单
 * 那一层子菜单**和**主页那一块**上（`ui/recentMenu.ts`、`ui/Home.tsx`），
 * 数据仍然由 `ui/useSession.ts` 从宿主那份侧车读回来。也就是说这一页**本来就
 * 只是同一份数据的第三个入口**，删掉它没有任何东西失去落脚点。
 *
 * ⚠️ 「文档列表」这一页和「文件」页那棵树**从来就是两码事**：那棵树是**磁盘上
 * 现在有什么**（跟着工作区走），那份列表是**用户最近碰过什么**（跟工作区无关）。
 * 合成一页的话，换一次工作区就会把最近记录一起换掉——这是当初它们分成两页的
 * 理由，也是现在"删掉一页不影响另一页"的理由。
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, type TreeNode } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { Icon } from "@/ui/Icon";
// ⚠️ 2026-09-27 起在 `editor/headings.ts`（原来挂在 `ui/outline.ts`）：
// 「内容目录」那条命令要**同一份判据**，见那份文件头。
import { extractOutline, type OutlineItem } from "@/editor/headings";
// 右缘那条可以拖的把手（2026-09-30）。⚠️ 它**渲染在这一栏里面**，理由见那边文件头。
import { SidebarResizer } from "@/ui/SidebarResizer";
import { FileList } from "@/ui/SidebarFiles";
import { SidebarContextMenu } from "@/ui/SidebarContextMenu";
import { useTablistKeys } from "@/ui/useTablistKeys";

export type SidebarTab = "tree" | "outline";

interface Props {
  workspace: string | null;
  tree: TreeNode[];
  /** 当前文档正文，用来抽大纲。 */
  docText: string;
  /** 当前文档的完整路径，用来在文件树里标出“正在编辑这一份”。 */
  activePath?: string | null;
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
  onJumpOutline: (target: { line: number; index: number }) => void;
  /** 展开某个子目录时按需取它那一层（`depth = 1`）。 */
  loadDir: (path: string) => Promise<TreeNode[]>;
  /**
   * 当前树口径的**字符串指纹**（`ui/tree-options.ts::口径键`）。
   *
   * ⚠️ 传的是那个字符串，**不是口径对象**：对象每次渲染都是新的，拿它当依赖
   * 等于每次渲染都重取一遍已经展开的目录。指纹只在"排序 / 过滤 / 隐藏文件"
   * 真的变了之后才换一个值。
   */
  optionKey: string;
  /**
   * 收起这一栏（右上角那颗 ×）。
   *
   * ⚠️ **只收，不"切换"**：传进来的东西只管关。要做成开关的话，用户
   * 点一个 × 却把它点开了——那种行为不合预期。开关语义留在 App 那边。
   */
  /**
   * 打开文件夹。**只在"还没打开工作区"那个空态里用**（2026-09-24 补）——
   * 那里原本只有一句话：界面提示要打开一个文件夹，
   * 却没有任何可点的地方（用户得自己想到「文件」菜单）。
   *
   * ⚠️ 与「文件 → 打开文件夹…」是**同一个回调**（`App.tsx` 的 `openFolder`），
   * 不是这里另开一条通路。
   */
  onOpenFolder: () => void;
  /** 底栏「＋」：新建一份文档。 */
  onNewFile: (workspaceFileName?: string) => void;
  /** 右键菜单：在当前工作区新建文件夹。 */
  onNewFolder: () => void;
  /** 底栏更多菜单：重新读取当前工作区。 */
  onRefresh: () => void;
  /** 每次自增都把文件页切到搜索框并聚焦。 */
  searchRequest?: number;
  /**
   * 摊着改动预览时把整栏锁掉（`inert`：点不动、也聚焦不了）。
   *
   * ⚠️ 锁**由 `App` 决定**（它才知道有没有预览），这里只把那个属性落到根节点
   * 上。理由与写法同 `ui/TabBar.tsx` 那一条：判据散开就会出现"三处里漏一处"，
   * 那处的症状是"预览开着还能从文件树里换掉文档"。
   */
  inert?: boolean;
  /**
   * 拖动右缘改宽度，**松手时**报一个最终值（2026-09-30）。
   *
   * ⚠️ 拖动过程本身**不走这里**：那是 `ui/SidebarResizer.tsx` 直接写
   * `--sidebar-width` 那条变量，一秒几十次派发 `updateSettings` 会把设置
   * 文件写穿。这里只接"拖完了，就这个数"。
   */
  onResize: (width: number) => void;
  /**
   * 收起来了（用户点的「显示/隐藏侧边栏」那三个入口之一，2026-09-30 加）。
   *
   * ⚠️ **这一栏始终挂着，折叠只把宽度动画到 0**（`styles/sidebar.css` 里那条
   * `transition`）：条件渲染的话元素是"凭空出现、凭空消失"的，没有加动画的
   * 余地（元素一挂上就是终态）。所以这个 prop 只负责**加一个类 ＋ 让整栏
   * `inert`**，不做卸载。
   *
   * ⚠️ **`inert` 不能省**：宽度归零之后里头那些按钮、树的行**还在 DOM 里**，
   * 不加的话 Tab 键会走进一个看不见的侧栏里（读屏也会念它）。
   */
  collapse2?: boolean;
}

export function Sidebar({
  workspace,
  tree,
  docText,
  activePath,
  strict,
  tab,
  onTab,
  onOpenFile,
  onJumpOutline,
  loadDir,
  optionKey,
  onOpenFolder,
  onNewFile,
  onNewFolder,
  onRefresh,
  searchRequest = 0,
  inert,
  onResize,
  collapse2,
}: Props) {
  // 订阅语言（宿主报来语言之后这一块要重画，见 `i18n/index.ts::useT`）。
  const t = useT();
  const outline = useMemo(() => extractOutline(docText, strict), [docText, strict]);
  const [fileView, setFileView] = useState<"list" | "tree">("list");
  const [creatingFile, setCreatingFile] = useState(false);
  const [searching, setSearching] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path: string | null;
  } | null>(null);
  const [footerMenu, setFooterMenu] = useState(false);
  const footer = useRef<HTMLDivElement>(null);
  const workspaceName = useMemo(() => {
    if (!workspace) return "Nota";
    const parts = workspace.replaceAll("\\", "/").replace(/\/+$/, "").split("/");
    return parts[parts.length - 1] || workspace;
  }, [workspace]);
  // 页签的方向键（第 50 项，2026-10-04）。
  const pageKeyBar = useRef<HTMLElement>(null);
  useTablistKeys(pageKeyBar);

  const startNewFile = useCallback(() => {
    if (!workspace) {
      onNewFile();
      return;
    }
    setFileView("list");
    setCreatingFile(true);
  }, [onNewFile, workspace]);

  useEffect(() => {
    if (!searchRequest) return;
    setFileView("list");
    setSearching(true);
  }, [searchRequest]);

  useEffect(() => {
    if (!footerMenu) return;
    const pointDistinguishPlace = (e: PointerEvent) => {
      const target = e.target;
      if (target instanceof Node && footer.current?.contains(target)) return;
      setFooterMenu(false);
    };
    const keypress = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFooterMenu(false);
    };
    document.addEventListener("pointerdown", pointDistinguishPlace);
    document.addEventListener("keydown", keypress);
    return () => {
      document.removeEventListener("pointerdown", pointDistinguishPlace);
      document.removeEventListener("keydown", keypress);
    };
  }, [footerMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const keypress = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", keypress);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", keypress);
    };
  }, [contextMenu]);

  return (
    <aside
      // ⚠️ 折叠**不卸载**，只加类（宽度动画到 0）——见 `折叠` 那个 prop 的注释。
      className={collapse2 ? "sidebar sidebar-collapsed" : "sidebar"}
      inert={inert || collapse2 || undefined}
      data-controls-open={footerMenu || contextMenu ? "true" : undefined}
    >
      {/* ⚠️ 页签与外层的 `role="tablist"` 之间**不能夹别的按钮**：tablist 的
          子元素按规矩只能是 tab，把 × 塞进去会让读屏把"关闭"念成一个页签。
          所以 × 在 tablist **外面**，两个一起装进这条 `sidebar-head`。 */}
      <div className="sidebar-head">
        {/* ⚠️ 方向键（←→/Home/End）走 `useTablistKeys`（第 50 项，2026-10-04）：
            挪焦点不切换，Enter 由 `TabButton` 的 `<button>` 自己点。 */}
        <nav ref={pageKeyBar} className="sidebar-tabs" role="tablist">
          <TabButton id="tree" current={tab} onSelect={onTab} label={t("File")} />
          {/* ⚠️ 顺序照「视图」菜单里那两条（`Ctrl+Shift+3` 文件树、
              `Ctrl+Shift+1` 大纲）：菜单里从上往下是文件树 → 大纲，
              这里也照这个次序排。 */}
          <TabButton id="outline" current={tab} onSelect={onTab} label={t("Outline")} />
        </nav>
        {/* ⚠️ **这里原来有一颗 ×**（收起侧栏），2026-10-11 用户点名去掉了
            （「右侧叉可以删掉」）。去掉不是"少了一个入口"：隐藏侧栏本来就有三条路
            ——菜单「视图 → 切换侧栏」、`Ctrl+Shift+L`、以及**状态栏最左那颗圈**
            （它画的就是这一栏的开合）。而那颗 × 站在页签右边，紧挨着页签，
            点错的代价是整栏消失、还得去别处找回来。 */}
      </div>

      <div className="sidebar-body">
        <section
          className="sidebar-pane"
          role="tabpanel"
          hidden={tab !== "tree"}
          onContextMenu={(e) => {
            e.preventDefault();
            const target = e.target as Element;
            const line3 = target.closest<HTMLElement>("[data-absolute-path]");
            const width = 272;
            const height = 472;
            setContextMenu({
              x: Math.max(8, Math.min(e.clientX, window.innerWidth - width - 8)),
              y: Math.max(8, Math.min(e.clientY, window.innerHeight - height - 8)),
              path: line3?.dataset.absolutePath ?? activePath ?? null,
            });
          }}
        >
          {workspace ? (
            fileView === "list" ? (
              <FileList
                nodes={tree}
                workspace={workspace}
                activePath={activePath ?? null}
                onOpenFile={onOpenFile}
                loadDir={loadDir}
                active={!collapse2 && tab === "tree"}
                creating={creatingFile}
                searching={searching}
                onCloseSearch={() => setSearching(false)}
                onCancelCreate={() => setCreatingFile(false)}
                onCreateFile={(name) => {
                  setCreatingFile(false);
                  onNewFile(name);
                }}
              />
            ) : (
              <FileTree
                nodes={tree}
                workspace={workspace}
                activePath={activePath ?? null}
                onOpenFile={onOpenFile}
                loadDir={loadDir}
                optionKey={optionKey}
              />
            )
          ) : (
            <div className="sidebar-empty-state">
              <p>{t("File list is empty")}</p>
            </div>
          )}
        </section>
        <section className="sidebar-pane" role="tabpanel" hidden={tab !== "outline"}>
          <Outline items={outline} onJump={onJumpOutline} />
        </section>
      </div>

      {tab === "tree" && (
        <div
          ref={footer}
          className={`sidebar-footer${workspace ? "" : " sidebar-footer-empty"}`}
        >
          {footerMenu && (
            <div className="sidebar-footer-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFooterMenu(false);
                  startNewFile();
                }}
              >
                {t("New Document")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFooterMenu(false);
                  onOpenFolder();
                }}
              >
                {t("Open Folder…")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFooterMenu(false);
                  onRefresh();
                }}
              >
                {t("Refresh")}
              </button>
            </div>
          )}
          {workspace ? (
            <>
              <button
                type="button"
                className="sidebar-footer-btn"
                title={t("New Document")}
                aria-label={t("New Document")}
                onClick={startNewFile}
              >
                <Icon name="folio-add-symbolic" />
              </button>
              <span className="sidebar-workspace" title={workspace}>
                {workspaceName}
              </span>
            </>
          ) : (
            <button
              type="button"
              className="sidebar-footer-open"
              onClick={onOpenFolder}
            >
              {t("Open Folder…")}
            </button>
          )}
          <button
            type="button"
            className="sidebar-footer-btn sidebar-more"
            title={t("More actions")}
            aria-label={t("More actions")}
            aria-expanded={footerMenu}
            onClick={() => setFooterMenu((open) => !open)}
          >
            ⋮
          </button>
          <button
            type="button"
            className="sidebar-footer-btn sidebar-view-toggle"
            title={t("Switch List/Tree View")}
            aria-label={t("Switch List/Tree View")}
            onClick={() => {
              setCreatingFile(false);
              setSearching(false);
              setFileView((view) => (view === "list" ? "tree" : "list"));
            }}
          >
            <span
              className={`sidebar-view-glyph ${fileView === "list" ? "is-list" : "is-tree"}`}
              aria-hidden="true"
            >
              <i /><i /><i />
            </span>
          </button>
        </div>
      )}

      {contextMenu && (
        <SidebarContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          path={contextMenu.path}
          workspace={workspace}
          listMode={fileView === "list"}
          onClose={() => setContextMenu(null)}
          onNewFile={startNewFile}
          onNewFolder={onNewFolder}
          onSearch={() => {
            setFileView("list");
            setSearching(true);
          }}
          onOpenFolder={onOpenFolder}
          onRefresh={onRefresh}
          onList={() => {
            setSearching(false);
            setFileView("list");
          }}
          onTree={() => {
            setSearching(false);
            setFileView("tree");
          }}
          onCopyPath={(path) => {
            void navigator.clipboard.writeText(path);
          }}
          onReveal={(path) => {
            void api.export.reveal(path).catch((e) => {
              console.warn("[nota] 打开文件位置失败：", e);
            });
          }}
        />
      )}

      {/* 右缘那条可以拖的把手（2026-09-30）。⚠️ **必须是 `.sidebar` 的最后一个
          子元素**：它靠 `parentElement` 量这一栏的左缘（判据见
          `ui/SidebarResizer.tsx` 文件头），换个位置量到的就是别人。 */}
      <SidebarResizer onCommit={onResize} />
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
  onJump: (target: { line: number; index: number }) => void;
}) {
  // 订阅语言。⚠️ 这是**另一个组件**，`Sidebar` 里那个 `t` 它够不着，得自己订阅一次
  //（`useT` 是 hook，不能在两个组件之间借用）。
  const t = useT();
  const [folded, setFolded] = useState<ReadonlySet<number>>(() => new Set());
  const [activeLine, setActiveLine] = useState<number | null>(null);

  useEffect(() => {
    const read = () => {
      const selection = window.getSelection();
      const anchor = selection?.anchorNode;
      const element = anchor instanceof Element ? anchor : anchor?.parentElement ?? null;
      const editor = element?.closest(".ProseMirror");
      if (!editor || !anchor) return;
      const headings = Array.from(editor.querySelectorAll("h1, h2, h3, h4, h5, h6"));
      let index = -1;
      for (let i = 0; i < headings.length; i += 1) {
        const heading = headings[i]!;
        if (heading === anchor || heading.contains(anchor)) {
          index = i;
          break;
        }
        if (heading.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING) {
          index = i;
        }
      }
      setActiveLine(index >= 0 ? items[index]?.line ?? null : null);
    };
    read();
    document.addEventListener("selectionchange", read);
    return () => document.removeEventListener("selectionchange", read);
  }, [items]);

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

  if (!items.length) {
    return (
      <div className="sidebar-empty-state">
        <p>{t("Outline is empty")}</p>
      </div>
    );
  }

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
            style={{ paddingLeft: `${(item.level - 1) * 16 + 4}px` }}
          >
            {hasKids ? (
              <button
                type="button"
                className="outline-twisty"
                data-folded={folded.has(item.line)}
                aria-expanded={!folded.has(item.line)}
                title={folded.has(item.line) ? t("Expand this section") : t("Collapse this section")}
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
              className={`outline-item${activeLine === item.line ? " outline-item-active" : ""}`}
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
  activePath: string | null;
  onOpenFile: (path: string) => void;
  loadDir: (path: string) => Promise<TreeNode[]>;
  optionKey: string;
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
  const kidsRef = useRef(kids);
  kidsRef.current = kids;

  /**
   * `loadDir` 的**最新一份**（ref 快照）。
   *
   * ⚠️ 下面那个"口径变了要重取"的 effect **不能把 `props.loadDir` 放进依赖
   * 数组**：`props` 每次渲染都是新对象，而 `loadDir` 的身份也会跟着设置刷新而
   * 变（它依赖口径）。放进去的后果是这个 effect 在**每一次设置写入**之后都跑一遍
   * ——用户改个字号，侧栏把已经展开的十几层目录重新读一次。
   * 用 ref 拿最新一份，依赖数组里就只剩那个指纹。
   */
  const loadDirRef = useRef(props.loadDir);
  loadDirRef.current = props.loadDir;

  /** 取一层子目录放进缓存。展开、以及"口径变了要重取"两条路共用。 */
  const getValueLayer = useCallback((path: string) => {
    void loadDirRef
      .current(path)
      .then((nodes) => setKids((prev) => ({ ...prev, [path]: nodes })))
      .catch((e: unknown) => {
        // 读不了就**如实写在那一行下面**，不要静默成"这个目录是空的"——
        // 那会让"权限不够"看起来像"文件夹里没东西"。
        setErrors((prev) => ({ ...prev, [path]: String(e) }));
      });
  }, []);

  /**
   * ⚠️ **口径一变，已经取回来的那几层就过期了**（2026-09-28 加）。
   *
   * 换排序 / 换过滤 / 拨开隐藏文件之后，缓存里那份顺序与内容都是按**旧口径**
   * 取的。不清的话，界面上会出现"顶层已经按新规则排了，展开的目录还是旧顺序"
   * ——同一棵树里两种排法，看起来像排序坏了。
   *
   * ⚠️ **不能对 `open` 里的路径只重取"已经在 `kids` 里"的那些**：过滤档从
   * `supported` 换成 `all` 时，新露出来的那些**目录**本来就没有缓存，而无缓存
   * 的目录是**不展开**的（`TreeRow` 只在 `kids[path]` 有值时才往下画）——
   * 于是"展开着的目录一个都没重取，新目录一个都不出现"。
   *
   * ⚠️ **清缓存、逐条重取，但不收回 `open`**：用户的展开状态与排序偏好无关，
   * 为了换个排序把树收回去，等于每次改设置都要重新展开一遍。
   */
  const aboveCountMouthPath = useRef(props.optionKey);
  useEffect(() => {
    if (aboveCountMouthPath.current === props.optionKey) return;
    aboveCountMouthPath.current = props.optionKey;
    const returnOpen = [...open];
    setKids({});
    setErrors({});
    for (const path of returnOpen) getValueLayer(path);
  }, [props.optionKey, open, getValueLayer]);

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

    getValueLayer(path);
  };

  useEffect(() => {
    if (!props.activePath) return;
    const normalize = (path: string) => path.replaceAll("\\", "/").replace(/\/+$/, "");
    const workspace = normalize(props.workspace);
    const active = normalize(props.activePath);
    if (!active.startsWith(`${workspace}/`)) return;
    const parts = active.slice(workspace.length + 1).split("/");
    const parents: string[] = [];
    for (let i = 1; i < parts.length; i += 1) parents.push(parts.slice(0, i).join("/"));
    if (!parents.length) return;
    setOpen((prev) => {
      const next = new Set(prev);
      for (const path of parents) next.add(path);
      return next;
    });
    for (const path of parents) {
      if (!kidsRef.current[path]) getValueLayer(path);
    }
  }, [props.activePath, props.workspace, getValueLayer]);

  if (!props.nodes.length) {
    return (
      <div className="sidebar-empty-state">
        <p>{t("File list is empty")}</p>
      </div>
    );
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
          activePath={props.activePath}
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
  activePath: string | null;
  onToggleDir: (path: string) => void;
  onOpenFile: (rel: string) => void;
}) {
  const { node, workspace, depth, open, kids, errors, activePath, onToggleDir, onOpenFile } = props;
  // 订阅语言（同 `Outline`：每个组件各自订阅一次）。
  const t = useT();
  const pad = { paddingLeft: `${depth * 18 + 6}px` };
  const normalize = (path: string) => path.replaceAll("\\", "/").replace(/\/+$/, "");
  const absolute = `${workspace}/${node.path}`;
  const isActive =
    activePath !== null && normalize(activePath) === normalize(absolute);

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
          data-absolute-path={`${workspace}/${node.path}`}
          onClick={() => onToggleDir(node.path)}
        >
          <span className="tree-twisty" data-open={expanded}>
            ▸
          </span>
          <Icon
            name={expanded ? "nota-tree-folder-open-symbolic" : "nota-tree-folder-symbolic"}
            size={16}
          />
          <span className="tree-row-label">{node.name}</span>
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
                activePath={activePath}
                onToggleDir={onToggleDir}
                onOpenFile={onOpenFile}
              />
            ))}
          </ul>
        )}

        {expanded && errors[node.path] && (
          <p className="tree-error" style={{ paddingLeft: `${(depth + 1) * 12 + 4}px` }}>
            {t("Cannot read this folder: {0}", errors[node.path] ?? "")}
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
        aria-current={isActive ? "page" : undefined}
        title={`${workspace}/${node.path}`}
        data-absolute-path={`${workspace}/${node.path}`}
        onClick={() => onOpenFile(node.path)}
      >
        <Icon name="nota-tree-file-symbolic" size={16} />
        <span className="tree-row-label">{node.name}</span>
      </button>
    </li>
  );
}
