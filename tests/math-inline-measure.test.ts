/**
 * Inline-formula source sizing and delayed layout remeasurement.
 *
 * These cases intentionally do not mount a NodeView. The bug being guarded
 * against is local to a span/form-control pair: a proportional document theme
 * makes a character count wider than the rendered LaTeX, and a form-control
 * `min-width` can override an otherwise-correct empty width.
 */

import { readFileSync } from "node:fs";
import {
  fitInlineSourceWidth,
  redrawAfterMount,
  watchFontMetrics,
} from "../src/editor/math-inline-measure";
import { fakeElement } from "./fake-dom";

let pass = 0;
let fail = 0;

function testCase(name: string, body3: () => void | Promise<void>): void {
  try {
    body3();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail++;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertion(condition: unknown, description: string): asserts condition {
  if (!condition) throw new Error(description);
}

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

console.log("\n【行内公式源码像素尺寸】");

testCase("空公式只保留 1px 光标槽，源码框不再用 size 列数", () => {
  const input = new fakeElement("input");
  const ruler = new fakeElement("span");
  fitInlineSourceWidth(input, ruler, "", "");
  equal(input.style.width, "1px", "空公式宽度");
  equal(input.style["--nota-math-source-width"], "1px", "空公式 CSS 宽度变量");
  equal(input.getAttribute("size"), null, "源码框不应设置原生 size");
});

testCase("按尺子的实际字形像素收缩，而不是按字符数乘 ch", () => {
  const input = new fakeElement("input");
  const ruler = new fakeElement("span");
  ruler.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 47.25,
    bottom: 20,
    width: 47.25,
    height: 20,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });

  fitInlineSourceWidth(input, ruler, "\\LaTeX", "");
  equal(ruler.textContent, "\\LaTeX", "尺子量到的源码");
  equal(input.style.width, "49px", "源码框像素宽度（47.25 向上取整加 1px 光标）");
  equal(input.style["--nota-math-source-width"], "49px", "CSS 像素宽度变量");
});

testCase("CSS 没有恢复 2ch 表单下限或额外尾反斜杠间距", () => {
  const css = readFileSync("src/styles/math.css", "utf8");
  assertion(
    /\.nota-math-inline \.nota-math-source\s*\{[^}]*min-width:\s*0/s.test(css),
    "行内源码仍有表单最小宽度",
  );
  assertion(
    /\.nota-math-inline \.nota-math-source\s*\{[^}]*width:\s*var\(--nota-math-source-width,\s*1px\)/s.test(css),
    "行内源码宽度没有读像素变量",
  );
  assertion(
    !/nota-math-trailing-backslash[^{]*nota-math-delim-close\s*\{[^}]*margin-inline-start/s.test(css),
    "尾反斜杠仍在右侧 `$` 前制造额外间距",
  );
  assertion(
    /\.nota-math-ruler\s*\{[^}]*width:\s*max-content/s.test(css),
    "隐藏尺子没有按内容取宽",
  );
});

testCase("字体稳定与后续加载都会重测，首次挂载也补一次布局帧", async () => {
  const listeners = new Map<string, () => void>();
  const previousDocument = (globalThis as { document?: unknown }).document;
  let readyResolve: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });
  (globalThis as { document?: unknown }).document = {
    fonts: {
      ready,
      addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name),
    },
  };

  let remeasures = 0;
  const stop = watchFontMetrics(() => remeasures++);
  readyResolve?.();
  await ready;
  await Promise.resolve();
  listeners.get("loadingdone")?.();
  equal(remeasures, 2, "首次字体就绪与后续加载的测量次数");
  stop();
  equal(listeners.size, 0, "取消监听后仍留着 loadingdone 回调");

  let connected = false;
  let redraws = 0;
  redrawAfterMount(() => connected, () => redraws++);
  connected = true;
  await new Promise((resolve) => setTimeout(resolve, 20));
  equal(redraws, 1, "连接后没有补一次布局帧");
  (globalThis as { document?: unknown }).document = previousDocument;
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
