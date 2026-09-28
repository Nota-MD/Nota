/**
 * 偏好设置那个框：**左栏分节 + 右栏内容**。
 *
 * ```text
 * ┌──────────────┬────────────────────────────────────┐
 * │ [搜索设置…]  │  界面风格                          │
 * │ ▸ 文件       │  ┌──────────────┬────────┬───────┐ │
 * │   编辑器     │  │ 组标题       │ 子标签 │ 控件  │ │
 * │   图像       │  ├──────────────┼────────┼───────┤ │
 * │   Markdown   │  │ 明暗         │        │ [▣][▣]│ │
 * │   导出       │  │ 跟随系统偏好 │        │ (●—)  │ │
 * │   外观       │  └──────────────┴────────┴───────┘ │
 * │   文档主题   │                                    │
 * │   快捷键     │                                    │
 * │   强制专注   │                                    │
 * │   拓展       │                                    │
 * │   通用       │                                    │
 * │ [ 完成 ]     │                                    │
 * └──────────────┴────────────────────────────────────┘
 * ```
 *
 * # 十一页是怎么来的
 *
 * 前七页（文件 / 编辑器 / 图像 / Markdown / 导出 / 外观 / 通用）是一组通用分节，
 * **中间四页是 Nota 自己的**：
 *
 * - **文档主题**——单独成页，不并在「外观」里：2026-09-23 划的线
 *   （「这是文档风格，不是界面风格」），并排摆着才和那条线一致；
 * - **快捷键**——不从「通用」页上放一个链接进去，而是独立一整页
 *   （从菜单里读出来的，见 `panes/ShortcutsPane.tsx`）；
 * - **强制专注**——用户 2026-09-26 明说「在拓展自己的设置页面进行设置」，
 *   即这块功能的旋钮**归这一页**（`panes/FocusPane.tsx`）；
 * - **拓展**——用户 2026-09-27：「完全没有拓展管理面板。做一个。可以导入，
 *   导出和卸载拓展」。在此之前装/卸只能从右侧插件栏点，**导出根本不存在**
 *   （`panes/ExtensionsPane.tsx` 顶上写着这一页与那一栏的分工）。
 *
 * 顺序按前七页的排列，Nota 自有的四页插在各自该在的位置。
 *
 * # 三件事的分工（都别改）
 *
 * 1. **左栏搜索是就地过滤**，不是跳转：查询非空时十一页**叠着**渲染，
 *    每行自己比标签、说明和**所属组的标题**（见 `primitives.tsx` 顶上那段）。
 *    所以搜索态下左栏不高亮任何一页——`data-active` 那一行是 `!searching && …`。
 * 2. **改动即时生效**，唯一那个按钮是「完成」（= 关掉）。⚠️ 不要加「取消」，
 *    理由在 `panes/FilesPane.tsx` 顶上（改动已经写盘了，一个「取消」撤销不了
 *    它，要么撒谎要么得再做一套暂存-回滚）。
 * 3. **文档主题那一页只读**。换主题在「主题」菜单里，那边是唯一入口。
 *
 * # 为什么不是窗口
 *
 * 偏好设置做成**覆盖层**，不是独立窗口。差别是有意的：
 * 覆盖层不需要处理"关了主窗口设置窗口还开着"这类生命周期问题，
 * 也省掉一套窗口管理的 IPC。代价是它盖住了正文——而外观这种东西
 * **正是要边看边调**的，所以框做得够宽（`min(1080px, 94vw)`），
 * 两侧都留得下正文。真的挡住的那一块，拖窗口就是了。
 */

import { useEffect, useRef, useState } from "react";

import type { DocThemeInfo, PluginInfo, Settings, UiStyleInfo, 信任记录 } from "@/bridge/ipc";
import { useT } from "@/i18n";
import type { MenuSpec } from "@/ui/commands";
import { Icon, type 图标名 } from "@/ui/Icon";
import type { 插件动作 } from "@/ui/usePlugins";
import { QueryProvider, SearchField } from "./primitives";
import { AppearancePane } from "./panes/AppearancePane";
import { DocThemePane } from "./panes/DocThemePane";
import { EditorPane } from "./panes/EditorPane";
import { ExportPane } from "./panes/ExportPane";
import { ExtensionsPane } from "./panes/ExtensionsPane";
import { FilesPane } from "./panes/FilesPane";
import { FocusPane } from "./panes/FocusPane";
import { GeneralPane } from "./panes/GeneralPane";
import { ImagePane } from "./panes/ImagePane";
import { MarkdownPane } from "./panes/MarkdownPane";
import { ShortcutsPane } from "./panes/ShortcutsPane";
import type { PaneProps } from "./panes/props";

type SectionId =
  | "files"
  | "editor"
  | "image"
  | "markdown"
  | "export"
  | "appearance"
  | "docTheme"
  | "shortcuts"
  | "focus"
  | "extensions"
  | "general";

/**
 * 左栏的十一页。
 *
 * ⚠️ 图标来自 `ui/Icon.tsx` 那张 `名字表`：**十一枚里七枚是 Folio 那 96 枚里的，
 * 四枚（Markdown / 文档主题 / 强制专注 / 拓展）是 Nota 自己画的**——Folio 那一套里
 * 没有"框里的 MD""框里的 Aa""秒表""拼图块"这几个形状，而最接近的那几枚都指错了
 * 东西（每一枚的理由写在下面 `SECTIONS` 上）。
 * 在这之前左栏用的是 `primitives.tsx` 里手写的五枚 24 格细线图标——那是
 * **第二套画风**，和工具栏、侧栏、菜单里那 96 枚摆在一起就看得出不一样。
 * 现在全应用一套（同一套 16 格填充画法）。加一页 = 挑一枚已有的 + 往 `名字表`
 * 加一行（如果还没加）。
 *
 * ⚠️ 写成 `Record`：加一页时漏了下面那条 `ORDER`，症状是"这一页点不到"
 * ——不报错。两处都在同一个文件里，改一处时看得见另一处。
 */
const SECTIONS: Record<SectionId, 图标名> = {
  // ⚠️ 这里**只有图标**。十一页的**名字**是界面文案，挪到组件体里的 `页名` 表去了
  // （模块级求值时 `t` 还没订阅，而且 `tools/i18n-check.sh` 只认源码里的字面量
  // `t("…")`——那一对理由写在 `页名` 上面）。别把名字搬回这张表。
  // 文件页管的是启动、文件树、拖放 —— 一枚「打开的文件夹」
  files: "folio-document-open-symbolic",
  editor: "folio-edit-symbolic",
  image: "folio-insert-image-symbolic",
  // 框里的 MD——这一页整页都在讲 Markdown 的语法。⚠️ 原先是 `¶`（段落符），
  // 那说的是"显示编辑标记"，是**另一个设置项**，指错了东西（2026-09-25 换）。
  markdown: "nota-markdown-symbolic",
  export: "folio-document-export-symbolic",
  // 一枚窗口 = 整个应用的样子（外观页管外壳，不管正文）
  appearance: "folio-window-symbolic",
  // 一枚"拼图"= 拓展那一页（装 / 导出 / 卸载）。⚠️ 这一枚是 **Nota 自己画的**
  // （`nota-` 前缀，同「Markdown」「文档主题」那几枚的来路）：Folio 那 96 枚里
  // **没有拼图块**，而"拓展"这件事的形状就是拼图——用别的（齿轮、方块）都会
  // 指到别的意思上去（齿轮已经是「通用」那一页了）。
  extensions: "nota-plugin-symbolic",
  // 框里的 Aa = 正文的字与色（这一页只管正文，不管外壳）。
  // ⚠️ 原先是"页面 + 分页参考线"，那说的是打印/页码（2026-09-25 换）。
  docTheme: "nota-doc-theme-symbolic",
  shortcuts: "nota-keys-symbolic",
  // 强制专注：秒表。⚠️ 这一枚是**Nota 自己画的**（同上面那两枚的来路）——
  // 那一套里没有秒表，而最近的两枚都指错了东西，理由写在 `ui/Icon.tsx`。
  focus: "nota-force-focus-symbolic",
  general: "folio-configure-symbolic",
};

/**
 * 显示顺序（Nota 那四页插在各自该在的位置）。
 * 第一节不是打开时的默认——默认是「外观」，见下面 `useState`。
 *
 * ⚠️ 「强制专注」放在「通用」**前面**：通用那页是"别的都归不到一起的东西"，
 * 一直是收尾那一页；而强制专注是一整块有自己账本的功能，不该塞进收尾里。
 */
const ORDER: SectionId[] = [
  "files",
  "editor",
  "image",
  "markdown",
  "export",
  "appearance",
  "docTheme",
  "shortcuts",
  "focus",
  "extensions",
  "general",
];

interface Props {
  settings: Settings;
  /** 改一项。**即时生效**，见文件头。 */
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
  /** 只读：用来在「文档主题」那一页显示当前是哪套、以及深色主题的可选项。 */
  docThemes: DocThemeInfo[];
  onOpenThemesDir: () => void;
  /** 只读：界面风格的清单（内置的 ＋ 用户导入的），「外观」那一页的下拉用。 */
  uiStyles: UiStyleInfo[];
  /** 打开用户界面风格目录（`~/.config/nota/ui-styles`）。 */
  onOpenStylesDir: () => void;
  /** 打开设置文件所在的目录（`~/.config/nota`）。通用页的「高级设置」。 */
  onOpenConfigDir: () => void;
  /** 恢复出厂默认。整份替换，新的那一份由后端返回。 */
  onResetSettings: () => void;
  /**
   * 清空「最近打开」那份记录（文件页那颗「清除记录」）。
   *
   * ⚠️ 它是**动作**、不是设置项：调用之后没有可回滚的状态，也没有"取消"。
   * 界面上那句说明就写着"只清记录，不碰文件本身"——所以这里**不弹确认框**
   *（`ui/useSession.ts::清空最近` 里写了为什么不弹）。
   */
  onClearRecent: () => void;
  /**
   * 全应用那一份菜单表（**已经叠过用户的键位覆盖**），「快捷键」那一页用。
   * 见 `panes/props.ts` 里同名字段那一段。
   */
  menus: readonly MenuSpec[];
  /**
   * 已装插件清单，「拓展」那一页用。
   *
   * ⚠️ 下面这三样**不并进 `PaneProps`**：它们与设置项一个字节都不沾，整包铺给
   * 十一页的话，别的页也会莫名其妙拿到一份插件清单（`panes/props.ts` 顶上那段
   * 写着同一件事：一页该依赖什么，得能从它的入参一眼读出来）。
   * 这三样是 `App.tsx` 里**同一个 `usePlugins`** 喂的——右侧插件栏吃的是
   * 同一份，所以不会出现"那一栏说装好了、这一页还没有"。
   */
  plugins: PluginInfo[];
  /** 信任库里那几把钥匙（指纹 + 名字）。⚠️ **要摆出来**：信任按指纹判，看不见的表等于没有表。 */
  插件信任: 信任记录[];
  /** 装 / 导出 / 卸 / 启停 / 信任那几颗按钮的实现。见 `ui/usePlugins.ts`。 */
  插件动作: 插件动作;
}

export function SettingsDialog({
  settings,
  onChange,
  onClose,
  docThemes,
  onOpenThemesDir,
  uiStyles,
  onOpenStylesDir,
  onOpenConfigDir,
  onResetSettings,
  onClearRecent,
  menus,
  plugins,
  插件信任,
  插件动作,
}: Props) {
  // 订阅语言（宿主报来语言之后这一块要重画，见 `i18n/index.ts::useT`）。
  // 局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();

  /**
   * 左栏十一页的名字。
   *
   * ⚠️ **必须写在组件里现建**，不能提到模块级当常量——理由与
   * `PluginDock.tsx::能力名` 那三张表完全相同：模块级求值时 `t` 还是
   * **没订阅**的那个版本（首帧画的是兜底语言，而且之后没有任何东西会通知它
   * 重画）；另外 `tools/i18n-check.sh` 数的是**源码里字面写出来的 `t("…")`**，
   * 写成模块级的 `t(表[id])` 就不算调用，`en.ts` 里那几条会算"废键"→ 闸门 FAIL。
   */
  const 页名: Record<SectionId, string> = {
    files: t("File"),
    editor: t("Editor"),
    image: t("Image"),
    // ⚠️ 这一条**不包 `t()`**：Markdown 是同一门语言的词，中英两版一模一样。
    markdown: "Markdown",
    export: t("Export"),
    appearance: t("Appearance"),
    docTheme: t("Document Themes"),
    shortcuts: t("Shortcuts"),
    // ⚠️ 名字里**不能省掉「强制」**：上面「外观」上面那条菜单项叫「专注模式」
    // （F8，收起外壳），和这一页是两件事。名字撞了的话，用户找"专注"会找到
    // 那一页去，然后觉得"怎么只有个界面开关"。（`ui/commands.ts` 那两条的注释）
    focus: t("Force Focus"),
    // ⚠️ 页名叫「拓展」而**不是「插件」**：右侧那一栏的清单页已经叫「插件」了
    // （`PluginDock.tsx`），两处同名会让人以为点哪个都一样。这一页管的是
    // **装 / 导出 / 卸载**（用户 2026-09-27 的原话就是"拓展管理面板"）。
    extensions: t("Extensions"),
    general: t("General"),
  };

  const panelRef = useRef<HTMLDivElement>(null);
  // ⚠️ 默认开在「外观」而不是第一节「文件」：打开设置的人多半是要调样子或者
  // 找 Markdown 那几档开关，而文件页那几条（启动选项、拖放）一辈子改一次。
  const [section, setSection] = useState<SectionId>("appearance");
  const [query, setQuery] = useState("");

  // 查询先小写化再进 context：`hits()` 只做一次 `includes`，
  // 不该让每一行都自己 `toLowerCase` 一遍。
  const normalized = query.trim().toLowerCase();
  const searching = normalized.length > 0;

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // ── 键盘：Esc 关闭 ＋ **焦点陷阱** ──────────────────────────────────────
  //
  // ⚠️ **焦点陷阱不是可选项**（2026-09-25，用户体验评估抓出来的）。这个面板
  // 标着 `aria-modal="true"`，但在此之前只有 Escape 一个键盘处理：挂载时
  // `panelRef.current.focus()` 把焦点接过来，之后**放任它跑出去**。一路按 Tab
  // 焦点会落到面板背后那个可编辑的正文上，此后打的每个字都写进文档——而屏幕上
  // 盖着设置面板，**用户看不见自己正在改文件**。实测：面板里按 208 次 Tab 再
  // Esc，文档净增 271 个字符，状态栏变成"已修改"。
  //
  // 两道闸，缺一不可：
  //   ① Tab / Shift+Tab 在面板内首尾相接，焦点**从不离开**；
  //   ② `focusin` 兜住非键盘的出路（鼠标点、程序 focus），一旦落在面板外就拉回。
  // 只留 ② 的话，焦点先跑出去再被拽回，Tab 的落点每次都重置到面板容器上、
  // 键盘用户等于没法在面板里走动；只留 ① 的话，鼠标那条路还敞着。
  //
  // ⚠️ 面板里**没有 portal**（设置那套原语不弹 `MenuPopup`，只有菜单栏弹），
  // 所以"在面板外"就是"该拉回来"，不必给谁留口子。以后要是有哪一页改成弹
  // 浮层，这里有第二处要改。
  useEffect(() => {
    /** 面板里此刻真的能聚焦的格子。⚠️ 藏起来的不算：搜索态下每一页都渲染、
     *  靠 CSS 藏行，不滤掉的话 Tab 会掉进看不见的格子里（`offsetParent`
     *  为 `null` 就是 `display: none`）。 */
    const 可聚焦 = (panel: HTMLElement) =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),' +
            ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const list = 可聚焦(panel);
      if (list.length === 0) {
        e.preventDefault();
        return;
      }

      const first = list[0];
      const last = list[list.length - 1];
      // 上面判过 `length === 0`，这里是给类型看的（`noUncheckedIndexedAccess`）。
      if (!first || !last) {
        e.preventDefault();
        return;
      }
      const active = document.activeElement as HTMLElement | null;

      // 焦点已经在外面（或还在面板容器自己身上）：Tab 一律拉回第一格／最后一格。
      if (!active || !panel.contains(active) || active === panel) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      const panel = panelRef.current;
      const target = e.target as Node | null;
      if (!panel || !target || panel.contains(target)) return;
      panel.focus();
    };

    window.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, [onClose]);

  /** 某一页的内容。搜索态下**全上**，靠每一行自己过滤。 */
  const paneFor = (id: SectionId) => {
    const props: PaneProps = {
      settings,
      onChange,
      docThemes,
      onOpenThemesDir,
      uiStyles,
      onOpenStylesDir,
      onOpenConfigDir,
      onResetSettings,
      onClearRecent,
      menus,
    };
    switch (id) {
      case "files":
        return <FilesPane {...props} />;
      case "editor":
        return <EditorPane {...props} />;
      case "image":
        return <ImagePane {...props} />;
      case "markdown":
        return <MarkdownPane {...props} />;
      case "export":
        return <ExportPane {...props} />;
      case "docTheme":
        return <DocThemePane {...props} />;
      // ⚠️ 快捷键页**不吃 `{...props}`**（2026-09-27 起它可编辑了，但吃的仍然只有
      // 这三样）：条目从菜单表里算、改动只往 `keys` 那一节写。整包铺过去的话，
      // 这一页会莫名其妙拿到 `docThemes` / `uiStyles` 那些和它无关的东西，
      // 下次有人在这一页里用上其中一个，就再也说不清"它到底该依赖什么"了。
      case "shortcuts":
        return <ShortcutsPane menus={menus} settings={settings} onChange={onChange} />;
      case "focus":
        return <FocusPane {...props} />;
      // ⚠️ 拓展页**不吃 `{...props}`**（同「快捷键」那一条，理由也一样）：
      // 它要的是插件清单、信任表、插件动作那三样，与设置项一个字节都不沾。
      case "extensions":
        return <ExtensionsPane plugins={plugins} 信任={插件信任} 动作={插件动作} />;
      case "general":
        return <GeneralPane {...props} />;
      default:
        return <AppearancePane {...props} />;
    }
  };

  return (
    // 点遮罩 = 关掉。跟确认框同一个约定：想走的人会去点旁边。
    <div className="confirm-backdrop" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="settings-shell"
        role="dialog"
        aria-modal="true"
        aria-label={t("Settings")}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <aside className="settings-nav">
          <div className="settings-nav-search">
            <SearchField value={query} onChange={setQuery} />
          </div>

          <nav className="settings-nav-list" aria-label={t("Settings sections")}>
            {ORDER.map((id) => (
              <button
                key={id}
                type="button"
                className="stg-nav-item"
                // ⚠️ 搜索态下**不高亮**：那时候右栏显示的是全部分页的结果，
                // 高亮哪一页都是假的。
                data-active={!searching && section === id}
                onClick={() => {
                  // 点一页 = 退出搜索。留着查询的话，切过去看到的还是空壳
                  // （那一页里没有匹配项），看着像"这一页是空的"。
                  setQuery("");
                  setSection(id);
                }}
              >
                {/* ⚠️ **20 而不是默认的 16**：十枚里有七枚在 16 格下够用，
                    但「Markdown」「文档主题」是两枚**框里带字母**的（MD / Aa），
                    16 格塞不下两个字母——实测过，缩到 16 是两个黑团。
                    20 格时才读得出来，而 20 也正好配得上 15px 的标签。 */}
                <Icon name={SECTIONS[id]} size={20} />
                {页名[id]}
              </button>
            ))}
          </nav>

          <div className="settings-nav-foot">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              {t("Done")}
            </button>
          </div>
        </aside>

        <div className="settings-content">
          <QueryProvider value={normalized}>
            {searching ? ORDER.map((id) => <div key={id}>{paneFor(id)}</div>) : paneFor(section)}
          </QueryProvider>
        </div>
      </div>
    </div>
  );
}
