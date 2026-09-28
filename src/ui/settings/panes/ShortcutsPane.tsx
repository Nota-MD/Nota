/**
 * 快捷键一览，**可以在这一页改**（2026-09-27，用户点名要的）。
 *
 * # 1. 条目和键位都是**读出来的**，不是抄的
 *
 * 条目来自 `menus`（`App.tsx` 那份，**已经叠过用户的键位覆盖**），
 * `walkMenuItems` 走**深度优先**，所以子菜单里的 `Ctrl+Shift+C` 这类一条都不会漏；
 * 键位用 `formatAccel` 过一遍——于是 macOS 上显示的是 `⌘⇧C` 而不是 `Ctrl+Shift+C`。
 *
 * ⚠️ **别改成 import 常量 `MENUS`**：那是**出厂**键位，用户改过之后它就不对了，
 * 而"这个键位现在是什么"正是这一页唯一要回答的问题。同理，这一页**不标**
 * 哪条实现了哪条没实现——那个判据在 `App.tsx` 的 `menuHandlers` 上。
 *
 * # 2. 改的是**差量**，不是整张键位表
 *
 * 存进设置的是 `keys.overrides`：**只放用户动过的那些**。整张表的真相源还是
 * `ui/commands.ts`（那份是代码，跟着版本走）。理由（加新命令怎么办、改默认键位
 * 怎么办）写在 `src-tauri/src/settings/keys.rs` 头上，值是空串是什么意思也在那儿。
 *
 * # 3. 冲突**拦在录制那一刻**，不做"先到先得"
 *
 * `buildAccelIndex` 遇上撞车是"先到先得 + 控制台警告"，那对**写死的**表是够用的
 *（那些撞车是开发期的问题）。但在这里不行：用户按下一组键，如果静默地归了别人，
 * 他会以为"改成功了"，然后按下去跑了另一个命令——**界面在骗他**。
 * 所以这里当场拒绝，并说清那个键位现在归谁、要怎么办。
 *
 * ⚠️ 代价是**两条命令不能交换键位**（想换得先清掉一条）。这是有意的取舍：
 * 换键位是罕见动作，而"改了没生效"是每次都会踩的坑。
 *
 * # 4. 列的是**全部可绑定的命令**，不只是已经有键位的
 *
 * 原来是"只列有快捷键的"（理由是不想拉长表）。2026-09-27 改掉了：那样**没法给
 * 一条本来没有键位的命令加上键位**，而这正是用户点开这一页最常见的动机之一。
 * 现在没有键位的显示「未设置」，一样按菜单分组，全局搜索框也照样能搜到。
 * 子菜单父项（「导出」本身那种）和合成的条目（主题、最近文件）仍然排除——
 * 它们要么不执行任何命令，要么压根不是命令。
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Settings } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { accelSig, accelToText, eventAccel, formatAccel, parseAccel } from "@/ui/accel";
import { walkMenuItems, type MenuItemSpec, type MenuSpec } from "@/ui/commands";
import { 是最近条目 } from "@/ui/recentMenu";
import { ActionButton, Note, SettingRow, SettingsGroup } from "../primitives";

interface Props {
  /** 全应用那一份菜单表，**已经叠过用户的覆盖**（`App.tsx` 的 `菜单`）。 */
  menus: readonly MenuSpec[];
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}

interface Shortcut {
  id: string;
  label: string;
  /** **生效**的键位（默认的或用户改的）。`undefined` = 这条命令现在没有快捷键。 */
  accel?: string;
}

/** 这条菜单项**能不能绑快捷键**。判据写在文件头第 4 条。 */
function 可绑定(item: MenuItemSpec): boolean {
  if (item.submenu) return false; // 自己不执行命令，只是个入口
  if (item.id.startsWith("__")) return false; // 主题那套（`ui/commands.ts` 的三个常量）
  return !是最近条目(item.id); // 最近文件那套（`ui/recentMenu.ts` 拼出来的 id）
}

/**
 * 按键位归组：`[{ menu, items }]`，菜单顺序照 `menus`，组内照菜单里的先后。
 *
 * 空组（这一栏一条可绑定的命令都没有）**丢掉**：留一个空标题在表里，
 * 看着像「这一栏的内容没显示出来」，而它本来就没有。
 *
 * ⚠️ 这里存下来的 `label` 是**键**（英文原文），不是译文——翻译在下面渲染处做
 *（`t(menu.label)` / `t(s.label)`）。模块级常量里调 `t` 是禁止的，理由写在
 * `ui/MenuBar.tsx::useT` 那一段。
 */
function 按菜单组(menus: readonly MenuSpec[]): Array<{ menu: MenuSpec; items: Shortcut[] }> {
  const groups: Array<{ menu: MenuSpec; items: Shortcut[] }> = [];

  for (const menu of menus) {
    const items: Shortcut[] = [];
    walkMenuItems([menu], (item: MenuItemSpec) => {
      if (!可绑定(item)) return;
      items.push({ id: item.id, label: item.label, accel: item.accel });
    });
    if (items.length) groups.push({ menu, items });
  }

  return groups;
}

export function ShortcutsPane({ menus, settings, onChange }: Props) {
  // 订阅语言（宿主报来语言之后这一块要重画，见 `i18n/index.ts::useT`）。
  // 局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();

  /** 当前这份覆盖表。⚠️ 那个 `??` 兜的是"跑在旧后端上"（见 `App.tsx` 同处）。 */
  const 覆盖 = settings?.keys?.overrides ?? {};

  /** 正在录制的那一条的 id。`null` = 没在录。 */
  const [录制中, set录制中] = useState<string | null>(null);
  /** 录制时撞了车的提示，挂在那一行下面。 */
  const [撞车, set撞车] = useState<{ id: string; 文案: string } | null>(null);

  // ⚠️ 依赖 `menus`：它每改一次键位就换一份新的（`App.tsx` 那个 useMemo），
  // 这一页要跟着重算——不然改完一条，表上还是旧键位。
  const 组 = useMemo(() => 按菜单组(menus), [menus]);

  /**
   * 键位签名 → 那条命令。**判撞车用**。
   *
   * ⚠️ 用的是**生效**键位（`menus` 里那份已经叠过覆盖），不是出厂那份：
   * 用户把 A 改成了 `Ctrl+K`、而 B 本来就写着 `Ctrl+K`，这两个就是撞的。
   */
  const 键位归属 = useMemo(() => {
    const m = new Map<string, Shortcut>();
    for (const g of 组) {
      for (const s of g.items) {
        const a = s.accel ? parseAccel(s.accel) : null;
        if (a) m.set(accelSig(a), s);
      }
    }
    return m;
  }, [组]);

  /** 写回设置。只动 `keys` 这一节，别的字段一个不碰。 */
  const 写 = useCallback(
    (补: Record<string, string>) => {
      onChange({ keys: { overrides: { ...覆盖, ...补 } } });
    },
    [onChange, 覆盖],
  );

  /**
   * 录制期的按键处理。**挂在 window 的捕获阶段**，不是某一行的 `onKeyDown`：
   * 那一行不一定有焦点（用户刚点的是「改」按钮，焦点在那颗按钮上，而按钮对
   * 方向键、Tab 有自己的默认行为）。
   *
   * ⚠️ 三件事都得做到，少一件就是个难查的毛病：
   * - `preventDefault`：不然 `Ctrl+S` 会顺手触发宿主那一层的保存；
   * - `stopPropagation`：不然设置对话框自己那个 Esc 监听会**先把框关了**，
   *   而用户按 Esc 的意思是"这条不改了"；
   * - 只认 `keydown`：`keyup` 在按住不放时会连发，`Ctrl` 还没松开就录进去了。
   */
  useEffect(() => {
    if (!录制中) return;
    const id = 录制中;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        set录制中(null);
        set撞车(null);
        return;
      }

      const a = eventAccel(e);
      const 文本 = accelToText(a);
      // ⚠️ `null` = "这一下不算一个键位"（光按修饰键、或者不该绑的单字符）。
      // **不能**当成"用户想清空键位"——那个动作有单独的按钮，
      // 而空串在设置里的含义是"这条命令不要快捷键"，两者差得很远。
      if (!文本) return;

      const 撞 = 键位归属.get(accelSig(a));
      if (撞 && 撞.id !== id) {
        set撞车({
          id,
          文案: t("That binding belongs to “{0}”. Clear it there first if you want this command to have it.", t(撞.label)),
        });
        return;
      }

      set录制中(null);
      set撞车(null);
      写({ [id]: 文本 });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [录制中, 键位归属, 写, t]);

  /** 这一条被用户动过没有（在覆盖表里就是动过，哪怕改成了空串）。 */
  const 改过 = (id: string) => id in 覆盖;

  return (
    <>
      {组.map(({ menu, items }) => (
        <SettingsGroup key={menu.id} title={t(menu.label)}>
          {items.map((s) => (
            <SettingRow
              key={s.id}
              label={t(s.label)}
              // ⚠️ 键位走 `searchText` 而**不是** `description`：它已经画在右边
              // 那一栏了，再挂一遍说明就是重复；可它又确实是用户会搜的词（搜
              // 「ctrl+shift」该出所有带 Shift 的）。所以它**只参与过滤、不画出来**。
              // 菜单名那部分不用管——`SettingsGroup` 会把组标题加进每一行的搜索面。
              // ⚠️ 搜的是**原始 accel**（`Ctrl+S`）而不是显示出来的那串：
              // macOS 上显示成 `⌘S`，用户照着屏幕上抄下来的字反而搜不到。
              searchText={[s.accel, 改过(s.id) ? t("changed") : ""].filter(Boolean).join(" ")}
              description={
                撞车?.id === s.id ? <span className="stg-keys-clash">{撞车.文案}</span> : undefined
              }
            >
              <span className="stg-keys-cell">
                {录制中 === s.id ? (
                  // ⚠️ 录制态**画成一个 `<kbd>` 的样子**（不是提示条）：它就长在
                  // 原来那个键位的格子里，用户的眼睛不用换地方。
                  <kbd className="stg-kbd stg-kbd-rec">{t("Press the new keys…")}</kbd>
                ) : s.accel ? (
                  <kbd className="stg-kbd">{formatAccel(s.accel)}</kbd>
                ) : (
                  <span className="stg-keys-none">{t("Not set")}</span>
                )}
                <ActionButton
                  onClick={() => {
                    set撞车(null);
                    set录制中(录制中 === s.id ? null : s.id);
                  }}
                  title={t("Press the keys you want to use; press Esc to cancel")}
                >
                  {录制中 === s.id ? t("Cancel") : t("Change")}
                </ActionButton>
                {/* 「清除」只在**现在有键位**时出现：把这条设为"不要快捷键"。
                    ⚠️ 它和下面那颗「恢复默认」**不是一回事**，两句话都得看得见：
                    这一颗是"这条不要键位"，那一颗是"回到出厂那个键位"。 */}
                {s.accel && (
                  <ActionButton onClick={() => 写({ [s.id]: "" })} title={t("No shortcut for this command")}>
                    {t("Clear")}
                  </ActionButton>
                )}
                {/* 「恢复默认」只在**用户动过它**时出现——没动过时它按下去什么都不会变，
                    留一颗按了没反应的按钮，比没有这颗按钮更糟（`general.rs` 头上那句）。 */}
                {改过(s.id) && (
                  <ActionButton
                    onClick={() => {
                      const 新 = { ...覆盖 };
                      delete 新[s.id];
                      onChange({ keys: { overrides: 新 } });
                    }}
                    title={t("Reset this one to its factory binding (or to none, if it never had one)")}
                  >
                    {t("Reset")}
                  </ActionButton>
                )}
              </span>
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
        {t("This table is")}
        <strong>{t(" read from the menu")}</strong>
        {t(", so it always matches what the menu says. Bindings you change are stored in the settings file; the ones you don't change follow the ")}
        <code>src/ui/commands.ts</code>
        {t(" file — so if a default binding changes there later, the rows you never touched will follow it.")}
      </Note>

      {/* 「全部恢复默认」放在最后、而且**只在有改动时出现**：没有改动时它是个
          没有意义的按钮，而这一页的 Note 已经很长了，不该再压一颗永远灰着的。 */}
      {Object.keys(覆盖).length > 0 && (
        <div className="stg-keys-reset-all">
          <ActionButton onClick={() => onChange({ keys: { overrides: {} } })}>
            {t("Reset all")}
          </ActionButton>
          <span className="stg-keys-hint">
            {t("{0} changed. After resetting, every binding follows the factory defaults in commands.ts.", Object.keys(覆盖).length)}
          </span>
        </div>
      )}
    </>
  );
}
