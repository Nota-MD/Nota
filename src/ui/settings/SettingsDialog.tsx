/**
 * 偏好设置那个框：**左栏分节 + 右栏内容**，版式照 VMark 的偏好面板抄。
 *
 * ```text
 * ┌──────────────┬────────────────────────────────────┐
 * │ [搜索设置…]  │  主题                              │
 * │ ▸ 外观       │  界面风格            [下拉 ▾]      │
 * │   文档主题   │  明暗               [浅][深]       │
 * │   编辑器     │  跟随系统偏好          ( ●—)       │
 * │   Markdown   │                                    │
 * │   快捷键     │                                    │
 * │              │  界面                              │
 * │ [ 完成 ]     │  界面字号        ──●────  15px      │
 * └──────────────┴────────────────────────────────────┘
 * ```
 *
 * # 三件事的分工（都别改）
 *
 * 1. **左栏搜索是就地过滤**，不是跳转：查询非空时五个分节**叠着**渲染，
 *    每行自己比标签（见 `primitives.tsx` 顶上那段）。所以搜索态下左栏不
 *    高亮任何一节——`data-active` 那一行是 `!searching && …`。
 * 2. **改动即时生效**，唯一那个按钮是「完成」（= 关掉）。⚠️ 不要加「取消」，
 *    理由在 `panes.tsx` 顶上。
 * 3. **文档主题这一节只读**。换主题在「主题」菜单里，那边是唯一入口——
 *    这里放个选择器就会变成两个真相源。
 *
 * # 为什么不是窗口
 *
 * Typora 的偏好设置是一个独立窗口，我们是**覆盖层**。差别是有意的：
 * 覆盖层不需要处理"关了主窗口设置窗口还开着"这类生命周期问题，
 * 也省掉一套窗口管理的 IPC。代价是它盖住了正文——而外观这种东西
 * **正是要边看边调**的，所以框做得够宽（`min(880px, 92vw)`），
 * 两侧都留得下正文。真的挡住的那一块，拖窗口就是了。
 */

import { useEffect, useRef, useState } from "react";

import type { DocThemeInfo, Settings } from "@/bridge/ipc";
import { AppearancePane, DocThemePane, EditorPane, MarkdownPane } from "./panes";
import { Icon, QueryProvider, SearchField, type IconName } from "./primitives";
import { ShortcutsPane } from "./ShortcutsPane";

type SectionId = "appearance" | "docTheme" | "editor" | "markdown" | "shortcuts";

/**
 * 左栏的分节。⚠️ 同样写成 `Record`：加一节时漏了下面那条 `ORDER`，
 * 症状是"这一节点不到"——不报错。两处都在同一个文件里，改一处时看得见另一处。
 */
const SECTIONS: Record<SectionId, { label: string; icon: IconName }> = {
  appearance: { label: "外观", icon: "appearance" },
  docTheme: { label: "文档主题", icon: "doc" },
  editor: { label: "编辑器", icon: "editor" },
  markdown: { label: "Markdown", icon: "markdown" },
  shortcuts: { label: "快捷键", icon: "keys" },
};

/** 显示顺序（VMark 是字母序，我们按常用程度排）。第一节也是打开时的默认节。 */
const ORDER: SectionId[] = ["appearance", "docTheme", "editor", "markdown", "shortcuts"];

interface Props {
  settings: Settings;
  /** 改一项。**即时生效**，见文件头。 */
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
  /** 只读：用来在「文档主题」那一行显示当前是哪套。 */
  docThemes: DocThemeInfo[];
  onOpenThemesDir: () => void;
}

export function SettingsDialog({
  settings,
  onChange,
  onClose,
  docThemes,
  onOpenThemesDir,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<SectionId>("appearance");
  const [query, setQuery] = useState("");

  // 查询先小写化再进 context：`hits()` 只做一次 `includes`，
  // 不该让每一行都自己 `toLowerCase` 一遍。
  const normalized = query.trim().toLowerCase();
  const searching = normalized.length > 0;

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  /** 某一节的内容。搜索态下**全上**，靠每一行自己过滤。 */
  const paneFor = (id: SectionId) => {
    const props = { settings, onChange, docThemes, onOpenThemesDir };
    switch (id) {
      case "docTheme":
        return <DocThemePane {...props} />;
      case "editor":
        return <EditorPane {...props} />;
      case "markdown":
        return <MarkdownPane {...props} />;
      case "shortcuts":
        return <ShortcutsPane />;
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
        aria-label="偏好设置"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <aside className="settings-nav">
          <div className="settings-nav-search">
            <SearchField value={query} onChange={setQuery} />
          </div>

          <nav className="settings-nav-list" aria-label="设置分节">
            {ORDER.map((id) => (
              <button
                key={id}
                type="button"
                className="stg-nav-item"
                // ⚠️ 搜索态下**不高亮**：那时候右栏显示的是全部分节的结果，
                // 高亮哪一节都是假的。
                data-active={!searching && section === id}
                onClick={() => {
                  // 点一节 = 退出搜索。留着查询的话，切过去看到的还是空壳
                  // （那一节里没有匹配项），看着像"这一节是空的"。
                  setQuery("");
                  setSection(id);
                }}
              >
                <Icon name={SECTIONS[id].icon} />
                {SECTIONS[id].label}
              </button>
            ))}
          </nav>

          <div className="settings-nav-foot">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              完成
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
