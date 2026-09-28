/**
 * 标签栏。2026-09-23 从 `App.tsx` 拆出来，理由见 `TopBar.tsx` 文件头。
 *
 * ⚠️ 只画，不管"关之前要不要存盘"——那是 `App.tsx` 的事（`confirmReq` 在它手上）。
 * 也**不持有**任何状态：`docs` / `activeId` 都是 props。
 *
 * # 标签页右键（2026-09-27）
 *
 * 右键一个标签弹出一条菜单，目前只有一条：**「在新窗口中打开」**（用户 2026-09-27
 * 点名要的，原话「标签页支持右键之后选择在新窗口中打开。不用考虑拖回来的情况了」）。
 *
 * ⚠️ **"在新窗口中打开"不是"把这个标签搬过去"**：新窗口是**另一个进程**，
 * 两边文档表各自独立，旧窗口里这一份照旧开着。所以这条菜单**不需要知道**
 * 原标签之后怎么了——用户明确说了不用考虑拖回来。
 *
 * ⚠️ **没有路径的标签（新建的、从没存过盘的）那一条是灰的**：新进程只能按路径
 * 去读盘，它拿不到这一份内存里的正文。判据在这里，宿主那边也判一次
 * （`commands/window.rs`）——命令是对外开着的一条路，别指望调用方都守规矩。
 *
 * # ⚠️ 弹层复用 `MenuPopup`，但**锚点是自己搭的**
 *
 * `MenuPopup` 是给菜单栏写的：它自己 `position: absolute` ＋ `top: calc(100%
 * + 5px)`，也就是"挂在菜单栏那一栏下面"。右键菜单要落在**鼠标那一点**上，
 * 所以外面套一个**零高度**的定点容器（`.tab-menu-anchor`，`styles/app.css`），
 * 弹层就落在光标下面 5px 处。复用而不是另写一个的理由：键盘漫游、Esc、
 * 点外面关掉、`.menu-popup` 那套外观全都在那边，抄一份等于把那些行为再实现一遍。
 *
 * ⚠️ **不另记"现在右键的是哪个标签"**——菜单里那条动作只用得上*那一个*标签的
 * 路径，而路径在开菜单那一刻就取好了（`菜单.path`）。把整个 `DocId` 存下来
 * 再回头查列表，多一次"查不到怎么办"的分支，而那个分支没有正确的处理方式。
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { DocId, Document } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { Icon } from "@/ui/Icon";
import { MenuPopup } from "@/ui/MenuPopup";
import type { MenuEntry } from "@/ui/commands";

/** 右键菜单里那一条的 id。**不是命令**——它不进 `commands.ts` 那张表（见下）。 */
const 新窗口项 = "tab.openInNewWindow";

// ── 标签栏 ────────────────────────────────────────────────────────────────

export function TabBar(props: {
  docs: Document[];
  activeId: DocId | null;
  onSelect: (id: DocId) => void;
  onClose: (id: DocId) => void;
  /**
   * 「在新窗口中打开」：参数是**路径**，不是文档 id（新窗口是另一个进程，
   * 它那边没有这个 id）。⚠️ **只有有路径的标签会调到它**——判据在下面
   * `开菜单` 里，没有路径的标签那一条是灰的。
   */
  onOpenInNewWindow: (path: string) => void;
  /**
   * 摊着改动预览时把整条锁掉（`inert`：点不动、也聚焦不了）。
   *
   * ⚠️ 锁**由 `App` 决定**（它才知道有没有预览），这里只是把那个属性落到自己
   * 的根节点上。别在这一层判断"该不该锁"——判据散开就会出现"三处里漏一处"，
   * 而那处的症状是"预览开着还能把文档关掉"，看着像别处坏了。
   */
  inert?: boolean;
}) {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();

  /**
   * 开着的右键菜单：锚点坐标 ＋ 那一个标签的路径（`null` = 新窗口那条是灰的）。
   *
   * ⚠️ 路径**当场取**，不存 `DocId`：见文件头那段。
   */
  const [菜单, set菜单] = useState<{ x: number; y: number; path: string | null } | null>(null);
  const 锚 = useRef<HTMLDivElement>(null);

  const 关菜单 = useCallback(() => set菜单(null), []);

  const 开菜单 = useCallback((d: Document, x: number, y: number) => {
    // ⚠️ **贴边时往回收**：菜单宽 224px（`.menu-popup` 的 `min-width`），
    // 右击最右边那个标签的右半部分时不收就会顶出窗口右边——在窄窗口里
    // 那一整条就点不到了。高度这边不量（只有一条，70vh 的 `max-height`
    // 轮不到它），量了反而要等一帧。
    const 宽 = 232;
    const 左 = Math.max(0, Math.min(x, window.innerWidth - 宽));
    set菜单({ x: 左, y, path: d.path ?? null });
  }, []);

  // 点别处 / 按 Esc 关掉。⚠️ 与 `MenuBar.tsx` 那两条**同一条口径**，
  // 理由也照抄：`mousedown` 不是 `click`（`click` 要等鼠标抬起，期间菜单还开着，
  // 点到的东西会被挡着——表现是"点了两下才关掉"）；Esc 必须监听**捕获期**，
  // 因为焦点在弹层里时那一条会被 `useMenuRovingFocus` 吃掉（它只调 `onDismiss`，
  // 也就是下面那个，所以两条不冲突：谁先到都关）。
  useEffect(() => {
    if (!菜单) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (锚.current?.contains(t as Node)) return;
      // ⚠️ 弹层**不在** `锚` 里面吗？在的（它是 `锚` 的子节点，右键菜单没有子菜单，
      // 不走 portal）。但 `.menu-sub` 那条特判仍然留着——`MenuPopup` 哪天给这一层
      // 加上子菜单，走 portal 的那一层就会漏在外面，而症状是"子菜单里的项点不动"。
      if (t?.closest?.(".menu-sub")) return;
      关菜单();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [菜单, 关菜单]);

  // ⚠️ 菜单开着时**滚动或改窗口大小**就关掉：它是 `fixed` 的，锚在鼠标那一点上，
  // 底下那条栏一滚就与它脱节（菜单指着 A 标签，A 已经滚走了）。这不是追求
  // 桌面软件的每一条细节，是**别让它指错人**。
  useEffect(() => {
    if (!菜单) return;
    window.addEventListener("resize", 关菜单);
    window.addEventListener("scroll", 关菜单, true);
    return () => {
      window.removeEventListener("resize", 关菜单);
      window.removeEventListener("scroll", 关菜单, true);
    };
  }, [菜单, 关菜单]);

  const 条目: MenuEntry[] = [{ id: 新窗口项, label: t("Open in New Window") }];
  // ⚠️ 灰的判据就是"没有路径"，理由见文件头。
  const 灰的 = new Set(菜单?.path ? [] : [新窗口项]);

  return (
    <div className="tabbar" role="tablist" inert={props.inert || undefined}>
      {props.docs.map((d) => (
        <div
          key={d.id}
          role="tab"
          aria-selected={d.id === props.activeId}
          className={`tab ${d.id === props.activeId ? "tab-active" : ""}`}
          // ⚠️ `preventDefault` 是必需的：不拦的话 WebKitGTK 会弹出它自己那份
          // 默认菜单（"重新载入 / 检查元素…"），我们的菜单要么被盖住、要么并排出现。
          onContextMenu={(e) => {
            e.preventDefault();
            开菜单(d, e.clientX, e.clientY);
          }}
        >
          <button type="button" className="tab-label" onClick={() => props.onSelect(d.id)}>
            {d.dirty && <span className="tab-dot" title={t("Has unsaved changes")} />}
            {d.title}
          </button>
          <button
            type="button"
            className="tab-close"
            title={t("Close")}
            aria-label={t("Close this tab")}
            onClick={() => props.onClose(d.id)}
          >
            <Icon name="folio-close-symbolic" />
          </button>
        </div>
      ))}

      {菜单 && (
        <div className="tab-menu-anchor" ref={锚} style={{ left: 菜单.x, top: 菜单.y }}>
          <MenuPopup
            label={t("Tab")}
            entries={条目}
            disabled={灰的}
            checks={{}}
            onPick={() => {
              const 路 = 菜单.path;
              关菜单();
              if (路) props.onOpenInNewWindow(路);
            }}
            onDismiss={关菜单}
            // ⚠️ `←` `→` 在这里**什么都不做**：菜单栏那一套是"往左右切一栏"，
            // 而右键菜单是独立的一层、没有"邻栏"可切。传空函数而不是省略——
            // 省略的话那一层会拿到 `undefined` 并在按键时炸。
            onArrowOut={() => {}}
          />
        </div>
      )}
    </div>
  );
}
