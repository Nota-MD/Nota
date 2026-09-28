/**
 * **「打开最近文件」那一层子菜单**（`docs/10` §2 那两格、§5「最近文件列表」）。
 *
 * # 为什么要在运行时合成，而不是写进 `commands.ts` 的 `MENUS`
 *
 * 那一张是**模块级常量**（理由在它自己的文件头：菜单栏不只是入口，还是一张
 * 进度表），而"最近打开过哪些文件"只有跑起来才知道——和「主题」那一栏同一个
 * 处境，所以走同一条路：**表里留一个占位项，渲染前换掉**。
 *
 * ⚠️ 占位项那条 `{ id: "file.recent", label: "打开最近文件" }` **一个字都不改**
 * 地留着，它同时是"没有最近文件时"的样子：那种情况下不注入子菜单，于是它
 * 照旧按老规矩灰着（判据是"命令表里没有这个 id"，见 `ui/useCommandTable.ts`）。
 * 一份空列表配一层要飞出去才看得见的空子菜单，比灰着更难懂。
 *
 * # ⚠️ 两个"必须和主题那套一样"的细节
 *
 * 1. **id 是合成的、不进 `MENUS`**：形如 `file.recent:/home/…/笔记.md`。
 *    所以 `App.tsx` 的 `menuChecks` 里不会有它们，勾要另算（这里没有勾）；
 *    而"能不能点"照旧由命令表说了算——那几个 id 在表里现生成。
 * 2. **自绘菜单与原生菜单走的是同一份**（`App.tsx` 把注入后的表同时喂给
 *    `TopBar` 和 `ui/useMenus.ts`）。只改一处的话，症状是"macOS 那条系统菜单里
 *    没有最近文件"——不报错，只是少一半。
 */

import { 清除最近项, type MenuEntry, type MenuItemSpec, type MenuSpec } from "@/ui/commands";
import { 最近条目名 } from "@/ui/useSession";

/** 合成 id 的前缀。⚠️ 与主题那套（`THEME_PREFIX`）同理，改动要连着 `resolvePick` 一起想。 */
const 前缀 = "file.recent:";

/** 这一条是不是某个最近文件（而不是普通命令）。 */
export function 是最近条目(id: string): boolean {
  return id.startsWith(前缀);
}

/**
 * 给一个路径合成菜单 id。
 *
 * ⚠️ **前缀只在这一个文件里拼**：菜单那一侧要用它比 id、命令表那一侧要用它
 * 建处理函数。两边各写一次 `"file.recent:" + 路径` 的话，某天改前缀漏了一边，
 * 症状是**条目亮着、点了什么都不发生**——而这个仓库里"点了没反应"式的失效
 * 已经记过好几条了（`docs/07`），判据都是"同一件事有没有两个真相源"。
 */
export function 最近条目id(路径: string): string {
  return `${前缀}${路径}`;
}

/**
 * 从合成 id 里取回路径。**原样切掉前缀**，不做任何解码——路径里可以有
 * 冒号、空格、中文，它们都是 id 的合法部分（`id` 只在两处比字符串，
 * 谁都没把它当"结构"用）。
 */
export function 最近路径(id: string): string {
  return id.slice(前缀.length);
}

/**
 * 把 `最近` 摊成菜单条目。
 *
 * ⚠️ **列表上限在宿主那边**（`session.rs::最近最多 = 20`），这里不再截一刀：
 * 两处各有一个上限时，改了一处而漏改另一处，界面上的条数会跟设置页说明的
 * 数字对不上——而那种不一致只能靠数数发现。
 */
export function 最近条目(最近: readonly string[]): MenuEntry[] {
  const 条目: MenuEntry[] = 最近.map((路径) => ({
    id: 最近条目id(路径),
    label: 最近条目名(路径),
  }));
  // ⚠️ 分隔线与「清除」**编进同一个数组**，不另外渲染：分开的话它们不参与
  // 键盘漫游焦点（`ui/useMenuRovingFocus.ts`），键盘用户按 End 到不了它。
  // 主题那一层踩过同一个坑，见 `commands.ts::themeEntries` 那段。
  //
  // ⚠️ 那一条的**全文写在 `commands.ts`**（`清除最近项`），不在这儿现写：
  // 中文标签留在本文件里的话 i18n 那道闸数不到它，中文表里那条译文会被判成
  // 废键。理由在那边那条常量的注释里。
  条目.push("sep", 清除最近项);
  return 条目;
}

/**
 * 把「文件」栏里那条占位项换成真子菜单。**其余菜单原样返回**（引用也原样，
 * 好让 `useMemo` 的依赖尽量少变）。
 */
export function 注入最近文件(
  menus: readonly MenuSpec[],
  最近: readonly string[],
): MenuSpec[] {
  if (最近.length === 0) return menus as MenuSpec[];
  return menus.map((栏) => {
    if (栏.id !== "file") return 栏;
    return {
      ...栏,
      items: 栏.items.map((项): MenuEntry => {
        if (项 === "sep" || 项.id !== "file.recent") return 项;
        return { ...项, submenu: 最近条目(最近) } satisfies MenuItemSpec;
      }),
    };
  });
}
