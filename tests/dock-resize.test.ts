/**
 * 右侧插件栏那条把手**能被测的那一半**（`ui/DockResizer.tsx::夹右栏宽`）。
 *
 * ⚠️ 拖动本身要开窗（指针捕获、量右缘、写 CSS 变量），无头测不了——但**夹边界**
 * 是纯函数，而它恰好是"拖坏了找不到回来"的唯一防线：拖成 0 宽等于把这一栏弄丢，
 * 而丢的方式是**看不见**。所以这一条必须钉住。
 */
import { describe, expect, it } from "vitest";

import { 夹右栏宽, 右栏宽最大, 右栏宽最小, 右栏宽默认 } from "@/ui/DockResizer";

describe("夹右栏宽", () => {
  it("区间内的原样通过，并且取整", () => {
    expect(夹右栏宽(300)).toBe(300);
    expect(夹右栏宽(300.4)).toBe(300);
    expect(夹右栏宽(300.6)).toBe(301);
  });

  it("比最小还小就夹到最小、比最大还大就夹到最大", () => {
    expect(夹右栏宽(1)).toBe(右栏宽最小);
    expect(夹右栏宽(-999)).toBe(右栏宽最小);
    expect(夹右栏宽(99999)).toBe(右栏宽最大);
  });

  it("不是数就退回出厂值（NaN 写进 CSS 变量会让那一格整条失效）", () => {
    for (const 怪 of [NaN, Infinity, -Infinity]) expect(夹右栏宽(怪)).toBe(右栏宽默认);
  });

  it("出厂值与另外两处必须同值（theme/base.css 与 Rust 的默认值）", () => {
    expect(右栏宽默认).toBe(260);
    // ⚠️ 区间是**有方向的**：反了的话下面两条会同时红。
    expect(右栏宽最小).toBeLessThan(右栏宽默认);
    expect(右栏宽默认).toBeLessThan(右栏宽最大);
  });
});
