/**
 * **`![](a.mp4)` 该画成一个能播的播放器**，不是一张坏掉的图。
 * 2026-09-28 落地，用户原话：「…**图片语法指向 `.mp4` 当视频**…都是简单的小功能」。
 *
 * # 它解决的那个具体问题
 *
 * 地址指向一个视频文件时，浏览器画不出图：`<img src="a.mp4">` 的产物是一颗
 * 破图标 ＋ `alt` 那行字。**而 Markdown 源码是对的**——`![](a.mp4)` 在别的
 * 编辑器里是合法的写法。坏的是屏幕，不是文件；所以这里只改屏幕。
 *
 * # 判据只有一条：**地址的后缀**
 *
 * 不看文件在不在、不看它多大、不去嗅开头那几个字节。理由：
 *
 * - 编辑器里那个地址**可能根本不是本地路径**（`https://…`、`data:`、相对路径），
 *   "它到底存不存在"在这个位置**没有可靠的答案**；
 * - 按后缀认类型这件事本仓已经有一处（`editor/file-kind.ts`），所以这里**复用**
 *   它的 {@link 后缀}，不自己再写一遍"取最后那个点后面的东西"——`a.mp4?t=3`
 *   那种写法自己取会读成 `mp4?t=3`（见 {@link 是视频地址} 里那一步）。
 *
 * ⚠️ **不猜 `.mov` / `.mkv` / `.avi`**：那些容器的**编码不保证** WebKitGTK 播得动
 * （H.265、ProRes、各种音轨），进去就是一块黑框——**比一张破图更糟**：
 * 破图至少还写着 `alt`，黑框什么都不说。所以 {@link 视频后缀} 只收浏览器
 * 原生就认的那几个盒子。
 *
 * # ⚠️ 为什么是 NodeView，而不是改 schema
 *
 * 换节点类型要把**解析与序列化**一起接过来（同一个 `![](…)` 得能读能写），
 * 而那是 preset 的 `imageSchema` 在管、`image-attrs.ts` 又在上面补过属性。
 * NodeView 只接手**"画成什么"**：源码一个字节都不动、存盘那条路完全没碰，
 * 于是往返不变量（打开再存字节不变）**不受任何影响**。这是选它的唯一理由。
 *
 * ⚠️ 但**导出那条路会跟着变**：`editor/export.ts` 摘的是渲染后的 `innerHTML`
 *（不是文档树），所以导出的 HTML 里会出现真的 `<video controls>`——这是想要的
 *（导出就"所见即所得"）。⚠️ 只是那个 `<span class="nota-video">` 的类名会被
 * 导出那一步**按 `nota-` 前缀摘掉**，所以尺寸约束**不能只挂在这个类名上**
 *（见 `src/styles/video.css` 里那段，两头都写了）。
 *
 * # ⚠️ 两件**没验**的事（都记在 `docs/07` 第 87 项的账里）
 *
 * 1. **点播放按钮到底播不播**。本仓的编辑器测试**没有 DOM**（没有 jsdom，
 *    无头环境里也没有 WebKit 窗口），这件事只能开窗目检。理论上没问题：
 *    ProseMirror 是在 **`mouseup`** 里 `preventDefault()` 的（点原子节点走
 *    `selectClickedLeaf` 那条路，见 `node_modules/prosemirror-view`），
 *    而浏览器的 `click` 不因那一下被取消。
 *    ⚠️ 万一实测是"点了没反应"，**一行就能换**：给下面那个视图加
 *    `stopEvent: () => true`，把点击整个让给浏览器。代价说清楚——加了之后
 *    **点一下不再选中这个节点**（想删它得把光标放到旁边按退格）。默认不加是
 *    为了跟图片**一致**：图片点一下就是选中，视频没有理由是另一回事。
 * 2. **拖进度条会不会被当成"拖整颗节点"**。图片在 schema 里是 `draggable: true`，
 *    ProseMirror 会把这个属性挂在节点视图的**根**上；下面那颗视频的根是外面
 *    那个 `<span>`，视频自己另写了 `draggable="false"` 兜一层。⚠️ 到底管不管用
 *    同样没验——顺带说一句，用户那句「测试的时候不要真的放声音」也压着这件事：
 *    连播都不该在这里播，更别说测到一半出声。
 */

import { imageSchema } from "@milkdown/kit/preset/commonmark";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";

import { api } from "@/bridge/ipc";
import { extension } from "./file-kind";

/**
 * 认作视频的后缀，小写、不带点。
 *
 * ⚠️ 这张单子**故意短**：里面每一个都得是 WebKitGTK 有把握播的盒子。
 * `mp4`（H.264/AAC）与 `webm`（VP8/VP9/Opus）是两大主力，`m4v` 就是
 * "只有视频的 mp4"（苹果那边这么叫），`ogv` 是 Ogg 那一支。
 * ⚠️ 加新的一条之前，先想清楚"播不动时用户看到什么"——一块黑框不会告诉
 * 他为什么黑（见文件头那段）。
 */
export const visionFrequencyExtension: readonly string[] = ["mp4", "m4v", "webm", "ogv"];

/**
 * 这个地址指的是一个视频吗。
 *
 * ⚠️ **先切掉查询串与片段**再取后缀，这是这一步唯一容易写错的地方：
 * `a.mp4?t=3` 与 `a.mp4#t=3` 都是**常见写法**（后者是 Media Fragments，
 * 浏览器自己认），不切的话取出来的后缀是 `mp4?t=3`，判据当场失效——而症状是
 * "带时间戳的那种链接画不成播放器"，看着像视频支持时灵时不灵。
 */
export function IsVideoSource(address: string): boolean {
  const clean = address.split(/[?#]/, 1)[0] ?? "";
  return visionFrequencyExtension.includes(extension(clean));
}

/** 属性取字符串。⚠️ 上游那三个属性的类型是 `string`，但**运行时不保证**（见 `image-attrs.ts`）。 */
function text2(value2: unknown): string {
  return typeof value2 === "string" ? value2 : "";
}

/** 不是本机文件：网络地址、内联数据、已经转换过的 asset 地址。 */
function isExternalPartAddress(address: string): boolean {
  return /^(?:https?:|data:|blob:|asset:)/i.test(address.trim());
}

/** Markdown 地址 → 本机绝对路径；不是本地文件时给 `null`。 */
export function localLocalImageSliceAbsoluteCorrectPath(address: string, documentPath: string | null): string | null {
  const original = address.trim();
  if (!original || isExternalPartAddress(original)) return null;
  if (original.toLowerCase().startsWith("file://")) {
    try {
      return decodeURIComponent(original.slice("file://".length));
    } catch {
      return original.slice("file://".length);
    }
  }

  const windowsAbsoluteCorrect = /^[a-zA-Z]:[\\/]/.test(original);
  const unixAbsoluteCorrect = original.startsWith("/");
  const UNC = original.startsWith("\\\\");
  if (windowsAbsoluteCorrect || unixAbsoluteCorrect || UNC) return original;
  if (!documentPath) return null;

  const slantBar = documentPath.includes("\\") ? "\\" : "/";
  const split = documentPath.lastIndexOf(slantBar);
  if (split < 0) return null;
  const itemRecord = documentPath.slice(0, split);
  const paragraph2 = `${itemRecord}${slantBar}${original}`.split(/[\\/]+/);
  const returnAnd: string[] = [];
  for (const value of paragraph2) {
    if (!value || value === ".") continue;
    if (value === "..") {
      returnAnd.pop();
      continue;
    }
    returnAnd.push(value);
  }
  const body2 = returnAnd.join(slantBar);
  if (UNC) return `\\\\${body2}`;
  return documentPath.startsWith("/") ? `/${body2}` : body2;
}

/** 造出来的那一对：外面那层盒子 ＋ 里面那颗图片/视频元素。 */
interface viewItem {
  /** 节点视图的根。ProseMirror 的选中高亮与 `draggable` 都挂在这一颗上。 */
  dom: HTMLElement;
  /** 图片或视频元素本身。 */
  mediaBody: HTMLImageElement | HTMLVideoElement;
  /** 图片选中后显示的 Markdown 源文输入框；视频没有。 */
  sourceBody: HTMLInputElement | null;
  /** 造的时候认定的是不是视频。**建成之后不再变**（变了就整个重建，见 `update`）。 */
  isVisionFrequency: boolean;
  /** 异步读图令牌：后一次 update 回来时，旧结果不许覆盖新节点。 */
  represent: number;
}

/**
 * 按"是不是视频"造一对元素。**只造壳，不写属性**——属性统一由 {@link 写属性}
 * 写，一处真相，`update` 那条路才不会漏掉某一颗。
 */
function createElement(isVisionFrequency: boolean): viewItem {
  if (!isVisionFrequency) {
    // 图片外面这一层只在编辑时承载 Markdown 源码输入框；渲染内容仍是裸
    // `<img>`，导出时源码框会被删除，这一层也会被展开。
    const box = document.createElement("span");
    box.className = "nota-image";
    const source = document.createElement("input");
    source.type = "text";
    source.className = "nota-image-source";
    source.spellcheck = false;
    source.autocomplete = "off";
    source.setAttribute("aria-label", "Image Markdown source");
    const img = document.createElement("img");
    box.append(source, img);
    return { dom: box, mediaBody: img, sourceBody: source, isVisionFrequency: false, represent: 0 };
  }

  // ⚠️ 视频这一支**要**包一层盒子，两个理由：
  // ① 选中高亮（`ProseMirror-selectednode`）与 `draggable` 是挂在根上的，
  //    让它们落在盒子上，就别去动视频自己那身原生控件；
  // ② CSS 有个稳的落点（类名会被导出那一步摘掉，但盒子的**结构**还在）。
  const box = document.createElement("span");
  box.className = "nota-video";
  const video = document.createElement("video");
  // ⚠️ `preload="metadata"`：只要时长与第一帧，**不预下载整段**。一篇记满了
  // 视频的稿子用 `auto` 会把带宽和磁盘一起吃掉，而用户多半只是路过这一行。
  video.preload = "metadata";
  video.controls = true;
  // 见文件头第 2 条：schema 是 `draggable: true`，这一行是"别把我当拖拽把手"。
  video.setAttribute("draggable", "false");
  box.appendChild(video);
  return { dom: box, mediaBody: video, sourceBody: null, isVisionFrequency: true, represent: 0 };
}

/**
 * 把节点的三个属性写到元素上。
 *
 * ⚠️ 图片那一支的三条**与 preset 的 `toDOM` 逐条对齐**（`src` / `alt` / `title`，
 * 空串也照写）。少写一个的症状是"加了视频支持之后某张图的 `title` 没了"——
 * 与视频八竿子打不着，没人会往这里找。
 *
 * ⚠️ `alt` 在 `<video>` 上**不是合法属性**（它没有那个内容模型），写进去只会
 * 变成一颗没人读的属性。给屏幕阅读器的那份走 `aria-label`——语义正好对上
 *（`![](a.mp4 "演示")` 里那个 `alt` 说的就是"这段视频在讲什么"），而 `title`
 * 两边都是全局属性，照写当鼠标提示。
 */
function writeAttribute(item3: viewItem, node: PMNode, documentPath: string | null): void {
  const src = text2(node.attrs.src);
  const alt = text2(node.attrs.alt);
  const title = text2(node.attrs.title);
  const represent = ++item3.represent;

  const localLocal = localLocalImageSliceAbsoluteCorrectPath(src, documentPath);
  if (!localLocal) {
    item3.mediaBody.setAttribute("src", src);
  } else {
    // 本地图片由宿主读成 data URL。asset 协议在中文路径 / SVG / dev server 下
    // 会静默失败，表现正是“只剩 alt 和一顆破图标”。
    item3.mediaBody.removeAttribute("src");
    void api.image
      .dataUrl(localLocal)
      .then((address) => {
        if (item3.represent === represent) item3.mediaBody.setAttribute("src", address);
      })
      .catch(() => {
        // 读不了就保留 alt；不要把 `src` 设回相对路径让浏览器再猜一次。
        if (item3.represent === represent) item3.mediaBody.removeAttribute("src");
      });
  }
 item3.mediaBody.setAttribute("title", title);
  if (item3.isVisionFrequency) {
    if (alt) item3.mediaBody.setAttribute("aria-label", alt);
    else item3.mediaBody.removeAttribute("aria-label");
  } else {
    item3.mediaBody.setAttribute("alt", alt);
    if (item3.sourceBody && document.activeElement !== item3.sourceBody) {
      item3.sourceBody.value = imageMarkdownSource(node);
    }
  }
}

/** 当前图片节点的 Markdown 源文。 */
export function imageMarkdownSource(node: PMNode): string {
  const src = text2(node.attrs.src);
  const alt = text2(node.attrs.alt).replaceAll("]", "\\]");
  const title = text2(node.attrs.title).replaceAll('"', '\\"');
  return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
}

/** 解析用户改过的图片 Markdown；认不出来时给 `null`，绝不猜测或吞掉内容。 */
export function parseImageMarkdownSource(
  source: string,
): { src: string; alt: string; title: string } | null {
  const match = /^\s*!\[((?:\\.|[^\]])*)\]\(\s*(\S+?)(?:\s+["']((?:\\.|[^"'])*)["'])?\s*\)\s*$/.exec(source);
  if (!match) return null;
  return {
    alt: match[1]!.replaceAll("\\]", "]"),
    src: match[2]!,
    title: (match[3] ?? "").replaceAll('\\"', '"'),
  };
}

/**
 * 图片语法里那个地址指向视频时，画成播放器；其余的照旧画成图片。
 *
 * ⚠️ **`$view` 收的是 `$Node`，不是 `$NodeSchema`**——要的是 `imageSchema.node`
 *（同 `code-block.ts` 顶上那条注释）。
 */
export function visionFrequencyView(documentPath: string | null = null) {
  return $view(
    imageSchema.node,
    () =>
      (
        initialNode: PMNode,
        view: EditorView,
        getPos: () => number | undefined,
      ): NodeView => {
      const initial = createElement(IsVideoSource(text2(initialNode.attrs.src)));
      const isVisionFrequency = initial.isVisionFrequency;
      writeAttribute(initial, initialNode, documentPath);
      let currentNode = initialNode;

      const showSource = (): void => {
        initial.dom.classList.add("is-selected");
        if (!initial.sourceBody) return;
        initial.sourceBody.value = imageMarkdownSource(currentNode);
        requestAnimationFrame(() => initial.sourceBody?.focus());
      };

      initial.mediaBody.addEventListener("mousedown", (event) => {
        if (initial.isVisionFrequency || !(event instanceof MouseEvent) || event.button !== 0) return;
        event.preventDefault();
        showSource();
      });

      const commitSource = (): void => {
        const source = initial.sourceBody;
        if (!source) return;
        const parsed = parseImageMarkdownSource(source.value);
        if (!parsed) {
          source.value = imageMarkdownSource(currentNode);
          return;
        }
        const position2 = getPos();
        if (position2 === undefined) return;
        view.dispatch(
          view.state.tr.setNodeMarkup(position2, undefined, {
            ...currentNode.attrs,
            ...parsed,
          }),
        );
      };

      initial.sourceBody?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commitSource();
          view.focus();
        } else if (event.key === "Escape") {
          event.preventDefault();
          initial.sourceBody!.value = imageMarkdownSource(currentNode);
          view.focus();
        }
      });
      initial.sourceBody?.addEventListener("blur", commitSource);
      initial.sourceBody?.addEventListener("blur", () => {
        queueMicrotask(() => {
          if (initial.dom.isConnected && !initial.dom.contains(document.activeElement)) {
            initial.dom.classList.remove("is-selected");
          }
        });
      });

      return {
        dom: initial.dom,
        update: (newValueNode: PMNode): boolean => {
          // ⚠️ **类别变了就 `return false`**：`<img>` 与 `<video>` 是两种元素，
          // 改属性改不过去（在一颗 `<video>` 上改 `src` 也变不成图）。返回
          // `false` 是告诉 ProseMirror"这个我处理不了，你重建一个"——它会拿新
          // 节点再调一次这里的构造函数，落到的就是对的元素。
          // ⚠️ 症状对照：不写这一条的话，用户把 `![](a.mp4)` 改成 `![](a.png)`
          // 之后**屏幕上还是一块播放器**（而且 `a.png` 播不出来，是黑的）。
          if (IsVideoSource(text2(newValueNode.attrs.src)) !== isVisionFrequency) return false;
          currentNode = newValueNode;
          writeAttribute(initial, newValueNode, documentPath);
          return true;
        },
        stopEvent: (event) =>
          event.target === initial.sourceBody ||
          (!initial.isVisionFrequency && event.target === initial.mediaBody),
        // NodeView 内部所有 DOM 都由这里自己写：图片异步拿到 data URL 后设置
        // `src` 也是内部更新。放给 ProseMirror 观察会被误判成用户编辑，
        // 随后整颗节点重绘时图片会退回只有 alt 的空壳。
        ignoreMutation: () => true,
        // Programmatic focusAtStart / reload may create a NodeSelection at an
        // image without any user intent. Keep the source editor closed in that
        // case; only an explicit click on the image opens it.
        selectNode: () => {
          initial.dom.classList.remove("is-selected");
        },
        deselectNode: () => {
          initial.dom.classList.remove("is-selected");
          if (initial.sourceBody) {
            initial.sourceBody.value = imageMarkdownSource(currentNode);
          }
        },
        };
      },
  );
}
