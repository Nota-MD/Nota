/**
 * **启动那一枪**：把设置、工作区、主题、开机问题、命令行文件、界面语言
 * 一次拉齐，然后握手。
 *
 * 从 `App.tsx` 搬出来的（2026-09-26，本文件当时 1049 行、硬上限 1000）。
 * 判据是老规矩（见 `App.tsx` 文件头）：**这块东西自己有一份完整的理由可写**。
 * 搬的时候一行逻辑没改，只是把外面那几个 `setState` 变成了入参。
 *
 * # 为什么这些必须**一起**拉
 *
 * 六枪走的是同一个 `Promise.all`。逐条各有各的理由，写在这里免得以后有人
 * "顺手"把某一枪挪出去：
 *
 * - **设置 / 工作区 / 主题**：三样都是"界面第一帧就要"的状态。分开拉的话，
 *   先画出来的那一帧里，正文宽度、侧栏根目录、主题名至少有一个是空的。
 * - **开机问题**（`api.settings.problem()`）：**不是可选的**。不报的话，用户
 *   看到的是一份"自己变回默认"的设置，而下一次改动能把原文件覆盖掉。
 * - **命令行文件**：自带 `catch`（见下面那段的注释）——一个打不开的文件不该
 *   拖垮整个启动。⚠️ **打开动作不在这里**，走的是 `openPath`（下面那个
 *   `await`），因为读不出来时该弹的提示条、该选中的标签都在那条路上。
 * - **界面语言**：也自带 `catch`。它决定界面上用中文还是英文（`src/i18n/`），
 *   拉不到就按兜底语言画——为它把整个启动掀翻是说不通的。
 *
 * # ⚠️ 「启动时」那一档是从设置里读的（2026-09-27 起它真的生效了）
 *
 * `files.startup` 三档（`settings/files.rs::StartupAction`）：
 *
 * ```text
 * new-file      什么都不恢复，开一份空白文档      ← 默认
 * last-file     恢复上次开着的那些标签
 * last-session  恢复标签 **＋** 上次那个文件夹
 * ```
 *
 * ⚠️ **在这一天之前它是个摆设**：三档没有任何一处读它，而这一段无条件恢复标签
 * 和工作区——也就是**永远按第三档办**。现在由这里读、当作入参递给 `接上会话`
 * （为什么是入参而不是闭包捕获的值，见文件头最后一段）。
 *
 * ⚠️ 所以**默认行为变了**：从没动过这一项的人，启动时从"什么都有"变成"一张白纸"。
 * 那是用户点名要的第一档，也是 `StartupAction::default()` 一直以来的值。
 *
 * # ⚠️ 顺序上那两处刻意的安排（都留着原注释的理由）
 *
 * 1. `定语言` 必须在 `setSettings` **之前**：定了之后 `i18n` 会通知所有订阅者
 *    重画一次（`useT`），而那一批订阅者这一帧还没挂上，不会白画一趟。
 * 2. `openPath(启动文件)` 必须在 `refreshDocs()` **之后**：`openPath` 自己会再
 *    刷新一次列表，先刷是为了让标签栏先立起来（不然开文件那一下界面是空的）。
 *
 * # ⚠️ 这个 effect 只跑一次——那是一条**约定**，不是观察
 *
 * 依赖里的 `refreshDocs` / `toast` / `openPath` 都是空依赖的 `useCallback`，
 * 三个 `set*` 是 `useState` 给的稳定身份。⚠️ 哪天有人给 `openPath` 的上游加一条
 * 会抖的依赖（比如直接捕获 `docs`），这个 effect 就会每次刷新文档列表都重跑
 * 一遍、**把命令行那份文件反复重新打开**。那条约定记在 `ui/useDocuments.ts`
 * 文件头第 4 条里，那边有踩过的现场。
 */

import { useEffect } from "react";

import { api, type DocThemeInfo, type Settings, type StartupAction } from "@/bridge/ipc";
import { 定语言, t } from "@/i18n";
import type { Toast } from "@/ui/Toasts";
import { markStartupReady } from "@/ui/useBootReveal";

export interface 启动接线 {
  setSettings: (s: Settings) => void;
  setWorkspace: (w: string | null) => void;
  setThemes: (t: DocThemeInfo[]) => void;
  /** 重拉文档列表。**必须在 `openPath` 之前调一次**，理由见文件头第 2 条。 */
  refreshDocs: () => Promise<unknown>;
  /** 打开一份文档（命令行给的那个也走它）。 */
  openPath: (path: string) => Promise<unknown>;
  /**
   * **接上上次的会话**：读侧车，按启动档把上次的样子接回来（`ui/useSession.ts`）。
   *
   * ⚠️ 第一个参数传的是**命令行给的那个文件**，不是"要不要恢复"这个布尔：
   * 判断在那边做（有命令行文件就只读列表、一个标签都不开——用户是**指名**要开
   * 某一份，这时再把上次那堆标签拖出来，等于替他改了主意）。
   *
   * ⚠️ 第二个参数是设置里那一档（`files.startup`）。**它是入参，不是这个接口的
   * 字段**：写成字段的话它就是闭包捕获的值，而 `useStartup` 那条 effect 只该跑
   * 一次（见文件头最后一段）——设置一改、`接上会话` 的身份跟着变，那条 effect
   * 就会重跑，把命令行那份文件**再开一遍**。
   */
  接上会话: (启动文件: string | null, 启动档: StartupAction) => Promise<void>;
  toast: (message: string, level?: Toast["level"], ttlMs?: number) => void;
}

export function useStartup(w: 启动接线): void {
  const { setSettings, setWorkspace, setThemes, refreshDocs, openPath, 接上会话, toast } = w;

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        // ⚠️ 插件那三样（清单 / 面板 / 菜单项）**不在这里拉**——它们在
        // `ui/usePlugins.ts` 里有自己的一整套拉取与派生（合成菜单栏、建处理函数）。
        // 搬回来的话，拉的地方和用它的地方分开，就又要靠 props 一层层传。
        //
        // ⚠️ **设置有关的三枪先走，其余四枪在后台同时开跑**。旧实现把六枪放进
        // 同一个 `Promise.all`，于是哪怕设置只用了 40 ms，也必须等主题目录扫描、
        // 工作区、命令行文件和语言全部回来才 `setSettings`；而 `useUiStyles`
        // 又要等 `settings` 才肯取主题 CSS。冷启动的 5 秒里，这条串联链贡献的是
        // **所有 IPC 的最大值之和的一半**，不是任何一项本身。
        //
        // 主题 CSS 的第一帧只依赖设置里的 `ui_style`。所以先让设置/语言/设置问题
        // 到岸，立刻 `setSettings` 触发主题装载；其余状态继续并行，不改变下面
        // “先文档列表、再启动文件、最后会话”的既有顺序。
        const 工作区任务 = api.workspace.get();
        // 主题扫目录。目录不存在、一个主题都没有都是**正常结果**（返回空表），
        // 不是错误——主题目录还没建起来的机器就是这种情况。
        const 主题任务 = api.theme.list();
        // 命令行带来的文件（`nota 笔记.md`、"用 Nota 打开"）。宿主只转告路径。
        //
        // ⚠️ 这一枪**自带 `catch`**（2026-09-25）：文件名不是合法 UTF-8 时
        // 宿主会如实报错，而它一旦把后面那组 `Promise.all` 整体掀翻，
        // 工作区 / 主题 / 文档列表就**全都不会生效**——一个打不开的文件
        // 不该拖垮整个启动。报错本身还是要给用户看，所以就地弹一条。
        const 启动文件任务 = api.startupFile().catch((e) => {
          toast(t("Could not open the file from the command line: {0}", String(e)), "error");
          return null;
        });
        const [s, 设置问题, 界面语言] = await Promise.all([
          api.settings.get(),
          // 开机读设置有没有出问题（解析不了 `settings.toml` 时宿主退回默认值
          // 继续跑）。**这条不是可选的**，理由见文件头。
          api.settings.problem(),
          // 界面语言。⚠️ 自带 `catch`，理由见文件头。
          api.appLang().catch(() => null),
        ]);
        if (!alive) return;
        // ⚠️ 在 `setSettings` 之前定语言（理由见文件头第 1 条）。
        if (界面语言) 定语言(界面语言.effective);
        setSettings(s);
        const [ws, themeList, 启动文件] = await Promise.all([工作区任务, 主题任务, 启动文件任务]);
        if (!alive) return;
        // ⚠️ 这一枪**冷启动时永远是 `null`**：工作区在宿主进程里只是个
        // `Mutex<Option<PathBuf>>`，新进程开出来必然是空的。这里照设不误是因为
        // 它才是"这次进程现在的工作区"的真相；真正的"接上上次那个文件夹"在
        // `接上会话` 里（第三档），而且要排在它**后面**才对得上。
        setWorkspace(ws);
        setThemes(themeList);
        // 不自动消失（`0`）：这是状态，不是一次操作的结果。见 `ui/useToasts.ts`。
        if (设置问题) toast(t("The settings could not be read; starting with defaults this time. {0}", String(设置问题)), "error", 0);
        // ⚠️ 那个 `?.` 是给**旧后端**留的（同上面那段）：真正缺了这一截时按第一档
        // 办——那正是这一档的词义，也是 `StartupAction` 的 `Default`。
        const 启动档: StartupAction = s.files?.startup ?? "new-file";
        await refreshDocs();
        // ⚠️ 放在 `refreshDocs()` **之后**（理由见文件头第 2 条）。
        if (启动文件) await openPath(启动文件);
        // ⚠️ **恢复会话排在最后**，而且两步的顺序不能反：`接上会话` 在没有
        // 命令行文件时会把上次那几个标签逐个开回来，而它自己也要**先**读到
        // 那份侧车才知道该开谁。放到 `openPath` 前面的话，命令行给的那一份
        // 会先被恢复出来的标签盖掉（活动标签归最后打开的那一个）。
        //
        // ⚠️ 它**自带 `catch`**（在 `useSession` 里）：侧车读不出来只该让标签
        // 不恢复，不该在启动时先给用户一条看不懂的错，更不该拖垮握手。
        //
        // ⚠️ **启动档在这里读、在这里传**（2026-09-27 起它真的生效了）。
        // 在这一天之前 `files.startup` 是个**摆设**——三档没有任何一处读它，
        // 而这一段无条件恢复标签和工作区，也就是永远按第三档办。
        // 那个 `?.` 与 `App.tsx` 里 `keys?.` 那条同一个理由：跑起来的后端
        // 可能是旧的，缺了这一截就是启动即白屏。
        await 接上会话(启动文件 ?? null, 启动档);
        markStartupReady();
      } catch (e) {
        toast(t("Could not read the state at startup: {0}", String(e)), "error");
      }

      // 握手（见 `lib.rs` 里那段"为什么需要"）。失败不影响使用，只记一笔。
      try {
        await api.frontendReady();
      } catch (e) {
        console.warn("[nota] frontendReady 失败：", e);
      }
    })();

    return () => {
      alive = false;
    };
    // ⚠️ 这三个 `set*` 是 `useState` 给的稳定身份（React 保证），列进来是为了
    // 这条 effect 的依赖看起来是完整的；真正会变的是那三个回调，而它们**必须**
    // 是稳定的——理由见文件头最后一段。
  }, [refreshDocs, toast, openPath, 接上会话, setSettings, setWorkspace, setThemes]);
}
