/**
 * 菜单栏（含插件那一栏）**＋ 运行时合成的「最近文件」那一层**。
 *
 * 2026-10-04 从 `App.tsx` 搬来——那次是**为了腾行数**（本文件当时 998 行，
 * 离 1000 硬上限只剩 2 行，而右键菜单那一批还要往里加）。搬的时候内容
 * 一个字节没改，只把 `全部菜单` 与 `最近` 换成了入参。同 `ui/useCommandTable.ts`
 * / `ui/useStatusBar.ts` / `ui/useStartup.ts` 那几次的判据一样：**它自己有一份
 * 完整的理由可写**，所以值得单独一个文件，不是因为长。
 *
 * # 为什么必须 `useMemo`
 *
 * 菜单表的**身份**是给原生菜单栏用的（`ui/useMenus.ts` 顶上那条链），每帧重建
 * 就等于每帧往系统菜单推一遍。`全部菜单` 是 `usePlugins` 里 `useMemo` 出来的、
 * `最近` 是个 state 数组，两个都稳。
 *
 * ⚠️ **两个消费方都改用这一份**（自绘菜单 `TopBar` 与 `useMenus`），漏掉一处
 * 的症状是"最近文件只出现在自绘菜单里"——macOS 那条系统菜单里没有，不报错，
 * 只是少一半。
 *
 * ⚠️ **2026-09-27 起在最后再叠一层用户改过的键位**（设置里的 `keys.overrides`）。
 * 位置选在这里是有意的：这一份是全应用**唯一**一份对外发出去的菜单表，叠在
 * 这一处，菜单显示、按键分发（`buildAccelIndex`）、macOS 那条原生菜单栏、
 * 设置里那张快捷键表**一起**跟着变——不用每个消费方各自记得去查一次覆盖表。
 * ⚠️ 没改过时 `应用键位覆盖` 原样返回入参（保住引用），所以依赖里多一个对象
 * 不会让菜单的身份抖动。
 *
 * ⚠️ 入参里的 `覆盖` 有两个 `?.`，**不是啰嗦**：`keys` 在类型上不是可选的，
 * 但**跑起来的后端可能是旧的**（前端资源与二进制不是永远同步装着）。少一个
 * `?.` 就是启动即白屏，代价太大。
 */

import { useMemo } from "react";

import { 应用键位覆盖, type MenuSpec } from "@/ui/commands";
import { 注入最近文件 } from "@/ui/recentMenu";

export interface 菜单表输入 {
  /** 内置菜单 ＋ 插件自报的菜单（`ui/usePlugins.ts`，已经是 `useMemo` 过的）。 */
  全部菜单: MenuSpec[];
  /**
   * 「最近文件」那一层要插进去的条目（`ui/useSession.ts` 的 state）。
   *
   * ⚠️ `readonly` **不是可选的**：`useSession` 那个 state 就是只读的，
   * 而 `注入最近文件` 也照只读收（`ui/recentMenu.ts`）。
   */
  最近: readonly string[];
  /** 用户改过的键位。后端太旧时整个 `keys` 都可能是 `undefined`。 */
  覆盖: Record<string, string> | undefined;
}

export function useMenuTable({ 全部菜单, 最近, 覆盖 }: 菜单表输入): readonly MenuSpec[] {
  return useMemo(
    () => 应用键位覆盖(注入最近文件(全部菜单, 最近), 覆盖 ?? {}),
    [全部菜单, 最近, 覆盖],
  );
}
