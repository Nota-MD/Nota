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
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import {
  api,
  events,
  on,
  type PluginInfo,
  type PluginMenuItem,
  type PluginPanel,
  type PluginReview,
  type 信任记录,
} from "@/bridge/ipc";
import { t, use语言 } from "@/i18n";
import { MENUS, type MenuSpec } from "@/ui/commands";
import { 认识的菜单, 带插件栏, 插件项id } from "@/ui/pluginMenus";
import { 问参数 } from "@/ui/plugin-prompt";
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
export interface 插件动作 {
  /** 弹文件框挑一个插件包，然后装。用户取消就什么都不做。 */
  装: () => Promise<void>;
  /** 卸掉（**不可逆**，先问一句）。 */
  卸: (id: string) => Promise<void>;
  启停: (id: string, enabled: boolean) => Promise<void>;
  /**
   * 信任这个插件的签名者（TOFU + 显式信任）。
   *
   * ⚠️ **指纹要一路传进来**，别让实现自己去清单里查：那张确认框上唯一要给人
   * 看的东西就是指纹，而查清单会查到**这一次渲染的快照**——装完那一步调过来时，
   * 新插件还不在快照里。实现里的注释有完整来龙去脉。
   */
  信任: (id: string, 指纹?: string | null) => Promise<void>;
  /** 此刻正忙的那个：插件 id，或者 `"装"`（安装中）。按钮据此置灰。 */
  忙: string | null;
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
  信任: 信任记录[];
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
  调: (plugin: string, command: string, args?: unknown) => Promise<void>;
  /** 「插件」页上那几颗按钮。见 [`插件动作`]。 */
  动作: 插件动作;
  /**
   * 编辑区里**此刻**摊着哪一块（没有就是 `null`）。`App.tsx` 据此决定
   * 主区是画正文还是画预览。
   */
  review: PluginReview | null;
  /** 收起编辑区里那一块、切回正文。用户点「回到正文」。 */
  收预览: () => Promise<void>;
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
  const 语 = use语言();
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [panels, setPanels] = useState<PluginPanel[]>([]);
  const [菜单项们, set菜单项们] = useState<PluginMenuItem[]>([]);
  /** 见 [`PluginsState::信任`]。拉法与前三个一样。 */
  const [信任表, set信任表] = useState<信任记录[]>([]);
  /** 正忙哪一个（插件 id 或 `"装"`）。见 [`插件动作::忙`]。 */
  const [忙, set忙] = useState<string | null>(null);

  /**
   * 拉一次三样。**装 / 卸 / 启停之后必须重拉**：那四件事都会真的加载或卸载
   * 插件，而面板清单、菜单项、插件行上的状态**都是加载的产物**
   * （见 `bridge/ipc.ts::panels` 那段"什么时候需要重拉"）。
   *
   * ⚠️ 用 `ref` 装一个"这一次还活着吗"的旗标：动作是用户点的，页面可能在
   * 请求飞在路上时就被关掉，那时 `setState` 会报"更新了已卸载的组件"。
   */
  const 活着 = useRef(true);
  useEffect(() => {
    活着.current = true;
    return () => {
      活着.current = false;
    };
  }, []);

  const 重拉 = useCallback(async () => {
    const [ps, pn, mn, tk] = await Promise.all([
      api.plugin.list(),
      api.plugin.panels(),
      api.plugin.menus(),
      api.plugin.trustList(),
    ]);
    if (!活着.current) return;
    setPlugins(ps);
    setPanels(pn);
    set菜单项们(mn);
    set信任表(tk);
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
        await 重拉();
      } catch (e) {
        // 插件读不出来**不该拦住别的**（设置、工作区、主题照常），
        // 但也不能不响：界面上少了一整栏，用户得知道是为什么。
        toast(t("读取插件状态失败：{0}", String(e)), "error");
      }
    })();
  }, [重拉, toast]);

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
    let 退订: (() => void) | null = null;
    let 还活着 = true;

    const 拉预览 = async () => {
      try {
        const 现在 = await api.plugin.review();
        if (还活着) setReview(现在);
      } catch (e) {
        if (还活着) toast(t("读取编辑区预览状态失败：{0}", String(e)), "error");
      }
    };

    void 拉预览();
    void on<Record<string, never>>(events.pluginReview, () => {
      void 拉预览();
    }).then((u) => {
      if (还活着) 退订 = u;
      else u();
    });

    return () => {
      还活着 = false;
      退订?.();
    };
  }, [toast]);

  const 收预览 = useCallback(async () => {
    if (!review) return;
    try {
      await api.plugin.reviewClose(review.plugin);
      // ⚠️ 本地说一声"收了"，**不指望事件**：宿主那边确实会发
      // `nota:plugin-review`，但"用户按了返回、界面还停在预览上"这一下
      // 多等一个来回都嫌长。事件到了再拉一次，两边收敛到同一个答案。
      setReview(null);
    } catch (e) {
      // ⚠️ 收不起来要说话：不说的话用户看到的是"按钮点了没反应"。
      toast(t("收起预览失败：{0}", String(e)), "error");
    }
  }, [review, toast]);

  const 调 = useCallback(
    async (plugin: string, command: string, args?: unknown) => {
      try {
        await api.plugin.call(plugin, command, args);
      } catch (e) {
        // 带上插件 id 与命令名：插件多了之后"哪一条没跑成"正是用户要看的。
        toast(t("插件 {0} 的「{1}」没跑成：{2}", plugin, command, String(e)), "error");
      }
    },
    [toast],
  );

  // ⚠️ `语` 在依赖里：`pluginMenus.ts` 那两处 `t(...)`（栏名「插件」、以及
  // "想挂到别的栏"那句后缀）是在**算这一份的时候**翻好的，语言换了不重算
  // 就还是旧语言。同一条理由见 `useMenus.ts` 推原生菜单那个 effect。
  const menus = useMemo(() => 带插件栏(MENUS, 菜单项们), [菜单项们, 语]);

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
    for (const it of 菜单项们) {
      if (it.menu !== 认识的菜单) continue;
      out[插件项id(it.plugin, it.command)] = () => {
        void (async () => {
          const 问 = await 问参数({ prompt: it.prompt, askPrompt });
          if (!问) return; // 用户取消
          await 调(it.plugin, it.command, 问.args);
        })();
      };
    }
    return out;
  }, [菜单项们, askPrompt, 调]);

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
  const 跑 = useCallback(
    async <T,>(标记: string, 干什么: () => Promise<T>, 成了?: string): Promise<T | null> => {
      set忙(标记);
      try {
        const 值 = await 干什么();
        await 重拉();
        if (成了) toast(成了, "info");
        return 值;
      } catch (e) {
        toast(String(e), "error");
        return null;
      } finally {
        set忙(null);
      }
    },
    [重拉, toast],
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
  const 信任它 = useCallback(
    async (id: string, 指纹?: string | null) => {
      // 兜底那一次查只是为了老调用点，正常情况下上面那条 `??` 用不上。
      const 真指纹 = 指纹 ?? plugins.find((x) => x.id === id)?.key_id ?? null;
      const 答 = await askConfirm({
        title: t("信任这个签名者？"),
        // ⚠️ 拆成一句一条，而不是把三句拼成一个 `t("…")`：换行是**分段**，不是
        // 句子的一部分——键里带上 `\n` 的话，英文表那边也得照着写转义。
        message:
          t("指纹：{0}", 真指纹 ?? t("（未知）")) +
          "\n\n" +
          t("信任之后，凡是这把钥匙签的包都会当成「已验证」。") +
          "\n" +
          t("信任是按**指纹**记的——请对着作者公布的那一份核对，别只看名字。"),
        confirmLabel: t("信任"),
      });
      if (答 !== "confirm") return;
      await 跑(id, () => api.plugin.trust(id), t("信任了 {0}", 真指纹 ?? id));
    },
    [plugins, askConfirm, 跑],
  );

  const 装它 = useCallback(async () => {
    // ⚠️ 文件框由前端弹（宿主不弹框）：那是界面的事，而且宿主弹框在无头测试里
    // 没法验。只认**包文件**——开发态的目录插件走仓库里的 `plugins/`，
    // 那条路本来就在（见 `plugin/mod.rs` 的"目录与去重"）。
    const 选 = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: t("插件包"), extensions: ["nota-plugin", "zip"] }],
    }).catch(() => null);
    if (typeof 选 !== "string") return; // 用户取消 / 平台没给路径

    const id = await 跑("装", () => api.plugin.install(选));
    if (id === null) return; // 装失败了，`跑` 已经 toast 过

    // 装完**直接问**（而不是只 toast 一句"去列表里点信任"）：用户刚选完文件，
    // 这一刻他知道这包是从哪儿来的，正是该做决定的时候。
    //
    // ⚠️ "未知签名者"**不是**拒装的理由（见 `plugin/mod.rs::装`）：装进来、
    // 标出来、再问一句要不要信任。用户说不信任，包也照旧躺在磁盘上能用。
    //
    // ⚠️ 这里**重新拉一次清单**而不是读 state 里的 `plugins`：那一个是上一次
    // 渲染的快照，刚装进来的那个插件还不在里面。
    const 清单 = await api.plugin.list().catch(() => []);
    const p = 清单.find((x) => x.id === id);
    if (!p) return;
    toast(t("装好了：{0}（{1}）", p.name, 签名说明(p.signature)), "info");
    if (p.signature === "unknown") await 信任它(p.id, p.key_id);
  }, [跑, 信任它, toast]);

  const 卸它 = useCallback(
    async (id: string) => {
      // ⚠️ 这一下**不可逆**（插件目录真的删掉），所以必须先问一句。
      // 文案里明说"设置文件留着"——用户最担心的正是"我的 API key 会不会没了"。
      const 答 = await askConfirm({
        title: t("卸载这个插件？"),
        // 拆法同上面「信任」那张框（换行是分段，不进键）。
        message:
          t("「{0}」的插件目录会被删掉，它带来的面板、菜单项、命令都会消失。", id) +
          "\n\n" +
          t("它自己的设置文件（比如 AI 插件的 API key）会留着，重装同一个 id 时还在。"),
        confirmLabel: t("卸载"),
        danger: true,
      });
      if (答 !== "confirm") return;
      await 跑(id, () => api.plugin.uninstall(id), t("卸载了 {0}", id));
    },
    [askConfirm, 跑],
  );

  const 启停它 = useCallback(
    async (id: string, enabled: boolean) => {
      const 名 = plugins.find((p) => p.id === id)?.name ?? id;
      // ⚠️ 停用是**真卸载**（见 `bridge/ipc.ts::setEnabled`）：要跑插件的
      // `on_unload` / `on_load`，所以会有一小会儿延迟，那颗按钮这时该是灰的。
      // ⚠️ 这一句原来是 `` `${enabled ? "启用" : "停用"}了 ${名}` ``：那个"…了"
      // 是接在**两个不同的词**后面的，拆开翻就会拼出"Enable 了 X"这种话。
      // 所以这里**整句当一个键**（两种形态两条）。
      await 跑(
        id,
        () => api.plugin.setEnabled(id, enabled),
        enabled ? t("启用了 {0}", 名) : t("停用了 {0}", 名),
      );
    },
    [plugins, 跑],
  );

  const 动作 = useMemo<插件动作>(
    () => ({
      忙,
      装: 装它,
      卸: 卸它,
      启停: 启停它,
      信任: 信任它,
    }),
    [忙, 装它, 卸它, 启停它, 信任它],
  );

  return { plugins, panels, 信任: 信任表, menus, handlers, 调, 动作, review, 收预览 };
}

/**
 * 签名结论的一句话。⚠️ 与后端 `installed::Signature::说明` **说的是同一套词**
 * （已验证 / 未知签名者 / 未签名）——两处不一致的话，同一个状态在 toast 里
 * 和在插件行上会是两种说法。
 *
 * ⚠️ 这里用的是**模块级的 `t`**：它是"渲染期间被调用的纯函数"那一类，调用点
 * 就在下面几个动作里（**不是**模块级常量里现算），那一下读到的就是当前语言。
 */
function 签名说明(s: PluginInfo["signature"]): string {
  switch (s) {
    case "verified":
      return t("已验证");
    case "unknown":
      return t("未知签名者");
    case "unsigned":
      return t("未签名");
    default:
      return t("来路没记过");
  }
}
