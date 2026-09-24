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

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  api,
  type PluginInfo,
  type PluginMenuItem,
  type PluginPanel,
} from "@/bridge/ipc";
import { MENUS, type MenuSpec } from "@/ui/commands";
import { 认识的菜单, 带插件栏, 插件项id } from "@/ui/pluginMenus";
import { 问参数 } from "@/ui/plugin-prompt";
import type { Toast } from "@/ui/Toasts";
import type { PromptRequest } from "@/ui/useDialogs";

export interface PluginsWiring {
  toast: (message: string, level?: Toast["level"]) => void;
  askPrompt: (req: PromptRequest) => Promise<{ value: string; second: string } | null>;
}

export interface PluginsState {
  /** 已装插件清单。`Home` 与 `PluginDock` 那道诊断清单用它。 */
  plugins: PluginInfo[];
  /** 插件声明的面板（清单，不是内容）。 */
  panels: PluginPanel[];
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
}

export function usePlugins({ toast, askPrompt }: PluginsWiring): PluginsState {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [panels, setPanels] = useState<PluginPanel[]>([]);
  const [菜单项们, set菜单项们] = useState<PluginMenuItem[]>([]);

  // 启动拉一次。三样一起拉——它们回答的是同一个问题（"现在装了什么"），
  // 分开三次只会让"读了插件清单但菜单还没到"这种中间态多出几种。
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [ps, pn, mn] = await Promise.all([
          api.plugin.list(),
          api.plugin.panels(),
          api.plugin.menus(),
        ]);
        if (!alive) return;
        setPlugins(ps);
        setPanels(pn);
        set菜单项们(mn);
      } catch (e) {
        // 插件读不出来**不该拦住别的**（设置、工作区、主题照常），
        // 但也不能不响：界面上少了一整栏，用户得知道是为什么。
        toast(`读取插件状态失败：${e}`, "error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [toast]);

  const 调 = useCallback(
    async (plugin: string, command: string, args?: unknown) => {
      try {
        await api.plugin.call(plugin, command, args);
      } catch (e) {
        // 带上插件 id 与命令名：插件多了之后"哪一条没跑成"正是用户要看的。
        toast(`插件 ${plugin} 的「${command}」没跑成：${e}`, "error");
      }
    },
    [toast],
  );

  const menus = useMemo(() => 带插件栏(MENUS, 菜单项们), [菜单项们]);

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

  return { plugins, panels, menus, handlers, 调 };
}
