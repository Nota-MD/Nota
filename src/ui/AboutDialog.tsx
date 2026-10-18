/**
 * 「帮助 → 关于 Nota」那张框（2026-09-28 按 GNOME 的关于窗重做；
 * **2026-10-04 又改了一次**，见下）。
 *
 * 用户原话（第一版）：「关于界面这么做。版本用0.3，网站先不填写。」并附了一张
 * GNOME「终端」关于窗的截图：**大图标 ＋ 名字 ＋ 作者 ＋ 版本药丸**，底下两组行
 * ——「网站／报告问题」是外链、子页那几行是子页（行尾一个 `›`）。
 *
 * # 2026-10-04 这一次改了什么（用户三句话）
 *
 * > 「"故障排除"记录编译信息（比如编译时间戳，机器，各编译工具依赖）」
 * > 「法律信息用超链接显示"bsd-2条款许可证"，点击打开窗口独立展示」
 * > 「故障排除用于存放编译信息和本机信息。专门新开一栏叫做权限列表。
 * >   用表格的形式展示权限说明和备注。」
 *
 * 于是本文件做了四件事：
 *
 * 1. **故障排除 = 两张表**（编译信息 / 本机信息），数据来自
 *    `api.diagnostics.collect()`（`src-tauri/src/diagnostics.rs`）。它以前
 *    装的是权限清单，那些**整段搬走**了。
 * 2. **多了一页「权限列表」**：权限不再是"名字 ＋ 一段话"的清单，而是一张
 *    **两列表格**（权限说明 ｜ 备注）——用户点名要表格。
 * 3. **法律信息里的许可证名是超链接**：点它开 `ui/LicenseDialog.tsx`
 *    （**另一个框**，全文从仓库根 `LICENSE` 读，不抄第二份）。
 * 4. ⚠️ **删掉了两大段说明**：「什么没申请」那一列七条，以及鸣谢页底下那句
 *    "完整清单在 THIRD-PARTY.md"。用户这一轮的总口径是**全删**（"删掉各种
 *    菜单下面大段大段的无用ai味描述"），而这两段正是那一类。**要加回来，
 *    加在这里**——别的地方没有它们的影子了。
 *
 * # 第一版留下的三条设计口径（都还有效）
 *
 * ① **版本号取不到照样要弹。** `getVersion()` 在开发构建、或者 `tauri.conf.json`
 *    缺字段时是会失败的——而「关于」**正是用户来查版本的地方**，在这里因为
 *    查不到版本而什么都不显示，是最坏的一种失败。所以先按 `Unknown` 画，
 *    取到了再换。
 * ② **空着的行不画。** 用户说「网站先不填写」，于是 `网站` / `问题反馈`
 *    两个常量是空串，那两行**根本不出现在界面上**——画一颗点了什么都不发生的
 *    按钮，比少一行更像是坏了。填上就出现（改那两个常量）。
 * ③ **表在渲染里现建，不是模块级常量。** `t("…")` 要等语言定下来才有正确
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
 *   `1`–`5`（`ui/commands.ts`），`W` / `R` / `T` / `P` / `C` / `L` 都空着，
 *   所以不撞。⚠️ 但 `accesskey` 在 WebKitGTK 上到底认不认**没开窗验过**，
 *   这一条记在 `docs/07` 的账里。
 *
 * ⚠️ 壳（`.confirm-backdrop` / `.confirm-dialog`）与别的框**共用**：长得一样、
 * 行为也一样（`Esc` 关、点遮罩关），样式不该有两套（`styles/overlay.css` 文件头
 * 那段"五段用的是同一层壳"）。本文件只加 `.about-*` 那几条。
 */

import { useEffect, useRef, useState } from "react";
// ⚠️ 从 `@tauri-apps/api/app` 取，不是从 `package.json` 读：前者问的是**正在跑的
// 这个二进制**（Tauri 编译时注入的版本），后者在打包后根本不在旁边。
import { getVersion } from "@tauri-apps/api/app";
// 外链交给系统浏览器。⚠️ 是 `openUrl` 不是 `openPath`，权限也分开管
//（`capabilities/default.json` 里开的是 `opener:allow-open-url`）。
import { openUrl } from "@tauri-apps/plugin-opener";

import { api } from "@/bridge/ipc";
import { 致谢名单 } from "@/ui/credits";
import type { Diagnostics } from "@/bridge/types";
import { useT } from "@/i18n";
import { DialogClose } from "@/ui/DialogClose";
import { LicenseDialog } from "@/ui/LicenseDialog";
import { SoftwareUpdatePane } from "@/ui/SoftwareUpdatePane";
// 应用标识的**唯一手写源**是 `src-tauri/icons/nota.svg`，这里借分享图那一套
// 嵌法（`标识()` 顺带做 id 改名与圆角裁剪），不再画第二遍。
import { 标识, 标识视图 } from "@/ui/nota-mark";

/**
 * 五个子页。`null` ＝ 首页那一列行。
 *
 * ⚠️ 值写成中文是**内部标识**，不显示给用户（标题走下面 `页标题()` 里那张表的
 * `t("…")`）——所以它不进 i18n 表，也别拿它去拼界面文字。
 */
type 页 = null | "软件更新" | "故障排除" | "权限列表" | "鸣谢" | "法律信息";

/**
 * 外面那两行要的网址。**今天是空的**（见文件头口径 ②），空着的行不画。
 *
 * ⚠️ 填的时候用**能直接交给浏览器**的完整地址（`https://…`）。
 * 「报告问题」那一格是本仓的 issue 地址。
 */
const 网站 = "";
const 问题反馈 = "";

/**
 * 本项目的许可证短名。
 *
 * ⚠️ 与根目录 `LICENSE` 的第一行、`package.json`、`Cargo.toml` 四处一致；
 * `ui/LicenseDialog.tsx` 里那个 `短名` 是同一个词（那边管标题、这边管这一行）。
 * 改一处就得改两处。
 */
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

/** 诊断信息里**取不到的那一格**在界面上的样子（见 `diagnostics.rs` 的口径）。 */
const 空 = "—";

/** 空串画成「—」。⚠️ 只判断题里那一条口径，不管别的事。 */
function 或破折(v: string): string {
  return v.trim() === "" ? 空 : v;
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

  /** 诊断报告。`null` ＝ 还没拉（或者正在拉）。见下面那个 `useEffect`。 */
  const [诊断, 设诊断] = useState<Diagnostics | null>(null);
  /** 拉诊断信息**炸了**。⚠️ 与"某几格是空的"是两回事：那是正常的，这是一条命令整个失败。 */
  const [诊断炸了, 设诊断炸了] = useState(false);
  /** 许可证全文那张框开着没。 */
  const [显示许可证, 设显示许可证] = useState(false);
  /**
   * 打开外链**失败**时要说的话（2026-10-06 加）。
   *
   * ⚠️ 加它是因为我自己先犯了一次错：第一版只 `console.warn`，屏幕上一点反馈
   * 都没有——用户只能说"点击打不开"，而**原因在 WebView 的 console 里，
   * 进程日志里一个字都没有**。项目里那条硬口径「**报错不是文案**」说的就是
   * 这件事：失败必须看得见。
   * ⚠️ 文案里带上了 `e`（Tauri 那边抛出来的原因）——"打不开"三个字没法排查，
   * "not allowed to open url" 才能。
   */
  const [链接错误, 设链接错误] = useState<string | null>(null);

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

  /**
   * 翻到「故障排除」时才去拉诊断信息（进框就拉是白拉：多数人打开关于窗
   * 只是看一眼版本）。
   *
   * ⚠️ 拉过一次就不重复拉：那一条命令要起 `uname` 子进程（见
   * `commands/diagnostics.rs`），而**这个框活着的这段时间里那些值不会变**
   *（编译信息是刻在二进制里的，本机信息也没有一天之内变的道理）。所以
   * `诊断 !== null` 与 `诊断炸了` 都是"别再试了"的闸——失败也一样，
   * 反复重试只会让一页错误反复闪。
   */
  useEffect(() => {
    if (页 !== "故障排除" || 诊断 !== null || 诊断炸了) return;
    let 还在 = true;
    api.diagnostics
      .collect()
      .then((d) => {
        if (还在) 设诊断(d);
      })
      .catch(() => {
        if (还在) 设诊断炸了(true);
      });
    return () => {
      还在 = false;
    };
  }, [页, 诊断, 诊断炸了]);

  // `Esc` 关掉。⚠️ **绑在 window 上**，和 `ConfirmDialog` 同一条理由：焦点可能
  // 还没落进来（用户在它出现前就把手放在键盘上了）。
  useEffect(() => {
    const 按键 = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // ⚠️ **许可证那张框开着时不接**：它盖在本框上面，这一次 `Esc` 是它的
      //（它自己那条走 `useModalTrap`，在捕获阶段）。不拦的话一次 `Esc`
      // 会把两层一起关掉。⚠️ 本文件这条是**冒泡**阶段，所以拦不住它——
      // 只能在这儿让路。
      if (显示许可证) return;
      e.preventDefault();
      // ⚠️ 在子页里 `Esc` 也是**关掉整个框**，不是退回首页：这一层没有"没保存
      // 的东西"，而用户按 `Esc` 想要的从来是"把这块东西收起来"。
      onClose();
    };
    window.addEventListener("keydown", 按键);
    return () => window.removeEventListener("keydown", 按键);
  }, [onClose, 显示许可证]);

  // 焦点跟着"当前页最上面那颗按钮"走（换页也要重给一次，否则翻进子页之后
  // 焦点还留在上一页被卸载掉的那颗按钮上——那时 `Tab` 会从文档开头重新数）。
  useEffect(() => {
    头一颗.current?.focus();
  }, [页]);

  /**
   * 致谢名单。⚠️ **2026-10-10 搬去了 `ui/credits.ts` 并补全**（用户原话：
   * 「将 Codemirror 等引入的 BSD/MIT 库写入"鸣谢"」）——那一份是"直接引的、
   * 宽松许可的那些"，逐条对着 `THIRD-PARTY.md` 抄的，来龙去脉写在它的文件头。
   *
   * ⚠️ 只在**渲染里**现取（`t()` 要等语言定下来，理由见文件头口径 ③）。
   */
  const 致谢 = 致谢名单(t);

  /**
   * 「权限列表」那张表的两列。`名` 进「权限说明」那一列，`说明` 进「备注」。
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
   *
   * ⚠️ 2026-10-04：以前这里还有一张「什么没申请」的清单，**删了**（见文件头
   * 第 4 条）。
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
        "Handing external links in the document to the system (opener:allow-open-url ＋ opener:allow-default-urls, which only lets http, https, mailto and tel through); no web page is ever opened inside Nota.",
      ),
    },
    {
      名: t("Reading images under your home folder (read-only)"),
      说明: t(
        "Image files in the home, Documents, Desktop, and Downloads folders can be read and displayed in a document (assetProtocol.scope). Note: this range is wider than the opened folder because images may use any absolute path. Files are read as images only and are never written, modified, or transmitted.",
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
        "Open, edit, save, and Save As. Within a workspace folder, file changes are also monitored (inotify) so changes made by another program can be reported. Only the opened folder is monitored.",
      ),
    },
    { 名: t("Clipboard"), 说明: t("Copy, cut, and paste.") },
    {
      名: t("Starting external processes"),
      说明: t(
        "Export formats use pandoc when installed; the Git extension uses git; Force Focus uses a system notification sound when an alarm is triggered (canberra-gtk-play or aplay). These processes are short-lived and do not remain resident.",
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
        "① Detecting whether Nota's own window is active; ② displaying a full-screen, always-on-top window; ③ playing a sound. These capabilities are used only after selecting View → Force Focus. Force Focus does not read the keyboard, capture screenshots, or inspect other applications.",
      ),
    },
  ];

  /** 子页的标题（首页那几行的字复用同一张表）。 */
  const 页标题: Record<Exclude<页, null>, string> = {
    软件更新: t("Software Update"),
    故障排除: t("Troubleshooting"),
    权限列表: t("Permissions"),
    鸣谢: t("Credits"),
    法律信息: t("Legal"),
  };

  const 子页行: readonly 子页行[] = [
    { 键: "u", 标签: t("Software Update"), 页: "软件更新" },
    { 键: "t", 标签: t("Troubleshooting"), 页: "故障排除" },
    { 键: "p", 标签: t("Permissions"), 页: "权限列表" },
    { 键: "c", 标签: t("Credits"), 页: "鸣谢" },
    { 键: "l", 标签: t("Legal"), 页: "法律信息" },
  ];

  // 见文件头口径 ②：网址是空串的行**根本不画**。
  const 外链行: readonly 外链行[] = [
    { 键: "w", 标签: t("Website"), 网址: 网站 },
    { 键: "r", 标签: t("Report an Issue"), 网址: 问题反馈 },
  ].filter((行) => 行.网址 !== "");

  /**
   * 故障排除那两张表的内容。见文件头口径 ③：**在渲染里现建**。
   *
   * ⚠️ 左边那一列里 `rustc` / `cargo` / `node` / `npm` / `tauri` / `webkit2gtk` /
   * `gtk` / `mlua` **故意不翻**：它们是程序名与包名，翻了反而找不到。其余几条
   * 是给人看的，走 `t()`。
   *
   * ⚠️ 值那一列**一个都不翻**（它们本来就长那样），取不到的统一画「—」。
   */
  const 编译行: readonly (readonly [string, string])[] = 诊断
    ? [
        [t("Package version"), 或破折(诊断.version)],
        // ⚠️ 格式化**在这儿做**，不在后端：语言与时区都在前端这一侧
        //（Rust 那边只给 Unix 秒，理由见 `build.rs` 文件头第 ③ 条）。
        [t("Build time"), new Date(诊断.build_time * 1000).toLocaleString()],
        [t("Build host"), 或破折(诊断.build_host)],
        [t("Build platform"), 或破折(诊断.build_platform)],
        [t("Target triple"), 或破折(诊断.target)],
        [t("Build profile"), 或破折(诊断.profile)],
        ["rustc", 或破折(诊断.rustc)],
        ["cargo", 或破折(诊断.cargo)],
        ["node", 或破折(诊断.node)],
        ["npm", 或破折(诊断.npm)],
        ["tauri", 或破折(诊断.tauri)],
        ["webkit2gtk", 或破折(诊断.webkit_crate)],
        ["gtk", 或破折(诊断.gtk_crate)],
        ["mlua", 或破折(诊断.mlua)],
      ]
    : [];

  /**
   * 本机信息。
   *
   * ⚠️ `gtk` / `WebKitGTK` 这两条问的是**运行时那个库**，和上面编译信息里
   * 同名的那两条**不是一回事**——上面是编进包里的 crate 版本，这里是用户这台
   * 机器上装的那个 `.so`。两条都要有，对不上恰恰是最该看见的情况
   * （`src-tauri/src/diagnostics.rs` 文件头那张表）。
   */
  const 本机行: readonly (readonly [string, string])[] = 诊断
    ? [
        [t("Operating system"), 或破折(诊断.os_pretty)],
        [t("Kernel"), 或破折(诊断.kernel)],
        [t("Architecture"), 或破折(诊断.arch)],
        [t("GTK version"), 或破折(诊断.gtk_runtime)],
        [t("WebKitGTK version"), 或破折(诊断.webkit_runtime)],
      ]
    : [];

  /** 一张「项 ｜ 值」两列表（故障排除那两张用它）。 */
  const 值表 = (行: readonly (readonly [string, string])[]) => (
    <table className="about-table">
      <tbody>
        {行.map(([标签, 值]) => (
          <tr key={标签}>
            <th scope="row">{标签}</th>
            <td>{值}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

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
    <>
      {/* 点遮罩 = 关掉，和别的框同一条约定（`ConfirmDialog` / `ImageDialog`）。 */}
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
          {/* 在首页，统一关闭按钮同时承担焦点落点；进入子页后焦点交给返回键。 */}
          <DialogClose ref={页 === null ? 头一颗 : undefined} onClose={onClose} />

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
              {/* ⚠️ 字标是 **SVG 轮廓**（2026-10-17），不再用随包字体：见 `styles/overlay.css`
            里 `.about-name` 那一段。`role="img"` + `aria-label` 保留读屏可读。 */}
            <div className="about-name" role="img" aria-label="Nota" />
              {/* ⚠️ **作者名 2026-10-10 起是 `Leo Lee`**（用户原话：「还有，软件作者叫
                  Leo Lee。」），与 `LICENSE` / `Cargo.toml` 的 `authors` / 四个内置插件
                  清单里的 `authors` **四处同源**——改一处就得四处一起改。
                  ⚠️ 名字**不走 `t()`**：人名不是文案（`zh-ui.ts` 里那两条键同批删掉，
                  留着它们会被 `tools/i18n-check.sh` ③ 报成废键）。 */}
              <div className="about-developer">Leo Lee</div>
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
                {页 === "软件更新" && <SoftwareUpdatePane />}

                {页 === "故障排除" && (
                  <>
                    {诊断炸了 ? (
                      <p className="about-lead">{t("Could not read the information.")}</p>
                    ) : 诊断 === null ? (
                      <p className="about-lead">{t("Loading…")}</p>
                    ) : (
                      <>
                        <div className="about-sub">{t("Build information")}</div>
                        {值表(编译行)}
                        <div className="about-sub">{t("This machine")}</div>
                        {值表(本机行)}
                      </>
                    )}
                  </>
                )}

                {页 === "权限列表" && (
                  <table className="about-table about-table-2col">
                    <thead>
                      <tr>
                        <th>{t("Permission")}</th>
                        <th>{t("Notes")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {权限.map((条) => (
                        <tr key={条.名}>
                          <td className="about-cell-name">{条.名}</td>
                          <td>{条.说明}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {页 === "鸣谢" &&
                  致谢.map((条) => (
                    <div className="about-item" key={条.名}>
                      <div className="about-item-name">
                        {/* ⚠️ 名字本身就是那颗外链（用户 2026-10-06：「这个里的链接和
                            许可证公示」）——每一项都要能点回源头，并且写明许可。
                            走现成的 `opener:allow-open-url`。⚠️ 与「法律信息」那一行
                            的区别：那一条开的是**进程内的框**（不跳浏览器），这一条
                            才是**真交给系统浏览器**。 */}
                        <button
                          type="button"
                          className="about-link"
                          title={条.链接}
                          onClick={() => {
                            // ⚠️ 先清上一次那行（点第二条时不该还挂着第一条的错）。
                            设链接错误(null);
                            void openUrl(条.链接).catch((e) => {
                              // 失败**要说出来**，不许哑着（见 `链接错误` 那段注释）。
                              设链接错误(t("Could not open the link: {0}", String(e)));
                            });
                          }}
                        >
                          {条.名}
                        </button>
                      </div>
                      <div className="about-item-text">{条.用处}</div>
                      <div className="about-item-text about-item-license">{条.许可}</div>
                    </div>
                  ))}

                {/* 外链打不开时**说一句**（2026-10-06）——见 `链接错误` 那段注释：
                    失败哑着是查不出原因的，用户只能说"点了没反应"。 */}
                {页 === "鸣谢" && 链接错误 && (
                  <div className="about-item-text about-err">{链接错误}</div>
                )}

                {页 === "法律信息" && (
                  <div className="about-item">
                    <div className="about-item-name">
                      {/* 见文件头第 3 条：这一行是**超链接**，点它开许可证全文
                          那张框（另一个框，不跳浏览器）。⚠️ 用 `<button>` 不用
                          `<a>`：`<a>` 得有 `href`，而这里没有 URL 可去——
                          画一个带 `href="#"` 的假链接比按钮更像坏了。 */}
                      <button
                        type="button"
                        className="about-link"
                        onClick={() => 设显示许可证(true)}
                      >
                        {t("{0} License", 许可证)}
                      </button>
                    </div>
                    <div className="about-item-text">Copyright (c) 2026, Leo Lee</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ⚠️ **兄弟节点、画在关于框后面**：两层的 `z-index` 都是 200，靠 DOM 顺序
          分前后（许可证那张在上面）。`Esc` 的归属在那个 effect 里让了路。 */}
      {显示许可证 && <LicenseDialog onClose={() => 设显示许可证(false)} />}
    </>
  );
}
