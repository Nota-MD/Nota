/**
 * **启动那一枪**：优先把设置、语言与首份文档接上，其余导航状态并行补齐。
 *
 * 从 `App.tsx` 搬出来的（2026-09-26，本文件当时 1049 行、硬上限 1000）。
 * 判据是老规矩（见 `App.tsx` 文件头）：**这块东西自己有一份完整的理由可写**。
 * 搬的时候一行逻辑没改，只是把外面那几个 `setState` 变成了入参。
 *
 * # 首帧关键路径
 *
 * ```text
 * 设置 + 语言 + 设置问题 → 命令行文件 → 首份文档 → 编辑器可输入 → 显示窗口
 * ```
 *
 * 工作区根目录与文档主题清单只影响随后出现的侧栏和菜单。它们和关键路径同时
 * 发起，但完成后各自 `setState`，不再用 `Promise.all` 把窗口挡在后面。
 *
 * - **开机问题**：与设置、语言同批等待。不报的话，用户看到的是一份“自己变回
 *   默认”的设置，而下一次改动能把原文件覆盖掉。
 * - **命令行文件**：自带 `catch`；打开失败时退回默认启动档，而不是让窗口停到
 *   五秒兜底计时器。
 * - **界面语言**：必须在 `setSettings` 前定好，否则第一帧会先画成英文再跳中文。
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
 * # ⚠️ 顺序上刻意保留的安排
 *
 * 1. `定语言` 必须在 `setSettings` **之前**：定了之后 `i18n` 会通知所有订阅者
 *    重画一次（`useT`），而那一批订阅者这一帧还没挂上，不会白画一趟。
 * 2. 命令行文件先 `openPath`，再交给 `接上会话` 只恢复最近记录与滚动位置；
 *    这样编辑器不必等会话侧车整份读完才出现。
 *
 * # ⚠️ 这个 effect 只跑一次——那是一条**约定**，不是观察
 *
 * 依赖里的 `toast` / `openPath` 都是空依赖的 `useCallback`，
 * 三个 `set*` 是 `useState` 给的稳定身份。⚠️ 哪天有人给 `openPath` 的上游加一条
 * 会抖的依赖（比如直接捕获 `docs`），这个 effect 就会每次刷新文档列表都重跑
 * 一遍、**把命令行那份文件反复重新打开**。那条约定记在 `ui/useDocuments.ts`
 * 文件头第 4 条里，那边有踩过的现场。
 */

import { useEffect } from "react";

import { api, type DocThemeInfo, type Settings, type StartupAction } from "@/bridge/ipc";
import { setLanguage, t } from "@/i18n";
import type { Toast } from "@/ui/Toasts";
import { markStartupReady } from "@/ui/useBootReveal";
import { debugError, debugEvent } from "@/ui/debug-log";

/**
 * 编译进二进制的 Adwaita 文档主题。它同时是宿主清单的第一帧兜底：
 * Windows 首次启动或主题目录暂不可读时，下拉与「主题」菜单也不能空着。
 */
export const BUILTIN_DOC_THEMES: DocThemeInfo[] = [
  { id: "adwaita", name: "Adwaita", builtin: true },
  { id: "adwaita-dark", name: "Adwaita（深色）", builtin: true },
];

export interface StartActionWiring {
  setSettings: (s: Settings) => void;
  setWorkspace: (w: string | null) => void;
  setThemes: (t: DocThemeInfo[]) => void;
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
  connectAboveMeetingSpeech: (startActionTextItem: string | null, startActionLevel: StartupAction) => Promise<void>;
  toast: (message: string, level?: Toast["level"], ttlMs?: number) => void;
}

export function useStartup(w: StartActionWiring): void {
  const { setSettings, setWorkspace, setThemes, openPath, connectAboveMeetingSpeech, toast } = w;

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
        // 到岸，立刻 `setSettings` 触发主题装载。工作区与主题清单只影响菜单和
        // 侧栏，不参与编辑器首帧，到了就各自写入，不再挡在主路径上。
        const workWorkAreaTaskTask = api.workspace.get();
        // 主题扫目录。目录不存在、一个主题都没有都是**正常结果**（返回空表），
        // 不是错误——主题目录还没建起来的机器就是这种情况。
        const themeTask = api.theme.list();
        // 命令行带来的文件（`nota 笔记.md`、"用 Nota 打开"）。宿主只转告路径。
        //
        // ⚠️ 这一枪**自带 `catch`**（2026-09-25）：文件名不是合法 UTF-8 时
        // 宿主会如实报错，而它一旦把后面那组 `Promise.all` 整体掀翻，
        // 工作区 / 主题 / 文档列表就**全都不会生效**——一个打不开的文件
        // 不该拖垮整个启动。报错本身还是要给用户看，所以就地弹一条。
        const startActionTextItemTaskTask = api.startupFile().catch((e) => {
          debugError("startup", "command-line file lookup failed", e);
          toast(t("Could not open the file from the command line: {0}", String(e)), "error");
          return null;
        });
        const [s, settingsIssue, uiLanguage] = await Promise.all([
          api.settings.get(),
          // 开机读设置有没有出问题（解析不了 `settings.toml` 时宿主退回默认值
          // 继续跑）。**这条不是可选的**，理由见文件头。
          api.settings.problem(),
          // 界面语言。⚠️ 自带 `catch`，理由见文件头。
          api.appLang().catch(() => null),
        ]);
        if (!alive) return;
        // ⚠️ 在 `setSettings` 之前定语言（理由见文件头第 1 条）。
        if (uiLanguage) setLanguage(uiLanguage.effective);
        setSettings(s);
        debugEvent("startup", "settings ready", {
          language: uiLanguage?.effective ?? "unknown",
          ui_style: s.ui_style,
          ui_mode: s.ui_mode,
          document_theme: s.document_theme,
          startup: s.files?.startup ?? "new-file",
        });
        void workWorkAreaTaskTask
          .then((ws) => {
            if (alive) {
              setWorkspace(ws);
              debugEvent("startup", "workspace restored", { path: ws ?? "" });
            }
          })
          .catch((e) => {
            if (alive) debugError("startup", "workspace lookup failed", e);
          });
        void themeTask
          .then((themeList) => {
            if (alive) {
              setThemes(themeList.length > 0 ? themeList : BUILTIN_DOC_THEMES);
              debugEvent("startup", "document theme inventory ready", {
                count: themeList.length || BUILTIN_DOC_THEMES.length,
              });
            }
          })
          .catch((e) => {
            if (alive) {
              setThemes(BUILTIN_DOC_THEMES);
              debugError("startup", "document theme inventory failed", e);
            }
          });

        const startActionTextItem = await startActionTextItemTaskTask;
        if (!alive) return;
        debugEvent("startup", "command-line file resolved", {
          present: Boolean(startActionTextItem),
        });
        // 不自动消失（`0`）：这是状态，不是一次操作的结果。见 `ui/useToasts.ts`。
        if (settingsIssue) toast(t("The settings could not be read; starting with defaults this time. {0}", String(settingsIssue)), "error", 0);
        // ⚠️ 那个 `?.` 是给**旧后端**留的（同上面那段）：真正缺了这一截时按第一档
        // 办——那正是这一档的词义，也是 `StartupAction` 的 `Default`。
        const startActionLevel: StartupAction = s.files?.startup ?? "new-file";
        // 命令行指名的文件可以先开；开失败时把 `null` 交给会话恢复，
        // 让默认的「新建空白文档」仍有一条兜底。
        const alreadyEnableActionTextItem = startActionTextItem ? await openPath(startActionTextItem) : false;
        if (startActionTextItem) {
          debugEvent("startup", "command-line file open finished", {
            opened: Boolean(alreadyEnableActionTextItem),
          });
        }
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
        await connectAboveMeetingSpeech(alreadyEnableActionTextItem ? startActionTextItem : null, startActionLevel);
        debugEvent("startup", "session restore finished");
        markStartupReady();
      } catch (e) {
        debugError("startup", "startup state failed", e);
        toast(t("Could not read the state at startup: {0}", String(e)), "error");
      }

      // 握手（见 `lib.rs` 里那段"为什么需要"）。失败不影响使用，只记一笔。
      try {
        await api.frontendReady();
        debugEvent("startup", "frontend ready handshake sent");
      } catch (e) {
        debugError("startup", "frontend ready handshake failed", e);
      }
    })();

    return () => {
      alive = false;
    };
    // ⚠️ 这三个 `set*` 是 `useState` 给的稳定身份（React 保证），列进来是为了
    // 这条 effect 的依赖看起来是完整的；真正会变的是那三个回调，而它们**必须**
    // 是稳定的——理由见文件头最后一段。
  }, [toast, openPath, connectAboveMeetingSpeech, setSettings, setWorkspace, setThemes]);
}
