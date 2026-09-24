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
 * # ⚠️ 一个插件独占一页，两页不能同时开（2026-09-24 用户要求）
 *
 * 用户原话：「每一个拓展应该独占一个窗口……右侧每一个拓展专站一个面板，
 * 两个拓展面板不能同时打开。」
 *
 * 所以这一栏是**页签式**的：左边一排页签（每个声明了 `location = "right"`
 * 的面板一个，外加一个「插件」页），**一次只画一页**。
 *
 * 为什么不是"叠起来"（改之前的样子）：叠起来时每个面板都在抢那点高度，
 * 而**面板是会自己长高的**——AI 那页一轮问答就能长出好几屏，Git 那页的
 * 文件列表也会。叠在一起的结果是两条内容互相把对方挤没，用户想看的那个
 * 常常在屏幕外。这不是"样式没调好"，是**两样东西共用一个滚动条**这件事本身错。
 *
 * 代价写在明处：**看不到的那一页不刷新**（下面只拉当前页）。所以切过去的
 * 一瞬间会现拉一次，慢接口下会闪一下「正在读取…」。这是刻意的取舍——
 * 后台一直拉所有页意味着用户不开的面板也在花时间花钱（AI 那页的拉取就是
 * 重跑一遍 `render`，虽然不花钱，但没必要）。
 *
 * # 栏里的两样：**插件声明的面板** 与 **已装插件清单**
 *
 * 面板**一页一个**（各占自己的页签）。清单在**「插件」页**，是**诊断用的**：
 * 哪个插件加载失败了、它申请了哪些能力，出问题时第一眼看这里。
 *
 * # ⚠️ 面板的**清单**是拉的，不要再改回事件（BUG-13）
 *
 * 这一栏最初只装了插件清单，因为 `nota.ui.register_panel` 注册的面板
 * **进不了界面**：后端把面板当事件发（`nota:plugin-panel`），而前端一个订阅者都没有
 * （BUG-13）。关键不是"忘了写订阅"，而是**订阅了也没用**——注册发生在
 * **插件加载时**（`setup()` 阶段），前端 `listen()` 是在**挂载之后**，
 * 时序上必漏；而且 Tauri 对没有监听者的频道 emit 是**静默成功**的，
 * 日志里连痕迹都没有，界面看着好好的，只是永远空着。
 *
 * 修法按本仓既有的范式来：**声明是状态 → 拉；发生是事件 → 推。**
 * 面板清单进插件自己的 Lua registry，宿主按需读（`nota_plugin_panels`），
 * 跟 `nota_commands` 一模一样。理由见 `plugin/mod.rs::panels`。
 *
 * # 面板的**内容**：拉 ＋ 一条"变了"的事件（2026-09-24）
 *
 * 内容也是**状态**，所以打开（或切到）那一页时拉一次
 * （`api.plugin.panelContent`）。插件在自己知道内容变了的时候喊一声
 * `nota.ui.refresh(id)`，宿主机转发成 `nota:plugin-panel` 事件，这一栏收到就
 * **重拉**——事件里没有内容，它只是个"该去拉一次"的提示。
 *
 * ⚠️ 所以那条事件**丢了也不影响正确性**：这一栏没打开时没人收，而用户
 * **切到那一页**时一定会拉一次。**别把内容塞进事件**——那就回到了 BUG-13 的形状：
 * 两份真相源，漏一枪就静默分叉。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, events, on, type PanelDirtyPayload, type PluginInfo, type PluginPanel } from "@/bridge/ipc";
import { Icon } from "@/ui/Icon";
import { PanelBody } from "@/ui/PanelBody";
import { normalise, type PanelNode } from "@/ui/panel-nodes";
import type { PromptRequest } from "@/ui/useDialogs";

/** 一个面板此刻的状态。`loading` 只在**第一次**拉的时候出现——
 *  重拉时保留旧内容，否则每按一次「刷新」面板就闪一下白。 */
type 面板状态 =
  | { state: "loading" }
  | { state: "ok"; nodes: PanelNode[]; busy: string | null }
  | { state: "error"; message: string; busy: string | null };

/** 页签的坐标。`null` = 「插件」那一页（插件清单，不是插件声明的面板）。 */
type 页 = string | null;

interface Props {
  plugins: PluginInfo[];
  /** 插件声明的面板。**启动时拉一次**，见 `App.tsx` 与 `bridge/ipc.ts`。 */
  panels: PluginPanel[];
  onClose: () => void;
  /** 跑一条插件命令（错误由 `App.tsx` 那边 toast，这里只管调）。 */
  onCall: (plugin: string, command: string, args?: unknown) => Promise<void>;
  askPrompt: (req: PromptRequest) => Promise<{ value: string; second: string } | null>;
}

/** 面板的坐标字符串。id 只在插件内部唯一，所以**必须**带上插件名。 */
function 坐标(p: PluginPanel): string {
  return `${p.plugin}/${p.id}`;
}

export function PluginDock({ plugins, panels, onClose, onCall, askPrompt }: Props) {
  // 右侧的进这一栏，**一个一页**。别的 location（`left` 等）目前没有落脚处——
  // 但**不静默丢掉**：「插件」页里单独列出来并写明，否则就成了"插件声明了却
  // 哪儿都没有"那种最难查的症状（BUG-13 就是这个形状）。
  const 右侧的 = useMemo(() => panels.filter((p) => p.location === "right"), [panels]);
  const 没落脚处的 = panels.filter((p) => p.location !== "right");

  // ⚠️ 依赖是**拼出来的字符串**而不是 `右侧的` 那个数组：数组每次渲染都是
  // 新身份，拿它当依赖会让下面每个 effect 每渲染一次都重跑一遍。
  const 键串 = 右侧的.map(坐标).join("\n");
  const 键们 = useMemo(() => 右侧的.map(坐标), [键串]); // eslint-disable-line react-hooks/exhaustive-deps

  const [当前, set当前] = useState<页>(() => 键们[0] ?? null);
  const [内容表, set内容表] = useState<Record<string, 面板状态>>({});

  /** 用户**手动**点过页签。点过之后就不再替用户选（他点了「插件」页就该留在那儿）。 */
  const 手动选过 = useRef(false);
  const 切到 = (页: 页) => {
    手动选过.current = true;
    set当前(页);
  };

  // 面板清单是**启动时异步拉的**：第一次渲染时 `键们` 很可能是空的，
  // 于是 `当前` 初始值是 `null`（「插件」页）。清单到了之后补选第一页——
  // 除非用户已经自己点过。
  // 反过来的情况（当前这页的插件被卸了／面板没了）也一样处理：落到第一页。
  useEffect(() => {
    const 有效 = 当前 !== null && 键们.includes(当前);
    if (有效) return;
    if (手动选过.current && 当前 !== null) return; // 用户选的页没了 → 下面兜底
    if (当前 === null && 手动选过.current) return; // 用户自己停在「插件」页
    set当前(键们[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [键串]);

  const 活动 = 当前 !== null && 键们.includes(当前) ? 当前 : null;
  const 活动面板 = 右侧的.find((p) => 坐标(p) === 活动) ?? null;

  /**
   * 每次请求的序号，按面板记。
   *
   * ⚠️ **不是过度设计**：`nota.ui.refresh` 是会连着来的（提交完先刷状态、
   * 插件自己再刷一次），两个请求同时在飞的时候，**先发的后回来**就会把
   * 新内容盖成旧的——症状是"提交完列表还是旧的，再点一次刷新才对"，
   * 而且它只在慢的时候出现。
   */
  const 序号 = useRef<Record<string, number>>({});

  const 拉 = useCallback(async (plugin: string, id: string) => {
    const 键 = `${plugin}/${id}`;
    const 这次 = (序号.current[键] = (序号.current[键] ?? 0) + 1);

    set内容表((m) => ({
      ...m,
      // 已经有内容就留着，别闪白（见 `面板状态` 的注释）。
      [键]: m[键]?.state === "ok" || m[键]?.state === "error" ? m[键] : { state: "loading" },
    }));

    try {
      const nodes = normalise(await api.plugin.panelContent(plugin, id));
      if (序号.current[键] !== 这次) return; // 已经有更新的请求在飞了
      set内容表((m) => ({ ...m, [键]: { state: "ok", nodes, busy: null } }));
    } catch (e) {
      if (序号.current[键] !== 这次) return;
      // **错误要看得见**：面板渲染失败（插件里 `render` 抛错）是插件作者
      // 最需要看到的一条信息，吞掉它就等于让人对着一个空面板猜。
      set内容表((m) => ({
        ...m,
        [键]: { state: "error", message: String(e), busy: null },
      }));
    }
  }, []);

  // 切到哪一页就拉哪一页（包括第一次打开）。
  useEffect(() => {
    if (!活动面板) return;
    void 拉(活动面板.plugin, 活动面板.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [活动, 拉]);

  // 插件说"我这边变了" → 重拉。载荷里没有内容，只有一个坐标（或 `id = null`
  // 表示"这个插件的都重拉"）。
  // ⚠️ 只看**当前这一页**：没显示的那几页不拉（见文件头那段取舍）。
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let alive = true;

    void on<PanelDirtyPayload>(events.pluginPanel, ({ plugin, id }) => {
      if (!活动面板 || 活动面板.plugin !== plugin) return;
      if (id === null || id === 活动面板.id) void 拉(活动面板.plugin, 活动面板.id);
    }).then((u) => {
      if (alive) unlisten = u;
      else u();
    });

    return () => {
      alive = false;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [活动, 拉]);

  /** 面板上的按钮：跑命令，跑完**自己**再拉一次。 */
  const 跑 = async (plugin: string, id: string, command: string, args?: unknown) => {
    const 键 = `${plugin}/${id}`;
    set内容表((m) => {
      const 旧 = m[键];
      if (旧?.state !== "ok") return m;
      return { ...m, [键]: { ...旧, busy: command } };
    });
    try {
      await onCall(plugin, command, args);
    } finally {
      // ⚠️ `finally` 而不是"成功才刷"：命令失败时界面上那句错误提示
      // 也常常要改面板（比如 git 报错后分支行要变），而且**卡在 busy 上
      // 会让所有按钮永远灰着**——那个状态只能靠重开面板才能解开。
      //
      // ⚠️ 这里**不管当前在哪一页**都拉：命令是这一页发出去的，跑完得把它
      // 自己刷干净（用户可能已经切走了，切回来时看到的必须是结果不是过程）。
      void 拉(plugin, id);
    }
  };

  /** 「插件」页：清单 ＋ 没落脚处的面板。抽出来只为让下面 JSX 短一点。 */
  const 插件页 = (
    <>
      {没落脚处的.length > 0 && (
        <section className="dock-orphans">
          <h4 className="dock-subtitle">没有落脚处</h4>
          <p className="dock-hint">
            这些面板声明的位置目前还没有对应的地方，所以哪儿都没显示。
          </p>
          {没落脚处的.map((p) => (
            <p key={坐标(p)} className="dock-orphan">
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
    </>
  );

  return (
    <aside className="plugin-dock">
      <nav className="dock-head">
        <span className="dock-title">{活动面板 ? 活动面板.title || 活动面板.id : "插件"}</span>
        <button
          type="button"
          className="dock-close"
          title="收起插件栏"
          aria-label="收起插件栏"
          onClick={onClose}
        >
          <Icon name="folio-close-symbolic" />
        </button>
      </nav>

      {/* 页签：每个右侧面板一页 ＋ 「插件」页（清单）。
          ⚠️ 页签**永远都在**，哪怕只有一个面板：它是"这里还有别的东西"的
          唯一线索，藏起来的话用户会以为这一栏就叫这个名字。 */}
      <nav className="dock-tabs" role="tablist" aria-label="插件面板">
        {右侧的.map((p) => {
          const 键 = 坐标(p);
          return (
            <button
              key={键}
              type="button"
              role="tab"
              className="dock-tab"
              data-active={键 === 活动}
              aria-selected={键 === 活动}
              title={`由插件 ${p.plugin} 提供`}
              onClick={() => 切到(键)}
            >
              {p.title || p.id}
            </button>
          );
        })}
        <button
          type="button"
          role="tab"
          className="dock-tab dock-tab-plugins"
          data-active={活动 === null}
          aria-selected={活动 === null}
          title="已装插件清单（出问题时看这里）"
          onClick={() => 切到(null)}
        >
          插件
        </button>
      </nav>

      <div className="dock-body">
        {活动面板
          ? (() => {
              // ⚠️ 这里重新算一遍坐标而不是用上面的 `活动`：那个的类型是
              // `string | null`（TS 不会因为 `活动面板` 非空就把它窄化），
              // 拿它当索引 TS 要报"不能用 null 当索引"。
              const 键 = 坐标(活动面板);
              const 态 = 内容表[键] ?? { state: "loading" as const };
              return (
                <section className="dock-panels">
                  {/* key 用坐标：换页时**换掉整棵子树**，否则
                      `<PanelBody>` 里输入框的草稿会跟着页签跑到另一页去。 */}
                  <article key={键} className="panel">
                    <div className="panel-body">
                      {态.state === "loading" && <p className="panel-pending">正在读取…</p>}
                      {态.state === "error" && (
                        <p className="panel-error" role="alert">
                          {态.message}
                        </p>
                      )}
                      {态.state === "ok" &&
                        (态.nodes.length === 0 ? (
                          // 空的**不是错误**：插件这一刻没有内容可显示（没开文件夹、
                          // 没有改动）。如实说，别画一个空框让人以为坏了。
                          <p className="panel-empty">插件没有给出内容。</p>
                        ) : (
                          <PanelBody
                            plugin={活动面板.plugin}
                            nodes={态.nodes}
                            busy={态.busy}
                            askPrompt={askPrompt}
                            onCall={(plugin, command, args) =>
                              跑(plugin, 活动面板.id, command, args)
                            }
                          />
                        ))}
                    </div>
                  </article>
                </section>
              );
            })()
          : 插件页}
      </div>
    </aside>
  );
}
