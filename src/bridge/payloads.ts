/**
 * 前端这一侧的**事件载荷形状**：`events.*` 那几条**推过来**的消息长什么样。
 *
 * 2026-09-27 从 `types.ts` 拆出来（那边当时 1009 行、顶破 1000 行硬线，
 * `docs/09` §4）。⚠️ **这一段和 `types.ts` 里那些命令返回类型是两回事**：
 * 命令是"我问一句、宿主答一句"，事件是"此刻发生了一件事"——那条现成的缝
 * 就是这里，所以拆的线画在这儿。
 *
 * ⚠️ `types.ts` 里有一行 `export * from "./payloads"`：**调用方看不见这次拆分**，
 * `import type { FileChangedPayload } from "@/bridge/types"` 这种写法照旧成立
 * （`ipc.ts` 当初拆出 `types.ts` 用的也是同一招）。
 *
 * ⚠️ 只有形状、没有行为：不 import `@tauri-apps/api`，也不 import 任何真值——
 * 下面那个 `import type` 只是为了 `DocId`，**编译后一行都不剩**，所以
 * 与 `types.ts` 之间那点循环引用在运行期不存在。
 */

import type { DocId } from "./types";

// ── 事件载荷 ──────────────────────────────────────────────────────────────
//
// ⚠️ 这三个是 `ipc.ts` 里 `on` / `events` 的载荷形状。它们和上面那些命令的
// 返回类型是**两回事**：命令是"我问一句、宿主答一句"，事件是"此刻发生了一件事"。
// 放在一起是因为它们都只是形状——**形状不分拉还是推**。

export interface NotifyPayload {
  plugin: string;
  message: string;
  level: "info" | "warn" | "error" | "success";
}

/** `events.pluginPanel` 的载荷。`id` 为 `null` = 那个插件的面板都该重拉。 */
export interface PanelDirtyPayload {
  plugin: string;
  id: string | null;
}

/**
 * `events.pluginStream` 的载荷（2026-10-04 加，`docs/07` 第 58 项）。
 *
 * ⚠️ **这一条带着内容**（`text`），是 `pluginPanel` 那条的例外，也是整个
 * `events.*` 里唯一一条"推内容"的——理由在 `ipc.ts::events.pluginStream`
 * 和 `src-tauri/src/lua/api/ui.rs::实时表` 顶上写着（跑命令时宿主握着
 * `plugins` 锁，拉那条路回不来）。
 *
 * ⚠️ 只有 `plugin`、**没有 `id`**：宿主那边（`ui.rs::实时表`）只知道是哪个
 * 插件在吐字。一个插件同时开两个面板一起吐字的话，这段字会落到**那个插件
 * 当前显示的那一页**上。眼下只有 AI 一家用得上，真出现第二家再谈。
 *
 * ⚠️ `text` 为空 = **收工**（把这段撤掉）。它**从来不是**面板的真内容：
 * 真内容永远来自 `api.plugin.panelContent` 那条拉的路。
 */
export interface PanelStreamPayload {
  plugin: string;
  text: string;
}

export interface DocumentChangedPayload {
  id: DocId;
  text: string;
  /** 谁改的：`"plugin"`（Lua 插件的 `document.write`）或 `"mcp"`
   *  （AI 客户端经 `nota_write`，2026-09-27 加）。两者前端都**照单全收**
   *  覆盖编辑器；宿主自身的改动前端本来就知道，不会走这条。 */
  origin?: string;
}

/**
 * `events.documentEdit` 的载荷：**插件要编辑器在光标处改一笔**
 * （`docs/07` 第 14 项，2026-10-04 加）。
 *
 * ⚠️ 与 `DocumentChangedPayload` 的分工是这个设计的全部内容：那条是
 * **"正文已经换了"**（宿主改完镜像再通知，前端整篇 `setMarkdown`），
 * 这条是**"请你替我改"**——宿主**改不动**，因为"在光标处插一段"在 markdown
 * 里没有对应的偏移（量测见 `editor/caret-snapshot.ts` 顶上那张表）。
 *
 * ⚠️ 所以它**丢了就是丢了**（编辑区没挂载、瞄的不是当前文档、当前实例只读都会
 * 静默丢掉）：宿主那条路做不到这件事，报错也没用。真正的代价只有一条——
 * 插件发出的改动落了空，而文档一个字没动（比"结构被拼坏、存盘才发现"好）。
 */
export interface DocumentEditPayload {
  id: DocId;
  /** 这一笔要做什么。今天只有一种，留成字段是为了将来加（比如"替换整块"）。 */
  op: "insert-at-cursor";
  /** 要插入的文本。**非空**——空串在宿主那侧就被拒了。 */
  text: string;
}

/**
 * `events.fileChanged` 的载荷：**磁盘上那份文件被别的程序改了**。
 *
 * 用户 2026-09-26 点的那条（「加入对本地其他程序修改后提示支持」，非插件）。
 * 发现那一半在宿主（`src-tauri/src/watch.rs`），三个动作全在前端
 *（`ui/useExternalChanges.ts`）：忽略 / 重新载入 / 查看修改。
 *
 * ⚠️ **载荷里没有磁盘文本**，只有"哪一份 + 磁盘上现在是什么摘要"。理由与
 * BUG-13 那条判据同一路：事件只报"发生了一件事"，**内容要用的时候去拉**
 *（`api.doc.diskText`）。把整篇正文塞进事件里，等于把"这份文档现在多大"
 * 变成一条 IPC 消息的大小，而绝大多数提示用户是直接忽略掉的。
 * 摘要留着是因为前端要拿它判"这条提示还是不是同一次改动"（点过「忽略」
 * 之后宿主不再报，但**同一份文件连着被改两次**是两件事）。
 *
 * ⚠️ `path` 是**载荷里带的那一份**，不是前端现查的：事件发出来的那一刻
 * 磁盘上就是它。用户可能正好在这 250ms 里按了「另存为」，那时前端手里的
 * 路径已经是新的了，拿它去比会对不上。
 */
export interface FileChangedPayload {
  id: DocId;
  path: string;
  /** 磁盘上那份内容此刻的摘要（FNV-1a，见 `watch.rs::摘要`）。 */
  hash: string;
}

/**
 * `events.secondInstance` 的载荷：**用户又启动了一次 Nota**（2026-09-27）。
 *
 * 单实例（`src-tauri/src/single_instance.rs`）把第二次启动的参数转交给已经在跑的
 * 那一份，宿主再把"要打开什么"推过来。窗口**已经**被宿主抬起来了
 *（`unminimize` ＋ `set_focus`），所以前端这边只管"要不要再开一份文档"。
 *
 * ⚠️ **两个字段都为空是正常情况**：用户只是又点了一次图标（或者从菜单里
 * 再点一次启动器），他那一下要的就是"把窗口给我找回来"——那件事宿主已经做完了，
 * 前端**一个字都不用说**。别为这一种情况弹提示条，那是最常见的一帧。
 *
 * ⚠️ `error` 有值只可能是**非 UTF-8 的路径**（`paths::path_to_string` 的产物），
 * 与 `path` 互斥。⚠️ 要如实报出去：`cli.rs` 顶上那段记着同样的坑——静默吞掉
 * 它的表现是"用户双击一个文件，界面上什么都不发生"，而那看起来像文件丢了。
 */
export interface SecondInstancePayload {
  path: string | null;
  error: string | null;
}
