/**
 * 主页（没有文档打开时显示的那一屏）。
 *
 * 布局：左边是标识 + 三个大动作 + **最近打开的文件**，右边一列是插件状态。
 *
 * ⚠️ 「最近打开的文件」是 2026-09-27 补上的。在这之前这里**故意不画**它
 *（"与其画一个空列表占位，不如先不画"）——那条判断的前提是"最近文件的存取
 * 还没做"，现在存取在 `ui/useSession.ts` 里，前提没了。
 *
 * ⚠️ 一**份都没有时整块不出现**（连标题一起），不是画一个空框：这一屏是
 * "还没开始"的样子，摆一个空列表在那里只会让人以为自己弄丢了什么。
 */

import type { PluginInfo } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { 父目录名, 文件名 } from "@/ui/useSession";

interface Props {
  plugins: PluginInfo[];
  onNew: () => void;
  onOpen: () => void;
  onOpenFolder: () => void;
  /** 最近打开过的文件（新的在前）。**空表 = 这一块整个不画**，见文件头。 */
  最近: readonly string[];
  onOpenRecent: (path: string) => void;
}

export function Home({ plugins, onNew, onOpen, onOpenFolder, 最近, onOpenRecent }: Props) {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const failed = plugins.filter((p) => p.state === "failed");

  return (
    <div className="home">
      <div className="home-main">
        <h1 className="home-title">Nota</h1>
        <p className="home-lead">{t("A WYSIWYG Markdown editor")}</p>

        <div className="home-actions">
          <button type="button" className="home-action" onClick={onNew}>
            <span className="home-action-label">{t("New Document")}</span>
            <span className="home-action-hint">Ctrl+N</span>
          </button>
          <button type="button" className="home-action" onClick={onOpen}>
            <span className="home-action-label">{t("Open File")}</span>
            <span className="home-action-hint">Ctrl+O</span>
          </button>
          <button type="button" className="home-action" onClick={onOpenFolder}>
            <span className="home-action-label">{t("Open Folder")}</span>
            <span className="home-action-hint">{t("Use a whole folder as a workspace")}</span>
          </button>
        </div>

        {/* ⚠️ 这一块**排在那三个动作下面**，不是上面：进来第一眼该是"能做什么"，
            最近文件是"继续上次那件事"——它是第二条路。
            ⚠️ 这里**不画那颗"从列表里去掉"的 ×**（侧栏那一页有）：主页上
            多一排 × 会把"点一下就打开"这件事变得犹犹豫豫，而走到侧栏
            「文档列表」那一页的人本来就是来整理这份列表的。 */}
        {最近.length > 0 && (
          <section className="home-recent">
            <h2 className="home-recent-title">{t("Recently Opened")}</h2>
            <ul className="home-recent-list">
              {最近.map((路径) => (
                <li key={路径}>
                  <button
                    type="button"
                    className="home-recent-item"
                    title={路径}
                    onClick={() => onOpenRecent(路径)}
                  >
                    <span className="home-recent-name">{文件名(路径)}</span>
                    <span className="home-recent-dir">{父目录名(路径)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="home-side">
        <h2 className="home-side-title">{t("Extensions")}</h2>
        {plugins.length === 0 ? (
          <p className="home-hint">{t("No extensions found.")}</p>
        ) : (
          <ul className="home-plugins">
            {plugins.map((p) => (
              <li key={p.id} className={`home-plugin home-plugin-${p.state}`}>
                <span className="home-plugin-name">{p.name}</span>
                <span className="home-plugin-state">
                  {p.state === "loaded"
                    ? t("Loaded")
                    : p.state === "disabled"
                      ? t("Disabled")
                      : t("Failed")}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* 插件加载失败要**显眼**。静默失败的表现是"这个插件装了怎么没反应"，
            用户会去怀疑自己装错了，而不是来看这里。 */}
        {failed.length > 0 && (
          <p className="home-warn">
            {t("{0} extensions failed to load. See the “Extensions” dock on the right for details.", failed.length)}
          </p>
        )}
      </aside>
    </div>
  );
}
