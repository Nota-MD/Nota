/**
 * 「帮助 → 关于 Nota」。
 *
 * 从 `App.tsx` 搬出来的（2026-09-25，本文件当时 918 行、软上限 900），理由和
 * 这个仓库里其他几次搬迁一样：**那支文件顶着行数上限**，而"取个版本号、弹一句话"
 * 和 `App.tsx` 编排的文档 / 插件 / 工作区三件事没有关系。
 *
 * # 四个判断
 *
 * 1. **版本号取不到照样要弹**。`getVersion()` 在开发构建、或者 `tauri.conf.json`
 *    缺字段时是会失败的——而「关于」**正是用户来查版本的地方**，在这里因为查不到
 *    版本而什么都不显示，是最坏的一种失败。
 * 2. **用自绘的确认框，不用 `window.confirm`/`alert`**：那两个会阻塞 WebView，
 *    把中文输入法的组合态打断（见 `ui/ConfirmDialog.tsx` 文件头）。`hideCancel`
 *    是因为这条只有"知道了"一个答案——摆一颗没有别的路的取消键是假的。
 * 3. **许可证与致谢写在同一句话里**（2026-09-26 加）。用户要求「关于菜单要支持：
 *    版本号显示；许可证显示(BSD2)；致谢列表（预留）」。做成一张**表 + 一段拼装**
 *    而不是一段写死的长字符串：加一个组件只在 `致谢` 那张表里添一行。
 * 4. **把向系统申请的权限一条不漏地列出来**（2026-09-26 加，用户要求：
 *    「在关于页面中，你应该把所有需要申请到的系统权限全部列出来」）。
 *    这一节是**给用户核对用的**——`权限` 那张表的每一条后面都写了出处，
 *    出处对得上才叫"列出来了"，对不上就只是"说了一句好听的话"。
 *
 * # 为什么不做成"自己一页界面"
 *
 * 原先的理由是"那份内容一共就三行字，为它单开一个对话框组件、一套样式、
 * 一套焦点管理，换来的只是能滚动"。**加了权限清单之后第一半不成立了**
 *（现在二十来行，确实要滚）——但结论没变，因为第二半还是成立的：
 * 滚动这件事**确认框已经能办**（`.confirm-message` 的 `max-height`），
 * 而"自绘对话框 + 焦点管理"这套东西本仓已经有三份（确认框 / 设置面板 /
 * 警报窗），再加第四份只为了少一个滚动条，不划算。
 *
 * ⚠️ 真到要**分节跳转 / 可折叠 / 带图标**的那天再拆，别在这条消息里继续堆。
 */

import { useCallback } from "react";
// ⚠️ 从 `@tauri-apps/api/app` 取，不是从 `package.json` 读：前者问的是**正在跑的
// 这个二进制**（Tauri 编译时注入的版本），后者在打包后根本不在旁边。
import { getVersion } from "@tauri-apps/api/app";

import { t } from "@/i18n";
import type { ConfirmAnswer, ConfirmRequest } from "@/ui/useDialogs";

/**
 * 本项目的许可证。
 *
 * ⚠️ 这个字符串要和根目录 `LICENSE`、`package.json` 的 `license` 字段、
 * `src-tauri/Cargo.toml` 的 `license` 字段**四处一致**。三处元数据写
 * `BSD-2-Clause`，这里的短名写成给人看的 `BSD-2`（用户要的就是这个写法）。
 */
const 许可证 = "BSD-2-Clause";

/**
 * @param askConfirm `ui/useDialogs.ts` 的「问一句」——本 hook 只负责凑那句话，
 *   **"谁来接答案"不在这里**（那条 Promise 归 `useDialogs` 管）。
 */
export function useAbout(
  askConfirm: (req: ConfirmRequest) => Promise<ConfirmAnswer>,
) {
  return useCallback(async () => {
    /**
     * 致谢名单。
     *
     * ⚠️ **这里是"预留"的那个位置**（用户 2026-09-26 的要求）：以后要加谁，
     * 在这张表里添一行就够，别去改下面那段拼装。
     *
     * ⚠️ 只写**真的用了、而且是用户看得见的那种**。完整的传递依赖闭包有几百个
     * （前端 + Rust 加起来），清单在根目录 `THIRD-PARTY.md`——这里放不下、
     * 也没人读，所以那句话里指过去。
     *
     * ⚠️ 名字照各项目自己的写法（`Tauri` 不是 `tauri`、`KaTeX` 不是 `katex`）；
     * 后面那半句是"它是干什么的"，用中文——这个框里没有第二处英文说明。
     *
     * ⚠️ 这张表**必须在这儿现建**，不能提到模块级当常量：模块级求值时语言还没
     * 定，`t("…")` 拿到的是兜底语言那一份，而且之后**没有任何东西会通知它重算**
     *（理由见 `ui/PluginDock.tsx::能力名` 与 `i18n/index.ts` 顶上那两段）。
     */
    const 致谢: readonly { 名: string; 用处: string }[] = [
      { 名: "Tauri", 用处: t("Desktop shell and windows") },
      { 名: "React", 用处: t("Interface") },
      { 名: "Milkdown / ProseMirror", 用处: t("Editor core") },
      { 名: "KaTeX", 用处: t("Math typesetting") },
      { 名: "Mermaid", 用处: t("Diagrams") },
      { 名: "mlua / Lua", 用处: t("Extension runtime") },
      // ⚠️ 这一条是**语言图标**的出处（代码框旁边那颗小图）。它和上面那些
      //    不一样的地方在于：图标是**直接搬进仓库**的（`src/assets/lang-icons/`），
      //    不是"引了个依赖"——所以 MIT 要求的那份版权声明必须随源码走，
      //    正文在根目录 `THIRD-PARTY.md` §6。
      { 名: "vscode-icons", 用处: t("Language icons for code blocks") },
      { 名: "Pandoc", 用处: t("Export (external, optional)") },
      // ⚠️ 这一条是**拼写检查的词典**那一半（2026-09-28 加，用户点名：
      //    「拼写检查找一个 BSD 开源的属个名」）。⚠️ **Nota 一个字典字节都不带**：
      //    整条链子是「WebKitGTK → libenchant → hunspell → 系统装的字典」，
      //    所以这一行的义务落点在**打包**那一侧（谁把字典打进安装包，谁得随包
      //    附上那段声明）。BSD 的那一件是 SCOWL（Kevin Atkinson），正文在根目录
      //    `THIRD-PARTY.md` §7。
      { 名: "SCOWL", 用处: t("Spell checking word lists") },
    ];
    /**
     * 向系统申请的权限，**一条不漏**。
     *
     * ⚠️⚠️ **这张表是"声明"，实现是另一处代码——两处对不上就是撒谎。**
     * 每一条的出处：
     *
     * - 前三条 = `src-tauri/capabilities/default.json` 的 `permissions` 数组
     *   （Tauri 的能力清单，逐条对着抄的；`core:default` 那条是一整包默认权限，
     *   里面没有文件、网络、外设这一类东西，所以不单列）；
     * - 第 4 条 = `src-tauri/tauri.conf.json` 的 `app.security.assetProtocol.scope`
     *   和同一个文件里的 `app.security.csp`；
     * - 其余 = 我们自己的 `#[tauri::command]` 实际干的事（`src-tauri/src/commands/`、
     *   `src-tauri/src/focus/`）。
     *
     * ⚠️ 改了上面任何一处，**这一张表要在同一批里跟着改**——理由和
     * `tools/doc-sync-check.sh` 管着的那批文档一样：一处声明、一处实现，
     * 只有同批改才拦得住"声明漂到实现前面去"。
     *
     * ⚠️ 措辞**宁细勿粗**：写"读写文件"是没用的（谁读、读哪儿、什么时候），
     * 用户要能拿这句话去反驳我们。
     */
    const 权限: readonly { 名: string; 说明: string }[] = [
      {
        名: t("Managing its own window"),
        说明: t(
          "Dragging the window, changing the title-bar text, the full-screen toggle, page zoom, and opening the developer tools (core:window:* and core:webview:* in capabilities/default.json). These apply only to Nota's own window; they cannot touch other applications.",
        ),
      },
      {
        名: t("System file dialogs"),
        说明: t(
          "Open files, Save As, message boxes, question boxes (dialog:allow-open/save/message/ask). These use the system's own dialogs, and you choose which file.",
        ),
      },
      {
        名: t("Open links with the default application"),
        说明: t(
          "Handing external links in the document to the system (opener:allow-open-url); no web page is ever opened inside Nota.",
        ),
      },
      {
        名: t("Reading images under your home folder (read-only)"),
        说明: t(
          "Image files in your home, Documents, Desktop, and Downloads folders can be read and shown inside the document (assetProtocol.scope). ⚠️ Note: this range is wider than “the folder you opened” — an image can be any absolute path, and the interface has to be able to show it. They are read as images only: never written, never changed, never sent anywhere.",
        ),
      },
      {
        名: t("The interface layer cannot go online on its own"),
        说明: t(
          "The content security policy allows connect-src only for itself and internal IPC (tauri.conf.json's csp), so even if someone slipped code into the interface, it could not send a request.",
        ),
      },
      {
        名: t("Reading and writing the files and folders you open"),
        说明: t(
          "Open, edit, save, Save As; inside a workspace folder it also watches for file changes (inotify), to tell you “this file was changed elsewhere”. ⚠️ It watches only the folder you opened.",
        ),
      },
      {
        名: t("Clipboard"),
        说明: t("Copy, cut, and paste."),
      },
      {
        名: t("Starting external processes"),
        说明: t(
          "The export formats call pandoc (an external program, optional); the Git extension calls git; Force Focus calls the system bell program when the alarm sounds (canberra-gtk-play or aplay). ⚠️ All short-lived processes that exit when done; nothing stays resident.",
        ),
      },
      {
        名: t("Networking (only when you have configured it)"),
        说明: t(
          "Only an extension you have enabled that explicitly asks for the nota.http capability, and only to an address that passes its own allowlist, will make a network request. The core features themselves send nothing.",
        ),
      },
      {
        名: t("The three things Force Focus uses"),
        说明: t(
          "① Knowing whether Nota's own window is the active window; ② putting up a full-screen always-on-top window; ③ making a sound. ⚠️ Those three, and only after you press View → Force Focus. It does not read the keyboard, take screenshots, or look at other applications.",
        ),
      },
    ];

    /**
     * 明确**没有**申请的。列出来比不列有用得多：上面那张表说"要了什么"，
     * 这张说"没要什么"——用户真正想知道的是后者。
     *
     * ⚠️ 只写**能验证的**。"我们不会偷看你的隐私"这种话不写在这里，
     * 那不是权限，是承诺；这一节讲的是**权限**，所以只写"没申请哪一项能力"。
     */
    const 没申请: readonly string[] = [
      t(
        "Reading keyboard input: no global shortcuts, no keyboard hooks — every shortcut is received only while Nota's own window has focus",
      ),
      t("Taking screenshots or recordings, or reading the camera or microphone"),
      t("Reading other applications' window titles, process lists, or which app is in use (Force Focus does not look either)"),
      t("Starting at login, installing system services, or staying in the background after you quit"),
      t(
        "Reading and writing arbitrary paths through Tauri's file plugin: `tauri-plugin-fs` is installed, but no `fs:*` permission is granted, so the interface cannot call it — all reads and writes go through our own commands",
      ),
      t("Reading your disk while no file is open (apart from the read-only image range in item 4 above)"),
      t("Going online without you having configured it"),
    ];

    // 版本号取不到时显示的占位。⚠️ 不写"未知版本"之类更像回事的词——如实说不知道。
    // ⚠️ 它和上面那张表一样是**现取的**，不是模块级常量（理由同上）。
    let version = t("Unknown");
    try {
      version = await getVersion();
    } catch {
      // 见文件头第 1 条：取不到就照弹，只是版本那格写"未知"。
    }
    const 名单 = 致谢.map(({ 名, 用处 }) => `${名}（${用处}）`).join("、");
    // ⚠️ 只缩进**续行**，不缩进条目的第一行：`.confirm-message` 是 `pre-line`，
    // 缩进会原样画出来。`· ` 开头 + 换行 + 四个空格 = 一条一块，读得清。
    const 列 = (表: readonly { 名: string; 说明: string }[]) =>
      表.map(({ 名, 说明 }) => `· ${名}\n    ${说明}`).join("\n");
    await askConfirm({
      title: t("About Nota"),
      message: [
        `Nota ${version}`,
        t("A WYSIWYG Markdown editor with a Luan extension system."),
        "",
        t("License: {0} (the LICENSE file shipped with the source).", 许可证),
        t("Credits: {0}.", 名单),
        t("The complete list, with each license, is in THIRD-PARTY.md, shipped with the source."),
        "",
        t("── Every system permission Nota asks for ──"),
        t("(Each one is followed by its source; open that file if you want to check for yourself)"),
        "",
        列(权限),
        "",
        t("── What it does not ask for ──"),
        "",
        没申请.map((一条) => `· ${一条}`).join("\n"),
      ].join("\n"),
      confirmLabel: t("OK"),
      hideCancel: true,
    });
  }, [askConfirm]);
}
