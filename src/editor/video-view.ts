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
import type { NodeView } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";

import { api } from "@/bridge/ipc";
import { 后缀 } from "./file-kind";

/**
 * 认作视频的后缀，小写、不带点。
 *
 * ⚠️ 这张单子**故意短**：里面每一个都得是 WebKitGTK 有把握播的盒子。
 * `mp4`（H.264/AAC）与 `webm`（VP8/VP9/Opus）是两大主力，`m4v` 就是
 * "只有视频的 mp4"（苹果那边这么叫），`ogv` 是 Ogg 那一支。
 * ⚠️ 加新的一条之前，先想清楚"播不动时用户看到什么"——一块黑框不会告诉
 * 他为什么黑（见文件头那段）。
 */
export const 视频后缀: readonly string[] = ["mp4", "m4v", "webm", "ogv"];

/**
 * 这个地址指的是一个视频吗。
 *
 * ⚠️ **先切掉查询串与片段**再取后缀，这是这一步唯一容易写错的地方：
 * `a.mp4?t=3` 与 `a.mp4#t=3` 都是**常见写法**（后者是 Media Fragments，
 * 浏览器自己认），不切的话取出来的后缀是 `mp4?t=3`，判据当场失效——而症状是
 * "带时间戳的那种链接画不成播放器"，看着像视频支持时灵时不灵。
 */
export function 是视频地址(地址: string): boolean {
  const 净 = 地址.split(/[?#]/, 1)[0] ?? "";
  return 视频后缀.includes(后缀(净));
}

/** 属性取字符串。⚠️ 上游那三个属性的类型是 `string`，但**运行时不保证**（见 `image-attrs.ts`）。 */
function 文本(值: unknown): string {
  return typeof 值 === "string" ? 值 : "";
}

/** 不是本机文件：网络地址、内联数据、已经转换过的 asset 地址。 */
function 是外部地址(地址: string): boolean {
  return /^(?:https?:|data:|blob:|asset:)/i.test(地址.trim());
}

/** Markdown 地址 → 本机绝对路径；不是本地文件时给 `null`。 */
export function 本地图片绝对路径(地址: string, 文档路径: string | null): string | null {
  const 原 = 地址.trim();
  if (!原 || 是外部地址(原)) return null;
  if (原.toLowerCase().startsWith("file://")) {
    try {
      return decodeURIComponent(原.slice("file://".length));
    } catch {
      return 原.slice("file://".length);
    }
  }

  const Windows绝对 = /^[a-zA-Z]:[\\/]/.test(原);
  const Unix绝对 = 原.startsWith("/");
  const UNC = 原.startsWith("\\\\");
  if (Windows绝对 || Unix绝对 || UNC) return 原;
  if (!文档路径) return null;

  const 斜杠 = 文档路径.includes("\\") ? "\\" : "/";
  const 切 = 文档路径.lastIndexOf(斜杠);
  if (切 < 0) return null;
  const 目录 = 文档路径.slice(0, 切);
  const 段 = `${目录}${斜杠}${原}`.split(/[\\/]+/);
  const 归并: string[] = [];
  for (const 一 of 段) {
    if (!一 || 一 === ".") continue;
    if (一 === "..") {
      归并.pop();
      continue;
    }
    归并.push(一);
  }
  const 正文 = 归并.join(斜杠);
  if (UNC) return `\\\\${正文}`;
  return 文档路径.startsWith("/") ? `/${正文}` : 正文;
}

/** 造出来的那一对：外面那层盒子 ＋ 里面那颗图片/视频元素。 */
interface 视图件 {
  /** 节点视图的根。ProseMirror 的选中高亮与 `draggable` 都挂在这一颗上。 */
  dom: HTMLElement;
  /** 图片或视频元素本身。 */
  媒体: HTMLImageElement | HTMLVideoElement;
  /** 造的时候认定的是不是视频。**建成之后不再变**（变了就整个重建，见 `update`）。 */
  是视频: boolean;
  /** 异步读图令牌：后一次 update 回来时，旧结果不许覆盖新节点。 */
  代: number;
}

/**
 * 按"是不是视频"造一对元素。**只造壳，不写属性**——属性统一由 {@link 写属性}
 * 写，一处真相，`update` 那条路才不会漏掉某一颗。
 */
function 造元素(是视频: boolean): 视图件 {
  if (!是视频) {
    // ⚠️ 图片这一支返回的是**裸 `<img>`**，不是包一层盒子：这是 preset
    // `toDOM` 今天给出的形状（`["img", {...imageAttr, ...node.attrs}]`，
    // 本仓没有覆盖 `imageAttr`），一模一样才不会动到别处对图片的假设。
    const img = document.createElement("img");
    return { dom: img, 媒体: img, 是视频: false, 代: 0 };
  }

  // ⚠️ 视频这一支**要**包一层盒子，两个理由：
  // ① 选中高亮（`ProseMirror-selectednode`）与 `draggable` 是挂在根上的，
  //    让它们落在盒子上，就别去动视频自己那身原生控件；
  // ② CSS 有个稳的落点（类名会被导出那一步摘掉，但盒子的**结构**还在）。
  const 盒 = document.createElement("span");
  盒.className = "nota-video";
  const video = document.createElement("video");
  // ⚠️ `preload="metadata"`：只要时长与第一帧，**不预下载整段**。一篇记满了
  // 视频的稿子用 `auto` 会把带宽和磁盘一起吃掉，而用户多半只是路过这一行。
  video.preload = "metadata";
  video.controls = true;
  // 见文件头第 2 条：schema 是 `draggable: true`，这一行是"别把我当拖拽把手"。
  video.setAttribute("draggable", "false");
  盒.appendChild(video);
  return { dom: 盒, 媒体: video, 是视频: true, 代: 0 };
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
function 写属性(件: 视图件, 节点: PMNode, 文档路径: string | null): void {
  const src = 文本(节点.attrs.src);
  const alt = 文本(节点.attrs.alt);
  const title = 文本(节点.attrs.title);
  const 代 = ++件.代;

  const 本地 = 本地图片绝对路径(src, 文档路径);
  if (!本地) {
    件.媒体.setAttribute("src", src);
  } else {
    // 本地图片由宿主读成 data URL。asset 协议在中文路径 / SVG / dev server 下
    // 会静默失败，表现正是“只剩 alt 和一顆破图标”。
    件.媒体.removeAttribute("src");
    void api.image
      .dataUrl(本地)
      .then((地址) => {
        if (件.代 === 代) 件.媒体.setAttribute("src", 地址);
      })
      .catch(() => {
        // 读不了就保留 alt；不要把 `src` 设回相对路径让浏览器再猜一次。
        if (件.代 === 代) 件.媒体.removeAttribute("src");
      });
  }
 件.媒体.setAttribute("title", title);
  if (件.是视频) {
    if (alt) 件.媒体.setAttribute("aria-label", alt);
    else 件.媒体.removeAttribute("aria-label");
  } else {
    件.媒体.setAttribute("alt", alt);
  }
}

/**
 * 图片语法里那个地址指向视频时，画成播放器；其余的照旧画成图片。
 *
 * ⚠️ **`$view` 收的是 `$Node`，不是 `$NodeSchema`**——要的是 `imageSchema.node`
 *（同 `code-block.ts` 顶上那条注释）。
 */
export function 视频视图(文档路径: string | null = null) {
  return $view(
    imageSchema.node,
    () =>
      (初节点: PMNode): NodeView => {
      const 初 = 造元素(是视频地址(文本(初节点.attrs.src)));
      const 是视频 = 初.是视频;
      写属性(初, 初节点, 文档路径);

      return {
        dom: 初.dom,
        update: (新节点: PMNode): boolean => {
          // ⚠️ **类别变了就 `return false`**：`<img>` 与 `<video>` 是两种元素，
          // 改属性改不过去（在一颗 `<video>` 上改 `src` 也变不成图）。返回
          // `false` 是告诉 ProseMirror"这个我处理不了，你重建一个"——它会拿新
          // 节点再调一次这里的构造函数，落到的就是对的元素。
          // ⚠️ 症状对照：不写这一条的话，用户把 `![](a.mp4)` 改成 `![](a.png)`
          // 之后**屏幕上还是一块播放器**（而且 `a.png` 播不出来，是黑的）。
          if (是视频地址(文本(新节点.attrs.src)) !== 是视频) return false;
          写属性(初, 新节点, 文档路径);
          return true;
        },
        // 视频自己就会变 DOM（控件浮出来、封面帧画上去），告诉 ProseMirror
        // **别把这些当成"用户编辑了文档"**。图片那一支同样返回 `true`：它的
        // 属性全由上面那个 `update` 写，用不着观察器再看一眼。
        ignoreMutation: () => true,
        };
      },
  );
}
