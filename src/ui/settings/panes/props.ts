/**
 * 设置那几页里**吃设置项的那些页**共用的入参，外加一个"改本页某一项"的小工具。
 *
 * # 为什么单独一个文件
 *
 * 十个吃设置表的页都要 `settings` / `onChange`，而 `SettingsDialog.tsx` 又要 import
 * 它们十个——入参类型放在任何一个 pane 里都会连成环（dialog → pane → dialog）。
 * 放这儿，两边都只依赖它。
 *
 * ⚠️ **快捷键、插件设置、拓展管理和高级页不吃同一套域入参**：快捷键从菜单表里算，
 * 两个插件页吃插件清单与动作，高级页则通过 `download` 这一张设置表落盘。整包铺过去的话，
 * 那两页会莫名其妙拿到 `docThemes` / `uiStyles` 那些东西，下次有人在那里用上
 * 其中一个，就再也说不清"它到底该依赖什么"了（两处 `SettingsDialog.tsx` 的
 * `case` 上都写着同一句）。
 *
 * # ⚠️ 分页的十个键在这里列死了，改 Rust 侧的表结构要同时改这儿
 *
 * `PageKey` 是**手写**的十个字面量，不是 `keyof Settings`。理由：`keyof
 * Settings` 会把 `ui_style` / `strict_markdown` 那些**顶层老字段**也放进来，
 * 而 `paneWriter` 对它们是不成立的（那些不是对象，展开一个字符串/布尔得到的
 * 是个空对象）。列死之后，写错了是**编译期**的事。
 *
 * 判据：与 `src-tauri/src/settings/mod.rs` 顶上那张"哪一页对应哪个文件"的表
 * 逐条对照。
 */

import type { DocThemeInfo, Settings, UiStyleInfo } from "@/bridge/ipc";
import type { MenuSpec } from "@/ui/commands";

export interface PaneProps {
  settings: Settings;
  /** 改一项。**即时生效**（先改内存再写盘），没有「确定」按钮。 */
  onChange: (patch: Partial<Settings>) => void;
  /** 只读：用来在「文档主题」那一页显示当前是哪套、以及深色主题的可选项。 */
  docThemes: DocThemeInfo[];
  /**
   * 只读：界面风格的清单（内置的 ＋ 用户导入的）。⚠️ **「外观」那一页拿它拼下拉**——
   * 用户导入的那几档**只有后端知道**，前端列不出来（`ui/useUiStyles.ts`）。
   * 空数组 = 还没拉到，那时下拉退回内置那几档。
   */
  uiStyles: UiStyleInfo[];
  /** 打开用户主题目录（`~/.config/nota/themes`）。 */
  onOpenThemesDir: () => void;
  /** 打开用户**界面风格**目录（`~/.config/nota/themes/ui`）。⚠️ 与上面那个是两个目录。 */
  onOpenStylesDir: () => void;
  /** 用户放入新的界面风格文件后立即重扫。 */
  onRefreshUiStyles: () => void;
  /** 打开设置文件所在的目录（`~/.config/nota`）。 */
  onOpenConfigDir: () => void;
  /** 恢复出厂默认。**整份替换**，落盘在后端做，新的那一份从返回值拿。 */
  onResetSettings: () => void;
  /**
   * 清空「最近打开」那份记录（文件页那颗「清除记录」，2026-09-27 接上）。
   *
   * ⚠️ 它**不是设置项**，所以不走 `onChange`：那个回调改的是 `settings` 里的
   * 字段、落盘走的也是设置那一份；而这一颗清的是**会话侧车**
   *（`~/.local/share/nota/session.toml`），与设置文件是两个地方。
   */
  onClearRecent: () => void;
  /**
   * 全应用那一份菜单表（`App.tsx` 里那个 `菜单`），**已经叠过用户的键位覆盖**
   * （`ui/commands.ts::应用键位覆盖`）。2026-09-27 加，给「快捷键」那一页用。
   *
   * ⚠️ **必须用这一份，不能在那一页里 import 常量 `MENUS`**：常量那份是**出厂
   * 键位**，用户改过之后它就不对了——表上写着 `Ctrl+S`、按下去却是别的命令，
   * 而那正是「快捷键」这一页唯一要回答的问题。
   *
   * ⚠️ 也因此，「快捷键」那一页**不改键位时也要跟着菜单表重画**：改完一条，
   * `App.tsx` 会算出新的一份 `menus`，这一页得拿到新的那份才显示得对。
   */
  menus: readonly MenuSpec[];
}

/**
 * 分页的表。见文件头。
 *
 * ⚠️ 2026-09-26 加了 `focus`（强制专注）、2026-10-18 加了 `download`，所以是**十个**（它上面那两处
 * 原先写着"七个"、同一天已跟着改成"八个"，2026-09-27 加 `document` 时一并
 * 改成"九个"）。⚠️ 那两处和这一条是**同一句话的三个副本**——加一页忘了改
 * 其中一处，"七个"就会以一个很确定的口气留着。
 * 上面那句是**给人判"我改对了没有"用的**，说错了比没有更坏。
 *
 * ⚠️ **2026-09-27 加了「拓展」管理页，但这里不跟着加**：这一张表列的是
 * **域键**（`settings.toml` 里那一节的名字），而管理页与插件设置页都不写
 * （装/导出/卸载走的是 `usePlugins` 的动作，落盘在 `plugins.toml` 与插件目录，
 * 不在设置文件里）——同「快捷键」那条。加一页时**先问它写不写设置**：
 * 不写就不该往这里加键，加了 `paneWriter` 会去展开一个不存在的节。
 */
export type PageKey =
  | "files"
  | "editor"
  | "image"
  | "markdown"
  | "export"
  | "appearance"
  | "general"
  | "download"
  | "updates"
  | "focus"
  // ⚠️ 表名与页名差一点：那一页叫「文档主题」，而 `document_theme` 这个顶层
  // 老字段已经占着"用哪一套主题"的意思了。理由见 `settings/document.rs`。
  | "document";

/**
 * 改**本页**里的一项：`写({ highlight: false })` 就是"把 `[markdown]` 的
 * `highlight` 改成 false，别的字段一个不动"。
 *
 * # 为什么要有它
 *
 * 分页之后，改一项变成 `onChange({ markdown: { ...settings.markdown, highlight: false } })`
 * ——一页里写三十遍这个，眼睛就只看见重复。而**只传 `{ highlight: false }` 是
 * 错的**：Rust 那边是整份替换（`nota_settings_set` 收的是完整的 `Settings`），
 * 缺的字段会被 serde 当成"没给"落回**默认值**，于是"改了下标，高亮跟着关了"。
 *
 * # ⚠️ 同一个事件里别连着调两次
 *
 * 它展开的是**这次 render 的** `settings`。同一个 tick 里调两次，第二次展开的
 * 还是旧值，会把第一次的改动吞掉。要改两项就一次给全：`写({ a: 1, b: 2 })`。
 */
export function paneWriter<K extends PageKey>(
  settings: Settings,
  onChange: (patch: Partial<Settings>) => void,
  page: K,
): (partial: Partial<Settings[K]>) => void {
  return (partial) =>
    // ⚠️ 这个 `as` 是必要的：计算属性名（`{ [page]: … }`）在 TS 里推不出
    // "键是 `page` 那个字面量"，只能推成 `{ [x: string]: … }`。
    // 上面 `PageKey` 列死那十个键，就是为了让这个 `as` 之外的部分仍然有类型。
    onChange({ [page]: { ...settings[page], ...partial } } as Partial<Settings>);
}
