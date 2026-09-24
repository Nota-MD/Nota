/**
 * 编辑区：把编辑器实例接进 React 生命周期，并按当前**模式**摆一到两个窗格。
 *
 * ⚠️ **React 不该管编辑器内部的 DOM**。所见即所得那半由 Milkdown（ProseMirror）
 * 独占、源码那半由 CodeMirror 独占，React 只负责"什么时候挂上去、什么时候拆掉、
 * 摆几个"。想让 React 去 diff 编辑区的内容，两边会互相覆盖——这类 bug 表现为
 * "打着字光标突然跳走"，而且极难复现。所以这里用**从不重新渲染的空 div**
 * 当挂载点，内容变化一律走命令式通道。
 *
 * # 三种模式
 *
 * | 模式 | 左边 | 右边 | 谁的话算数 |
 * |---|---|---|---|
 * | `wysiwyg` | Milkdown（可编辑） | — | Milkdown |
 * | `source` | CodeMirror（可编辑） | — | CodeMirror |
 * | `split` | CodeMirror（可编辑） | Milkdown（**只读**预览） | CodeMirror |
 *
 * # ⚠️ 分屏为什么只有一个方向
 *
 * 两个窗格**不互推**：源码改动单向推给预览（去抖），预览**从不**往回写。
 * 理由是往返会改字——Milkdown 把 Markdown 解析成文档树再序列化回来未必逐字节
 * 相同（尾段、空行、标记写法都被规范化，BUG-12 的根因候选之一），互推会让
 * 用户的原文被另一侧"改写"，而且每推一次都可能再规范一遍。完整理由见
 * `editor/source.ts` 文件头。
 *
 * 所以预览窗格是**只读**的，这既是产品选择也是正确性要求：界面上不假装
 * 那边能改。
 *
 * # ⚠️ 切模式时文本怎么不丢
 *
 * 模式一变，那两个实例是**换掉**（不是复用）——ProseMirror 的撤销栈与
 * CodeMirror 的完全不是一回事，硬接只会得到一个"撤销会跳到另一个编辑器的历史里"
 * 的怪物。所以：
 *
 * 1. 新实例的初始文本取 `latestRef`（**不是** `doc.text`）——后者被 300ms 去抖
 *    拖着，用户打完最后一个字立刻切模式就会丢掉那几个字；
 * 2. `latestRef` 在 `onChange` 里就更新，另外**卸载时再从活着的实例同步读一次**
 *    （见清理函数），把去抖窗口里那最后一截也捞住。
 */

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

import { api, type Document, type ViewMode } from "@/bridge/ipc";
import { createEditor, type CommandPayload, type EditorCommand, type EditorHandle } from "@/editor/create";
import type { CommandState } from "@/editor/command-state";
import type { 写作模式 } from "@/editor/writing-modes";
import { 空查找状态, type FindOptions, type FindStatus } from "@/editor/find";
import { createSourceEditor, type SourceHandle } from "@/editor/source";

export interface EditorPaneHandle {
  getMarkdown: () => string | undefined;
  setMarkdown: (markdown: string) => void;
  /**
   * 跑一条编辑命令。菜单栏、快捷键与格式化工具栏都走这里。
   *
   * ⚠️ **返回它在这条通路上有没有实现**（见 `EditorHandle.runCommand`）：
   * 所见即所得恒 `true`，源码模式里表格那十条与"没填地址的链接/图片"
   * 会给 `false`。调用方据此提示用户，别让按钮按下去毫无反应。
   */
  runCommand: (name: EditorCommand, payload?: CommandPayload) => boolean;

  /* 查找五条。⚠️ **两种模式都有**（所见即所得走 `editor/find.ts`，源码走
   * `editor/source.ts` 里那套 CM 状态字段），所以这里不必判模式。
   * 口径只有一份：匹配逻辑都在 `find.ts` 的纯函数里。 */
  setFind: (query: string, options: FindOptions) => void;
  findStep: (方向: 1 | -1) => void;
  clearFind: () => void;
  replaceCurrent: (text: string) => boolean;
  replaceAll: (text: string) => number;

  /** 把焦点交回编辑区。关查找条、关菜单之后要用（焦点在别处时打的字是白打）。 */
  focus: () => void;
}

interface Props {
  doc: Document;
  /** 当前编辑模式，来自 `settings.view_mode`。 */
  mode: ViewMode;
  /**
   * **严格模式**，来自 `settings.strict_markdown`。
   *
   * ⚠️ 它**必须进下面那个 effect 的依赖**：两项模式判据不同（`#你好` 算不算
   * 标题），而解析发生在建实例的时候。不重建的话，用户改了设置得先切一次
   * 文档才生效——那种"设置像没生效"的毛病最难被当成 bug 报上来。
   */
  strict: boolean;
  /**
   * **数学公式里的 physics 宏包**，来自 `settings.enable_physics`。
   *
   * ⚠️ 理由同 `strict`：它换的是**交给 KaTeX 的那份宏表**，而 KaTeX 是在
   * 渲染那一刻查表的。不进依赖的话，用户拨了开关得先切一次文档才生效——
   * 那种"设置像没生效"的毛病最难被当成 bug 报上来。
   */
  physics: boolean;
  /**
   * 专注模式 / 打字机模式（视图菜单里那两个开关）。
   *
   * ⚠️ 它们**不进下面那个 effect 的依赖**：拨开关走 `setWritingModes`，
   * **不重建实例**——重建会丢撤销栈和光标，而这两个开关恰恰是"写到一半
   * 才想去拨"的东西。下面那份 ref 只在**新建实例**时当初始值用。
   */
  focusMode: boolean;
  typewriter: boolean;
  contentWidth: number;
  /**
   * 光标状态变化（工具栏高亮、菜单里表格那十条的灰/亮）。
   *
   * ⚠️ **源码模式与"还没有文档"时给 `null`**，不是给一份空状态——
   * 两者含义不同：`null` 是"这条通路读不出来"，而空状态是"读出来了，
   * 光标在普通段落上"。工具栏对这两种情况的反应不一样（见 `FormatBar.tsx`）。
   */
  onCommandState: (state: CommandState | null) => void;
  /** 查找状态（命中数、当前第几个）。关掉查找条时调用方自己清。 */
  onFindStatus: (status: FindStatus) => void;
  onToast: (message: string, level?: "info" | "warn" | "error" | "success") => void;
  onDocsChanged: () => Promise<unknown>;
  ref?: Ref<EditorPaneHandle>;
}

/** 推给后端的去抖间隔。见 `docs/03` §真相在哪。 */
const SYNC_DEBOUNCE_MS = 300;
/** 分屏里把源码推给预览的去抖。比 sync 短——那是本地的，不跨 IPC。 */
const PREVIEW_DEBOUNCE_MS = 150;

export function EditorPane({
  doc,
  mode,
  strict,
  physics,
  focusMode,
  typewriter,
  contentWidth,
  onCommandState,
  onFindStatus,
  onToast,
  onDocsChanged,
  ref,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<EditorHandle | SourceHandle | null>(null);
  const previewHandleRef = useRef<EditorHandle | null>(null);
  const timerRef = useRef<number | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  /** 最后一次知道的文本。切模式时用它当新实例的初始值。 */
  const latestRef = useRef(doc.text);
  const [ready, setReady] = useState(false);

  // ⚠️ 光标状态那条回调**走 ref 读**，不进下面那个 effect 的依赖：
  // 它来自 `App`，而 `App` 每次重渲染都可能给出一个新的函数身份。
  // 进了依赖就等于"每次光标动一下都重建编辑器"——灾难。
  const commandStateRef = useRef(onCommandState);
  commandStateRef.current = onCommandState;
  // 查找那条同理（同一份理由：它是 `App` 每次渲染新建的函数）。
  const findStatusRef = useRef(onFindStatus);
  findStatusRef.current = onFindStatus;

  // 两个写作开关。⚠️ 同上：拨开关**不重建实例**，所以它只能走 ref 读。
  const 写作模式Ref = useRef<写作模式>({ focus: focusMode, typewriter });
  写作模式Ref.current = { focus: focusMode, typewriter };

  // 拨开关 → 通知活着的那个实例。⚠️ **建实例那一刻是没 handle 的**，
  // 所以这一句在挂载时是空跑——那种情况由"建实例时把当前值传进去"兜住
  //（见下面两处 `writingModes`）。
  useEffect(() => {
    handleRef.current?.setWritingModes({ focus: focusMode, typewriter });
  }, [focusMode, typewriter]);

  // 把 handle 暴露给 App（存盘前要强制同步、插件改文档时整篇替换）。
  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => handleRef.current?.getMarkdown(),
      setMarkdown: (markdown: string) => {
        latestRef.current = markdown;
        handleRef.current?.setMarkdown(markdown);
        previewHandleRef.current?.setMarkdown(markdown);
      },
      runCommand: (name: EditorCommand, payload?: CommandPayload) =>
        handleRef.current?.runCommand(name, payload) ?? false,

      // 查找五条**直接转发**给当前那个 handle。⚠️ 没有 handle 时（编辑器
      // 还没建好/已经拆了）给"什么都没做"的安全值，不是抛错——关查找条
      // 恰好发生在编辑器重建的那一瞬间（换文档）时，抛错会把整棵树带下来。
      setFind: (query: string, options: FindOptions) =>
        handleRef.current?.setFind(query, options),
      findStep: (方向: 1 | -1) => handleRef.current?.findStep(方向),
      clearFind: () => handleRef.current?.clearFind(),
      replaceCurrent: (text: string) => handleRef.current?.replaceCurrent(text) ?? false,
      replaceAll: (text: string) => handleRef.current?.replaceAll(text) ?? 0,
      focus: () => handleRef.current?.focus(),
    }),
    [],
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let handle: EditorHandle | SourceHandle | null = null;
    let preview: EditorHandle | null = null;

    /** 源码 → 预览。⚠️ 单向，见文件头。 */
    const pushPreview = (markdown: string) => {
      if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = window.setTimeout(() => {
        previewTimerRef.current = null;
        previewHandleRef.current?.setMarkdown(markdown);
      }, PREVIEW_DEBOUNCE_MS);
    };

    (async () => {
      try {
        // ── 权威那一侧 ────────────────────────────────────────────────
        // ⚠️ 初始文本取 `latestRef` 而不是 `doc.text`，理由见文件头第 1 条。
        const initial = latestRef.current;

        if (mode === "wysiwyg") {
          handle = await createEditor({
            root: mount,
            initialMarkdown: initial,
            strict,
            physics,
            writingModes: 写作模式Ref.current,
            // 光标状态只在这一侧读得出来（源码模式没有文档树）。
            onCommandState: (s) => commandStateRef.current(s),
            onFindStatus: (s) => findStatusRef.current(s),
            onChange: (markdown) => {
              latestRef.current = markdown;
              if (timerRef.current !== null) window.clearTimeout(timerRef.current);
              timerRef.current = window.setTimeout(async () => {
                timerRef.current = null;
                try {
                  await api.doc.sync(doc.id, markdown);
                  await onDocsChanged();
                } catch (e) {
                  onToast(`同步到后端失败：${e}`, "error");
                }
              }, SYNC_DEBOUNCE_MS);
            },
          });
        } else {
          // source 与 split 的左侧是同一个东西，只是 split 多一个预览窗格。
          // ⚠️ 源码这一侧**明确报 `null`**（不是空状态）：CodeMirror 手里
          // 就是文本，没有文档树可读，工具栏据此不画任何高亮。
          commandStateRef.current(null);
          handle = createSourceEditor({
            root: mount,
            initialMarkdown: initial,
            strict,
            // ⚠️ 源码那一侧**没有 `physics`**：它是 CodeMirror，只显示 Markdown
            // 原文，一个字都不渲染，宏表跟它无关（`CreateSourceOptions` 里没这项，
            // 传了编译不过）。
            writingModes: 写作模式Ref.current,
            onFindStatus: (s) => findStatusRef.current(s),
            onChange: (markdown) => {
              latestRef.current = markdown;
              if (mode === "split") pushPreview(markdown);
              if (timerRef.current !== null) window.clearTimeout(timerRef.current);
              timerRef.current = window.setTimeout(async () => {
                timerRef.current = null;
                try {
                  await api.doc.sync(doc.id, markdown);
                  await onDocsChanged();
                } catch (e) {
                  onToast(`同步到后端失败：${e}`, "error");
                }
              }, SYNC_DEBOUNCE_MS);
            },
          });
        }

        // StrictMode 下 effect 会跑两遍：第一遍的实例如果已经建好了，
        // 这一遍就得把它拆掉，不然页面上会有两个编辑器。
        if (disposed) {
          handle.destroy();
          return;
        }

        handleRef.current = handle;

        // ── 分屏右侧那个只读预览 ──────────────────────────────────────
        // ⚠️ 它**不接 onChange、不 settle、不 focus**：它是显示端，不是输入端。
        // 接了 onChange 就会形成回声（见 `create.ts` 里 `readOnly` 那段）。
        if (mode === "split" && previewRef.current) {
          preview = await createEditor({
            root: previewRef.current,
            initialMarkdown: initial,
            // 预览那一侧也要按同一套口径解析，否则分屏左右两边会各显示一个样。
            strict,
            physics,
            readOnly: true,
          });
          if (disposed) {
            preview.destroy();
            previewHandleRef.current = null;
            return;
          }
          previewHandleRef.current = preview;
        }

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
        //
        // ⚠️⚠️ **源码模式不认领**。`settle` 的语义是"接受编辑器的规范化结果"，
        // 而 CodeMirror **不做任何规范化**——它手里就是原文。源码模式下文本相同
        // 时下面这个 `if` 天然不成立；但更重要的是：源码模式下**没有"规范化"
        // 这回事**，认领这一步没有意义，留着只会让人以为这里有坑。
        const settled = handle.getMarkdown();
        latestRef.current = settled;
        if (mode === "wysiwyg" && settled !== doc.text) {
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
      if (previewTimerRef.current !== null) {
        window.clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      // ⚠️ 拆之前**再从活着的实例读一次**：去抖窗口里那最后一截（用户打完字
      // 不到 300ms 就切了模式）还没推给后端，而它已经不在 `latestRef` 之外
      // 的任何地方了。丢掉它 = 用户亲眼看着自己刚打的字消失。
      const last = handleRef.current?.getMarkdown();
      if (last !== undefined) latestRef.current = last;

      handleRef.current = null;
      previewHandleRef.current = null;
      handle?.destroy();
      preview?.destroy();
      setReady(false);
      // 拆掉了就报 `null`——留着上一次那份状态的话，换文档/切模式之后
      // 工具栏会高亮在一个**已经不存在**的位置上。
      commandStateRef.current(null);
      // 查找那边同理：新实例手里一个命中都没有，留着旧的那份命中数
      // （比如"3 / 12"）就是界面在报一个**已经不存在**的查找。
      findStatusRef.current(空查找状态);
    };
    // doc.id 变 = 换文档 = 重挂（App 那边也带了 key，双保险）；
    // mode 变 = 换编辑器（见文件头第 3 条）；
    // strict 变 = 解析口径变了，手里这份文档还是按旧口径解析出来的，得重来。
    // 刻意**不**依赖 doc.text：那是初始值，不是要跟随的状态。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, mode, strict, physics]);

  // ⚠️ 换文档时 `latestRef` 要跟着换，否则会把上一份文档的文本当成本份的初始值。
  // **真正管这件事的是 `App.tsx` 上那个 `key={doc.id}`**（换文档 = 整个组件重挂，
  // 连 `latestRef` 都是新的）。这里这几行是**兜底**：哪天有人把那个 key 去掉，
  // 症状会是"切到另一份文档、里面是上一份的内容"，而且看起来像后端的锅。
  // 判断写在渲染里（不是 effect 里）是为了**赶在上面那个 effect 之前**生效。
  const lastDocIdRef = useRef(doc.id);
  if (lastDocIdRef.current !== doc.id) {
    lastDocIdRef.current = doc.id;
    latestRef.current = doc.text;
  }

  return (
    <div className={`editor-pane editor-pane-${mode}`}>
      {!ready && <div className="editor-loading">正在准备编辑器…</div>}
      {/* ⚠️ 这两块 div 的内容由编辑器独占，React 永不往里渲染。 */}
      <div
        ref={mountRef}
        className="editor-mount"
        style={{ ["--content-width" as string]: `${contentWidth}px` }}
      />
      {mode === "split" && (
        // 右侧预览。`aria-readonly` 是**如实告知**——它真的改不了。
        // 预览不给 `--content-width`：那一半本来就窄，再限宽会剩一条缝。
        <div ref={previewRef} className="editor-mount editor-preview" aria-readonly="true" />
      )}
    </div>
  );
}
