/**
 * 插件在界面上那几句**人话**：它从哪儿来、签没签、语言对不对得上、能力叫什么、
 * 面板摆在哪儿。
 *
 * # 为什么单独一个文件（2026-09-27）
 *
 * 这几句话原先散在两个文件里：`PluginDock.tsx` 有「来源说明 / 语言对不上 /
 * 能力名 / 位置名」，`usePlugins.ts` 另有一份「签名说明」。加了**「拓展」设置页**
 * （用户 2026-09-27：「完全没有拓展管理面板。做一个。可以导入，导出和卸载拓展」）
 * 之后，同一句「自装 · 已验证」要在**两个界面**上出现——右侧插件栏和设置里的
 * 拓展页。谁抄第二份，往后就会「改一处、另一处不动」，而那种不一致
 * **不报错**：两个界面各说各的，用户只会觉得自己看错了。
 *
 * ⚠️ 这里**只有文案**：没有 JSX、没有状态、不碰 `api`。摆成什么样归两个界面自己。
 *
 * ⚠️ **全是函数**，不是模块级常量表。两个理由（`PluginDock.tsx::能力名` 那段
 * 原先就写着的）：模块级求值时 `t` 还是没订阅的那个版本，首帧画的是兜底语言，
 * 而且之后**没有任何东西会通知它重画**；另外 `tools/i18n-check.sh` 数的是源码里
 * **字面写出来**的 `t("…")`，写成模块级的 `t(表[id])` 就不算调用，那些键会被
 * 判成废键 → 闸门 FAIL。
 *
 * ⚠️ 模块级的 `t`（不是 `useT()`）在这儿是**对的**：这些函数在**渲染期间**
 * 被调用，而调用它们的组件都订阅了语言（`useT`），语言一换就会重画、重取一遍。
 * 同 `usePlugins.ts` 顶上那段"为什么用模块级 t"。
 */

import type { PluginInfo, PluginPanel } from "@/bridge/ipc";
import { t } from "@/i18n";

/**
 * 验签结论的一句话。⚠️ 与后端 `installed::Signature::说明` **说的是同一套词**
 * （已验证 / 未知签名者 / 未签名）——两处不一致的话，同一个状态在 toast 里、
 * 在插件行上、在后端日志里会是三种说法。
 */
export function 签名说明(s: PluginInfo["signature"]): string {
  switch (s) {
    case "verified":
      return t("已验证");
    case "unknown":
      return t("未知签名者");
    case "unsigned":
      return t("未签名");
    default:
      // ⚠️ `null` 不是第四种签名结论，是"这笔账没记过"（内置插件、或者早于
      // 这套机制的记录）。说成「未签名」是**撒谎**：那些包里可能有签名。
      return t("来路没记过");
  }
}

/**
 * 一行插件旁边那句"它从哪儿来、签没签"，形如 `自装 · 已验证`。
 *
 * ⚠️ 判据是**目录落点**（`origin` 由宿主算好），不是"谁先扫到"——
 * 内置插件卸不掉，界面靠这一格决定给不给「卸载」那颗按钮。
 */
export function 来源说明(p: PluginInfo): string {
  const 来路 = p.origin === "user" ? t("自装") : t("内置");
  return `${来路} · ${签名说明(p.signature)}`;
}

/**
 * 这个插件**语言对不上**吗？对不上的话要显示那句「此插件不支持您的语言」。
 *
 * ⚠️ 判据是宿主算好的 `langs` + `lang_ok` 两格，**不在前端按 `lang` 猜一遍**：
 * "声明了 zh-CN 但少了那个文件"这种事只有宿主知道（见
 * `src-tauri/src/lua/api/i18n.rs`）。没声明 `langs` 的插件（`langs` 空）
 * 不参与协商，也就没有这句话——它是"只用一种语言写的"，不是"不支持你"。
 */
export function 语言对不上(p: PluginInfo): boolean {
  return p.langs.length > 0 && !p.lang_ok;
}

/** 那句提示。**一模一样的一句话**在三个地方（插件行、面板、编辑区预览）。 */
export function 语言提示(): string {
  return t("此拓展不支持您的语言");
}

/**
 * 语言标记（`en` / `zh-CN`）的中文名。
 *
 * ⚠️ **只认这两门应用自己支持的**语言，别的插件语言（`ja`、`pt-BR`）照原样
 * 露出来——那是插件的语言标记，我们不该替它编一个中文名
 * （见 `src-tauri/src/lang.rs::语言名` 那段：语言名要**用它自己那门语言写**，
 * 那件事只有插件的语言文件知道）。
 */
export function 语言标签名(tag: string): string | undefined {
  const 表: Record<string, string> = {
    en: t("英语"),
    "zh-CN": t("中文（简体）"),
  };
  return 表[tag];
}

/**
 * 能力 id → 人话。
 *
 * ⚠️ 键是 `docs/11` 那张能力表里的**原始 id**（`document.read` 之类），
 * 认不出的照原样显示；界面上同时留着原始 id（`title`），两样都要在：
 * 中文名是给用户看的，id 是给写清单的人对照文档用的。表在
 * `src-tauri/src/lua/api/mod.rs` 里校验，加一条能力要**两个文件一起改**。
 */
export function 能力名(tag: string): string | undefined {
  const 表: Record<string, string> = {
    "document.read": t("读当前文档"),
    "document.write": t("改当前文档"),
    "fs.read": t("读工作区文件"),
    "fs.write": t("写工作区文件"),
    "process.git": t("调 git"),
    "process.devserver": t("起开发服务器"),
    "network.http": t("发网络请求"),
    "ui.notify": t("弹通知"),
    "ui.open_url": t("打开浏览器"),
    "ui.panel": t("加侧栏面板"),
    "ui.menu": t("加菜单条目"),
    "settings.own": t("读写自己的设置"),
    // ⚠️ `data.own` 与 `settings.own` **是两条**（见 `manifest.rs` 上那段）：
    // 设置是"用户该能改的偏好"，数据是"插件自己写的账"。原先这张表里漏了它，
    // 界面上只能看到一个生 id——2026-09-27 集中到本文件时补上。
    "data.own": t("读写自己的数据"),
  };
  return 表[tag];
}

/**
 * 面板声明的位置 → 人话。认不出的位置照原样显示（那是给作者看的线索）。
 *
 * ⚠️ 目前只有两处落脚（右栏 / 编辑区），别的地方**还没有对应的地方**——
 * `PluginDock` 会给那些面板单列一段"哪儿都没显示"，理由写在那儿。
 */
export function 位置名(location: PluginPanel["location"]): string | undefined {
  const 表: Record<string, string> = {
    right: t("右栏"),
    main: t("编辑区"),
  };
  return 表[location];
}
