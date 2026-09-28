/**
 * 「帮助 → 关于 Nota」那张框（2026-09-28 按 GNOME 的关于窗重做）。
 *
 * 用户原话：「关于界面这么做。版本用0.3，网站先不填写。」并附了一张
 * GNOME「终端」关于窗的截图：**大图标 ＋ 名字 ＋ 作者 ＋ 版本药丸**，底下两组行
 * ——「网站／报告问题」是外链、「故障排除／鸣谢／法律信息」是子页（行尾一个 `›`）。
 *
 * # 为什么以前不是这样
 *
 * 它原来是一个 `ConfirmDialog`，正文是一大段文本（版本 ＋ 许可证 ＋ 致谢 ＋
 * 系统权限清单，二十来行）。那个做法当年是**算过账的**：`ui/useAbout.ts` 的
 * 文件头写着"为它单开一个对话框组件、一套样式、一套焦点管理，换来的只是能滚动"，
 * 最后一句是「真到要**分节跳转 / 可折叠 / 带图标**的那天再拆」。**那天到了**，
 * 于是照那张截图拆：图标与版本药丸是新的，分节是新的。
 *
 * # 这一次重做带走的东西（两处，都在别的文件里）
 *
 * 1. **`ui/useAbout.ts` 没有了。** 它的**内容**（致谢表 / 权限表 / 没申请表 /
 *    许可证）整个搬进本文件；它的**状态**（开着 / 开 / 关）搬进
 *    `ui/useDialogs.ts`——那是"浮层那一族的开关"该待的地方，`ui/AppDialogs.tsx`
 *    已经拿着那个对象了，`App.tsx` 因此一行都不用多（那个文件当时 **998** 行，
 *    贴着 1000 的硬线，见 `docs/09` §4）。
 * 2. **`App.tsx` 里 `有浮层` 多了一条**（关于框开着时 `Esc` 该归它，见
 *    `ui/useImmersive.ts` 那一格："要逐个列在调用处"）。
 *
 * # 三条设计口径
 *
 * ① **版本号取不到照样要弹**（这条从 `useAbout.ts` 原样继承）。`getVersion()`
 *    在开发构建、或者 `tauri.conf.json` 缺字段时是会失败的——而「关于」
 *    **正是用户来查版本的地方**，在这里因为查不到版本而什么都不显示，是最坏的
 *    一种失败。所以先按 `Unknown` 画，取到了再换。
 * ② **空着的行不画。** 用户这次说「网站先不填写」，于是 `网站` / `问题反馈`
 *    两个常量是空串，那两行**根本不出现在界面上**——画一颗点了什么都不发生的
 *    按钮，比少一行更像是坏了。填上就出现（改那两个常量）。
 * ③ **两张表在渲染里现建，不是模块级常量。** `t("…")` 要等语言定下来才有正确
 *    的译文，而模块级求值时语言还没定、之后**没有任何东西会通知它重算**
 *    （理由见 `i18n/index.ts::useT` 与 `ui/PluginDock.tsx::能力名`）。
 *
 * # ⚠️ 那两样**没有照着截图做**的
 *
 * - **行尾的记号**：子页那几行是 `›`、外链那两行是 `↗`，都是**文本字形**，
 *   不是图标。本仓那 96 枚 Folio 图标里**没有** chevron / 外链箭头
 *   （`ui/Icon.tsx` 的名字表里没有这两样），而为一个字符加一枚资源不划算。
 *   ⚠️ 将来真加了图标，改的是本文件里那两处 `<span className="about-mark">`。
 * - **助记键那对括号**（截图里的「网站(W)」）：**做了**，走 HTML 的 `accesskey`
 *   （`Alt+W` 那一套）。⚠️ 本仓菜单栏占用的 `Alt` 组合是 `M` / `P` / `↑` / `↓` /
 *   `1`–`5`（`ui/commands.ts`），`W` / `R` / `T` / `C` / `L` 五个都空着，
 *   所以不撞。⚠️ 但 `accesskey` 在 WebKitGTK 上到底认不认**没开窗验过**，
 *   这一条记在 `docs/07` 的账里（`docs/10` 那一格是 🟡 的理由）。
 *
 * ⚠️ 壳（`.confirm-backdrop` / `.confirm-dialog`）与别的框**共用**：长得一样、
 * 行为也一样（`Esc` 关、点遮罩关），样式不该有两套（`styles/overlay.css` 文件头
 * 那段"四段用的是同一层壳"）。本文件只加 `.about-*` 那几条。
 */

import { useEffect, useRef, useState } from "react";
// ⚠️ 从 `@tauri-apps/api/app` 取，不是从 `package.json` 读：前者问的是**正在跑的
// 这个二进制**（Tauri 编译时注入的版本），后者在打包后根本不在旁边。
import { getVersion } from "@tauri-apps/api/app";
// 外链交给系统浏览器。⚠️ 是 `openUrl` 不是 `openPath`，权限也分开管
//（`capabilities/default.json` 里开的是 `opener:allow-open-url`）。
import { openUrl } from "@tauri-apps/plugin-opener";

import { useT } from "@/i18n";
import { Icon } from "@/ui/Icon";
// 应用标识的**唯一手写源**是 `src-tauri/icons/nota.svg`，这里借分享图那一套
// 嵌法（`标识()` 顺带做 id 改名与圆角裁剪），不再画第二遍。
import { 标识, 标识视图 } from "@/ui/nota-mark";

/**
 * 三个子页。`null` ＝ 首页那一列行。
 *
 * ⚠️ 值写成中文是**内部标识**，不显示给用户（标题走下面 `页标题()` 里那张表的
 * `t("…")`）——所以它不进 i18n 表，也别拿它去拼界面文字。
 */
type 页 = null | "故障排除" | "鸣谢" | "法律信息";

/**
 * 外面那两行要的网址。**今天是空的**（见文件头口径 ②），空着的行不画。
 *
 * ⚠️ 填的时候用**能直接交给浏览器**的完整地址（`https://…`）。
 * 「报告问题」那一格是本仓的 issue 地址。
 */
const 网站 = "";
const 问题反馈 = "";

/** 本项目的许可证。⚠️ 与根目录 `LICENSE`、`package.json`、`Cargo.toml` 四处一致。 */
const 许可证 = "BSD-2-Clause";

/** 一行「外链」：点它交给系统浏览器。 */
interface 外链行 {
  /** 助记键，小写一个字母（`accesskey` 用它，界面上画成 `(W)`）。 */
  键: string;
  标签: string;
  网址: string;
}

/** 一行「子页」：点它翻到里面那一页。 */
interface 子页行 {
  键: string;
  标签: string;
  页: Exclude<页, null>;
}

export function AboutDialog({ onClose }: { onClose: () => void }) {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  // 见文件头口径 ①：先按"不知道"画，取到了再换——取不到就一直是这一句。
  const [版本, set版本] = useState(() => t("Unknown"));
  const [页, 设页] = useState<页>(null);
  /** 当前这一页**最上面那颗按钮**（首页是 ×，子页是返回）。进框/换页时给它焦点。 */
  const 头一颗 = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let 还在 = true;
    getVersion()
      .then((v) => {
        if (还在) set版本(v);
      })
      .catch(() => {
        // 见文件头口径 ①：取不到就照弹，版本那格写「Unknown」。
      });
    return () => {
      还在 = false;
    };
  }, []);

  // `Esc` 关掉。⚠️ **绑在 window 上**，和 `ConfirmDialog` 同一条理由：焦点可能
  // 还没落进来（用户在它出现前就把手放在键盘上了）。
  useEffect(() => {
    const 按键 = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      // ⚠️ 在子页里 `Esc` 也是**关掉整个框**，不是退回首页：这一层没有"没保存
      // 的东西"，而用户按 `Esc` 想要的从来是"把这块东西收起来"。
      onClose();
    };
    window.addEventListener("keydown", 按键);
    return () => window.removeEventListener("keydown", 按键);
  }, [onClose]);

  // 焦点跟着"当前页最上面那颗按钮"走（换页也要重给一次，否则翻进子页之后
  // 焦点还留在上一页被卸载掉的那颗按钮上——那时 `Tab` 会从文档开头重新数）。
  useEffect(() => {
    头一颗.current?.focus();
  }, [页]);

  /**
   * 致谢名单。
   *
   * ⚠️ **只写"真的用了、而且是用户看得见的那种"**。完整的传递依赖闭包有几百个
   * （前端 + Rust 加起来），清单在根目录 `THIRD-PARTY.md`——这里放不下、也没人读，
   * 所以页面底下那句话里指过去。
   *
   * ⚠️ 名字照各项目自己的写法（`Tauri` 不是 `tauri`、`KaTeX` 不是 `katex`）。
   */
  const 致谢: readonly { 名: string; 用处: string }[] = [
    { 名: "Tauri", 用处: t("Desktop shell and windows") },
    { 名: "React", 用处: t("Interface") },
    { 名: "Milkdown / ProseMirror", 用处: t("Editor core") },
    { 名: "KaTeX", 用处: t("Math typesetting") },
    { 名: "Mermaid", 用处: t("Diagrams") },
    { 名: "mlua / Lua", 用处: t("Extension runtime") },
    // ⚠️ 这一条是**语言图标**的出处（代码框旁边那颗小图）。它和上面那些不一样
    // 的地方在于：图标是**直接搬进仓库**的（`src/assets/lang-icons/`），不是
    // "引了个依赖"——所以 MIT 要求的那份版权声明必须随源码走，正文在
    // `THIRD-PARTY.md` §6。
    { 名: "vscode-icons", 用处: t("Language icons for code blocks") },
    { 名: "Pandoc", 用处: t("Export (external, optional)") },
    // ⚠️ 这一条是**拼写检查的词典**那一半（2026-09-28 加，用户点名：
    // 「拼写检查找一个 BSD 开源的属个名」）。⚠️ **Nota 一个字典字节都不带**：
    // 整条链子是「WebKitGTK → libenchant → hunspell → 系统装的字典」，所以这一行
    // 的义务落点在**打包**那一侧（谁把字典打进安装包，谁得随包附上那段声明）。
    // BSD 的那一件是 SCOWL（Kevin Atkinson），正文在 `THIRD-PARTY.md` §7。
    { 名: "SCOWL", 用处: t("Spell checking word lists") },
  ];

  /**
   * 向系统申请的权限，**一条不漏**。
   *
   * ⚠️⚠️ **这张表是"声明"，实现是另一处代码——两处对不上就是撒谎。** 每一条的
   * 出处：
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
   * `tools/doc-sync-check.sh` 管着的那批文档一样：一处声明、一处实现，只有同批改
   * 才拦得住"声明漂到实现前面去"。
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
    { 名: t("Clipboard"), 说明: t("Copy, cut, and paste.") },
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
   * 明确**没有**申请的。列出来比不列有用得多：上面那张表说"要了什么"，这张说
   * "没要什么"——用户真正想知道的是后者。
   *
   * ⚠️ 只写**能验证的**。"我们不会偷看你的隐私"这种话不写在这里，那不是权限，
   * 是承诺；这一节讲的是**权限**，所以只写"没申请哪一项能力"。
   */
  const 没申请: readonly string[] = [
    t(
      "Reading keyboard input: no global shortcuts, no keyboard hooks — every shortcut is received only while Nota's own window has focus",
    ),
    t("Taking screenshots or recordings, or reading the camera or microphone"),
    t(
      "Reading other applications' window titles, process lists, or which app is in use (Force Focus does not look either)",
    ),
    t(
      "Starting at login, installing system services, or staying in the background after you quit",
    ),
    t(
      "Reading and writing arbitrary paths through Tauri's file plugin: `tauri-plugin-fs` is installed, but no `fs:*` permission is granted, so the interface cannot call it — all reads and writes go through our own commands",
    ),
    t(
      "Reading your disk while no file is open (apart from the read-only image range in item 4 above)",
    ),
    t("Going online without you having configured it"),
  ];

  /** 子页的标题（首页那三个行的字复用同一张表）。 */
  const 页标题: Record<Exclude<页, null>, string> = {
    故障排除: t("Troubleshooting"),
    鸣谢: t("Credits"),
    法律信息: t("Legal"),
  };

  const 子页行: readonly 子页行[] = [
    { 键: "t", 标签: t("Troubleshooting"), 页: "故障排除" },
    { 键: "c", 标签: t("Credits"), 页: "鸣谢" },
    { 键: "l", 标签: t("Legal"), 页: "法律信息" },
  ];

  // 见文件头口径 ②：网址是空串的行**根本不画**。
  const 外链行: readonly 外链行[] = [
    { 键: "w", 标签: t("Website"), 网址: 网站 },
    { 键: "r", 标签: t("Report an Issue"), 网址: 问题反馈 },
  ].filter((行) => 行.网址 !== "");

  /** 一颗「行」按钮的共同长相：标签 ＋ 行尾那颗记号（`›` / `↗`）。 */
  const 行壳 = (
    行: { 键: string; 标签: string },
    记号: string,
    点: () => void,
  ) => (
    <button type="button" className="about-row" accessKey={行.键} onClick={点}>
      <span className="about-row-label">
        {行.标签}
        {/* 助记键那对括号（见文件头）。⚠️ 大写显示、`accesskey` 用小写，
            两边是同一个字母——所以这里 `toUpperCase()` 而不是再抄一遍。 */}
        <span className="about-row-key">({行.键.toUpperCase()})</span>
      </span>
      <span className="about-mark" aria-hidden="true">
        {记号}
      </span>
    </button>
  );

  return (
    // 点遮罩 = 关掉，和别的框同一条约定（`ConfirmDialog` / `ImageDialog`）。
    <div
      className="confirm-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="confirm-dialog about-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("About Nota")}
      >
        {/* × 固定在右上角（截图里也在那儿）。⚠️ 它是**首页最上面那颗按钮**
            （`头一颗` 在首页指它），子页里那颗让给"返回"。 */}
        <button
          type="button"
          className="about-close"
          ref={页 === null ? 头一颗 : undefined}
          onClick={onClose}
          aria-label={t("Close")}
          title={t("Close")}
        >
          <Icon name="folio-close-symbolic" />
        </button>

        {页 === null ? (
          <div className="about-home">
            {/* 标识：`标识()` 给的是一段能嵌进别的 SVG 的**子元素**，所以外面这层
                只是个 128×128 的框；图标自己那张底衬只占画布 74%，所以实际画出来
                比 128 小一圈——那正是系统对话框的样子（图标自带留白）。 */}
            <svg
              className="about-icon"
              width={128}
              height={128}
              viewBox={标识视图}
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: 标识(0, 0, 1254, "about") }}
            />
            <div className="about-name">Nota</div>
            {/* ⚠️ 名字取自 `LICENSE` / `Cargo.toml` 的 `authors`。改那一行就是
                改这里显示的那一行——三处要么一起改，要么别改。 */}
            <div className="about-developer">{t("Nota contributors")}</div>
            <div className="about-version">{版本}</div>

            {/* 两组行。⚠️ 空数组时不画那一组（`外链行` 今天就是空的）。 */}
            {外链行.length > 0 && (
              <div className="about-rows">
                {外链行.map((行) =>
                  行壳(行, "↗", () => {
                    void openUrl(行.网址).catch(() => {
                      // 打不开就算了：这一条不改变文档、也不影响用户正在做的事，
                      // 弹一句"打不开"只会打断他（与 `useExport` 那条同一条口径）。
                    });
                  }),
                )}
              </div>
            )}

            <div className="about-rows">
              {子页行.map((行) => 行壳(行, "›", () => 设页(行.页)))}
            </div>
          </div>
        ) : (
          <div className="about-page">
            <div className="about-page-head">
              <button
                type="button"
                className="about-back"
                ref={头一颗}
                onClick={() => 设页(null)}
              >
                <span className="about-mark" aria-hidden="true">
                  ‹
                </span>
                {t("Back")}
              </button>
              <span className="about-page-title">{页标题[页]}</span>
            </div>

            <div className="about-page-body">
              {页 === "故障排除" && (
                <>
                  <p className="about-lead">
                    {t("Every system permission Nota asks for, each followed by its source.")}
                  </p>
                  {权限.map((条) => (
                    <div className="about-item" key={条.名}>
                      <div className="about-item-name">{条.名}</div>
                      <div className="about-item-text">{条.说明}</div>
                    </div>
                  ))}
                  <p className="about-lead">
                    {t("What it does not ask for")}
                  </p>
                  {没申请.map((条) => (
                    <div className="about-item" key={条}>
                      <div className="about-item-text">{条}</div>
                    </div>
                  ))}
                </>
              )}

              {页 === "鸣谢" && (
                <>
                  {致谢.map((条) => (
                    <div className="about-item" key={条.名}>
                      <div className="about-item-name">{条.名}</div>
                      <div className="about-item-text">{条.用处}</div>
                    </div>
                  ))}
                  <p className="about-lead">
                    {t(
                      "The complete list, with each license, is in THIRD-PARTY.md, shipped with the source.",
                    )}
                  </p>
                </>
              )}

              {页 === "法律信息" && (
                <>
                  <div className="about-item">
                    <div className="about-item-name">
                      {t("License: {0}", 许可证)}
                    </div>
                    <div className="about-item-text">
                      {t("The full text is in the LICENSE file shipped with the source.")}
                    </div>
                  </div>
                  <div className="about-item">
                    <div className="about-item-name">
                      {t("Copyright (c) 2026, Nota contributors")}
                    </div>
                    <div className="about-item-text">
                      {t("Nota is free software; you may redistribute it under the terms of that license.")}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
