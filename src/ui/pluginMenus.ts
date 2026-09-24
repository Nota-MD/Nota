/**
 * 插件菜单 → 菜单栏里那一栏「插件」。
 *
 * # 为什么是**合成**一栏，不是往已有的几栏里插
 *
 * `register_menu` 收一个 `menu` 字段（`file` / `format` / `plugins`…），
 * 但**目前只有 `plugins` 是认的**。往「文件」里插两条第三方条目这件事，
 * 一旦做出来，用户就分不清哪些项是 Nota 自己的、哪些是插件塞进来的——
 * 出问题时连"该去找谁"都不知道。单独一栏把这件事摆明了。
 *
 * ⚠️ 写别的 `menu` 值的条目**不静默丢掉**：它们照样出现在这一栏里，
 * 标签后面写明"想去哪一栏（暂不支持）"，而且是**灰的**（判据是
 * "`App.tsx` 的 `menuHandlers` 里有没有它的 id"——没有就灰，见
 * `ui/commands.ts` 顶上那段）。静默丢掉的话，插件作者看到的是
 * "我注册的菜单项不见了"，而界面上没有任何线索。
 *
 * # id 是**合成**的，走 `resolvePick` 那条老路
 *
 * `__plugin:<插件 id>:<命令名>`。它看起来像个命令 id，**这也正是要点**：
 * 菜单项点下去之后走的是既有的那条链（`resolvePick` → `menuHandlers[id]`），
 * 没有为插件单开一条分支。少一条分支就少一处"插件项和普通项行为不一样"。
 *
 * ⚠️ 插件 id 里不会有 `:`（清单校验的允许集合是字母数字和 `.` `-` `_`），
 * 所以"第一个冒号"就是插件 id 的结尾。但**这里不需要拆回来**——
 * 处理函数是闭包，它自己知道是哪个插件。
 */

import type { PluginMenuItem } from "@/bridge/ipc";
import type { MenuEntry, MenuSpec } from "@/ui/commands";

/** 我们认得的那一栏。**只有它**——`menu` 写别的值无处安放（见文件头）。 */
export const 认识的菜单 = "plugins";

/** 能跑的插件项的 id 前缀。 */
export const 插件项前缀 = "__plugin:";

/** 无处安放的插件项的 id 前缀。**故意和上面不一样**，见下面的注释。 */
const 无处安放前缀 = "__plugin-unplaced:";

/** 一条插件菜单项在 `menuHandlers` 里的键。 */
export function 插件项id(plugin: string, command: string): string {
  return `${插件项前缀}${plugin}:${command}`;
}

/**
 * 合成菜单栏里那一栏。**一条插件菜单都没有时返回 `null`**——
 * 那时不该出现一栏空的「插件」。
 *
 * ⚠️ `menuHandlers` 里**没有**这些 id 的话，它们就是灰的（判据同上）。
 * 所以这个函数只负责"摆出来"，不负责"能不能点"——那是 `App.tsx` 那张表的事。
 */
export function 插件菜单栏(items: PluginMenuItem[]): MenuSpec | null {
  if (items.length === 0) return null;

  const 认得: MenuEntry[] = [];
  const 无处: MenuEntry[] = [];

  for (const it of items) {
    if (it.menu === 认识的菜单) {
      认得.push({
        id: 插件项id(it.plugin, it.command),
        label: it.label,
        ...(it.accelerator ? { accel: it.accelerator } : {}),
      });
    } else {
      无处.push({
        // ⚠️ id **必须**和认得的那些不一样：同一个插件的同一条命令，
        // 若同时以两种 `menu` 值声明（合法的——去重看的是标签），
        // 用同一个 id 就是 React 的重复 key，也是 `disabledCommands`
        // 那张集合里两条打架。加上这一截就永远不会撞。
        id: `${无处安放前缀}${it.plugin}:${it.menu}:${it.command}`,
        label: `${it.label}（想挂到「${it.menu}」栏，暂不支持）`,
      });
    }
  }

  return {
    id: "plugins",
    label: "插件",
    // 一条都没有就**不摆分隔线**——一栏里只有一条分隔线看着像坏了。
    items: 认得.length && 无处.length ? [...认得, "sep", ...无处] : [...认得, ...无处],
  };
}

/**
 * 把「插件」栏拼进菜单栏。
 *
 * 插在**「帮助」前面**：最后那一栏是"关于这个应用"，它按惯例待在末尾。
 * 找不到「帮助」（`commands.ts` 里改了 id）就接在最后——**不静默丢掉**，
 * 一栏菜单凭空消失比位置不对难查得多。
 *
 * ⚠️ 调用方**必须**把它包在 `useMemo` 里：返回值每次都是新数组，而它下游
 * 牵着三条 `useMemo`／`useEffect`（`ui/useMenus.ts` 顶上那张表），其中
 * 最后一条会**每渲染重推一次原生菜单**（一次 IPC ＋ 一次重建）。
 */
export function 带插件栏(menus: readonly MenuSpec[], items: PluginMenuItem[]): MenuSpec[] {
  const 栏 = 插件菜单栏(items);
  if (!栏) return [...menus];

  const out = [...menus];
  const 帮助 = out.findIndex((m) => m.id === "help");
  out.splice(帮助 < 0 ? out.length : 帮助, 0, 栏);
  return out;
}
