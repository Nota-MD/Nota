/**
 * 右侧插件栏。
 *
 * # 为什么插件在右边，不跟文件树挤在左边
 *
 * 用户 2026-09-22 定的：「插件的话我的想法是右侧边栏。」
 *
 * 左边那条是**文档导航**（文件树、大纲）——写东西的时候一直在用，得贴着正文。
 * 插件是**工具面**：Git 的暂存区、AI 的对话框、将来别的什么面板，它们是
 * "看着正文顺便操作"的东西。两边的**使用节奏不同**，挤在一列里就要来回切页。
 *
 * # 栏里装两样：**插件声明的面板** 与 **已装插件清单**
 *
 * 面板在上面——那才是这一栏存在的理由。清单在下面，是**诊断用的**：
 * 哪个插件加载失败了、它申请了哪些能力，出问题时第一眼看这里。
 *
 * # ⚠️ 面板是**拉**来的，不要再改回事件
 *
 * 这一栏最初只装了插件清单，因为 `nota.ui.register_panel` 注册的面板
 * **进不了界面**：后端把面板当事件发（`nota:plugin-panel`），而前端一个订阅者都没有
 * （BUG-13）。关键不是"忘了写订阅"，而是**订阅了也没用**——注册发生在
 * **插件加载时**（`setup()` 阶段），前端 `listen()` 是在**挂载之后**，
 * 时序上必漏；而且 Tauri 对没有监听者的频道 emit 是**静默成功**的，
 * 日志里连痕迹都没有，界面看着好好的，只是永远空着。
 *
 * 修法按本仓既有的范式来：**声明是状态 → 拉；发生是事件 → 推。**
 * 面板进插件自己的 Lua registry，宿主按需读（`nota_plugin_panels`），
 * 跟 `nota_commands` 一模一样。理由见 `plugin/mod.rs::panels`。
 */

import type { PluginInfo, PluginPanel } from "@/bridge/ipc";

interface Props {
  plugins: PluginInfo[];
  /** 插件声明的面板。**启动时拉一次**，见 `App.tsx` 与 `bridge/ipc.ts`。 */
  panels: PluginPanel[];
  onClose: () => void;
}

export function PluginDock({ plugins, panels, onClose }: Props) {
  // 右侧的进这一栏。别的 location（`left` 等）目前**没有落脚处**——
  // 但**不静默丢掉**：下面单独列出来并写明，否则就成了"插件声明了却哪儿都没有"
  // 那种最难查的症状（BUG-13 就是这个形状）。
  const 右侧的 = panels.filter((p) => p.location === "right");
  const 没落脚处的 = panels.filter((p) => p.location !== "right");

  return (
    <aside className="plugin-dock">
      <nav className="dock-head">
        <span className="dock-title">插件</span>
        <button type="button" className="dock-close" title="收起插件栏" onClick={onClose}>
          ×
        </button>
      </nav>

      <div className="dock-body">
        {右侧的.length > 0 && (
          <section className="dock-panels">
            {右侧的.map((p) => (
              // key 用 `plugin/id`：id 只在插件内部唯一，两个插件都叫 `main` 是合法的。
              <article key={`${p.plugin}/${p.id}`} className="panel">
                <header className="panel-head">
                  <span className="panel-title">{p.title || p.id}</span>
                </header>
                <div className="panel-body">
                  {/* ⚠️ 面板**内容**还没有机制填：宿主不解析插件给的 HTML，
                      要等纯 Lua 的声明式面板 DSL（docs/07 第 15 项）。
                      这里如实写出来，不做个假界面假装已经能用。 */}
                  <p className="panel-pending">面板内容尚未接入。</p>
                </div>
              </article>
            ))}
          </section>
        )}

        {没落脚处的.length > 0 && (
          <section className="dock-orphans">
            <h4 className="dock-subtitle">没有落脚处</h4>
            <p className="dock-hint">
              这些面板声明的位置目前还没有对应的地方，所以哪儿都没显示。
            </p>
            {没落脚处的.map((p) => (
              <p key={`${p.plugin}/${p.id}`} className="dock-orphan">
                {p.title || p.id}
                <span className="dock-orphan-where">{p.location}</span>
              </p>
            ))}
          </section>
        )}

        <h4 className="dock-subtitle">已装插件</h4>
        {plugins.length ? (
          <ul className="plugins">
            {plugins.map((p) => (
              <li key={p.id} className={`plugin plugin-${p.state}`}>
                <div className="plugin-head">
                  <span className="plugin-name">{p.name}</span>
                  <span className="plugin-version">{p.version}</span>
                </div>
                <div className="plugin-id">{p.id}</div>
                {p.description && <p className="plugin-desc">{p.description}</p>}
                {p.error && <p className="plugin-error">{p.error}</p>}
                {p.capabilities.length > 0 && (
                  <div className="plugin-caps">
                    {p.capabilities.map((c) => (
                      <span key={c} className="cap">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="sidebar-empty">没有发现插件。</p>
        )}
      </div>
    </aside>
  );
}
