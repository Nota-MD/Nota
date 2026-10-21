/**
 * 显示主窗口。
 *
 * 主窗口在 `tauri.conf.json` 里先创建在屏幕外并隐藏任务栏入口。屏幕外的窗口
 * 仍会正常渲染，避免 WebKit 在隐藏窗口里暂停动画帧；等界面风格与编辑器实例
 * 都就绪后，才由宿主移入屏幕。用户第一次看到窗口时，正文已经可以输入，不存在
 * “Nota”启动文字、纯色动画或半成品界面。
 *
 * ⚠️ **不要把 `document.fonts.ready` 放进这条必经链**。用户导入的 CDE 主题带
 * 一支 2.1 MB 的多字符集点阵字体；等整套字体解析完再揭幕，会把每次冷启动硬拖长
 * 最多 2 秒（旧实现还真有一个 2 秒超时）。字体是主题样式的一部分，但它的装载
 * **不需要挡住应用窗口的第一帧**：`@font-face` 已经由浏览器并行获取，样式与布局
 * 也已经在 CSS 注入时确定。这里只等两个渲染帧，确保主题属性先落到 DOM，再换掉
 * 启动层。
 */

import { useEffect } from "react";

import { api } from "@/bridge/ipc";

const EDITOR_READY_EVENT = "nota-editor-ready";
const STARTUP_READY_EVENT = "nota-startup-ready";

/** 编辑器实例已经建好，可以接收输入。 */
export function markEditorReady(): void {
  document.documentElement.dataset.editorReady = "true";
  window.dispatchEvent(new Event(EDITOR_READY_EVENT));
}

/** 启动数据与会话已经接上。保留给诊断和异常兜底，不作为“已可编辑”的同义词。 */
export function markStartupReady(): void {
  document.documentElement.dataset.startupReady = "true";
  window.dispatchEvent(new Event(STARTUP_READY_EVENT));
}

export function useBootReveal(ready: boolean): void {
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let timer = 0;
    const listeners: Array<[string, () => void]> = [];
    const reveal = () => {
      if (cancelled) return;
      for (const [event, fn] of listeners) window.removeEventListener(event, fn);
      if (timer) window.clearTimeout(timer);
      // ⚠️ 不能等 rAF：窗口隐藏时 WebKit 会暂停它，ready 之后永远等不到下一帧。
      // 编辑器在此刻已经挂载并聚焦，直接显示原生窗口即可。
      document.documentElement.dataset.booted = "true";
      void api.window.showMain().catch((error) => {
        console.error("[nota] 显示主窗口失败：", error);
      });
    };
    const maybeReveal = () => {
      // ⚠️ 只认编辑器实例已经建好。`startupReady` 只表示会话恢复完成，不能证明
      // 正文已经可输入；此前用它配合 `.home` 揭幕，会让用户先看到一帧空壳。
      if (document.documentElement.dataset.editorReady === "true") reveal();
    };
    for (const event of [EDITOR_READY_EVENT, STARTUP_READY_EVENT]) {
      listeners.push([event, maybeReveal]);
      window.addEventListener(event, maybeReveal);
    }
    maybeReveal();
    // 编辑器初始化真的失败时不能永远隐藏窗口。正常路径由 `markEditorReady()`
    // 显示；这里是故障兜底，不是常规开窗计时器。
    timer = window.setTimeout(reveal, 5000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      for (const [event, fn] of listeners) window.removeEventListener(event, fn);
    };
  }, [ready]);
}
