/**
 * 快捷键一览。**只读**——改键位要改 `ui/commands.ts`。
 *
 * # 为什么要造这一页
 *
 * 在这之前，这个问题的唯一答案是**逐个打开菜单查看**。
 * 菜单栏能回答，但它要一层层翻（导出、表格那两处还各有一层子菜单），
 * 而且关掉菜单之后就没法对照着按。
 *
 * ⚠️ 快捷键一览是**独立的一页**，不放在「通用」页里。
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
 * 进来只是把表拉长，它们在菜单里本来就直接可见。
 */

import { useT } from "@/i18n";
import { formatAccel } from "@/ui/accel";
import { MENUS, walkMenuItems, type MenuItemSpec, type MenuSpec } from "@/ui/commands";
import { Note, SettingRow, SettingsGroup } from "../primitives";

interface Shortcut {
  id: string;
  label: string;
  accel: string;
}

/**
 * 按键位归组：`[{ menu, items }]`，菜单顺序照 `MENUS`，组内照菜单里的先后。
 *
 * 空组（这一栏一条快捷键都没有，比如「主题」——它是动态生成的）**丢掉**：
 * 留一个空标题在表里，看着像「这一栏的快捷键没显示出来」，
 * 而它本来就没有。
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

/**
 * 分组**在模块级算一次**：`MENUS` 是静态表，没理由每次 render 走一遍。
 *
 * ⚠️ 这里存下来的 `label` 是**键**（中文原文），不是译文——翻译在下面渲染处
 * 做（`t(menu.label)` / `t(s.label)`）。模块级常量里调 `t` 是禁止的，理由写在
 * `ui/MenuBar.tsx::useT` 那一段。所以模块级算一次**不影响切语言**。
 */
const GROUPS = groupByMenu();

export function ShortcutsPane() {
  const t = useT();

  return (
    <>
      {GROUPS.map(({ menu, items }) => (
        <SettingsGroup key={menu.id} title={t(menu.label)}>
          {/* ⚠️ 键位走 `searchText` 而**不是** `description`：它已经画在右边那一栏了，
              再挂一遍说明就是重复；可它又确实是用户会搜的词（搜「ctrl+shift」该出
              所有带 Shift 的）。所以让它**只参与过滤、不画出来**。
              菜单名那部分不用管——`SettingsGroup` 会把组标题加进每一行的搜索面，
              搜「文件」自然会出这一组（`primitives.tsx` 里那段）。
              ⚠️ 搜的是**原始 accel**（`Ctrl+S`）而不是显示出来的那串：
              macOS 上显示成 `⌘S`，用户照着屏幕上抄下来的字反而搜不到。 */}
          {items.map((s) => (
            <SettingRow key={s.id} label={t(s.label)} searchText={s.accel}>
              {/* ⚠️ `<kbd>` 不是可标注控件，所以这一行的标签是 `<span>` +
                  `aria-labelledby`（判据在 `primitives.tsx` 里）。 */}
              <kbd className="stg-kbd">{formatAccel(s.accel)}</kbd>
            </SettingRow>
          ))}
        </SettingsGroup>
      ))}

      {/* ⚠️ 这一段**夹了 `<strong>` 与 `<code>`**，所以只能按标签边界切成几段
          分别翻——`t()` 返回的是字符串，塞不进元素。切的时候每一段自己得是
          一句**说得通的话**（哪怕很短），不然英文那边拼不出句子。
          ⚠️ 别把切出来的碎片合并成一个键：那会把 `<strong>` / `<code>` 一起
          降级成纯文本，而这一段的重点恰恰是那个文件路径。 */}
      <Note>
        {t("这张表是")}
        <strong>{t("从菜单里读出来的")}</strong>
        {t("，所以它一定和菜单上写的一致。键位暂时不能在界面上修改——要改就动 ")}
        <code>src/ui/commands.ts</code>
        {t(" 这个文件。")}
      </Note>
    </>
  );
}
