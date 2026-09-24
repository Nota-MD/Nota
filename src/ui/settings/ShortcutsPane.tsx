/**
 * 快捷键一览。**只读**——改键位要改 `ui/commands.ts`。
 *
 * # 为什么要造这一节
 *
 * 在这之前，「我有哪些快捷键」这个问题的唯一答案是**逐个打开菜单看**。
 * 菜单栏能回答，但它要一层层翻（导出、表格那两处还各有一层子菜单），
 * 而且关了就没法对照着按。
 *
 * # ⚠️ 这张表是**读出来的**，不是抄出来的
 *
 * 条目来自 `MENUS`（`walkMenuItems` 走**深度优先**，所以子菜单里的
 * `Ctrl+Shift+C` 这类一条都不会漏），键位用 `formatAccel` 过一遍——
 * 于是 macOS 上显示的是 `⌘⇧C` 而不是 `Ctrl+Shift+C`。
 *
 * 抄一份静态表在短期里更省事，但那是**第二份真相源**：`commands.ts` 里改了
 * 键位，这里不跟着变，而"菜单上写着 A、这里写着 B"不会报错。同理，
 * 这张表也**不标**哪条实现了哪条没实现——那个判据在 `App.tsx` 的
 * `menuHandlers` 上，这里只回答"键位是什么"。
 *
 * ⚠️ 只列**有快捷键**的条目。没有键位的（「关于 Nota」「打开文件夹…」）列
 * 进来只是把表拉长，它们本来就在菜单里一眼可见。
 */

import { formatAccel } from "@/ui/accel";
import { MENUS, walkMenuItems, type MenuItemSpec, type MenuSpec } from "@/ui/commands";
import { SettingRow, SettingsGroup } from "./primitives";

interface Shortcut {
  id: string;
  label: string;
  accel: string;
}

/**
 * 按键位归组：`[{ menu, items }]`，菜单顺序照 `MENUS`，组内照菜单里的先后。
 *
 * 空组（这一栏一条快捷键都没有，比如「主题」——它是动态生成的）**丢掉**：
 * 留一个空标题在表里，看着像"这一栏的快捷键没显示出来"，
 * 而真相是它本来就没有。
 */
function groupByMenu(): Array<{ menu: MenuSpec; items: Shortcut[] }> {
  const groups: Array<{ menu: MenuSpec; items: Shortcut[] }> = [];

  for (const menu of MENUS) {
    const items: Shortcut[] = [];
    walkMenuItems([menu], (item: MenuItemSpec) => {
      if (item.accel) items.push({ id: item.id, label: item.label, accel: item.accel });
    });
    if (items.length) groups.push({ menu, items });
  }

  return groups;
}

/** 分组**在模块级算一次**：`MENUS` 是静态表，没理由每次 render 走一遍。 */
const GROUPS = groupByMenu();

export function ShortcutsPane() {
  return (
    <>
      {GROUPS.map(({ menu, items }) => (
        <SettingsGroup key={menu.id} title={menu.label}>
          {/* ⚠️ 菜单名与键位走 `searchText` 而**不是** `description`：
              组标题已经写着「文件」了，每行再挂一遍就是九行一模一样的噪音；
              可它们又确实是用户会搜的词——搜「文件」该出这一组，
              搜「ctrl+shift」该出所有带 Shift 的。所以让它们**只参与过滤、不画出来**。
              ⚠️ 搜的是**原始 accel**（`Ctrl+S`）而不是显示出来的那串：
              macOS 上显示成 `⌘S`，用户照着屏幕上抄下来的字反而搜不到。 */}
          {items.map((s) => (
            <SettingRow key={s.id} label={s.label} searchText={`${menu.label} ${s.accel}`}>
              {/* ⚠️ `<kbd>` 不是可标注控件，所以这一行的标签是 `<span>` +
                  `aria-labelledby`（判据在 `primitives.tsx` 里）。 */}
              <kbd className="stg-kbd">{formatAccel(s.accel)}</kbd>
            </SettingRow>
          ))}
        </SettingsGroup>
      ))}
    </>
  );
}
