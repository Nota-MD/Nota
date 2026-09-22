/**
 * 编辑区：把 Milkdown 实例接进 React 生命周期。
 *
 * ⚠️ **React 不该管编辑器内部的 DOM**。Milkdown（ProseMirror）自己拥有那块
 * contenteditable，React 只负责"什么时候挂上去、什么时候拆掉"。
 * 想让 React 去 diff 编辑区的内容，两边会互相覆盖——这类 bug 表现为
 * "打着字光标突然跳走"，而且极难复现。所以这里用一个**从不重新渲染的空 div**
 * 当挂载点，内容变化一律走 `setMarkdown()` 这条命令式通道。
 *
 * 挂载点在 App 里带 `key={doc.id}`：换文档时整个组件重挂，
 * 省得去写"把 A 文档的撤销栈换成 B 的"这种活——重挂就是最干净的换法。
 */

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

import { api, type Document } from "@/bridge/ipc";
import { createEditor, type EditorHandle } from "@/editor/create";

export interface EditorPaneHandle {
  getMarkdown: () => string | undefined;
  setMarkdown: (markdown: string) => void;
}

interface Props {
  doc: Document;
  contentWidth: number;
  onToast: (message: string, level?: "info" | "warn" | "error" | "success") => void;
  onDocsChanged: () => Promise<unknown>;
  ref?: Ref<EditorPaneHandle>;
}

/** 推给后端的去抖间隔。见 `docs/03` §真相在哪。 */
const SYNC_DEBOUNCE_MS = 300;

export function EditorPane({ doc, contentWidth, onToast, onDocsChanged, ref }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<EditorHandle | null>(null);
  const timerRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);

  // 把 handle 暴露给 App（存盘前要强制同步、插件改文档时整篇替换）。
  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => handleRef.current?.getMarkdown(),
      setMarkdown: (markdown: string) => handleRef.current?.setMarkdown(markdown),
    }),
    [],
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let handle: EditorHandle | null = null;

    (async () => {
      try {
        handle = await createEditor({
          root: mount,
          initialMarkdown: doc.text,
          onChange: (markdown) => {
            // 去抖：连续打字时不该每个字符都过一次 IPC。
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(async () => {
              timerRef.current = null;
              try {
                await api.doc.sync(doc.id, markdown);
                // 脏标记是后端算的（它才知道跟磁盘上那份一不一样），
                // 取回来更新标签上的小圆点。
                await onDocsChanged();
              } catch (e) {
                onToast(`同步到后端失败：${e}`, "error");
              }
            }, SYNC_DEBOUNCE_MS);
          },
        });

        // StrictMode 下 effect 会跑两遍：第一遍的实例如果已经建好了，
        // 这一遍就得把它拆掉，不然页面上会有两个 ProseMirror。
        if (disposed) {
          handle.destroy();
          return;
        }

        handleRef.current = handle;
        setReady(true);
        handle.focus();

        // 装载完之后把编辑器的文本交回后端**认领**一次。
        //
        // ⚠️ 这不是 `sync`。编辑器把 markdown 解析成文档树再序列化回来，结果未必
        // 与磁盘上那份逐字节相同（尾段、空行、标记写法都会被规范化），而那是
        // **编辑器**改的、不是**用户**改的。不认领的话，打开一个文件就会显示
        // 「已修改」、关窗口还多问一句（BUG-12）。
        //
        // 此刻用户还没碰键盘，所以这一步吞不掉任何真改动；真改动走上面的 onChange。
        // ⚠️ 这一步**必须在 `focus()` 之后**：聚焦本身会派一次事务（补尾段、定选区），
        // 要认领就认领最后一次同步事务之后的结果。
        const settled = handle.getMarkdown();
        if (settled !== doc.text) {
          try {
            await api.doc.settle(doc.id, settled);
            await onDocsChanged();
          } catch (e) {
            // 认领失败不该挡住编辑——最坏的结果是脏标记虚报一次。
            console.warn("[nota] 装载后认领文本失败：", e);
          }
        }
      } catch (e) {
        onToast(`编辑器启动失败：${e}`, "error");
      }
    })();

    return () => {
      disposed = true;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      handleRef.current = null;
      handle?.destroy();
      setReady(false);
    };
    // doc.id 变 = 换文档 = 重挂（App 那边也带了 key，双保险）。
    // 刻意**不**依赖 doc.text：那是初始值，不是要跟随的状态。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  return (
    <div className="editor-pane">
      {!ready && <div className="editor-loading">正在准备编辑器…</div>}
      {/* 这块 div 的内容由 Milkdown 独占，React 永不往里渲染。 */}
      <div
        ref={mountRef}
        className="editor-mount"
        style={{ ["--content-width" as string]: `${contentWidth}px` }}
      />
    </div>
  );
}
