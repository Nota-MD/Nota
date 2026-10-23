/**
 * KaTeX 的异步运行层。
 *
 * 公式 schema 与编辑器输入规则属于核心 Markdown 能力；真正昂贵的排版引擎、
 * mhchem 扩展和样式表只在第一次需要渲染公式时加载。Vite 会把本文件拆成独立
 * chunk，空白文档与纯文本 Markdown 不会请求它。
 */

import type { KatexOptions } from "katex";

let katexPromise: Promise<typeof import("katex").default> | null = null;
let 窗口显示Promise: Promise<void> | null = null;

function 等窗口显示(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (document.documentElement.dataset.windowShown === "true") return Promise.resolve();
  窗口显示Promise ??= new Promise((resolve) => {
    window.addEventListener("nota-window-shown", () => resolve(), { once: true });
  });
  return 窗口显示Promise;
}

function 取Katex(): Promise<typeof import("katex").default> {
  katexPromise ??= 等窗口显示().then(() =>
    // @ts-expect-error KaTeX 的 mhchem 入口没有随包提供 TypeScript 声明。
    Promise.all([import("katex/dist/contrib/mhchem.mjs"), import("katex")]).then(
      ([, module]) => module.default,
    ),
  );
  return katexPromise;
}

/**
 * 编辑器首帧已经完成后再预热。不要在 `createEditor()` 前调用：
 * 这里的目的就是让核心窗口先出现并接受输入，数学排版引擎随后在后台到货。
 */
export function 预热Katex(): void {
  void 取Katex().catch((e: unknown) => {
    console.warn("[nota] KaTeX 预热失败；首次渲染时将重试：", e);
    katexPromise = null;
  });
}

/** 画一次公式；调用方负责处理自己那棵 DOM 的过期与错误状态。 */
export async function 渲染公式(
  源码: string,
  目标: HTMLElement,
  选项: KatexOptions = {},
): Promise<void> {
  const katex = await 取Katex();
  目标.replaceChildren();
  katex.render(源码, 目标, 选项);
}
