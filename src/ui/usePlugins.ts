/**
 * **插件在界面上的那一整块**：已装清单、声明的面板、声明的菜单项，
 * 以及"跑一条插件命令"这件事本身。
 *
 * # 为什么收成一个 hook
 *
 * 从 `App.tsx` 搬出来的（2026-09-24，那边顶着 1000 行上限，见 `AGENTS.md` §0.4）。
 * 搬的理由和 `useMenus.ts` / `useDialogs.ts` 那两次一样：这一块**和外壳骨架无关**
 * ——外壳只管"把 `plugins` 交给 `Home` 和 `PluginDock`、把 `menus` 交给菜单栏"，
 * 而"插件那三样从哪儿来、菜单项怎么变成能点的东西"是一件能自己讲圆的事。
 *
 * # ⚠️ 三条都靠**拉**，不是靠事件（BUG-13）
 *
 * `list` / `panels` / `menus` 都是**状态**：注册发生在插件加载时（`setup()`），
 * 早于前端挂载，等事件必漏且漏得安静。范式是**声明是状态 → 拉；发生是事件 → 推**，
 * 见 `plugin/mod.rs` 与 `bridge/ipc.ts` 里 `panels()` 那段。
 *
 * 面板的**内容**是个例外中的例外（它有"变了"的事件），但那件事由
 * `PluginDock.tsx` 自己管——这一层只负责清单。
 *
 * # 菜单项怎么变成"能点的"
 *
 * `ui/pluginMenus.ts` 把插件声明的菜单项合成一栏（id 是 `__plugin:<插件>:<命令>`），
 * 这里给出**与那些 id 一一对应的处理函数**。两份东西分开是有意的：
 * 「摆在哪一栏、长什么样」是菜单的事，「点了干什么」是实现的事。
 * 合起来写的话，`ui/commands.ts` 那张静态表就再也读不出"这一栏是谁的"了。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open as openDialog, save as saveDialog } from "@/ui/file-picker";

import {
  api,
  events,
  on,
  type PluginInfo,
  type PluginMenuItem,
  type PluginPanel,
  type PluginSetting,
  type PluginReview,
  type PluginUpdateInfo,
  type trustRecord,
  type exportReport,
} from "@/bridge/ipc";
import { t, useLanguage } from "@/i18n";
import { MENUS, type MenuSpec } from "@/ui/commands";
import { recognizeRecognizeOfMenu, withPluginDock, pluginItemId } from "@/ui/pluginMenus";
import { askParameter } from "@/ui/plugin-prompt";
import { keyNameDescription } from "@/ui/pluginText";
import type { Toast } from "@/ui/Toasts";
import type { ConfirmAnswer, ConfirmRequest, PromptRequest } from "@/ui/useDialogs";

export interface PluginsWiring {
  toast: (message: string, level?: Toast["level"]) => void;
  askPrompt: (req: PromptRequest) => Promise<{ value: string; second: string } | null>;
  /** 是/否框（宿主自己画的那个，不是 `window.confirm`）。装/卸之前要问一句。 */
  askConfirm: (req: ConfirmRequest) => Promise<ConfirmAnswer>;
}

/**
 * 「插件」页上那几颗按钮的接线。
 *
 * ⚠️ 动作**在这里实现、在 `PluginDock` 里画**：那一栏是个纯展示组件
 * （props 进、JSX 出），装/卸要问文件、要问确认、要弹 toast，都不该塞进它。
 */
export interface pluginAction {
  /** 弹文件框挑一个插件包，然后装。用户取消就什么都不做。 */
  install: () => Promise<void>;
  /**
   * 弹保存框，把这个插件导成一个 `.nota-plugin` 包（2026-09-27 加）。
   *
   * ⚠️ 默认文件名**由后端算**（`api.plugin.exportName`），不在这儿用
   * `name + version` 拼：清单里的 `name` 是作者写的，可以带斜杠。
   *
   * ⚠️ 导出**不改任何状态**，所以不会弹确认框；取消保存框就什么都不做。
   */
  export: (id: string) => Promise<void>;
  /** 卸掉（**不可逆**，先问一句）。 */
  unload: (id: string) => Promise<void>;
  /**
   * 在系统的文件管理器里打开用户插件目录（`~/.local/share/nota/plugins`）。
   *
   * ⚠️ 为什么要经过这一层而不是让设置页自己调 `api`：**失败要说给人听**
   * （文件管理器调不起来是可能的），而 toast 只有这一层有。「拓展」那一页是
   * 纯展示的（同 `PluginDock`）。
   */
  openDirectory2: () => Promise<void>;
  toggle: (id: string, enabled: boolean) => Promise<void>;
  /**
   * 信任这个插件的签名者（TOFU + 显式信任）。
   *
   * ⚠️ **指纹要一路传进来**，别让实现自己去清单里查：那张确认框上唯一要给人
   * 看的东西就是指纹，而查清单会查到**这一次渲染的快照**——装完那一步调过来时，
   * 新插件还不在快照里。实现里的注释有完整来龙去脉。
   */
  messageTask: (id: string, pointTexture?: string | null) => Promise<void>;
  /**
   * 写插件声明的一格设置（2026-10-04 加：「设置 → 拓展」那一页上的滑杆）。
   *
   * ⚠️ **不走 `忙`**：滑杆拖一下就是一次调用，把它算进"正忙"会让旁边那几颗
   * 按钮在拖动期间一直灰着（装 / 卸 / 启停共用 `忙`）。
   */
  settings: (id: string, key: string, value: string | number | boolean) => Promise<void>;
  /** 重新读取所有插件声明的仓库清单。 */
  checkForUpdates: () => Promise<void>;
  /** 安装一个插件的可用更新。 */
  update: (id: string) => Promise<void>;
  /** 顺序安装当前全部可用更新。 */
  updateAll: () => Promise<void>;
  /** 此刻正忙的那个：插件 id，或者 `"装"`（安装中）。按钮据此置灰。 */
  busy: string | null;
}

export interface PluginsState {
  /** 已装插件清单。`Home` 与 `PluginDock` 那道诊断清单用它。 */
  plugins: PluginInfo[];
  /** 插件声明的面板（清单，不是内容）。 */
  panels: PluginPanel[];
  /**
   * 信任库里那几把钥匙（指纹 + 名字）。
   *
   * ⚠️ **必须给用户看得见**：信任是按**指纹**判的，而指纹这东西只有"对着作者
   * 公布的那一份核一遍"才有意义。看不见的表等于没有表——用户只会在某个插件行上
   * 点一下「信任」，然后永远不知道自己信了什么
   * （`package.rs::信任库::列` 的注释里写着同一句话）。
   */
  messageTask: trustRecord[];
  /** 有更新源的插件及其当前检查结果。 */
  pluginUpdate: PluginUpdateInfo[];
  /**
   * 菜单栏**这一份**要摆的那几栏 = `MENUS` ＋ 插件那一栏（没有插件菜单就没有它）。
   *
   * ⚠️ 身份**稳定**（`useMemo`）。它下游牵着三条 memo/effect，最后一条会
   * **每渲染重推一次原生菜单**——`ui/useMenus.ts` 顶上那张表写着这条链。
   */
  menus: MenuSpec[];
  /**
   * 插件菜单项 → 实现，键是合成的 id。**直接并进 `App.tsx` 的 `menuHandlers`**，
   * 于是"灰不灰"的判据（那张表里有没有）对插件项和普通项是同一条。
   */
  handlers: Record<string, () => void>;
  /**
   * 跑一条插件命令。⚠️ **错误在这里说给用户听，不再往外抛**——
   * 调用方（`PanelBody` 的 `void 点按钮(b)`、菜单的 `() => void 调(...)`）
   * 都是"点了就跑"的场合，往外抛就是一个**没人接的 Promise**，
   * 症状是控制台一行红字、界面上什么都没有。
   */
  configure: (plugin: string, command: string, args?: unknown) => Promise<void>;
  /** 「插件」页上那几颗按钮。见 [`插件动作`]。 */
  action: pluginAction;
  /**
   * 编辑区里**此刻**摊着哪一块（没有就是 `null`）。`App.tsx` 据此决定
   * 主区是画正文还是画预览。
   */
  review: PluginReview | null;
  /** 收起编辑区里那一块、切回正文。用户点「回到正文」。 */
  receivePreview: () => Promise<void>;
}

export function usePlugins({ toast, askPrompt, askConfirm }: PluginsWiring): PluginsState {
  // ⚠️ 这一层的文案一律走**模块级的 `t`**，不是 `useT()`：它们全是在动作发生的那
  // 一刻现取的（toast、确认框），那一下 `t` 读到的就是当前语言；而这个 hook
  // **几乎不往外返回"存下来"的字符串**，所以没有哪一块会因为语言变了而需要
  // 重画（`i18n/index.ts` 顶上讲的两条代价在这里基本不成立）。
  //
  // ⚠️ **`menus` 是那条"几乎"**（2026-09-26 补的）：它经由 `pluginMenus.ts`
  // 算出来时就翻好了栏名与那句后缀，属于**存下来的字符串**。所以它多一条
  // 语言依赖，见下面 `menus` 那个 `useMemo`。
  // 当前语言，**只当依赖用**（见上面那段最后那条"几乎"）。
  const language2 = useLanguage();
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [panels, setPanels] = useState<PluginPanel[]>([]);
  const [menuItems, setMenuItems] = useState<PluginMenuItem[]>([]);
  /** 见 [`PluginsState::信任`]。拉法与前三个一样。 */
  const [trustTable, setTrustTable] = useState<trustRecord[]>([]);
  const [pluginUpdate, setPluginUpdate] = useState<PluginUpdateInfo[]>([]);
  /** 正忙哪一个（插件 id 或 `"装"`）。见 [`插件动作::忙`]。 */
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * 拉一次三样。**装 / 卸 / 启停之后必须重拉**：那四件事都会真的加载或卸载
   * 插件，而面板清单、菜单项、插件行上的状态**都是加载的产物**
   * （见 `bridge/ipc.ts::panels` 那段"什么时候需要重拉"）。
   *
   * ⚠️ 用 `ref` 装一个"这一次还活着吗"的旗标：动作是用户点的，页面可能在
   * 请求飞在路上时就被关掉，那时 `setState` 会报"更新了已卸载的组件"。
   */
  const activeActive = useRef(true);
  useEffect(() => {
    activeActive.current = true;
    return () => {
      activeActive.current = false;
    };
  }, []);

  const heavyPull = useCallback(async () => {
    const [ps, pn, mn, tk] = await Promise.all([
      api.plugin.list(),
      api.plugin.panels(),
      api.plugin.menus(),
      api.plugin.trustList(),
    ]);
    if (!activeActive.current) return;
    setPlugins(ps);
    setPanels(pn);
    setMenuItems(mn);
    setTrustTable(tk);
  }, []);

  // 启动拉一次。四样一起拉——它们回答的是同一个问题（"现在装了什么、
  // 信了谁"），分开四次只会让"读了插件清单但菜单还没到"这种中间态多出几种。
  //
  // ⚠️ 这里**复用 `重拉`**（不再自己抄一遍四行的 `Promise.all`）：抄一遍就是
  // "同一个动作两份实现"，往后加第五样时必然漏掉一边，而漏掉的那一边
  // **只在重新挂载时才显出差别**——最难查的那种。
  useEffect(() => {
    void (async () => {
      try {
        await heavyPull();
      } catch (e) {
        // 插件读不出来**不该拦住别的**（设置、工作区、主题照常），
        // 但也不能不响：界面上少了一整栏，用户得知道是为什么。
        toast(t("Could not read extension status: {0}", String(e)), "error");
      }
    })();
  }, [heavyPull, toast]);

  // 启动后静默检查一次。离线时不打扰用户，手动点「检查更新」才显示错误。
  useEffect(() => {
    let returnAt = true;
    api.plugin
      .updates()
      .then((updates) => {
        if (returnAt) setPluginUpdate(updates);
      })
      .catch(() => {
        /* 手动检查会报告原因。 */
      });
    return () => {
      returnAt = false;
    };
  }, []);

  /**
   * 编辑区里摊着的那一块。**拉一次 + 订阅"变了"**，两条都要：
   *
   * - **拉**管"我挂载的时候它已经摊着了"（插件比界面先起来，或者用户刚
   *   热重载过）——只订阅不拉的话，这两种情况下编辑区会静静地显示正文；
   * - **推**管"就是现在这一瞬间变了"（AI 刚提了改动，用户正看着编辑区）。
   *
   * 这正是 BUG-13 那条判据的正面用法：**状态拉、发生推**，两条路各管一段，
   * 而不是"用事件去表达状态"。
   */
  const [review, setReview] = useState<PluginReview | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let returnActiveActive = true;

    const pullPreview = async () => {
      try {
        const now = await api.plugin.review();
        if (returnActiveActive) setReview(now);
      } catch (e) {
        if (returnActiveActive) toast(t("Could not read the in-editor preview status: {0}", String(e)), "error");
      }
    };

    void pullPreview();
    void on<Record<string, never>>(events.pluginReview, () => {
      void pullPreview();
    }).then((u) => {
      if (returnActiveActive) unsubscribe = u;
      else u();
    });

    return () => {
      returnActiveActive = false;
      unsubscribe?.();
    };
  }, [toast]);

  const receivePreview = useCallback(async () => {
    if (!review) return;
    try {
      await api.plugin.reviewClose(review.plugin);
      // ⚠️ 本地说一声"收了"，**不指望事件**：宿主那边确实会发
      // `nota:plugin-review`，但"用户按了返回、界面还停在预览上"这一下
      // 多等一个来回都嫌长。事件到了再拉一次，两边收敛到同一个答案。
      setReview(null);
    } catch (e) {
      // ⚠️ 收不起来要说话：不说的话用户看到的是"按钮点了没反应"。
      toast(t("Could not close the preview: {0}", String(e)), "error");
    }
  }, [review, toast]);

  const configure = useCallback(
    async (plugin: string, command: string, args?: unknown) => {
      try {
        await api.plugin.call(plugin, command, args);
      } catch (e) {
        // 带上插件 id 与命令名：插件多了之后"哪一条没跑成"正是用户要看的。
        toast(t("Could not run “{1}” from extension {0}: {2}", plugin, command, String(e)), "error");
      }
    },
    [toast],
  );

  // ⚠️ `语` 在依赖里：`pluginMenus.ts` 那两处 `t(...)`（栏名「插件」、以及
  // "想挂到别的栏"那句后缀）是在**算这一份的时候**翻好的，语言换了不重算
  // 就还是旧语言。同一条理由见 `useMenus.ts` 推原生菜单那个 effect。
  const menus = useMemo(() => withPluginDock(MENUS, menuItems), [menuItems, language2]);

  /**
   * 菜单项 → 实现。
   *
   * ⚠️ **只给"认得的那一栏"建处理函数**。`menu` 写了别的值的条目没有实现，
   * 于是按同一条判据（表里没有就灰）自动变灰——`ui/pluginMenus.ts` 里
   * 写明这件事，两处必须一致：那儿摆出条目、这儿不接，缺一边就变成
   * "看着能点、点了没反应"。
   */
  const handlers = useMemo(() => {
    const out: Record<string, () => void> = {};
    for (const it of menuItems) {
      if (it.menu !== recognizeRecognizeOfMenu) continue;
      out[pluginItemId(it.plugin, it.command)] = () => {
        void (async () => {
          const ask = await askParameter({ prompt: it.prompt, askPrompt });
          if (!ask) return; // 用户取消
          await configure(it.plugin, it.command, ask.args);
        })();
      };
    }
    return out;
  }, [menuItems, askPrompt, configure]);

  /**
   * 「插件」页那几颗按钮的实现。四件事的共同形状：**忙什么 → 干 → 重拉 → 报错**。
   *
   * ⚠️ 抽成一个 `跑` 是因为四段的收尾一模一样（成功要重拉、失败要 toast、
   * 无论如何要把"忙"清掉）。各写一遍的话，漏掉重拉的那个动作就会留下
   * 界面上"停用了但面板还在"这种半生效状态——而那正是这轮要修的病。
   *
   * ⚠️ 它**把值返回出来**（而不是让调用方在闭包里往外塞一个 `let`）：
   * TS 对"只在闭包里被重新赋值"的变量不会重算类型收窄，那样写出来的
   * `if (x === null) return` 会被判成永远成立，后面的 `x` 变成 `never`。
   * 失败返回 `null`（那时 `跑` 已经 toast 过了）。
   */
  const run = useCallback(
    async <T,>(mark: string, doWhatWhat: () => Promise<T>, becomeDone?: string): Promise<T | null> => {
      setBusy(mark);
      try {
        const value2 = await doWhatWhat();
        await heavyPull();
        if (becomeDone) toast(becomeDone, "info");
        return value2;
      } catch (e) {
        toast(String(e), "error");
        return null;
      } finally {
        setBusy(null);
      }
    },
    [heavyPull, toast],
  );

  /**
   * 信任一个插件的签名者。
   *
   * ⚠️ 单独抽出来（而不是写在下面那个 `useMemo` 里）是因为**「装」要用它**：
   * 装完之后如果签名者没被信任，装的那一步会现问一句"要不要信任"。
   * 写在 `useMemo` 里就成了自己引用自己。
   *
   * ⚠️ **指纹由调用者传进来，不在这里现查。** 这里 `plugins` 是**这一次渲染
   * 的那一帧**的快照：装在刚装完的那一刻调它时，新插件还不在快照里，
   * `plugins.find(...)` 只会得到 `undefined`——于是对话框上写的是「指纹：（未知）」，
   * 而**指纹恰恰是这张对话框唯一要给人看的东西**（信任按指纹判，名字不算数）。
   * 2026-09-25 之前就是这样，装完问的那一句永远显示"未知"。
   * 调用者要么手里已经有一份刚拉回来的清单（`装它`），要么正在渲染这一行
   * （列表里那颗「信任」），两处都拿得到真指纹。
   */
  const trustPlugin = useCallback(
    async (id: string, pointTexture?: string | null) => {
      // 兜底那一次查只是为了老调用点，正常情况下上面那条 `??` 用不上。
      const assertValuePointTexture = pointTexture ?? plugins.find((x) => x.id === id)?.key_id ?? null;
      const answer = await askConfirm({
        title: t("Trust This Signer?"),
        // ⚠️ 拆成一句一条，而不是把三句拼成一个 `t("…")`：换行是**分段**，不是
        // 句子的一部分——键里带上 `\n` 的话，中文表那边也得照着写转义。
        message:
          t("Fingerprint: {0}", assertValuePointTexture ?? t("(unknown)")) +
          "\n\n" +
          t("Once trusted, any package signed with this key counts as verified.") +
          "\n" +
          t("Trust is recorded by fingerprint — check it against the one the author publishes, not just the name."),
        confirmLabel: t("Trust"),
      });
      if (answer !== "confirm") return;
      await run(id, () => api.plugin.trust(id), t("Trusted {0}", assertValuePointTexture ?? id));
    },
    [plugins, askConfirm, run],
  );

  const checkForUpdates = useCallback(async () => {
    setBusy("更新检查");
    try {
      const updates = await api.plugin.updates();
      if (activeActive.current) setPluginUpdate(updates);
      const failures = updates.filter((update) => update.error);
      if (failures.length > 0) {
        toast(failures.map((update) => `${update.name}: ${update.error}`).join("\n"), "error");
      }
    } catch (e) {
      toast(t("Could not check extension updates: {0}", String(e)), "error");
    } finally {
      if (activeActive.current) setBusy(null);
    }
  }, [toast]);

  const updateOne = useCallback(
    async (id: string) => {
      setBusy(id);
      try {
        const result = await api.plugin.update(id);
        await heavyPull();
        const updates = await api.plugin.updates().catch(() => null);
        if (updates && activeActive.current) setPluginUpdate(updates);
        toast(
          t("Updated {0} from {1} to {2}", result.id, result.fromVersion, result.toVersion),
          "info",
        );
        const list = await api.plugin.list().catch(() => []);
        const installed = list.find((plugin) => plugin.id === id);
        if (installed?.signature === "unknown") {
          await trustPlugin(installed.id, installed.key_id);
        }
      } catch (e) {
        toast(t("Could not update extension {0}: {1}", id, String(e)), "error");
      } finally {
        if (activeActive.current) setBusy(null);
      }
    },
    [heavyPull, trustPlugin, toast],
  );

  const updateAll = useCallback(async () => {
    const pending = pluginUpdate.filter((update) => update.available).map((update) => update.id);
    if (pending.length === 0) return;
    setBusy("全部更新");
    const failures: string[] = [];
    try {
      for (const id of pending) {
        try {
          await api.plugin.update(id);
        } catch (e) {
          failures.push(`${id}: ${String(e)}`);
        }
      }
      await heavyPull();
      const updates = await api.plugin.updates().catch(() => null);
      if (updates && activeActive.current) setPluginUpdate(updates);
      if (failures.length > 0) {
        toast(failures.join("\n"), "error");
      } else {
        toast(t("Updated {0} extensions.", pending.length), "info");
      }
    } finally {
      if (activeActive.current) setBusy(null);
    }
  }, [pluginUpdate, heavyPull, toast]);

  const installPlugin = useCallback(async () => {
    // ⚠️ 文件框由前端弹（宿主不弹框）：那是界面的事，而且宿主弹框在无头测试里
    // 没法验。只认**包文件**——开发态的目录插件走仓库里的 `plugins/`，
    // 那条路本来就在（见 `plugin/mod.rs` 的"目录与去重"）。
    const select = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: t("Extension Package"), extensions: ["nota-plugin", "zip"] }],
    }).catch(() => null);
    if (typeof select !== "string") return; // 用户取消 / 平台没给路径

    const id = await run("装", () => api.plugin.install(select));
    if (id === null) return; // 装失败了，`跑` 已经 toast 过

    // 装完**直接问**（而不是只 toast 一句"去列表里点信任"）：用户刚选完文件，
    // 这一刻他知道这包是从哪儿来的，正是该做决定的时候。
    //
    // ⚠️ "未知签名者"**不是**拒装的理由（见 `plugin/mod.rs::装`）：装进来、
    // 标出来、再问一句要不要信任。用户说不信任，包也照旧躺在磁盘上能用。
    //
    // ⚠️ 这里**重新拉一次清单**而不是读 state 里的 `plugins`：那一个是上一次
    // 渲染的快照，刚装进来的那个插件还不在里面。
    const clearSingle = await api.plugin.list().catch(() => []);
    const p = clearSingle.find((x) => x.id === id);
    if (!p) return;
    toast(t("Installed: {0} ({1})", p.name, keyNameDescription(p.signature)), "info");
    if (p.signature === "unknown") await trustPlugin(p.id, p.key_id);
  }, [run, trustPlugin, toast]);

  const guideIt = useCallback(
    async (id: string) => {
      // ⚠️ 默认名**问后端要**（`paths::安全文件名` 的规则只该有一份实现）。
      // 拿不到就退回 `id + 后缀`：这一条路只在"插件刚好在这两步之间被卸掉了"
      // 时走到，那时保存框里写个 id 也比什么都不写好。
      const defaultName = await api.plugin.exportName(id).catch(() => `${id}.nota-plugin`);
      const select = await saveDialog({
        defaultPath: defaultName,
        filters: [{ name: t("Extension Package"), extensions: ["nota-plugin"] }],
      }).catch(() => null);
      if (typeof select !== "string") return; // 用户取消 / 平台没给路径

      // ⚠️ 只补"压根没有后缀"的那一种（`backup` → `backup.nota-plugin`）。
      // 用户自己写了后缀就**一个字节都不动**：他要是打了 `backup.zip`，
      // 说明他知道自己在干什么，硬接一个 `.nota-plugin` 会变成
      // `backup.zip.nota-plugin`——难看到像出了故障。
      const path = hasExtensionQuestion(select) ? select : `${select}.nota-plugin`;

      // ⚠️ 这里**沿用 `跑`**（它跑完会重拉一次清单）：导出不改任何状态，
      // 那一次重拉是多余的。留着它是因为"忙态 + 失败 toast + 收尾清忙"
      // 这三件事只该有一份实现——为省四个只读调用再抄一遍 try/catch，
      // 抄坏的那一次症状是"按钮永远转着圈"。
      const reportInform = await run(id, () => api.plugin.export(id, path));
      if (!reportInform) return; // 失败了，`跑` 已经 toast 过
      toast(
        [
          t("Exported {0}", reportInform.path),
          t("{0} files, {1}", String(reportInform.files), largeSmallDescription(reportInform.bytes)),
          keyNameGoTowardDescription(reportInform.signature),
        ].join("\n"),
        "info",
      );
    },
    [run, toast],
  );

  const openDirectory = useCallback(async () => {
    // 成功那一下也说一句：文件管理器可能在**另一个**窗口/工作区里弹出来，
    // 用户不一定看得见它。顺带把路径带上——找不到的人可以照着路径自己走。
    await run("目录", () => api.plugin.openDir(), t("Opened the extension folder in your file manager"));
  }, [run]);

  const uninstallPlugin = useCallback(
    async (id: string) => {
      // ⚠️ 这一下**不可逆**（插件目录真的删掉），所以必须先问一句。
      // 文案里明说"设置文件留着"——用户最担心的正是"我的 API key 会不会没了"。
      const answer = await askConfirm({
        title: t("Uninstall This Extension?"),
        // 拆法同上面「信任」那张框（换行是分段，不进键）。
        message:
          t("The extension folder for “{0}” is deleted, along with the panels, menu items and commands it brings.", id) +
          "\n\n" +
          t("Its own settings file (the AI extension's API key, for example) is kept, and stays if you reinstall the same id."),
        confirmLabel: t("Uninstall"),
        danger: true,
      });
      if (answer !== "confirm") return;
      await run(id, () => api.plugin.uninstall(id), t("Uninstalled {0}", id));
    },
    [askConfirm, run],
  );

  const togglePlugin = useCallback(
    async (id: string, enabled: boolean) => {
      const name3 = plugins.find((p) => p.id === id)?.name ?? id;
      // ⚠️ 停用是**真卸载**（见 `bridge/ipc.ts::setEnabled`）：要跑插件的
      // `on_unload` / `on_load`，所以会有一小会儿延迟，那颗按钮这时该是灰的。
      // ⚠️ 这一句原来是 `` `${enabled ? "启用" : "停用"}了 ${名}` ``：那个"…了"
      // 是接在**两个不同的词**后面的，拆开翻就会拼出"Enable 了 X"这种话。
      // 所以这里**整句当一个键**（两种形态两条）。
      await run(
        id,
        () => api.plugin.setEnabled(id, enabled),
        enabled ? t("Enabled {0}", name3) : t("Disabled {0}", name3),
      );
    },
    [plugins, run],
  );

  /**
   * 写插件声明的一格设置（「设置 → 拓展」那一页上的滑杆／文本框／开关）。
   * 见 [`插件动作::设置`]。
   *
   * # ⚠️ 三条口径
   *
   * 1. **先本地落一格，不等宿主回来**。三种控件都是**受控**的
   *    （`settings/primitives.tsx` 的 `Range` / `TextInput` / `Toggle` 画的都是传进去
   *    那个值），本地不跟着走的话，手指拖到 30、滑杆当场弹回 5——一次都拖不动。
   *    ⚠️ **按档位改对应的那个字段**（2026-10-10 起有三档）：一律改 `value` 的话，
   *    文本框与开关在"宿主回来之前"看着毫无反应——而反馈正是这里唯一要的东西。
   *    拖完拉回来的那个数**不是**新信息：宿主写下去的正是这个值（滑杆那边它只夹紧）。
   * 2. **不重拉**。`重拉` 是四条 IPC（清单 ＋ 面板 ＋ 菜单 ＋ 信任表），
   *    拖一下发一轮不值当；而那四条里**没有一条**会因为这一格设置而变。
   * 3. **失败要说话 ＋ 拉回来**：本地那一格现在是写失败的那个数，
   *    不拉回来的话界面上摆着一个没落盘的值——那正是这一页最不该有的东西。
   */
  const writeSettings = useCallback(
    async (id: string, key: string, value: string | number | boolean) => {
      const hitFillSmall = (s: PluginSetting): PluginSetting => {
        if (s.kind === "range") return { ...s, value: Number(value) };
        if (s.kind === "toggle") return { ...s, on: value === true };
        return { ...s, text: String(value) };
      };
      setPlugins((ps) =>
        ps.map((p) =>
          p.id === id
            ? {
                ...p,
                settings: p.settings.map((s) => (s.key === key ? hitFillSmall(s) : s)),
              }
            : p,
        ),
      );
      try {
        await api.plugin.setSetting(id, key, value);
      } catch (e) {
        toast(t("Could not save a setting for extension {0}: {1}", id, String(e)), "error");
        await heavyPull().catch(() => {
          /* 拉不回来也已经说过了，别再叠一条 toast */
        });
      }
    },
    [heavyPull, toast],
  );

  const action = useMemo<pluginAction>(
    () => ({
      busy,
      install: installPlugin,
      export: guideIt,
      unload: uninstallPlugin,
      openDirectory2: openDirectory,
      toggle: togglePlugin,
      messageTask: trustPlugin,
      settings: writeSettings,
      checkForUpdates,
      update: updateOne,
      updateAll,
    }),
    [
      busy,
      installPlugin,
      guideIt,
      uninstallPlugin,
      openDirectory,
      togglePlugin,
      trustPlugin,
      writeSettings,
      checkForUpdates,
      updateOne,
      updateAll,
    ],
  );

  return {
    plugins,
    panels,
    messageTask: trustTable,
    pluginUpdate,
    menus,
    handlers,
    configure,
    action,
    review,
    receivePreview,
  };
}

/**
 * ⚠️ `签名说明` **2026-09-27 搬去了 `ui/pluginText.ts`**（本地那份和插件栏那份
 * 是同一句话的两个副本，而「拓展」设置页又要用第三遍）。`t("verified")` 那几条
 * 键跟着搬走，`tools/i18n-check.sh` 扫的是全 `src/`，不受影响。
 */

/**
 * 导出报告里那个"签名块带没带上"的一句话。
 *
 * ⚠️ 这三句**必须说清楚**，不能只报"导出成功"：`dropped` 那一档的意思是
 * "你改过插件文件，所以这个包**没有签名**了"——收到包的人在界面上看到的
 * 会是「未签名」，而发的人以为发的是一份"已验证"的包。这件事只有这一句话
 * 能告诉他（`bridge/types.ts::导出报告::signature` 写着同一件事）。
 */
function keyNameGoTowardDescription(goToward: exportReport["signature"]): string {
  switch (goToward) {
    case "kept":
      return t("The signature was carried over — this package still counts as verified for whoever receives it (as long as they trust that key).");
    case "dropped":
      return t("This extension was modified, so its signature no longer matches. The package does not contain a signature. It can still be installed, but it will be shown as unsigned.");
    default:
      return t("This extension was never signed.");
  }
}

/** 这个路径有没有后缀（最后一个路径分隔符之后还有没有点）。见 [`导它`]。 */
function hasExtensionQuestion(path: string): boolean {
  const name3 = path.slice(path.lastIndexOf("/") + 1);
  // ⚠️ 点开头的隐藏文件（`.bashrc`）算**没有**后缀：那个点是"隐藏"的意思，
  // 不是"后缀"。判据取最后那个点是不是在开头之后。
  return name3.lastIndexOf(".") > 0;
}

/** 给人看的字节数。单位**不进 i18n**：KB / MB 两门语言写出来一样。 */
function largeSmallDescription(byte: number): string {
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${(byte / 1024).toFixed(1)} KB`;
  return `${(byte / 1024 / 1024).toFixed(1)} MB`;
}
