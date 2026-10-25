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
 * **切到那一页**时一定会拉一次。**内容不能塞进事件**——那就回到了 BUG-13 的形状：
 * 两份真相源，漏一次就静默分叉。
 *
 * # ⚠️ 2026-10-10：这一栏的凭据住到了组件外面（第 111 项）
 *
 * 用户报的是「**AI插件运行中关掉插件面板再打开就找不到了**」。上面那句
 * "切到那一页时一定会拉一次"**在那一种情形下是假的**：插件的一条命令正在跑的时候
 * 宿主握着 `plugins` 锁，而 `nota_plugin_panel_content` 要的**正是同一把锁**，
 * 于是那一次拉会一直等到命令跑完（AI 那一路是几十秒）。
 *
 * 所以"哪一页 / 每页拉回来的内容 / 正在吐的那段字"这三份凭据**搬去了
 * `ui/panel-dock-state.ts`**（一份进程内的记忆，关掉这一栏不再丢），并且
 * 拉不回来的时候**先把正在吐的那段字画出来**。那两份东西的判据、以及为什么
 * 记下来的时候要抹掉 `busy`，都写在那个文件头上——这一栏只负责画。
 *
 * # ⚠️ 2026-09-25：这里曾经有一个**内置页**（Slidev 预览），现在没有了
 *
 * 用户要求 Slidev 预览「**做成右侧插件栏里的一个面板（像 AI / Git）**」，
 * 当时（09-23）的做法是外壳里加一页 `@slidev`——因为插件给不了 iframe
 * 那种节点。**那一天的做法是对的，过时的是它的位置**：现在
 * `ui/panel-nodes.ts` 有 `kind = "frame"` 这一型（地址由宿主填，
 * 只指向发起它的那个插件自己那场开发服务器），于是那一页**变成了一个
 * 普通的插件面板**，外壳这边一个字都不用为它留。
 *
 * **这就是"拆拓展"的验收标准**：把 `plugins/slidev/` 删掉，这一栏里
 * 不会剩下任何跟幻灯片有关的痕迹——没有孤儿页签、没有一句为它写的话。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTablistKeys } from "@/ui/useTablistKeys";

import { api, events, on, type PanelDirtyPayload, type PanelStreamPayload, type PluginInfo, type PluginPanel, type trustRecord } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { DockResizer } from "@/ui/DockResizer";
import { PanelBody } from "@/ui/PanelBody";
import {
  recordRecall,
  recordHoldContentTable,
  startStartPage,
  thisValuePageDrawWhatWhat,
  type page,
  type PanelState,
} from "@/ui/panel-dock-state";
// ⚠️ `normalise` 还留着：拉回来的那一路（`拉` 里）照样过这道门收窄。
import { normalise } from "@/ui/panel-nodes";
import { positionName, ableForceName, comeSourceDescription, languageTag, languageMismatch, languageHint } from "@/ui/pluginText";
import type { PromptRequest } from "@/ui/useDialogs";
import type { pluginAction } from "@/ui/usePlugins";

interface Props {
  plugins: PluginInfo[];
  /** 插件声明的面板。**启动时拉一次**，见 `App.tsx` 与 `bridge/ipc.ts`。 */
  panels: PluginPanel[];
  /**
   * 信任库里那几把钥匙。⚠️ **摆出来是这套机制的正当性所在**：
   * 信任按**指纹**判，而指纹只有能被核对才有意义（`ui/usePlugins.ts::PluginsState::信任`）。
   */
  messageTask: trustRecord[];
  /** 跑一条插件命令（错误由 `App.tsx` 那边 toast，这里只管调）。 */
  onCall: (plugin: string, command: string, args?: unknown) => Promise<void>;
  /** 拖动**左缘**改宽（用户 2026-10-11：「拓展菜单左侧也可以拖动」）。 */
  onResize: (width: number) => void;
  askPrompt: (req: PromptRequest) => Promise<{ value: string; second: string } | null>;
  /**
   * 「插件」页那几颗按钮（装 / 卸 / 启停 / 信任）。**实现全在
   * `ui/usePlugins.ts`**，这里只画——那一层要弹文件框、弹确认框、弹 toast，
   * 都不该塞进这个纯展示组件里。
   */
  action: pluginAction;
  /**
   * 摊着改动预览时把整栏锁掉（`inert`：点不动、也聚焦不了）。
   *
   * ⚠️ 这一栏里有**插件的按钮**（AI 那页的预设、git 那页的动作），它们不走
   * 菜单那张命令表，所以菜单全灰**挡不住**它们——必须在这里单独锁。
   * 锁由 `App` 决定，理由同 `ui/TabBar.tsx` 那一条。
   */
  inert?: boolean;
}

/** 面板的坐标字符串。id 只在插件内部唯一，所以**必须**带上插件名。 */
function coordinate(p: PluginPanel): string {
  return `${p.plugin}/${p.id}`;
}

/**
 * ⚠️ 「来源 / 签名」「语言对不对得上」「能力叫什么」「面板摆在哪儿」这四句人话
 * **2026-09-27 搬去了 `ui/pluginText.ts`**：加了「拓展」设置页之后，同样的话
 * 要在两个界面上出现（这一栏与那一页），留在本地就是两份要同时改的副本。
 * 搬走的理由与那张表该怎么写，见那份文件头。
 */

export function PluginDock({
  plugins,
  panels,
  messageTask,
  onCall,
  onResize,
  askPrompt,
  action,
  inert,
}: Props) {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();

  // ── 三张"把后端原始标识符说成人话"的表（2026-09-26）────────────────────
  //
  // 用户 2026-09-26 报「界面中英混杂」。查下来**唯一**的实质来源就是这一栏：
  // 上面这些话（`document.read`、`right`、`en`）是**后端/插件的原始数据**，
  // 前面几轮只翻了"我们自己写下的字"，这些当时是直接 `{c}` 摆出去的。
  // 现在过一层映射：**认得出就说中文，认不出就照原样摆出来**——认不出时宁可
  // 露出 `ui.whatever`，也不要瞎编一个中文名（那是"猜"而不是"翻译"）。
  //
  // ⚠️ 三张表**2026-09-27 搬去了 `ui/pluginText.ts`**（那边是函数，不是模块级
  // 常量）。搬的原因是「拓展」设置页要用同样三张表；那一份文件头写着为什么
  // 必须是函数、为什么里面非得是字面量 `t("…")`（这两条在这里时也一样成立）。

  // 右侧的进这一栏，**一个一页**。另外两类各有各的去处，见下。
  const rightSideOf = useMemo(() => panels.filter((p) => p.location === "right"), [panels]);
  // `main`：属于**编辑区**（插件喊 `nota.ui.review` 时摊到正文那一块）。
  // 它**不是**没落脚处——只是落脚处不在这一栏，所以单独列出来（见「插件」页）。
  const editorAreaOf = panels.filter((p) => p.location === "main");
  // 剩下的（`left` 之类）目前**哪儿都不显示**——但**不静默丢掉**：
  // 「插件」页里单独列出来并写明，否则就成了"插件声明了却哪儿都没有"那种
  // 最难查的症状（BUG-13 就是这个形状）。
  const noneDropFootPlaceOf = panels.filter((p) => p.location !== "right" && p.location !== "main");

  // ⚠️ 依赖是**拼出来的字符串**而不是 `右侧的` 那个数组：数组每次渲染都是
  // 新身份，拿它当依赖会让下面每个 effect 每渲染一次都重跑一遍。
  const keyString = rightSideOf.map(coordinate).join("\n");
  const keys = useMemo(
    () => rightSideOf.map(coordinate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keyString],
  );

  /**
   * ⚠️ **这三个都从 [`记忆`] 里捞回来**（2026-10-10，`docs/07` 第 111 项）。
   *
   * 关掉这一栏 = 这个组件被卸载（`App.tsx` 那句 `{dockOpen && …}`），组件里的
   * state 全丢。从前那不要紧（切回来重拉一次就完了），但**插件的一条命令正在跑
   * 的时候，宿主握着 `plugins` 锁，那次"重拉"根本回不来**——面板重开之后一直
   * 空着。用户 2026-10-10 报的「AI插件运行中关掉插件面板再打开就找不到了」
   * 就是这个形状；来龙去脉与两半修法写在 `ui/panel-dock-state.ts` 的文件头。
   *
   * ⚠️ `当前` 的兜底**不能写成 `??`**：`null` 是"用户自己停在「插件」那一页"
   * （一个正经的选择），只有 `undefined`（从没选过）才该落回第一页。
   */
  const [current, setCurrent] = useState<page>(() => startStartPage(recordRecall.current, keys));
  const [contentTable, setContentTable] = useState<Record<string, PanelState>>(() => recordRecall.contentTable);

  /**
   * **正在往外吐的那段字**，按插件 id 记（2026-10-04 加，`docs/07` 第 58 项）。
   *
   * ⚠️ 它和 `内容表` 是**两份完全不同的东西，别合并**：那边是面板的真内容
   * （从 `panelContent` 拉来的），这边是**一份临时显示**，宿主每吐一小段就
   * 推一次。它**不进任何一份状态**——正因为如此，收工之后必须靠一次真拉
   * 把它擦掉（下面 `拉` 成功那条路会清），否则屏幕上会一直停在那半截上。
   *
   * ⚠️ 按**插件**记而不是按面板坐标记：宿主那边（`lua/api/ui.rs::实时表`）
   * 只知道是哪个插件在吐字，不知道是哪个面板——载荷里根本没有 `id`。
   */
  const [actualTimeTable, setActualTimeTable] = useState<Record<string, string>>(() => recordRecall.actualTimeTable);

  // 上面三个 state 每变一次就抄进记忆一份（那份记忆才是"关掉再打开时的起点"）。
  // ⚠️ 内容表抄过去的时候要**抹掉 `busy`**（见 `记住内容表` 的注释：不抹的话
  // 面板重开时会是一排永远解不开的灰按钮）。
  useEffect(() => {
    recordRecall.current = current;
  }, [current]);
  useEffect(() => {
    recordRecall.contentTable = recordHoldContentTable(contentTable);
  }, [contentTable]);
  useEffect(() => {
    recordRecall.actualTimeTable = actualTimeTable;
  }, [actualTimeTable]);

  /** 用户**手动**点过页签。点过之后就不再替用户选（他点了「插件」页就该留在那儿）。 */
  const handActionSelectPass = useRef(false);
  // ⚠️ 页签的方向键走 `useTablistKeys`（第 50 项，2026-10-04）：挪焦点不切换。
  const pageKeyBar = useRef<HTMLElement>(null);
  useTablistKeys(pageKeyBar);
  const splitTo = (page: page) => {
    handActionSelectPass.current = true;
    setCurrent(page);
  };

  // 面板清单是**启动时异步拉的**：第一次渲染时 `键们` 很可能是空的，
  // 于是 `当前` 初始值是 `null`（「插件」页）。清单到了之后补选第一页——
  // 除非用户已经自己点过。
  // 反过来的情况（当前这页的插件被卸了／面板没了）也一样处理：落到第一页。
  useEffect(() => {
    const hasEffect = current !== null && keys.includes(current);
    if (hasEffect) return;
    if (handActionSelectPass.current && current !== null) return; // 用户选的页没了 → 下面兜底
    if (current === null && handActionSelectPass.current) return; // 用户自己停在「插件」页
    setCurrent(keys[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyString]);

  const activity = current !== null && keys.includes(current) ? current : null;
  const activityPanel = rightSideOf.find((p) => coordinate(p) === activity) ?? null;

  /**
   * 每次请求的序号，按面板记。
   *
   * ⚠️ **不是过度设计**：`nota.ui.refresh` 是会连着来的（提交完先刷状态、
   * 插件自己再刷一次），两个请求同时在飞的时候，**先发的后回来**就会把
   * 新内容盖成旧的——症状是"提交完列表还是旧的，再点一次刷新才对"，
   * 而且它只在慢的时候出现。
   */
  const index = useRef<Record<string, number>>({});

  const pull = useCallback(async (plugin: string, id: string) => {
    const key = `${plugin}/${id}`;
    const thisCount = (index.current[key] = (index.current[key] ?? 0) + 1);

    setContentTable((m) => ({
      ...m,
      // 已经有内容就留着，别闪白（见 `面板状态` 的注释）。
      [key]: m[key]?.state === "ok" || m[key]?.state === "error" ? m[key] : { state: "loading" },
    }));

    try {
      const nodes = normalise(await api.plugin.panelContent(plugin, id));
      if (index.current[key] !== thisCount) return; // 已经有更新的请求在飞了
      setContentTable((m) => ({ ...m, [key]: { state: "ok", nodes, busy: null } }));
      // ⚠️ 真内容到手了 ⇒ 把这一段临时的擦掉（`docs/07` 第 58 项）。
      // 这里就是"收工"这件事的落点：插件吐完最后喊的那一声 `nota.ui.refresh`
      // 会走到这儿来。放在**成功之后**（而不是发请求的时候）是有意的——
      // 拉失败时那段字还留着，比屏幕上一片空白强。
      setActualTimeTable((m) => (plugin in m ? { ...m, [plugin]: "" } : m));
    } catch (e) {
      if (index.current[key] !== thisCount) return;
      // **错误要看得见**：面板渲染失败（插件里 `render` 抛错）是插件作者
      // 最需要看到的一条信息，吞掉它就等于让人对着一个空面板猜。
      setContentTable((m) => ({
        ...m,
        [key]: { state: "error", message: String(e), busy: null },
      }));
    }
  }, []);

  // 切到哪一页就拉哪一页（包括第一次打开）。
  useEffect(() => {
    if (!activityPanel) return;
    void pull(activityPanel.plugin, activityPanel.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, pull]);

  // 插件说"这一侧变了" → 重拉。载荷里没有内容，只有一个坐标（或 `id = null`
  // 表示"这个插件的都重拉"）。
  // ⚠️ 只看**当前这一页**：没显示的那几页不拉（见文件头那段取舍）。
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let alive = true;

    void on<PanelDirtyPayload>(events.pluginPanel, ({ plugin, id }) => {
      if (!activityPanel || activityPanel.plugin !== plugin) return;
      if (id === null || id === activityPanel.id) void pull(activityPanel.plugin, activityPanel.id);
    }).then((u) => {
      if (alive) unlisten = u;
      else u();
    });

    return () => {
      alive = false;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, pull]);

  // 插件正往外吐字（`nota.ui.stream`）→ 直接画，**一个字节都不去宿主那边取**。
  //
  // ⚠️ 上面那条 `pluginPanel` 是"收到就去重拉"，这条**不能**照那样写：跑命令
  // 的时候宿主一直握着 `plugins` 锁，这时候去拉是**回不来**的——真去拉，
  // 屏幕上会一直停在旧内容上直到那条命令整个跑完，也就是"边生成边显示"根本
  // 没发生。来龙去脉在 `ipc.ts::events.pluginStream` 和
  // `src-tauri/src/lua/api/ui.rs::实时表` 顶上。
  //
  // ⚠️ **不看哪一页是当前页**（与上面那条不同）：吐字是"此刻正在发生"的事，
  // 收下它不花什么（就一个字符串），而漏掉它的表现是"切过去一看是空的"。
  // 用户切走时这段字留着，切回来正好还在。
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let alive = true;

    void on<PanelStreamPayload>(events.pluginStream, ({ plugin, text }) => {
      setActualTimeTable((m) => ({ ...m, [plugin]: text }));
    }).then((u) => {
      if (alive) unlisten = u;
      else u();
    });

    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  /** 面板上的按钮：跑命令，跑完**自己**再拉一次。 */
  const run = async (plugin: string, id: string, command: string, args?: unknown) => {
    const key = `${plugin}/${id}`;
    setContentTable((m) => {
      const oldValue = m[key];
      if (oldValue?.state !== "ok") return m;
      return { ...m, [key]: { ...oldValue, busy: command } };
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
      void pull(plugin, id);
    }
  };

  /** 「插件」页：清单 ＋ 没落脚处的面板。抽出来只为让下面 JSX 短一点。 */
  const pluginPage = (
    <>
      {editorAreaOf.length > 0 && (
        // 声明了 `location = "main"` 的面板：它们摊在**正文那一块**，由插件自己
        // 在日常流程里喊开（AI 提了改动之后点「在编辑区看」）。这里是**清单**，
        // 不是开关——宿主点不开它们，因为"该不该摊"只有插件知道
        //（`lua/api/ui.rs::预览表` 的注释写着这条边界）。
        <section className="dock-orphans">
          <h4 className="dock-subtitle">{t("In-editor panels")}</h4>
          <p className="dock-hint">
            {t("These panels are laid over the editing area; the extension opens one when it needs to (e.g. “View in editor” after the AI proposes a change).")}
          </p>
          {editorAreaOf.map((p) => (
            <p key={coordinate(p)} className="dock-orphan">
              {p.title || p.id}
              <span className="dock-orphan-where">{t("editing area")}</span>
            </p>
          ))}
        </section>
      )}

      {noneDropFootPlaceOf.length > 0 && (
        <section className="dock-orphans">
          <h4 className="dock-subtitle">{t("Nowhere to land")}</h4>
          <p className="dock-hint">
            {t("These panels declare a location that does not exist yet, so they are not shown anywhere.")}
          </p>
          {noneDropFootPlaceOf.map((p) => (
            <p key={coordinate(p)} className="dock-orphan">
              {p.title || p.id}
              {/* ⚠️ 认不出的位置**照原样显示**（`left` 之类）。上面那段话已经说了
                  "还没有对应的地方"，这里露出原始值正好是给作者看的线索。 */}
              <span className="dock-orphan-where">{positionName(p.location) ?? p.location}</span>
            </p>
          ))}
        </section>
      )}

      <h4 className="dock-subtitle dock-subtitle-row">
        {t("Installed extensions")}
        {/* 「安装」在这一栏的**标题行**上：它是这一栏唯一的"加东西"动作，
            混在某一颗插件行里会让人以为那是那个插件的一部分。 */}
        <button
          type="button"
          // ⚠️ **`btn` 那个类不能省**（2026-10-07 修的）：这几颗以前只挂 `.plugin-install`，
          // 而那个类只管字号与内边距——于是一颗**裸 `<button>`**，画出来的是 WebKitGTK
          // 自己那套默认外观（浅色底）。浅色界面下看着"还行"，**深色界面里就成了
          // 浅底 + 继承来的浅字**：整颗按钮一片白，字看不见（用户 2026-10-07 报的
          // 「颜色异常。现在看不清按钮。」）。同族的 `.stg-action`（设置页）与
          // `panel-btn`（面板 DSL）都老老实实挂着 `btn`，只有这一栏漏了。
          className="btn plugin-install"
          disabled={action.busy !== null}
          title={t("Install from an extension package (.nota-plugin)")}
          onClick={() => void action.install()}
        >
          {action.busy === "装" ? t("Installing…") : t("Install from file…")}
        </button>
      </h4>
      {plugins.length ? (
        <ul className="plugins">
          {plugins.map((p) => (
            <li key={p.id} className={`plugin plugin-${p.state}`}>
              <div className="plugin-head">
                <span className="plugin-name">{p.name}</span>
                <span className="plugin-version">{p.version}</span>
              </div>
              <div className="plugin-id">
                {p.id}
                {/* 来路 + 验签结论。⚠️ **未签名**也要如实写出来：用户看得见
                    自己在信一个什么东西，是这套机制唯一的用处。 */}
                <span className="plugin-origin">{comeSourceDescription(p)}</span>
              </div>
              {p.description && <p className="plugin-desc">{p.description}</p>}
              {/* ⚠️ 语言对不上就在这里说一句（用户 2026-09-25 要的那句话）。
                  位置在**这一行插件**上，因为用户是从这里点进它的面板的；
                  面板里还会再说一次（那才是他真正在看的那些字）。 */}
              {languageMismatch(p) && (
                <p className="plugin-lang">
                  {languageHint()}
                  <span className="plugin-lang-now">
                    {languageTag(p.lang ?? "en") ?? (p.lang ?? "en")}
                  </span>
                </p>
              )}
              {p.error && <p className="plugin-error">{p.error}</p>}
              {p.capabilities.length > 0 && (
                <div className="plugin-caps">
                  {p.capabilities.map((c) => (
                    // ⚠️ `title` 留着**原始 id**：中文名是给用户看的，id 是给
                    // 写清单的人对照 `docs/11` 那张能力表用的，两个都要在。
                    <span key={c} className="cap" title={c}>
                      {ableForceName(c) ?? c}
                    </span>
                  ))}
                </div>
              )}
              <div className="plugin-actions">
                <button
                  type="button"
                  className="btn plugin-action"
                  disabled={action.busy !== null}
                  onClick={() => void action.toggle(p.id, p.state === "disabled")}
                >
                  {action.busy === p.id
                    ? "…"
                    : p.state === "disabled"
                      ? t("Enable")
                      : t("Disable")}
                </button>
                {/* ⚠️ 内置插件**不给**「卸载」：它在安装包里，删了下次启动又回来
                    （后端也会拒）。两种插件的差别只在这里显出来，
                    不给按钮比给一颗点了报错的按钮好。 */}
                {p.removable && (
                  <button
                    type="button"
                    className="btn plugin-action plugin-action-danger"
                    disabled={action.busy !== null}
                    onClick={() => void action.unload(p.id)}
                  >
                    {t("Uninstall")}
                  </button>
                )}
                {p.signature === "unknown" && (
                  <button
                    type="button"
                    className="btn plugin-action"
                    disabled={action.busy !== null}
                    title={t("Trust {0}", p.key_id ?? t("this signer"))}
                    onClick={() => void action.messageTask(p.id, p.key_id)}
                  >
                    {t("Trust")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sidebar-empty">
          {t("No extensions installed. Use “Install from file…” above.")}
        </p>
      )}

      {/* ⚠️ 信任表**必须露出来**：指纹是给人核对的，藏在配置文件里的指纹
          等于没记。这里只列不删——撤销信任是**改文件**的事
          （`~/.config/nota/trusted-keys.toml`，布局在 `docs/11` §1.6.5），
          不在这儿加一颗"删除"，免得用户以为那是"卸载这个插件"。 */}
      {messageTask.length > 0 && (
        <section className="dock-trust">
          <h4 className="dock-subtitle">{t("Trusted signers")}</h4>
          <p className="dock-hint">
            {t("Packages signed by these fingerprints count as verified. Edit ")}
            <code>trusted-keys.toml</code>
            {t(" to fix a mismatch.")}
          </p>
          {messageTask.map((k) => (
            <p key={k.key_id} className="trust-row">
              <span className="trust-key">{k.key_id}</span>
              <span className="trust-name">{k.name}</span>
            </p>
          ))}
        </section>
      )}
    </>
  );

  /**
   * 这一刻画的正文。**二选一**：插件声明的一个面板 / 「插件」清单页。
   *
   * ⚠️ 抽成变量而不是在 JSX 里嵌两层三目：那个写法（`a ? x : b ? y : z`，
   * 下面还各套一个立即执行的箭头函数）读起来要来回数问号，加新页面时
   * 几乎一定会接错分支——而接错的表现是"某一页显示成另一页"，不报错。
   */
  const body2 = (() => {
    if (activityPanel === null) return pluginPage;

    // ⚠️ 这里重新算一遍坐标而不是用上面的 `活动`：那个的类型是
    // `string | null`（TS 不会因为 `活动面板` 非空就把它窄化），
    // 拿它当索引 TS 要报"不能用 null 当索引"。
    const key = coordinate(activityPanel);
    const state2 = contentTable[key] ?? { state: "loading" as const };
    // 这一刻该画什么（内容 ＋ 插件正在吐的那段字）——判据全在
    // `ui/panel-dock-state.ts::这一页画什么` 里（**纯函数**，单测是
    // `tests/panel-dock-state.test.ts`）。那边有一条是这一栏的救命条款：
    // **内容还拉不回来、但有流式文字时先把文字画出来**（第 111 项）。
    const actualTime = actualTimeTable[activityPanel.plugin] ?? "";
    const draw = thisValuePageDrawWhatWhat(state2, actualTime);

    // 这一页的插件语言对不上吗？（那位用户看到的是英语的插件 + 一句话解释）
    const thisPlugin = plugins.find((p) => p.id === activityPanel.plugin);
    return (
      <section className="dock-panels">
        {/* key 用坐标：换页时**换掉整棵子树**，否则
            `<PanelBody>` 里输入框的草稿会跟着页签跑到另一页去。 */}
        <article key={key} className="panel">
          {thisPlugin && languageMismatch(thisPlugin) && (
            <p className="panel-lang">{languageHint()}</p>
          )}
          <div className="panel-body">
            {draw.notice === "载入" && <p className="panel-pending">{t("Loading…")}</p>}
            {draw.error !== null && (
              <p className="panel-error" role="alert">
                {draw.error}
              </p>
            )}
            {
              // 空的**不是错误**：插件这一刻没有内容可显示（没开文件夹、
              // 没有改动）。如实说，别画一个空框让人以为坏了。
              draw.notice === "空" && <p className="panel-empty">{t("The extension has nothing to show.")}</p>
            }
            {draw.nodes.length > 0 && (
              <PanelBody
                plugin={activityPanel.plugin}
                nodes={draw.nodes}
                busy={draw.busy}
                askPrompt={askPrompt}
                onCall={(plugin, command, args) => run(plugin, activityPanel.id, command, args)}
              />
            )}
          </div>
        </article>
      </section>
    );
  })();

  return (
    // ⚠️ `data-wide` 由**面板自己的声明**决定（`register_panel{ wide = true }`）：
    // 一块画布缩在 260px 里只是个缩略图。切页就回到默认宽度——宽度是
    // **页签的函数**，不再多存一份状态。
    //
    // ⚠️ 这一条以前写的是 `活动 === "@slidev"`：那是把一个**插件的名字**
    // 焊在外壳里，插件一改名/一搬家，这段就静默失灵（不报错，只是变窄）。
    <aside
      className="plugin-dock"
      data-wide={activityPanel?.wide || undefined}
      inert={inert || undefined}
    >
      <nav className="dock-head">
        <span className="dock-title">
          {activityPanel ? activityPanel.title || activityPanel.id : t("Extensions")}
        </span>
        {/* ⚠️ **这颗 × 2026-10-11 按用户点名去掉了**（「拓展的那个叉也可以关掉」）：
            收起拓展栏仍有两条路——顶部那颗 `Extensions` 开关（`TopBar`）与
            菜单「视图 → 拓展栏」。⚠️ 它是**和左侧栏那颗 × 一起摘的**：两栏并排站着，
            一颗有一颗没有才奇怪（那条"两栏要长得像"的判据同时也在管着页签）。 */}
      </nav>

      {/* 页签：每个右侧面板一页 ＋ 「插件」页（清单）。
          ⚠️ 页签**永远都在**，哪怕只有一个面板：它是"这里还有别的东西"的
          唯一线索，藏起来的话用户会以为这一栏就叫这个名字。 */}
      <nav ref={pageKeyBar} className="dock-tabs" role="tablist" aria-label={t("Extension panels")}>
        {rightSideOf.map((p) => {
          const key = coordinate(p);
          return (
            <button
              key={key}
              type="button"
              role="tab"
              className="dock-tab"
              data-active={key === activity}
              aria-selected={key === activity}
              title={t("Provided by extension {0}", p.plugin)}
              onClick={() => splitTo(key)}
            >
              {p.title || p.id}
            </button>
          );
        })}
        <button
          type="button"
          role="tab"
          className="dock-tab dock-tab-plugins"
          data-active={activity === null}
          aria-selected={activity === null}
          title={t("Installed extensions (look here when something is wrong)")}
          onClick={() => splitTo(null)}
        >
          {t("Extensions")}
        </button>
      </nav>

      {/* ⚠️ 这里原来还有一个 `data-fill`（内置的 Slidev 那一页要撑满，
          因为 iframe 得占满整块高度）。它随那一页一起删了：嵌进来的画面
          现在是面板里的一个 `kind = "frame"` 块，**高度由那一块自己声明**
          （`panel-nodes.ts` 里夹在 120–2000 之间），面板照旧"内容多高就多高、
          超出滚动"。一条滚动规则，不必再分两种。 */}
      <div className="dock-body">
        {body2}
      </div>
      <DockResizer onCommit={onResize} />
    </aside>
  );
}
