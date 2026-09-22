/**
 * IPC 桥：**前端唯一允许直接 `invoke` 的地方**。
 *
 * 别处一律 `import { api } from "@/bridge/ipc"` 再调 `api.doc.save(...)`。
 * 理由不是洁癖：命令名是字符串，散在组件里改一次要全仓搜；集中在这里
 * 还能顺手把返回值的形状标出来（`invoke` 本身是 `any`，等于把类型安全丢在边界上）。
 *
 * 命名对应关系：`api.docSave` ↔ Rust 侧 `nota_doc_save` ↔ `commands::document::nota_doc_save`。
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ── 类型（与 Rust 侧的结构体一一对应）──────────────────────────────────────
//
// ⚠️ 改 Rust 侧字段时**必须同批改这里**。两边不一致时 `invoke` 不会报错，
// 只会给你一个少了字段的对象，然后在某个 `.map` 上炸掉。

export type DocId = number;

export interface Document {
  id: DocId;
  path: string | null;
  title: string;
  text: string;
  dirty: boolean;
  revision: number;
}

export interface TreeNode {
  name: string;
  /** 相对工作区根、以 `/` 分隔。可直接喂给 `nota.fs.read`。 */
  path: string;
  is_dir: boolean;
  children: TreeNode[] | null;
}

export type UiStyle = "auto" | "adwaita" | "macos" | "yaru" | "windows";
export type UiMode = "auto" | "light" | "dark";

export interface Settings {
  ui_style: UiStyle;
  ui_mode: UiMode;
  document_theme: string;
  ui_font_size: number;
  content_width: number;
  confirm_unsaved: boolean;
  autosave_seconds: number;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  authors: string[];
  license: string;
  capabilities: string[];
  entry: string;
  dir: string;
  state: "loaded" | "failed" | "disabled";
  error: string | null;
}

/**
 * 插件声明的面板。**拉来的，不是事件推的**——见 `api.plugin.panels` 的说明。
 */
export interface PluginPanel {
  /** 声明它的插件 id。 */
  plugin: string;
  /** 插件内部的 id。**加上 `plugin` 才是全局唯一的键。** */
  id: string;
  title: string;
  icon: string | null;
  /** `right`（右侧插件栏，默认）/ `left`（左侧栏）。 */
  location: string;
}

/**
 * 插件声明的菜单项。
 *
 * ⚠️ 目前**没有菜单栏来接**（`docs/07` 第 40 项），所以 `api.plugin.menus()`
 * 暂时没有调用者。类型先立在这里，菜单栏一落地就是接一根线的事。
 */
export interface PluginMenuItem {
  plugin: string;
  label: string;
  /** 点下去要调的**命令名**，配 `plugin.call(plugin, command)` 用。 */
  command: string;
  menu: string;
  accelerator: string | null;
}

// ── 文档 ──────────────────────────────────────────────────────────────────
export const api = {
  doc: {
    create: () => invoke<DocId>("nota_doc_new"),
    open: (path: string) => invoke<DocId>("nota_doc_open", { path }),
    /** 前端推文本给后端。返回新 revision。 */
    sync: (id: DocId, text: string) => invoke<number>("nota_doc_sync", { id, text }),
    save: (id: DocId, path?: string) =>
      invoke<string>("nota_doc_save", { id, path: path ?? null }),
    close: (id: DocId) => invoke<void>("nota_doc_close", { id }),
    setActive: (id: DocId) => invoke<void>("nota_doc_set_active", { id }),
    get: (id: DocId) => invoke<Document>("nota_doc_get", { id }),
    list: () => invoke<Document[]>("nota_doc_list"),
    reload: (id: DocId) => invoke<Document>("nota_doc_reload", { id }),
    hasUnsaved: () => invoke<boolean>("nota_doc_has_unsaved"),
  },

  workspace: {
    open: (path: string) => invoke<string>("nota_workspace_open", { path }),
    close: () => invoke<void>("nota_workspace_close"),
    get: () => invoke<string | null>("nota_workspace_get"),
    tree: (subPath?: string, depth?: number) =>
      invoke<TreeNode[]>("nota_workspace_tree", {
        subPath: subPath ?? null,
        depth: depth ?? 1,
      }),
  },

  settings: {
    get: () => invoke<Settings>("nota_settings_get"),
    set: (settings: Settings) => invoke<void>("nota_settings_set", { settings }),
  },

  plugin: {
    list: () => invoke<PluginInfo[]>("nota_plugins_list"),
    setEnabled: (id: string, enabled: boolean) =>
      invoke<void>("nota_plugin_set_enabled", { id, enabled }),
    /**
     * 调插件命令。`plugin` **必须**是注册者自己的 id——
     * 别凭命令名去猜（见 `commands/plugin.rs` 里的告诫）。
     */
    call: (plugin: string, command: string, args?: unknown) =>
      invoke<unknown>("nota_plugin_call", { plugin, command, args: args ?? null }),
    findCommand: (command: string) =>
      invoke<string | null>("nota_plugin_find_command", { command }),

    /**
     * 插件声明的面板。**挂载后主动拉一次。**
     *
     * ⚠️ 早先这里配的是 `nota:plugin-panel` 事件，前端一个订阅者都没有，
     * 于是面板永远进不了界面（BUG-13）。**别把这条改回事件**：
     * `register_panel` 是在**插件加载时**（`setup()` 阶段）跑的，
     * 那时前端还没挂载，事件发出去没人收而且不报错——必漏，且漏得安静。
     *
     * ⚠️ 什么时候需要重拉：面板清单只在**插件加载**时定，而加载只发生在启动
     * （启用/禁用**不重跑** `on_load`）。所以现在启动拉一次就够。
     * **哪天界面上有了启用/禁用开关，记得在那里也重拉**——`PluginHost::生效的()`
     * 是按"加载成功且没被禁用"筛的，禁用之后面板该从清单里消失。
     */
    panels: () => invoke<PluginPanel[]>("nota_plugin_panels"),

    /** 插件声明的菜单项。范式同 `panels()`。菜单栏还没做，暂无调用者。 */
    menus: () => invoke<PluginMenuItem[]>("nota_plugin_menus"),
  },

  /** 前端就绪握手。见 `lib.rs::nota_frontend_ready` 里那段"为什么需要"。 */
  frontendReady: () => invoke<void>("nota_frontend_ready"),
};

// ── 事件 ──────────────────────────────────────────────────────────────────

export interface NotifyPayload {
  plugin: string;
  message: string;
  level: "info" | "warn" | "error" | "success";
}

export interface DocumentChangedPayload {
  id: DocId;
  text: string;
  /** `"plugin"` 表示改动来自插件，前端要**照单全收**覆盖编辑器；
   *  宿主自身的改动前端本来就知道，不会走这条。 */
  origin?: string;
}

/**
 * 订阅一个宿主事件。返回退订函数——**组件卸载时一定要调**，
 * 不然热重载几轮之后同一个事件会有好几个监听者，一次通知弹好几遍。
 */
export function on<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  return listen<T>(event, (e) => handler(e.payload));
}

/**
 * 宿主事件名。
 *
 * ⚠️ 这里只该有**"此刻发生了一件事"**的事件。**声明类的东西不走事件**——
 * 面板/菜单/命令是"插件启动时声明了一次、之后一直成立"的状态，走
 * `api.plugin.panels()` / `menus()` / `findCommand()` 去**拉**。
 *
 * 曾经这里有 `pluginPanel` / `pluginMenu` 两条，前后端各写好了类型，
 * 却**一个订阅者都没有**——插件在 `setup()` 里注册、前端挂载后才 `listen()`，
 * 时序上必漏，而且 Tauri 对没有监听者的频道 emit 是**静默成功**的，
 * 日志里连痕迹都没有。见 BUG-13。
 */
export const events = {
  notify: "nota:notify",
  documentChanged: "nota:document-changed",
} as const;
