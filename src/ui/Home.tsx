/**
 * 主页（没有文档打开时显示的那一屏）。
 *
 * 布局参照 Typora 的空闲屏：左边是标识 + 三个大动作，右边一列是插件状态。
 * **不做**"最近文件"列表——那要先把最近文件的存取做出来（`docs/07` 第 9 项），
 * 与其画一个空列表占位，不如先不画。
 */

import type { PluginInfo } from "@/bridge/ipc";

interface Props {
  plugins: PluginInfo[];
  onNew: () => void;
  onOpen: () => void;
  onOpenFolder: () => void;
}

export function Home({ plugins, onNew, onOpen, onOpenFolder }: Props) {
  const failed = plugins.filter((p) => p.state === "failed");

  return (
    <div className="home">
      <div className="home-main">
        <h1 className="home-title">Nota</h1>
        <p className="home-lead">所见即所得的 Markdown 编辑器</p>

        <div className="home-actions">
          <button type="button" className="home-action" onClick={onNew}>
            <span className="home-action-label">新建文档</span>
            <span className="home-action-hint">Ctrl+N</span>
          </button>
          <button type="button" className="home-action" onClick={onOpen}>
            <span className="home-action-label">打开文件</span>
            <span className="home-action-hint">Ctrl+O</span>
          </button>
          <button type="button" className="home-action" onClick={onOpenFolder}>
            <span className="home-action-label">打开文件夹</span>
            <span className="home-action-hint">把一整个目录当工作区</span>
          </button>
        </div>
      </div>

      <aside className="home-side">
        <h2 className="home-side-title">插件</h2>
        {plugins.length === 0 ? (
          <p className="home-hint">没有发现插件。</p>
        ) : (
          <ul className="home-plugins">
            {plugins.map((p) => (
              <li key={p.id} className={`home-plugin home-plugin-${p.state}`}>
                <span className="home-plugin-name">{p.name}</span>
                <span className="home-plugin-state">
                  {p.state === "loaded" ? "已加载" : p.state === "disabled" ? "已禁用" : "失败"}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* 插件加载失败要**显眼**。静默失败的表现是"这个插件装了怎么没反应"，
            用户会去怀疑自己装错了，而不是来看这里。 */}
        {failed.length > 0 && (
          <p className="home-warn">
            有 {failed.length} 个插件没能加载，详情见右侧「插件」栏。
          </p>
        )}
      </aside>
    </div>
  );
}
