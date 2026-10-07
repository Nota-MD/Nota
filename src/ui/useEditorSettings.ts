/**
 * 把设置里的 `settings.markdown` **拼成编辑器要的那两个形状**（2026-10-07 从
 * `ui/EditorPane.tsx` 搬出来的，`docs/07` 第 89 项）。
 *
 * 一句话职责：`EditorPane` 的 `Props.markdown` 收的是**整份**设置对象，而
 * `createEditor` 要的是"三个布尔"与"标点六项"这两个小对象——这一层把前者
 * 翻译成后者，并且**把记忆化也留在这里**。
 *
 * # ⚠️ 依赖为什么给逐项、不给整个对象
 *
 * 设置对象每次从后端回来都是**新的**（改任何一项都换一个），拿 `markdown`
 * 当依赖会让"改了字号"也顺手把编辑器重建一遍。所以：
 *
 * - `行内扩展` 依赖**三个布尔值**；
 * - `标点` 依赖**六个字段**；
 * - 两个对象身份不变 ⇒ `EditorPane` 那个建实例的 effect 不重跑。
 *
 * ⚠️ **六项里任何一项变了都要重建**（不是只重建"挂不挂规则"那三项）。
 * 曾经想过让字形与破折号风格热更新（它们在处理器被调到那一刻才被读，看着像个
 * 能省的），**放弃了**：那就得让规则读一个可变的盒子、再加一个 `set标点`，
 * 而"省下一次重建"换来的是一类**静默失效**——改了字形、活着的实例闭包里还是
 * 旧的，症状正是本仓最忌的"设置像没生效"。代价如实记：写到一半拨标点开关会丢
 * 撤销栈，与 `physics` / `inlineMarks` 完全一样（那两条也是这么办的）。
 *
 * # ⚠️ `undefined` 一律落到默认值，而不是"关"
 *
 * 设置还没从后端回来时 `markdown` 是 `undefined`。三个行内扩展落到
 * `默认行内扩展开关`、标点落到 `默认标点设置`、自动更正落到 **`true`**
 * （Rust 那边的默认就是开，见 `create-types.ts` 的 `自动更正` 那一格）——
 * 拼错方向的症状是"打开软件头几秒里 `==高亮==` 不生效"，很难查。
 */

import { useMemo } from "react";

import type { MarkdownSettings } from "@/bridge/ipc";
import { 默认行内扩展开关 } from "@/editor/inline-marks";
import { 默认标点设置, type 标点设置 } from "@/editor/smart-punctuation";

/** 编辑器那两个开关对象，外加上面那一格布尔。 */
export interface 编辑器开关 {
  行内扩展: { highlight: boolean; superscript: boolean; subscript: boolean };
  标点: 标点设置;
  自动更正: boolean;
}

/**
 * ⚠️ 这三个值就是 `EditorPane` **建实例时**读的那一份：拨设置要重建编辑器，
 * 所以它不该也不能热更新（理由见文件头）。
 */
export function use编辑器开关(markdown: MarkdownSettings | undefined): 编辑器开关 {
  // ── 三种行内扩展的开关（`Props.markdown` 那一条讲了为什么要这么包）──
  // ⚠️ 依赖给的是**三个布尔值**，不是 `markdown` 这个对象：设置对象每次从后端
  // 回来都是新的（改任何一项都换一个），拿它当依赖会让"改了字号"也顺手把
  // 编辑器重建一遍。三个布尔值没变，下面那个对象身份就不变，effect 不重跑。
  const 行内扩展 = useMemo(
    () => ({
      highlight: markdown?.highlight ?? 默认行内扩展开关.highlight,
      superscript: markdown?.superscript ?? 默认行内扩展开关.superscript,
      subscript: markdown?.subscript ?? 默认行内扩展开关.subscript,
    }),
    [markdown?.highlight, markdown?.superscript, markdown?.subscript],
  );

  // ── 智能标点那一组（同上：拼成对象、依赖给逐项）──
  // ⚠️ 依赖给的是**六个字段**，不是 `markdown` 对象——理由同上：改任何一项
  // 设置都会换一个新的 `markdown`，拿它当依赖等于"改了字号也重建编辑器"。
  const 标点 = useMemo<标点设置>(
    () => ({
      模式: markdown?.smart_punctuation ?? 默认标点设置.模式,
      引号: markdown?.smart_quotes ?? 默认标点设置.引号,
      双引号: markdown?.smart_quotes_double ?? 默认标点设置.双引号,
      单引号: markdown?.smart_quotes_single ?? 默认标点设置.单引号,
      破折号: markdown?.smart_dashes ?? 默认标点设置.破折号,
      风格: markdown?.dash_style ?? 默认标点设置.风格,
      省略号: 默认标点设置.省略号,
    }),
    [
      markdown?.smart_punctuation,
      markdown?.smart_quotes,
      markdown?.smart_quotes_double,
      markdown?.smart_quotes_single,
      markdown?.smart_dashes,
      markdown?.dash_style,
    ],
  );

  // 自动更正那一格。⚠️ `undefined` **不等于关**：Rust 那边的默认是 `true`，
  // 设置还没从后端回来时按默认走（`create-types.ts` 的 `自动更正` 那一格）。
  const 自动更正 = markdown?.auto_correct ?? true;

  return { 行内扩展, 标点, 自动更正 };
}
