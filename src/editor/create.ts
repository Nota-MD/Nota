/**
 * 编辑器内核：Milkdown（ProseMirror + remark）的封装。
 *
 * # 为什么是 ProseMirror 系而不是「textarea + 高亮装饰」
 *
 * Typora 的语义是**文档树**，不是"带样式的文本缓冲"。表格拖列宽、图片定尺寸、
 * 嵌套列表的层级、脚注引用、任务项勾选——这些在文档树上都是**一等的节点**，
 * 在文本缓冲上则要一层层拿文本偏移去近似，且每次编辑都可能算错。
 * Typora 能做到的那几样看起来"琐碎"的功能，恰恰是文本缓冲方案最先崩的地方。
 *
 * Milkdown 底下就是裸 ProseMirror。将来某个节点要下沉到 PM 原语（自定义 schema、
 * 自定义 plugin），这条路是敞开的——本文件不做任何"只此一家"的封装。
 *
 * # 真相在哪
 *
 * **前端是文本的真相**（见 `src-tauri/src/document/mod.rs` 顶上那段）。
 * 本模块提供 `getMarkdown()` / `setMarkdown()` 两个口子，别的模块
 * **不要**直接去摸 `editorViewCtx` 里的 state。
 */

import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
  serializerCtx,
  parserCtx,
} from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { cursor } from "@milkdown/kit/plugin/cursor";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { indent } from "@milkdown/kit/plugin/indent";
import { trailing } from "@milkdown/kit/plugin/trailing";
import { replaceAll } from "@milkdown/kit/utils";
// 这三个**不在** `@milkdown/kit` 的转发表里，得从各自的包进。
// 前两个是 kit 的依赖（间接装上了），plugin-prism 不是——所以它在 package.json
// 里必须显式列出来，漏了就是一句 "Cannot find module"。
import { prism } from "@milkdown/plugin-prism";
import { math } from "@milkdown/plugin-math";
import { diagram } from "@milkdown/plugin-diagram";

// ⚠️ 副作用导入，**不是多余的**：把 refractor 的语言表从 36 种补到 400 个
// （297 种语言 + 别名，比如 ts→typescript、sh→bash）。
//
// 为什么需要这一行：`@milkdown/plugin-prism` 内部是
// `import { refractor } from "refractor"`，而 `refractor` 这个入口指向
// `lib/common.js`——**里面只 register 了 36 种**（c / cpp / java / python /
// js / ts / rust / go 那一批）。`lib/all.js` 才是全量那份 297 行的注册清单。
//
// ⚠️ 两边是**同一个单例**（都从 `refractor/lib/core.js` 拿那一个 `refractor`），
// 所以这里注册的，plugin-prism 那边立刻看得见——它读语言表是**惰性**的
// （`getBlockDecorations(node, pos, refractor, languages = refractor.listLanguages())`
// 里那是默认参数，调用时才求值），只要这行 import 在 `Editor.make()` 之前跑完即可。
//
// 代价是打包体积。**这是有意的取舍**：桌面应用没有下载时间这一说，
// 而"我的语言不在列表里"是插件和用户都会撞上的问题。真嫌大时再换成
// 按需 import，但那时要自己维护依赖顺序（php 必须排在 markup-templating 后面）。
import "refractor/all";

// 光标所在块的 Markdown 标记（`##`、`>`、`-`……）浅灰画在块左边。
// 这是"标记不消失、只淡化"那条 Typora 手感，理由写在它自己的文件头上。
import { instantRender } from "./instant-render";
// 任务项的复选框：画出来 + 点它勾上。DOM 钩子（`data-checked`）是
// `preset-gfm` 早就给了的，缺的是 CSS 和点击，理由写在它自己的文件头上。
import { taskList } from "./task-list";
// 代码块的右下角那一条：语言选择器 / 复制 / 折叠。这是**唯一**一处用 NodeView
// 的地方（别处要么改 schema、要么用 Decoration），理由写在它自己的文件头上。
import { codeBlockView } from "./code-block";

/** 编辑器句柄。调用方只通过这些方法跟编辑器打交道。 */
export interface EditorHandle {
  /** 取出当前 markdown 文本。 */
  getMarkdown: () => string;
  /** 整篇替换（用于：打开文件、插件改了文档、放弃修改重载）。 */
  setMarkdown: (markdown: string) => void;
  /** 把焦点交给编辑区。 */
  focus: () => void;
  /** 销毁。组件卸载时**必须**调，否则 ProseMirror 的 DOM 监听会留着。 */
  destroy: () => void;
}

export interface CreateOptions {
  /** 挂载点。 */
  root: HTMLElement;
  /** 初始内容。 */
  initialMarkdown: string;
  /**
   * 文档变化回调。**已经在 Milkdown 的 `updated` 钩子里**——
   * 调用方拿到后仍要做去抖（见 `docs/03` §真相在哪）。
   */
  onChange?: (markdown: string) => void;
}

/**
 * 建一个编辑器实例。
 *
 * 注意插件清单里**没有**什么，和有什么一样重要：
 * - 没有 `slash`（斜杠菜单）、没有 `block`（块手柄）、没有 `tooltip`
 *   ——这些是交互糖，排在后面对标的轮次里（见 `docs/07`）。
 *   先装它们会让我们在还没确定自己交互口径时就被它们的默认行为绑住。
 */
export async function createEditor(options: CreateOptions): Promise<EditorHandle> {
  const { root, initialMarkdown, onChange } = options;

  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, initialMarkdown);

      // 文档变化 → 通知调用方。
      // ⚠️ 这里**不做去抖**：去抖是调用方的事，因为"多快算太快"取决于
      // 它拿这个回调干什么（存草稿 vs 推给后端 vs 更新字数，三种节奏不一样）。
      ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, prev) => {
        if (markdown !== prev) onChange?.(markdown);
      });
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
    .use(cursor)
    .use(clipboard)
    .use(indent)
    .use(trailing)
    .use(instantRender)
    .use(taskList)
    .use(codeBlockView)
    .use(prism)
    .use(math)
    .use(diagram)
    .create();

  return {
    getMarkdown: () =>
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const serializer = ctx.get(serializerCtx);
        return serializer(view.state.doc);
      }),

    setMarkdown: (markdown: string) => {
      editor.action(replaceAll(markdown));
    },

    focus: () => {
      editor.action((ctx) => {
        ctx.get(editorViewCtx).focus();
      });
    },

    destroy: () => {
      editor.destroy();
    },
  };
}

/**
 * 把 markdown 文本解析成 ProseMirror 文档（用于校验、或将来做"粘贴前预检"）。
 *
 * 单独导出来是因为 `docs/03` 里那条口径：**任何进编辑器的文本都要先过一遍解析**。
 * 直接 `replaceAll` 一个语法坏掉的串，remark 会按它的理解尽力解析——结果不是
 * "报错"而是"一段看起来对但不完全对的内容"，那种错最难发现。
 */
export function parseMarkdown(editor: Editor, markdown: string): unknown {
  return editor.action((ctx) => {
    const parser = ctx.get(parserCtx);
    return parser(markdown);
  });
}
