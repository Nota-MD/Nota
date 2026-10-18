#!/usr/bin/env bash
#
# doc-sync-check.sh —— 文档同步与行数上限的启发式自检
#
# 规则与判据写在 docs/09-doc-sync-policy.md §3。**改这里之前先改那里。**
#
# 查八件事：
#   ① 行数上限   任何 .rs/.ts/.tsx/.lua/.css/.sh 不得 >= 1000 行（>= 800 报 WARN，
#                 2026-09-29 起从 900 收到 800：用户要的是 300–800，不是"贴着 1000"）
#   ② 文档新鲜度 §2 映射表里的源文件改了、映射到的文档没跟
#   ③ 引用存在性 代码/AGENTS.md 里 docs/NN-*.md 的引用必须指到真文件
#   ④ 编号存在性 代码里「docs/07 第 N 项」与「BUG-N」的编号必须在 docs/07 里存在
#   ⑤ 文件已登记 每个源文件都要在 AGENTS.md §2 或 docs/09 §2 里出现过
#   ⑥ 界面无衬线 界面那几份 .css 与 index.html 里不许出现衬线字体栈
#   ⑦ 风格 id 一致 内置界面风格的 id 三份抄本必须一致（⑦ 的来历见那一段注释）
#   ⑧ 样式可解析  src/styles 下每份 .css 都要过一遍 PostCSS（⑧ 的来历见那一段注释）
#
# 为什么用 mtime 而不是 git diff：原先是「本仓库不是 git 仓库」——**那句话已过期**
# （2026-09-24 起仓库有提交了，`git status` 正常）。暂时仍用 mtime，理由与换法写在
# docs/09-doc-sync-policy.md §3 的「② 用 mtime 而不是 git」那一节，**改这里之前先改那里**。
# mtime 是近似，拉取/检出/touch 都会让它误报——
# 误报了别改脚本消掉，要么真去更新文档，要么往 docs/07 §4 记一笔。
#
# 退出码：0 = 全过；1 = 有 FAIL；0 但打 WARN = 过但有可疑项。

set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
ROOT=$PWD

# CI 模式：② 不用 mtime，而是拿 `DOC_SYNC_BASE...HEAD` 的 git diff 判
# “源文件改了、映射文档没改”。干净 checkout 上没有可靠的 mtime。
CI_MODE=0
if [ "${1:-}" = "--ci" ]; then
  CI_MODE=1
fi

# ── 输出小工具 ───────────────────────────────────────────────────────────
if [ -t 1 ]; then
  R=$'\e[31m'; Y=$'\e[33m'; G=$'\e[32m'; B=$'\e[1m'; N=$'\e[0m'
else
  R=''; Y=''; G=''; B=''; N=''
fi

FAILS=0
WARNS=0

fail() { printf '%sFAIL%s %s\n' "$R" "$N" "$1"; FAILS=$((FAILS + 1)); }
warn() { printf '%sWARN%s %s\n' "$Y" "$N" "$1"; WARNS=$((WARNS + 1)); }
ok()   { printf '%s  ok%s %s\n' "$G" "$N" "$1"; }
head_() { printf '\n%s── %s%s\n' "$B" "$1" "$N"; }

# 读文件的 mtime（秒）。取不到就给 0——宁可漏报，不要因为一个 stat 失败
# 把整轮检查变成噪音。
mtime_of() { stat -c %Y "$1" 2>/dev/null || echo 0; }

# ── 代码 → 文档映射表 ────────────────────────────────────────────────────
# 格式：源路径（相对仓库根，不带引号）后跟一个空格，再跟逗号分隔的文档编号。
# 这张表是 docs/09-doc-sync-policy.md §2 的机读副本，两边必须一致。
# 加源文件就加一行，否则 ⑤ 会报「文件没登记」。
PAIRS=(
  # 后端
  "src-tauri/src/main.rs                          06"
  "src-tauri/src/lib.rs                           01,02,04"
  "src-tauri/src/cli.rs                           01,02,10"
  "src-tauri/src/error.rs                         02,03"
  "src-tauri/src/log.rs                           01,02,06"
  "src-tauri/src/lang.rs                          01,03,11"
  "src-tauri/src/paths.rs                         02,03"
  "src-tauri/src/state.rs                         01,03"
  "src-tauri/src/settings/mod.rs                    03,04,10"
  "src-tauri/src/settings/files.rs                  03,04,10"
  "src-tauri/src/settings/editor.rs                 03,04,10"
  "src-tauri/src/settings/image.rs                  03,04,10"
  "src-tauri/src/settings/markdown.rs               03,04,10"
  "src-tauri/src/settings/export.rs                 03,04,10"
  "src-tauri/src/settings/appearance.rs             03,04,10"
  "src-tauri/src/settings/general.rs                03,04,10"
  "src-tauri/src/document/mod.rs                  03,05"
  # ⚠️ 2026-10-04 新建：`derive_title` 那一族从 `mod.rs` 拆出来的（那边过了 800 行）。
  # 拆缝是「纯文本进、标题出」——不认识 `DocId`、不碰仓库、不取锁，谁都能调它。
  "src-tauri/src/document/title.rs                03,05"
  "src-tauri/src/commands/mod.rs                 02"
  "src-tauri/src/commands/document.rs             02,04,10"
  "src-tauri/src/commands/workspace.rs            02,04"
  "src-tauri/src/commands/settings.rs             02,04"
  "src-tauri/src/commands/plugin.rs               02,04"
  "src-tauri/src/commands/menu.rs                 02,04"
  "src-tauri/src/commands/theme.rs                02,04,10"
  "src-tauri/src/commands/ui_style.rs             02,04,08"
  # 2026-10-17：应用内打印（先 PDF 再预览，最后 lp 投递）。
  "src-tauri/src/print_job.rs                    02,04,06"
  "src-tauri/src/commands/print.rs               02,04"
  "src-tauri/src/commands/export.rs            02,04,05"
  "src-tauri/src/commands/image.rs             02,04,10"
  "src-tauri/src/image.rs                      02,03,10"
  "src-tauri/src/image/address.rs              02,10"
  "src-tauri/src/image/target.rs               02,03,10"
  "src-tauri/src/image/plan.rs                 02,10"
  "src-tauri/src/image/tests.rs                02"
  "src-tauri/src/upload.rs                     02,03,10"
  "src-tauri/src/upload/net.rs                 02,10"
  "src-tauri/src/upload/tests.rs               02"
  "src-tauri/src/commands/image_upload.rs      02,04,10"
  "src-tauri/src/native_menu.rs                   01,02,04"
  "src-tauri/src/themes.rs                        02,03,08"
  # ⚠️ 与 `themes.rs` 是**两条并行的机制**（文档主题 / 界面风格），细节差别写在
  # `ui_styles.rs` 头上那张对照表里。⛔ 别把两份合成一份。
  "src-tauri/src/ui_styles.rs                     02,03,04,08"
  "src-tauri/src/plugin/mod.rs                    01,02,11"
  # 2026-09-29：那一份当时 819 行，按"说给别人的形状 / 宿主自己的动作"拆出这一份。
  "src-tauri/src/plugin/types.rs                  03,05,11"
  "src-tauri/src/plugin/manifest.rs               03,11,12"
  # 2026-10-04：`[[settings]]` 那一格把 `manifest.rs` 顶到 1077 行，按"这一格自己的
  # 全部（结构体 ＋ 夹紧 ＋ 校验）"拆出这一份。
  "src-tauri/src/plugin/settings_decl.rs          03,11,12"
  "src-tauri/src/plugin/install.rs                 02,11"
  "src-tauri/src/plugin/package.rs                 02,06,11"
  # 2026-09-29：那一份当时 875 行，按"包本身（对字节做的算术）／信谁（用户的一次表态）"拆出这一份。
  "src-tauri/src/plugin/trust.rs                  02,03,11"
  "src-tauri/src/plugin/installed.rs               02,03,11"
  # 2026-09-27：用户点名的「导入 / 导出 / 卸载」里缺的那一件（导出＝把一个已装插件打回成包）。
  "src-tauri/src/plugin/export.rs                  02,07,11"
  "src-tauri/src/proc.rs                          02,06,07"
  # 2026-10-04：「关于 → 故障排除」那一页要的编译信息 ＋ 本机信息（外加它那一条命令）。
  "src-tauri/src/diagnostics.rs                   02,04"
  "src-tauri/src/commands/diagnostics.rs          02,04"
  # 2026-09-29：那一份当时 836 行，按"这台机器能不能用／真的去转一份文档"拆出这一份。
  "src-tauri/src/pandoc_probe.rs                  02,05,06,10"
  "src-tauri/src/pandoc.rs                        02,05,06,10"
  "src-tauri/src/pandoc/tests.rs                  02,05,06"
  "src-tauri/src/pandoc_format.rs                 02,05,06,10"
  "src-tauri/src/pdf_print.rs                     02,05,06,10"
  # 2026-10-11：拼写检查这一整套（引擎 / 词典 / 口径）。⚠️ 在这之前
  # `spell/mod.rs` **没登记在这张表里**（⑤ 过得去是因为 AGENTS.md §2 里
  # 有它那一行，而 ② 的"源改了文档没跟"根本管不到它）——今天补上。
  "src-tauri/src/spell/mod.rs                    02,03,04,07,10"
  "src-tauri/src/spell/native.rs                 02,03,07,10"
  "src-tauri/src/spell/store.rs                  02,03,07,10"
  "src-tauri/src/spell/tests.rs                  02,06"
  # 2026-10-11（照 Typora 重做状态栏那个拼写菜单）：三个新文件。
  "src/ui/SpellMenu.tsx                          04,02"
  "src/ui/spell-langs.ts                         04,02"
  # 2026-10-11（修用户报的“菜单里一下滚就消失”）：弹层自己滚不算“底下动了”。
  "src/ui/popup-scroll.ts                         04,02"
  # 2026-09-28：和 `pdf_print.rs` 隔壁、同样"只有 Linux 编"的那一份 ——
  # GTK 捕获阶段拦 `Ctrl+B`/`Ctrl+I`（BUG-49 的修法）。
  "src-tauri/src/format_keys.rs                   01,02,04,06,07,10"
  "src-tauri/src/commands/pandoc.rs               02,04,05"
  "src-tauri/src/devserver.rs                     02,11,12"
  "src-tauri/src/devserver/probe.rs               02,11,12"
  "src-tauri/src/lua/mod.rs                       01,12"
  # 2026-09-27 拆出来的：`require` 那一组用例（`mod.rs` 加完 `装require` 之后
  # 顶破 1000 行，把"证明它装对了"的用例挪出去，只挪行数不挪内容）。
  "src-tauri/src/lua/require_tests.rs             01,12"
  # 2026-09-27：MCP 三个文件一起落地（`nota --mcp`）。⚠️ 它们是**一个功能的三块**，拆开登记但别只改一块。
  # ⚠️ `mod.rs` 原写 `01,02,12`——`12` 是**插件运行时**，而 MCP 连 Lua 都不碰，那是空指；
  # 2026-09-27 更晚改成 `01,02,07,10`（启动三步在 `01` ⓿、状态在第 82 项、§9 有一行）。
  "src-tauri/src/mcp/mod.rs                        01,02,07,10"
  "src-tauri/src/mcp/host.rs                       02"
  "src-tauri/src/mcp/tools.rs                      02,07,10"
  "src-tauri/src/lua/api/mod.rs                   12,13"
  "src-tauri/src/lua/api/document.rs              13,05"
  "src-tauri/src/lua/api/fs.rs                    13"
  "src-tauri/src/lua/api/git.rs                   13,11"
  "src-tauri/src/lua/api/ui.rs                    13,04"
  "src-tauri/src/lua/api/http.rs                  13,12,02,06"
  # ⚠️ 2026-10-04 补两行（第 58/60 项那一批）：
  #  · `http/tests.rs`——`http.rs` 那套房子的**测试**，跟着主文件走（先例：`image/tests.rs`
  #    记的是 `02`）。它钉的几条（每块都不切汉字、结果表的形状）在 `docs/13` §9 与
  #    `docs/06` §5.13 的桩脚本配方里都写着。
  #  · `json.rs`——`nota.json`（**不需要能力**的纯解码表）。记法与 `diff.rs` / `time.rs`
  #    一样是 `13,11`：契约在 `docs/13`，插件作者怎么用（别自己写解码器）在 `docs/11`。
  "src-tauri/src/lua/api/http/tests.rs           13,12,02,06"
  "src-tauri/src/lua/api/json.rs                 13,11"
  "src-tauri/src/lua/api/settings.rs              13,12,07"
  "src-tauri/src/lua/api/i18n.rs                  13,11,12"
  "src-tauri/src/lua/api/devserver.rs             13,12,11"
  "src-tauri/src/lua/api/unified_diff.rs          13,11"
  "src-tauri/src/lua/api/diff.rs                  13,11"
  # ⚠️ 2026-09-27 补的两行：写作统计第二轮加的两张表（`nota.time` / `nota.data`）。
  "src-tauri/src/lua/api/time.rs                  13,11"
  "src-tauri/src/lua/api/data.rs                  13,11,12"
  # 前端
  "src/main.tsx                                   06"
  "src/App.tsx                                    02,04"
  "src/i18n/index.ts                              04,11"
  "src/i18n/zh.ts                                 04,11"
  # ⚠️ 2026-09-26 补的这三行（当时代替的是 `en-*.ts`，2026-09-28 跟着翻转改成
  # `zh-*.ts`）。中文表拆成了四份（`zh.ts` 是壳，三份分表在它旁边），
  # **拆的时候漏登记过一次**——闸门当时只盯 `zh.ts`，那三份改了它不吭声。
  # 症状是"文案改了、`docs/04` 没跟上"而①~⑤全绿。三份都跟着 `zh.ts` 走。
  "src/i18n/zh-ui.ts                              04,11"
  "src/i18n/zh-settings.ts                        04,11"
  "src/i18n/zh-runtime.ts                         04,11"
  "src/bridge/ipc.ts                              02,05"
  "src/bridge/types.ts                            02,05"
  "src/bridge/payloads.ts                         02,05"
  "src/editor/create.ts                           05"
  # 2026-09-28：命令白名单（COMMANDS 表）整块搬出 `create.ts`（那边到 1010 行、破了硬线）。
  "src/editor/command-table.ts                    05"
  # 2026-10-07：`createEditor` 那一长串**选项怎么装配**搬出去（`create.ts` 1006 → 502，
  # 第 89 项）。⚠️ 它管的是"哪一格接哪一份、谁不许传谁"，改一处就要看 `docs/05`。
  "src/editor/assemble.ts                         05"
  "src/editor/front-matter.ts                     05,07,10"
  # ⚠️ 2026-10-04 新建：编辑器把**选区**报给宿主那一半（`docs/07` 第 14 项）。
  # 文件头是一张**量测表**：Markdown 偏移量在块边界上不存在，所以这条路只报
  # 「选中的那段字」、不报偏移。改它之前先读那张表，别把偏移量加回来。
  "src/editor/caret-snapshot.ts                  05,07"
  "src/editor/atx.ts                              05,03,10"
  "src/editor/lax-heading.ts                      05,03,07"
  "src/editor/command-state.ts                    05,04"
  "src/editor/insert.ts                           05"
  "src/editor/lang-icon.ts                        05,04"
  "src/editor/lang-picker.ts                      05,04"
  "src/editor/find.ts                             05,04"
  "src/editor/scroll-into-view.ts                 05,04,10"
  "src/editor/writing-modes.ts                    05,04"
  "src/editor/image-attrs.ts                      05,04"
  "src/editor/math-macros.ts                      05,10,04"
  "src/editor/source.ts                           05,04,10"
  # 2026-10-07：源码模式的**编辑命令**那一块（行内标记 / 链接 / 缩进 / 表格那十条）
  # 搬出去（`source.ts` 1048 → 637，第 89 项）。
  "src/editor/source-commands.ts                  05,04"
  # 2026-10-07：「选择」那一族（选行 / 选词 / 选句 / 选词并删，`Ctrl+L`/`D`/`E`/
  # `Shift+D`）＋ `Alt+↑`/`Alt+↓` 上移下移。⚠️ 两份都进四条单子里的复数：
  # 判据是**两种模式共用**的（`05` 讲内部、`04` 讲菜单上那几条与键位、
  # `02` 是模块清单、`10` 是功能矩阵），下面那两行测试同理。
  "src/editor/select.ts                          05,02,04,10"
  "src/editor/move-block.ts                      05,02,04,10"
  "tests/select.test.ts                          02,06"
  "tests/move-block.test.ts                      02,06"
  # 2026-10-07（第 96 ＋ 102 项：「链接」那个框）：三份新源码 ＋ 一份新测试。
  # ⚠️ `link-edit.ts` 是**纯函数优先**的那一份（判据两种模式共用），所以它进
  # `05`（内部）、`02`（模块清单）、`04`（菜单与界面那一格）、`10`（功能矩阵）；
  # `LinkDialog.tsx` / `useLinkClick.ts` 是界面那一层，只进 `04`／`02`。
  "src/editor/link-edit.ts                      05,02,04,10"
  "src/ui/LinkDialog.tsx                        04,02"
  "src/ui/useLinkClick.ts                       04,02,05"
  "tests/link-edit.test.ts                      02,06"
  # ⚠️ 2026-10-07 补：这一份**建好就一直在 `docs/09` §2 里、这里却没有**——
  # 与 2026-09-27 那两份（`chart-ticks` / `instant-render`）一模一样的漏法。
  # 它改了不会提醒 `02` 与 `06`（那一批 BUG-58 的账正是记在这两份文档里）。
  "tests/key-conflicts.test.ts                   02,06"
  # ⚠️ 2026-09-28 新建：源码模式的查找那一整块（状态 / 三条效果 / 装饰），
  # 从 `source.ts` 整块搬出来的——那天它顶到了 1001 行、撞①那条硬上限。
  "src/editor/source-find.ts                      05,04"
  # ⚠️ 2026-09-30 新建：源码模式里"行内标记能不能摘掉"那个**纯函数**（BUG-57：
  # 选中的文字已经加粗时再按 `Ctrl+B` 该摘掉、不是再包一层）。判据是纯字符串
  # 的事，分出来是为了 `tests/source-mark.test.ts` 能直接测——那几条嵌套边界
  # （`***甲***`）靠开窗手敲试不全，而它们最容易改坏。
  "src/editor/source-mark.ts                      05,04,07"
  "src/editor/instant-render.ts                   05,04,10"
  "src/editor/task-list.ts                        05,04,10"
  "src/editor/code-block.ts                       05,04,10"
  # 2026-10-06（第 101 项：代码块换成 CodeMirror 编辑）。⚠️ 两份一起进——
  # 那一份纯函数的判据就是下面那行测试，改了 `算最小改动` / `回车续行` 而不同步
  # `docs/02` 与 `docs/06` 的话，这里会提醒。
  "src/editor/code-block-cm.ts                    05,07,02"
  "tests/code-block-editing.test.ts               02,06"
  "src/editor/heading-on-enter.ts                 05,04,02"
  # 2026-10-16（用户朋友清单第 12 条「INSERT 键无法使用」）：新文件。
  # ⚠️ 它和 `command-state.ts` 是一对——开关住在插件 state 里、状态栏那个
  # `OVR` 靠**签名串**发现它变了，所以改这个文件要连着 `05` 与 `04` 一起看。
  "src/editor/overtype.ts                        05,04"
  # 2026-10-16（用户点名：「如果代码框语言是html的话，在下面可以直接显示预览」）。
  # ⚠️ 它和 `export.ts` 的 `整块删掉` 是一对：新增一个"编辑时零件"就回头看一眼
  # 那份名单，否则它会跟着导出走（第 69 项那次就是这么发现漏登记的）。
  "src/editor/code-preview.ts                    05,04"
  "tests/code-preview.test.ts                    02,06"
  # 2026-10-16（朋友清单第 7／16 条「退出软件时对更改进行保存/弹窗」）：新文件。
  # 它与 `src-tauri/src/lib.rs` 的 `CloseRequested` 是一对——改一边就要看一眼
  # 另一边，所以 `04`（界面上的那一问）与 `02`（模块账）都挂上。
  "src/ui/useQuitGuard.ts                        04,02"
  "src/editor/table-input.ts                      05,04,10"
  # 2026-09-27：行首那颗多余的反斜杠（`\| 1 | 2 |`）。⚠️ 它**不改表格那条路**——只动"物理上只能占一行"的普通段落。
  "src/editor/table-pipe.ts                      05,07"
  # 2026-10-04：表格里的 `Tab` / `Shift+Tab`（第 55 项 ②③）。⚠️ 上游 `preset-gfm` 的
  # `tableKeymap` **已经绑了这两颗键**，本文件接的是上游那条命令**撂挑子**的两种现场：
  # 最后一格 `Tab`（加一行）、第一格 `Shift+Tab`（吃掉——不吃焦点会静默飞出编辑器）。
  # ⚠️ "认键"得看 `keyCode`：GTK/X11 把 `Shift+Tab` 送成 `ISO_Left_Tab`
  # （`event.key` 是 `Unidentified`），只比 `event.key === "Tab"` 的那一版
  # **单测全绿、真窗口却是坏的**（`docs/06` §5.48）。
  "src/editor/table-tab.ts                       05,07,02"
  "src/editor/diagram-view.ts                     05,04,10"
  "src/editor/math-view.ts                      05,04,10"
  "src/editor/math-input.ts                     05,04,10"
  # 行内公式"用几个 `$`"那一套（2026-09-27）：解析标注 ＋ 规格加属性 ＋ 序列化选处理器。
  "src/editor/math-delim.ts                     05,04,10"
  # `$` 当钱的时候不算公式（2026-10-04，backlog 第 54 项）：包的是分词器上那条 `mathText`。
  "src/editor/math-currency.ts                  05,07,10"
  # 行首 `[TOC]` / `[!NOTE]` 别被加反斜杠（2026-10-04，backlog 第 56 项那一族的收尾）：序列化第七层。
  "src/editor/syntax-escape.ts                  05,07,02"
  # 公式源码框里的命令补全（2026-10-04）：表与判据那一半 ＋ 弹窗那一半。
  # ⚠️ 这两份**都进 `docs/02`**（模块清单里各占一行），所以 02 在这两行的单子里。
  "src/editor/math-commands.ts                  05,02,10"
  "src/editor/math-suggest.ts                   05,02,10"
  "src/editor/mark-hint.ts                      05,04,10"
  "src/editor/atom-space.ts                     05,04,10"
  # 2026-09-27：那五层文本处理器的"谁在外层"（加第五层时 `create.ts` 顶破 1000 行，把这串拆了出去）。
  "src/editor/text-handlers.ts                   05"
  "src/editor/lang-icons-real.ts                05,04,10"
  # 行内标记（高亮/上标/下标/下划线）与块级裸 HTML＋注释，2026-09-27 同批落地。
  "src/editor/inline-marks.ts                   05,04,10"
  "src/editor/html-block.ts                     05,04,10"
  "src/editor/smart-punctuation.ts              05,04,10"
  "src/editor/auto-correct.ts                   05,04,10"
  # Emoji：短代码替换 ＋ 补全面板（2026-09-27）。
  "src/editor/emoji.ts                          05,04,10"
  "src/editor/footnote.ts                       05,10"
  "src/ui/EditorPane.tsx                          05"
  # 2026-10-07（第 89 项）：`EditorPane.tsx` 1171 → 800，搬出去的六份。
  # ⚠️ 它们是**一件事一件**的，不是一个文件碎成六块——每份各自盯着的文档见下面那行注释。
  "src/ui/FrontMatterBanner.tsx                   04,05"   # 正文上方那条 YAML 横幅（第 64 项）
  "src/ui/pane-editors.ts                         05"      # 三个实例各传哪些选项
  "src/ui/useEditorSettings.ts                    05,04"   # 设置 → 开关（哪几项要重建实例）
  "src/ui/useEditorHandle.ts                      05"      # 十三条转发出去的命令
  "src/ui/useCursorSnapshot.ts                    05,07"   # 选区快照推给后端（第 14 项）
  "src/ui/table-widths.ts                         05,04"   # 表格列宽侧车的读写
  "src/ui/FormatBar.tsx                           04,05"
  "src/ui/Icon.tsx                                02,04"
  # 2026-09-30：侧栏右缘那条可以拖的把手（不是"顺手重构"，是用户照 Typora 点名的）。
  "src/ui/SidebarResizer.tsx                      04"
  "src/assets/icons/nota-sidebar-toggle-symbolic.svg    02"
  "src/assets/icons/nota-sidebar-collapse-symbolic.svg  02"
  # 2026-09-30 晚：状态栏悬停才出现的那两颗（拼写检查开关、展开「字数统计」菜单）。
  "src/assets/icons/nota-spellcheck-symbolic.svg        02"
  "src/assets/icons/nota-unfold-more-symbolic.svg       02"
  "src/ui/FindBar.tsx                             04,05"
  "src/ui/PromptDialog.tsx                        04,02"
  "src/ui/useMenus.ts                             04,02"
  "src/ui/useDialogs.ts                           04,02"
  "src/ui/EmojiDialog.tsx                         04,02"
  "src/ui/AppDialogs.tsx                          04,02"
  "src/ui/Sidebar.tsx                             04"
  "src/ui/MenuBar.tsx                             04,10"
  "src/ui/TopBar.tsx                              04,02"
  "src/ui/TabBar.tsx                              04,02"
  "src/ui/MenuPopup.tsx                           04"
  "src/ui/useMenuRovingFocus.ts                   04"
  # 2026-10-04（第 50 / 27 项那批）：弹层封闭、页签方向键、图表节点三份新文件。
  "src/ui/useModalTrap.ts 04"
  "src/ui/useTablistKeys.ts 04"
  "src/editor/diagram-node.ts 10"
  # 2026-10-04（右键菜单那批）：整个接管 WebKitGTK 那份英文原生菜单。
  # ⚠️ 三份都要列——少列一份就是那一份**从此不进任何闸门**（本仓反复踩过的坑）。
  # `context-menu.ts` 多一份 `06`：它的单测与目检配方都在那。
  "src/ui/context-menu.ts 02,04,06"
  "src/ui/ContextMenu.tsx 02,04"
  "src/ui/useMenuTable.ts 02,04"
  "src/ui/useExport.ts 02,04,10"
  "src/ui/useDocTheme.ts 02,04,10"
  "src/ui/useUiStyles.ts 02,04,08"
  "src/ui/useChromeVisibility.ts 02,04"
  # 2026-09-30 晚：状态栏那一堆 props 的接线（App.tsx 破 1000 行时拆出来的）。
  "src/ui/useStatusBar.ts 02,04"
  "src/ui/useImmersive.ts 02,04,05,07,10"
  "src/ui/useToasts.ts 02,04"
  # 2026-09-28：`useAbout.ts` 拆成两份 —— 界面在 `AboutDialog.tsx`，
  # 开关并进了 `useDialogs.ts`（那一行本来就有，不用再加）。
  "src/ui/AboutDialog.tsx 02,04"
  # 2026-10-04：许可证全文那张框（法律信息里那个超链接开的）。
  "src/ui/LicenseDialog.tsx 02,04"
  "src/ui/useFocusSession.ts 02,04"
  "src/ui/useDocuments.ts 02,04,07"
  "src/ui/useAutosave.ts 02,03,04,07,10"
  "src/ui/useClipboard.ts 02,04,05"
  "src/ui/useEditorCommands.ts 02,04,05"
  "src/ui/useImageInsert.ts 02,04,05"
  "src/ui/ImageDialog.tsx 02,04"
  "src/ui/useAppearance.ts 02,04"
  "src/ui/useUiMode.ts 02,04"
  "src/ui/useWindowTitle.ts 02,04"
  # 2026-10-04（第 45 项）：专注模式压暗三档那一条的接线。
  "src/ui/useFocusDim.ts 02,04"
  "src/ui/useZoom.ts 02,04"
  "src/editor/export.ts 05,10"
  "src/ui/nativeMenu.ts                           04"
  "src/ui/accel.ts                                04,05"
  "src/ui/commands.ts                             04,05"
  "src/ui/PluginDock.tsx                          04,10,02"
  # 2026-09-27：插件在两个界面上那几句人话（右侧栏 ＋ 设置里的「扩展」页）。
  "src/ui/pluginText.ts                          04"
  "src/ui/PanelBody.tsx                           04,11"
  "src/ui/panel-nodes.ts                          11,13"
  "src/ui/panel-data-nodes.ts                     13"
  # 2026-10-10（第 111 / 112 项那批）：插件栏的记忆 ＋ 鸣谢名单。
  "src/ui/panel-dock-state.ts                    04,11,02"
  "src/ui/credits.ts                             02,04"
  "tests/panel-dock-state.test.ts               02,06"
  # ⚠️ 2026-09-27 补的三行：写作统计分享图那一批（`docs/07` 第 65 项第三轮）。
  # ⑤ 只扫 `src-tauri/src` 与 `src`，所以下面这三个新文件是**靠这张表**被管的。
  "src/ui/share-card.ts                           02,04,06"
  "src/ui/nota-mark.ts                            02,04"
  "src/ui/chart-ticks.ts                          02,04"
  "src/ui/pluginMenus.ts                          04,13"
  "src/ui/plugin-prompt.ts                        04,13"
  "src/ui/usePlugins.ts                           02,04"
  "src/ui/PandocPanel.tsx                         04,02"
  "src/ui/ReviewPane.tsx                          04,05,02"
  "src/ui/ConfirmDialog.tsx                       04,02"
  "src/ui/Home.tsx                                04,10"
  "src/ui/StatusBar.tsx                           04"
  "src/ui/Toasts.tsx                              04"
  "src/ui/ErrorBoundary.tsx                       04"
  "src/ui/settings/SettingsDialog.tsx             04"
  "src/ui/settings/primitives.tsx                 04"
  "src/ui/useSettingsFile.ts                        04"
  "src/ui/settings/panes/FilesPane.tsx              04"
  "src/ui/settings/panes/EditorPane.tsx             04"
  "src/ui/settings/panes/ImagePane.tsx              04"
  "src/ui/settings/panes/ImageUploadGroup.tsx      04"
  "src/ui/settings/panes/MarkdownPane.tsx           04"
  "src/ui/settings/panes/ExportPane.tsx             04"
  "src/ui/settings/panes/AppearancePane.tsx         04"
  "src/ui/settings/panes/DocThemePane.tsx           04"
  "src/ui/settings/panes/ShortcutsPane.tsx          04"
  "src/ui/settings/panes/GeneralPane.tsx            04"
  "src/ui/settings/panes/FocusPane.tsx               04"
  # 2026-09-27：设置里的「扩展」页（装 / 导出 / 卸载）。
  "src/ui/settings/panes/ExtensionsPane.tsx          04"
  "src/ui/settings/panes/props.ts                   04"
  "src/ui/outline.ts                              05"
  "src/ui/view-modes.ts                           04"
  "src/styles/theme.css                           04,08"
  # ⚠️ 2026-09-26：`theme.css` 原 1117 行顶破 1000 行硬线，就地拆成这四份。
  # **四份的顺序是承重的**（base → shape → color → extras），理由写在 `theme.css` 头上。
  "src/styles/theme/base.css                      04"
  "src/styles/theme/shape.css                     04"
  "src/styles/theme/color.css                     04"
  "src/styles/theme/extras.css                    04"
  "src/styles/cde.css                            04,08"
  "src-tauri/src/theme_assets.rs                 02,08"
  "src/styles/ui-style.ts                         04,08"
  "src/styles/icons.css                           04"
  "src/styles/applyTheme.ts                       04"
  "src/styles/doc-theme.ts                        04,05,08"
  # ⚠️ 2026-09-29：`settings.css` 962 行，同样按功能拆成三份。
  "src/styles/settings.css                        04"
  "src/styles/settings-controls.css               04"
  "src/styles/settings-widgets.css                04"
  # ⚠️ 2026-09-29：`app.css` 836 行，按功能拆成五份（骨架 / 菜单栏 / 两条 / 主页 / 提示条）。
  "src/styles/app.css                             04"
  "src/styles/menubar.css                         04"
  "src/styles/tabs-status.css                     04"
  "src/styles/home.css                            04"
  "src/styles/toast.css                           04"
  "src/styles/sidebar.css                         04"
  # ⚠️ 2026-09-29：`editor.css` 945 行，按功能拆成三份（外壳 / 行内 / 块级）。
  "src/styles/editor.css                          04"
  "src/styles/editor-inline.css                   04,05"
  "src/styles/editor-blocks.css                   04,05"
  "src/styles/bars.css                            04"
  # 2026-10-07（第 89 项）：`math-view.test.ts` 涨到 1024 行（而 ① 当时扫不到
  # `tests/`），按职责拆成两份，地基抽成 `math-fixture.ts`——三行一起在这儿。
  "tests/math-view.test.ts                      02,06"
  "tests/math-wiring.test.ts                    02,06"
  "tests/math-fixture.ts                        02,06"
  "tests/math-commands.test.ts                  02,06"
  "tests/math-suggest.test.ts                   02,06"
  "tests/video-view.test.ts                       02,06"
  "tests/fake-dom.ts                            02,06"
  "tests/mark-hint.test.ts                      02,06"
  "tests/math-input.test.ts                     02,06"
  "tests/math-delim.test.ts                     02,06"
  "tests/math-currency.test.ts                  02,06"
  "tests/panel-cards.test.ts                    02,06"
  "tests/syntax-escape.test.ts                  02,06"
  "tests/list-indent.test.ts                    02,06"
  # 2026-10-04（第 64 / 45 项那批）。
  "tests/front-matter.test.ts                   02,06"
  "tests/focus-dim.test.ts                      02,06"
  "tests/window-title.test.ts                   02,06"
  "tests/lang-icons.test.ts                     02,06"
  "tests/atom-space.test.ts                     02,06"
  "tests/share-card.test.ts                      02,06"
  # ⚠️ 这两行是 2026-09-27 补的：两份测试**建好了却一直没进这张表**，于是它们改了
  # 也不会有任何文档提醒（`chart-ticks` 那一份正是这样漏掉一条真错的，见 docs/06 §6.3）。
  "tests/chart-ticks.test.ts                    02,06"
  "tests/instant-render.test.ts                  02,06"
  "tests/inline-marks.test.ts                   02,06"
  "tests/html-block.test.ts                     02,06"
  "tests/smart-punctuation.test.ts              02,06"
  "tests/auto-correct.test.ts                   02,06"
  "tests/emoji.test.ts                          02,06"
  "tests/footnote.test.ts                       02,06"
  # 2026-09-27：`editor/table-pipe.ts` 那 24 条（含"不挂这一层就复现出病"的对照）。
  "tests/table-pipe.test.ts                    02,06"
  # 2026-10-04：`editor/table-tab.ts` 那 58 条（四种现场 ＋ 两道认键闸；⚠️ 真窗口那半见
  # `docs/06` §5.48——这一份正是"单测全绿、真窗口却是坏的"那个故事的出处）。
  "tests/table-tab.test.ts                     02,06"
  # 2026-09-30：第 90 项「宽松标题输入时先不放大」。扫全篇段落算装饰范围 ＋
  # 「正在写的那一段把宽松那条按住」。真窗口那半见 docs/06 §5.39。
  "tests/heading-on-enter.test.ts               02,06"
  # 2026-09-30：下栏照 Typora 重做那一批。夹侧栏宽 ＋ 三个 240（CSS/TS/Rust）
  # 同值。真拖动那半见 docs/06 §5.40。
  "tests/sidebar-resize.test.ts                 02,06"
  # 2026-09-30：BUG-57 那一批。第④组读 `src/editor/source.ts` 的源码文本对账
  # （数 `切换行内标记(view,` 出现几次、链接那一行还在不在 `wrapSelection` 上），
  # 所以 `source.ts` 一改它就该被重看。真按键那半见 docs/06 §5.43。
  "tests/find.test.ts                          02,06"
  "tests/source-mark.test.ts                    02,06"
  # 2026-10-04（第 50 项那批）：焦点陷阱与页签方向键这两份新钩子的纯逻辑测试。
  # 真 DOM 那半（Tab 的默认挪动、focusin 兜底）没验，账在 docs/06 §5.45。
  "tests/modal-trap.test.ts                     02,06"
  "tests/tablist-keys.test.ts                   02,06"
  # 2026-10-04（第 49 项那批）：四栏那颗就地 × 的口径（长相一致 ＋ 汇到同一个 setter）
  # ＋ 视图菜单里那一族挨着。⚠️ 它读的是**源码文本**与 `MENUS` 结构，不开窗——
  # "点下去真的收起来了"那半没验（本仓没有 jsdom），账在 docs/06 §6.2。
  # ⚠️ 这几份组件一改它就该被重看：`ui/Sidebar.tsx` / `ui/PluginDock.tsx` /
  # `ui/FormatBar.tsx` / `ui/StatusBar.tsx`、那条链子上的 `ui/EditorArea.tsx` /
  # `ui/useChromeVisibility.ts` / `ui/useStatusBar.ts` / `ui/useCommandTable.ts`，
  # 以及 `ui/commands.ts` 里「视图」那一栏的分段。
  "tests/bar-close.test.ts                      02,06"
  # 2026-10-04 深夜（第 14 项那批）：选区上报那一份。⚠️ 第三组是**量测表**（按 markdown
  # 偏移拼接重建不出光标处插入），它盯的是 `editor/caret-snapshot.ts` ＋ `document/mod.rs`
  # ＋ `lua/api/document.rs` 这一条链的**前提**，两边任一侧改了口径它都该被重看。
  "tests/caret-snapshot.test.ts                 02,06"
  # ⚠️ 2026-09-29：`dock.css` 971 行，按用户的新尺子（300–800、按功能拆）分成四份。
  "src/styles/dock.css                            04"
  "src/styles/panel.css                           04"
  "src/styles/panel-data.css                      04"
  "src/styles/plugin-list.css                     04"
  # ⚠️ 2026-09-27 从 `app.css` 拆出来的浮层那一族（四个对话框 ＋ Emoji 补全面板）。
  "src/styles/overlay.css                         04"
  "src/styles/gate.css                            04"
  "src/styles/diff.css                            04,05"
  "src/styles/review.css                          04,05"
  "src/styles/share.css                           04"
  # ⚠️ 2026-09-26 换过一批：用户要求「删掉所有默认主题」，六套（paper /
  # blueprint / mist / print / ink / pine）全删，换成这三套。加一套要同时改
  # `src-tauri/src/themes.rs` 的 `BUILTIN` 表和这里，两处少一处就会出现
  # "菜单里有、清单里没有"（`docs/09` §2.2 那条规矩）。
  "src/styles/themes/minimal.css                 04"
  "src/styles/themes/adwaita/theme.css           04"
  "src/styles/themes/latex.css                   04"
  # ⚠️ 2026-10-16 加的**三份深色补丁**（用户朋友清单第 11 条「编辑器暗色/浅色
  # 跟随主题」）：它们不是另写一份排版，`themes.rs` 把同名浅色那份 `concat!`
  # 进去、这三份只盖颜色——所以文档跟着内置主题那三条走（`04`）。
  # 2026-10-17: CDE 文档风格（深底浅字 + 点宋）。
  "src/styles/themes/cde.css                    04"
  # 2026-10-17: 首选字体缺失那条提示的判据。
  "src/ui/font-check.ts                         04,02"
  "src/styles/themes/dark/minimal.css            04"
  "src/styles/themes/adwaita/dark.css            04"
  "src/styles/themes/dark/latex.css              04"
  "src/styles/diagram.css                        04,05"
  "src/styles/math.css                          04,05"
  "src/editor/video-view.ts                       05,04,10"
  "src/styles/video.css                           04,05"
  "src/styles/marks.css                         04,05"
  # ⚠️ 2026-10-09：**插件源码搬去独立仓库了**（`Nota-plugins`，与主仓库同级），
  #    所以这一段原来那十几行 `plugins/...` 的映射**整段删掉**——文件不在本仓库里，
  #    留着的行只会是"指向不存在的文件"的死账（② 会静默跳过它们，谁也不知道）。
  #    ⇒ 插件那几份自己的闸跟在插件仓库：`Nota-plugins/tools/check.sh`（行数 ＋ 两份
  #    无头测试）；插件改动与 `docs/11`–`13` 的同步，从那天起**靠人**（那三份文档
  #    讲的是宿主给插件的 API，插件自身的实现改动本来也很少推翻它们）。
  # 插件与工程
  "src-tauri/Cargo.toml                           06"
  "package.json                                   06"
  "src-tauri/tauri.conf.json                      01,06"
  "vite.config.ts                                 06"
  "tsconfig.json                                  06"
  "index.html                                     06"
  ".github/workflows/release.yml                  06"

  # ⚠️⚠️ 2026-09-28 一次性补齐的一段。这张表自称是 `docs/09` §2 的机读副本，
  # 可它**长期只是个手抄的片段**：`docs/09` §2 里已经按字面登记、而这里没有的行
  # 有 37 条（后端 8 ＋ 前端 20 ＋ 测试 9），另有 6 份测试**两边都没有**。
  # 后果不是报错，是**② 那条检查静默漏过一整片文件**——它们改了、映射到的文档
  # 没跟，五道闸一道都不响。`tests/` 尤其危险：⑤ 只扫 `src-tauri/src` 与 `src`，
  # **根本不看 `tests/`**，所以测试文件**只靠这张表**被管着（2026-09-27 那两份、
  # 2026-09-28 这四份都是这么漏的，`docs/07` §4 记过两笔）。
  #
  # ⚠️ 为什么之前没补：补一行要**去 `docs/09` §2 查它映射到哪几号文档**，猜不得
  #（猜错了症状是"改 A 文件却提示 B 文档过期"，比漏报更坏——它会教人忽略 WARN）。
  # 所以这一段是**照抄 `docs/09` §2 已有的字面行**，一条新映射都没有。
  #
  # ⚠️ **仍然没进这张表的还有约五十个源文件**（`src-tauri/src/diff.rs`、
  # `src/ui/useSession.ts` 那一批）：它们在 `AGENTS.md` §2 里登记着，所以 ⑤ 过，
  # 但 ② 管不到。补齐它们要先在 `docs/09` §2 里定映射，不是这张表能单方面做完的
  # ——登记在 `docs/07` §4。
  # ── 后端（8）──────────────────────────────────────────────────────────
  "src-tauri/src/single_instance.rs              01,02,06,10"
  "src-tauri/src/url_scheme.rs                   01,02,06,10"
  "src-tauri/src/file_move.rs                    02,04,07,10"
  "src-tauri/src/heartbeat.rs                    02,11,12,13"
  "src-tauri/src/focus/mod.rs                    01,02,06,07,10"
  "src-tauri/src/focus/alarm.rs                  02,06,07"
  "src-tauri/src/commands/focus.rs               02,04,10"
  "src-tauri/src/commands/window.rs              02,04,10"
  # ── 前端（20）────────────────────────────────────────────────────────
  "src/editor/url-link.ts                        05,04,10"
  "src/editor/auto-pair.ts                       05,04,10"
  "src/editor/paste.ts                           05,04,10"
  "src/editor/paste-clean.ts                     05,04,10"
  "src/editor/lang-guess.ts                      05,04,10"
  "src/editor/file-kind.ts                       05,04,10"
  "src/editor/empty-paragraph.ts                 05,06"
  "src/editor/headings.ts                        02,05,10"
  "src/editor/toc.ts                             05,02,10"
  "src/editor/slash.ts                           02,04,05,10"
  "src/ui/tree-options.ts                        02,04,07,10"
  "src/ui/useFileKindMode.ts                     04,07"
  "src/ui/useWindowControls.ts                   02,04,10"
  "src/ui/heatmap.ts                             02,04,06"
  "src/ui/ShareCard.tsx                          02,04,06"
  "src/ui/focus-summary.ts                       02,04,06,07"
  "src/ui/useFocusTrace.ts                       02,04,07"
  "src/styles/accent.ts                          04,08"
  "src/styles/heatmap.css                        04"
  # ── 测试（15）⚠️ 这一组最要紧：`tests/` 没有任何别的闸看着 ──────────────
  "tests/accent.test.ts                          02,06"
  "tests/icon-theme.test.ts                      02,06"
  "tests/doc-typography.test.ts                  02,06"
  "tests/empty-doc-save.test.ts                  02,06"
  "tests/focus-summary.test.ts                   06,07"
  "tests/heatmap.test.ts                         02,06"
  "tests/keymap.test.ts                          02,06"
  "tests/slash.test.ts                           02,06"
  "tests/table-input.test.ts                     02,06"
  "tests/toc.test.ts                             02,06"
  "tests/auto-pair.test.ts                       02,06"
  "tests/lang-guess.test.ts                      02,06"
  "tests/paste-clean.test.ts                     02,06"
  "tests/url-link.test.ts                        02,06"
  "tests/file-kind.test.ts                       02,06"
  "tests/tree-options.test.ts                    02,06"
  "tests/contribution-policy.test.ts             02,06"
  "tests/dock-resize.test.ts                     02,06"
  "tools/check-version.sh                       06"
  "tools/test-frontend.sh                       06"
)

# 文档编号 → 文件。找不到就说明 docs/ 里缺了这份。
doc_file() {
  local num=$1 hit
  hit=$(find docs -maxdepth 1 -name "${num}-*.md" 2>/dev/null | head -1)
  printf '%s' "${hit:-docs/${num}-MISSING.md}"
}

# ── ① 行数上限 ───────────────────────────────────────────────────────────
head_ "① 行数上限（硬线 1000 行，> 800 报 WARN）"

OVER=0
while IFS= read -r f; do
  n=$(wc -l <"$f")
  if [ "$n" -ge 1000 ]; then
    fail "$f 有 $n 行，超上限了 —— 就地按职责拆（docs/09 §4）"
    OVER=$((OVER + 1))
  elif [ "$n" -gt 800 ]; then
    warn "$f 有 $n 行，过了 800（目标 300–800，docs/09 §4），按功能拆"
  fi
# ⚠️ `tests` 也要扫（2026-10-07 加上，`docs/07` 第 89 项）：在加它之前，
#    `tests/` 是这条硬线**唯一没盖到的地方**——`math-view.test.ts` 就是这么
#    涨到 1024 行、超线一整轮都没人报的。测试文件也是本仓的代码。
# ⚠️ 2026-10-09：`plugins` 从这张扫描面上**去掉了**——插件源码搬去了独立仓库
# （`Nota-plugins`），那一份自己的行数闸在 `Nota-plugins/tools/check.sh` 里
# （同一把尺子：1000 硬线 / > 800 WARN）。⛔ 别为了"顺手扫一眼"把它加回来：
# 它会静默扫不到（目录不在），而"扫不到的闸"比没有闸更坏——它看起来是绿的。
done < <(find src-tauri/src src tools tests -type f \
           \( -name '*.rs' -o -name '*.ts' -o -name '*.tsx' \
              -o -name '*.lua' -o -name '*.css' -o -name '*.sh' \) 2>/dev/null | sort)

[ "$OVER" -eq 0 ] && ok "没有超限的文件"

# ── ② 文档新鲜度 ─────────────────────────────────────────────────────────
head_ "② 文档新鲜度（源改了、映射到的文档没跟）"

# 容差 120 秒：刚批量创建/生成时源与文档的 mtime 会差几秒到几十秒，
# 那是构建顺序不是漂移。真漂移（改了代码没动文档）间隔远大于此。
TOL=120
STALE=0
BASE=${DOC_SYNC_BASE:-}
if [ "$CI_MODE" -eq 1 ] && [ -n "$BASE" ] && git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  CHANGED=$(git diff --name-only "$BASE...HEAD" 2>/dev/null || true)
  while IFS= read -r row; do
    src=${row%% *}
    docs_part=${row##* }
    printf '%s\n' "$CHANGED" | grep -Fqx "$src" || continue
    IFS=',' read -r -a nums <<<"$docs_part"
    missing=""
    for num in "${nums[@]}"; do
      doc=$(doc_file "$num")
      printf '%s\n' "$CHANGED" | grep -Fqx "$doc" || missing="$missing $doc"
    done
    if [ -n "$missing" ]; then
      fail "$src 改了，但映射文档没同批修改：$missing"
      STALE=$((STALE + 1))
    fi
  done < <(printf '%s\n' "${PAIRS[@]}")
  [ "$STALE" -eq 0 ] && ok "git diff 内的源文件都有同批文档修改"
else
  for row in "${PAIRS[@]}"; do
    src=${row%% *}
    docs_part=${row##* }
    [ -e "$src" ] || continue          # 文件没了：主循环不管，⑤ 会提
    src_t=$(mtime_of "$src")
    IFS=',' read -r -a nums <<<"$docs_part"
    for num in "${nums[@]}"; do
      doc=$(doc_file "$num")
      [ -e "$doc" ] || continue
      doc_t=$(mtime_of "$doc")
      if [ $((src_t - doc_t)) -gt "$TOL" ]; then
        warn "$src 比 $doc 新 $((src_t - doc_t)) 秒 —— 这份文档的结论可能被推翻了"
        STALE=$((STALE + 1))
      fi
    done
  done
  [ "$STALE" -eq 0 ] && ok "映射表里的文档都跟上了"
fi

# ── ③ 文档引用存在性 ─────────────────────────────────────────────────────
head_ "③ 文档引用存在性（docs/NN-*.md 必须真有）"

MISSING_REF=0
while IFS= read -r ref; do
  num=$(printf '%s' "$ref" | sed -E 's#docs/([0-9]{2})-.*#\1#')
  [ -e "$(doc_file "$num")" ] || { fail "有人引用了 $ref，但 docs/ 里没有这份"; MISSING_REF=$((MISSING_REF + 1)); }
done < <(grep -rhoE 'docs/[0-9]{2}-[a-z-]+\.md' \
           src-tauri/src src plugins tools AGENTS.md docs 2>/dev/null | sort -u)
[ "$MISSING_REF" -eq 0 ] && ok "所有文档引用都指得到"

# ── ④ 编号存在性（backlog 第 N 项 / BUG-N）───────────────────────────────
head_ "④ 编号存在性（docs/07 第 N 项 / BUG-N）"

BACKLOG=docs/07-feature-status.md
if [ ! -e "$BACKLOG" ]; then
  warn "$BACKLOG 不存在，跳过编号检查"
else
  # backlog 表：从「## 3. Backlog」到下一个「## 」之间的 `| N |` 行
  backlog_nums=$(awk '/^## 3\. Backlog/{f=1;next} /^## /{f=0} f' "$BACKLOG" \
                 | grep -oE '^\| *[0-9]+ *\|' | grep -oE '[0-9]+' | sort -u)
  # 缺陷表：从「## 2.」到下一个「## 」之间的 `| **BUG-N** |` 行
  bug_nums=$(awk '/^## 2\./{f=1;next} /^## /{f=0} f' "$BACKLOG" \
             | grep -oE '\*\*BUG-[0-9]+\*\*' | grep -oE '[0-9]+' | sort -u)

  BAD_REF=0
  # 代码与文档里所有「docs/07 … 第 N 项」的引用
  while IFS= read -r n; do
    printf '%s\n' "$backlog_nums" | grep -qx "$n" \
      || { fail "有人引用 docs/07 第 $n 项，但 backlog 里没有这一项"; BAD_REF=$((BAD_REF + 1)); }
  done < <(grep -rhE '07-feature-status|docs/07' \
             src-tauri/src src plugins tools AGENTS.md docs 2>/dev/null \
           | grep -oE '第 *[0-9]+ *项' | grep -oE '[0-9]+' | sort -u)

  # 代码里所有 BUG-N 的引用（BUG-5 这种占位也算，所以只查编号在不在表里）
  while IFS= read -r n; do
    printf '%s\n' "$bug_nums" | grep -qx "$n" \
      || { fail "有人引用 BUG-$n，但缺陷清单里没有这一条"; BAD_REF=$((BAD_REF + 1)); }
  done < <(grep -rhoE 'BUG-[0-9]+' src-tauri/src src plugins tools AGENTS.md docs 2>/dev/null \
           | sort -u | grep -oE '[0-9]+' | sort -u)

  # ⚠️ 计数要 `printf '%s\n'`：`printf '%s'` 不带尾换行时 `wc -l` 会少算一行，
  # 于是"27 项"被报成"26 项"——一个只会让人对不上号的假信息。
  [ "$BAD_REF" -eq 0 ] && ok "backlog 与 BUG 的引用编号都存在（backlog $(printf '%s\n' "$backlog_nums" | wc -l) 项、BUG $(printf '%s\n' "$bug_nums" | wc -l) 条）"
fi

# ── ⑤ 源文件已在文档里登记 ───────────────────────────────────────────────
head_ "⑤ 源文件是否已登记（AGENTS.md §2 或 docs/09 §2）"

UNREG=0
while IFS= read -r f; do
  # 登记用的键：去掉 src-tauri/src/ 或 src/ 前缀，剩下相对路径。
  # 两份文档里就是这么写的（`commands/document.rs`、`ui/Sidebar.tsx`）。
  key=${f#src-tauri/src/}
  key=${key#src/}
  if grep -qF "$key" AGENTS.md 2>/dev/null || grep -qF "$key" docs/09-doc-sync-policy.md 2>/dev/null; then
    :
  else
    warn "$f 没在 AGENTS.md §2 或 docs/09 §2 里登记 —— 加一行（键：$key）"
    UNREG=$((UNREG + 1))
  fi
done < <(find src-tauri/src src -type f \( -name '*.rs' -o -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) 2>/dev/null | sort)
[ "$UNREG" -eq 0 ] && ok "每个源文件都能在文档里找到"

# ── ⑥ 界面字体里不许出现衬线 ─────────────────────────────────────────────
# 用户 2026-09-24：「绝对不要用衬线字体做UI字体。」——原话就是这么绝对。
#
# 判据（是启发式，别当编译器）：`src/styles/` 下 `*.css`（**不含 `themes/`
# 那个子目录**）与 `index.html`，只要出现 `serif` 而不带 `sans-`，就算 FAIL。
#   · `themes/` 是**文档**主题，衬线是它的正当选择（`paper`、`pine` 要的就是纸感）；
#   · 注释行（`*` / `/*` / `//` 开头）跳过——解释这条规矩的文字里必然会
#     出现 `serif` 这个词，不跳过的话这条检查会被自己的说明文字绊倒；
#   · `sans-serif` 里含 `serif`，所以要一起判，不能只 grep `serif`；
#   · **定义 `--font-doc` 的那一整条声明**跳过（它折了两行，见下面的 awk）。
#
# ⚠️ 这条只管字面上的字体栈。`font-family: var(--font-doc)` 这种**间接**引用
# 查不出来（`editor.css` 那一处是正当的：那是正文）。间接的越界靠人看——
# 2026-09-24 就漏过一次：工具栏的斜体字形引了 `--font-doc`，
# 于是界面上的一个字母是宋体画的。
head_ "⑥ 界面字体里有没有衬线"

# ⚠️ **`--font-doc` 那条声明是折成两行的**，所以"把含 `--font-doc` 的那一行免掉"
# 这种做法会漏：第二行 `"Songti SC", serif;` 上根本没有 `--font-doc`，
# 于是**定义文档字体的那一行自己**被报成越界（2026-09-24 真发生了）。
# 这里用 awk 从含 `--font-doc` 那行起、跳过整条声明（到以 `;` 收尾那行为止）。
# 输出保留 `文件:行号:` 前缀，报错时对得上原文。
scan_serif() {
  awk '
    skip { if ($0 ~ /;/) skip = 0; next }
    /--font-doc/ { if ($0 !~ /;/) skip = 1; next }
    /serif/ && !/sans-serif/ && $0 !~ /^[[:space:]]*(\/\*|\*)/ {
      printf "%s:%d:%s\n", FILENAME, FNR, $0
    }
  ' "$@"
}

BAD_FONT=$(scan_serif src/styles/*.css index.html 2>/dev/null || true)
if [ -n "$BAD_FONT" ]; then
  while IFS= read -r line; do
    [ -n "$line" ] && fail "界面样式里出现衬线：$line"
  done <<< "$BAD_FONT"
else
  ok "界面那几份样式里没有衬线字体（themes/ 与 --font-doc 不在此列）"
fi

# ⑥之二：**间接**引用也要挡。`font-family: var(--font-doc)` 一个字面
# `serif` 都不含，上面那条查不到——而 2026-09-24 踩的正是这一脚。
# 合法的去处只有三个：定义它的 `theme/`（2026-09-26 拆成四份之前是
# `theme.css` 一份）、消费它的 `editor.css`（正文）、以及 `themes/` 自己。
# 别的文件引它 = 拿文档字体画界面。
# ⚠️ **白名单是路径前缀，必须跟着 `theme.css` 那次拆分走**：拆之前判据是
# `'/(theme|editor)\.css$'`，拆分当天 `--font-doc` 的定义搬进了
# `theme/base.css`，那条判据立刻从"放行"变成"误报"——`base.css` 就是
# 那个唯一合法的定义处。（2026-09-26 拆完当天就踩了这一脚。）
# 教训：**判据写成"某个具体文件名"时，文件一拆就失效，而且失效方向是
# 把正确的东西报成错的**（比漏报更容易被发现，但也更容易被"顺手加个例外"绕过）。
# ⚠️ **注释行跳过**（`grep -vE ':[0-9]+:[[:space:]]*(/\*|\*)'`）：说清楚
# "这里为什么不能引 `--font-doc`"的那段说明本身就会写着这个名字，
# 不跳过的话这条检查会被自己的解释绊倒——`bars.css` 里那条 ⛔ 注释就是。
# ⚠️ 代价是"把引用写在注释里"查不出来，这是启发式，认了。
# ⚠️ **2026-09-27 又加了一个白名单项：`src/styles/doc-typography.ts`。**
# 它不是"顺手放行"：那个文件正是「文档主题」页那四项（行距 / 段距 / 字体 /
# 字号）算 CSS 变量的地方（`正文排版变量`），输出**只写在 `.editor-pane` 的
# 内联 style 上**，而 `--font-doc` 全仓唯一的消费者是 `editor.css` 里
# `.editor-mount .ProseMirror` 那一条（正文）。也就是它**确实**只在画正文，
# 只是写法是 JS 不是 CSS，上面那条"按扩展名放行"的判据看不见它。
# 下次要再放宽前，先确认这两件事：① 写出来的变量落在哪一层；
# ② 除正文外还有谁读那个变量。
DOCFONT=$(grep -rn 'font-doc' src/styles --exclude-dir=themes 2>/dev/null \
  | grep -vE ':[0-9]+:[[:space:]]*(/\*|\*)' \
  | cut -d: -f1 | sort -u \
  | grep -vE '^src/styles/(theme/|theme\.css$|editor\.css$|doc-typography\.ts$)' || true)
if [ -n "$DOCFONT" ]; then
  while IFS= read -r f; do
    [ -n "$f" ] && fail "$f 引了 --font-doc（文档字体），界面里只能用它画正文"
  done <<< "$DOCFONT"
else
  ok "--font-doc 只在 theme/ 、editor.css、themes 里出现"
fi

# ⑦ 内置界面风格的 id 三份抄本必须一致（2026-09-26）。
#    三份分别是：`ui_styles.rs::BUILTIN_IDS`（**权威**）、`theme/shape.css` 的
#    `[data-ui-style="…"]` 选择器、`AppearancePane.tsx` 的 `STYLE_ORDER`。
#    ⚠️ 为什么值得一条机器判据：三份不一致的**症状分两种，都不报错**——
#    少在 shape.css 里一档 = 那一档选中后"形状是默认的、颜色却是它自己的"（半套）；
#    少在 STYLE_ORDER 里一档 = 后端还没回来时下拉里少一项（一会儿又出现）。
#    两条都不像"漏了一处登记"，像"这个风格没做完"。
#    ⚠️ **`auto` 三份里只该有两份**：它是"跟随系统"这个**伪 id**，由
#    `applyTheme.ts::resolveStyle()` 落成某个具体风格，所以它自己**没有**
#    形状段也没有颜色段——`shape.css` 里找不到它是**对的**。
#    这条判据 2026-09-26 第一次跑就报了它，遂加这一句过滤。
head_ "⑦ 内置界面风格的 id 三份一致"
RUST_IDS=$(sed -n '/pub const BUILTIN_IDS/,/^];/p' src-tauri/src/ui_styles.rs 2>/dev/null \
  | grep -oE '"[a-z0-9-]+"' | tr -d '"' | grep -vx auto | sort -u || true)
CSS_IDS=$(grep -rhoE '\[data-ui-style="[a-z0-9-]+"\]' src/styles/theme/shape.css 2>/dev/null \
  | grep -oE '"[a-z0-9-]+"' | tr -d '"' | grep -vx auto | sort -u || true)
# 前端那份写在数组字面量里，取 `STYLE_ORDER` 到 `];` 之间
TS_IDS=$(sed -n '/const STYLE_ORDER/,/^\];/p' src/ui/settings/panes/AppearancePane.tsx 2>/dev/null \
  | grep -oE '"[a-z0-9-]+"' | tr -d '"' | grep -vx auto | sort -u || true)
if [ -z "$RUST_IDS" ] || [ -z "$CSS_IDS" ] || [ -z "$TS_IDS" ]; then
  warn '⑦ 取 id 清单时有一份是空的——判据本身失效了，别当成三份一致（Rust/CSS/TS 各自取到的行数：'"$(printf '%s\n' "${RUST_IDS:-x}" | wc -l)"'/'"$(printf '%s\n' "${CSS_IDS:-x}" | wc -l)"'/'"$(printf '%s\n' "${TS_IDS:-x}" | wc -l)"'）'
else
  # 两两比一次。⚠️ 用 comm 而不是 diff：comm 的 `-3` 输出**单边独有**的行，
  # 而 `-3` 只压掉两边都有的——正好是"哪一份少了谁"。
  IDS_OK=1
  cmp_ids() {  # $1/$2 是两份清单，$3/$4 是它们各自的名字
    local diff
    diff=$(comm -3 <(printf '%s\n' "$1") <(printf '%s\n' "$2") || true)
    [ -z "$diff" ] && return 0
    IDS_OK=0
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      case "$line" in
        $'\t'*) fail "界面风格 id 「${line#$'\t'}」只在 $4 里，$3 里没有" ;;
        *)      fail "界面风格 id 「$line」只在 $3 里，$4 里没有" ;;
      esac
    done <<< "$diff"
    return 0
  }
  cmp_ids "$RUST_IDS" "$CSS_IDS" "ui_styles.rs::BUILTIN_IDS" "theme/shape.css"
  cmp_ids "$RUST_IDS" "$TS_IDS"  "ui_styles.rs::BUILTIN_IDS" "AppearancePane.tsx 的 STYLE_ORDER"
  cmp_ids "$CSS_IDS"  "$TS_IDS"  "theme/shape.css"           "AppearancePane.tsx 的 STYLE_ORDER"
  if [ "$IDS_OK" -eq 1 ]; then
    ok "三份 id 清单一致（$(printf '%s\n' "$RUST_IDS" | wc -l) 项）"
  fi
fi

# ⑧ 样式表能不能解析（2026-09-26 新增）。
#    ⚠️ 这条的来历：`theme.css` 拆四份那天，文件头注释中间夹了一个 `*/`，
#    第 31 行之后的注释没有起始符——PostCSS 拒绝**整份文件**，于是应用**整个
#    样式表没了**，而 ①~⑦ **全绿**（它们数行数、查登记、比 id，都不解析 CSS）。
#    教训：**"文件是不是 CSS"这件事只有解析器知道**，启发式判不出来。
#    画面上它长成一张 vite 报错叠层，很容易被当成环境问题划过去。
#    ⚠️ 依赖 node + `node_modules/postcss`（仓库 devDependency 里本来就有）；
#    取不到就**跳过并说明**，不假装查过。
head_ "⑧ 样式表可解析"
if command -v node >/dev/null 2>&1 && [ -d node_modules/postcss ]; then
  CSSBAD=$(node -e '
    const p = require("postcss"), fs = require("fs");
    const { execSync } = require("child_process");
    const files = execSync("find src/styles -name \"*.css\"").toString().trim().split("\n");
    let bad = 0;
    for (const f of files) {
      try { p.parse(fs.readFileSync(f, "utf8"), { from: f }); }
      catch (e) { bad++; console.log(`${f}:${e.line}:${e.column} ${e.reason}`); }
    }
    process.exit(0);
  ' 2>/dev/null || true)
  if [ -n "$CSSBAD" ]; then
    while IFS= read -r line; do
      [ -n "$line" ] && fail "样式表解析失败 $line —— PostCSS 会拒收整份文件（整个应用没样式）"
    done <<< "$CSSBAD"
  else
    ok "src/styles 下每份 .css 都能解析"
  fi
else
  ok "跳过（没有 node 或 node_modules/postcss）"
fi

# ── 汇总 ─────────────────────────────────────────────────────────────────
printf '\n%s── 汇总%s\n' "$B" "$N"
if [ "$FAILS" -gt 0 ]; then
  printf '%s%d 项 FAIL、%d 项 WARN%s\n' "$R" "$FAILS" "$WARNS" "$N"
  printf '规则见 docs/09-doc-sync-policy.md\n'
  exit 1
fi
if [ "$WARNS" -gt 0 ]; then
  printf '%s0 项 FAIL、%d 项 WARN%s —— WARN 要人判断：\n' "$Y" "$WARNS" "$N"
  printf '  · 真漂移就去更新文档（不是改脚本）\n'
  printf '  · 只是 mtime 假警报就忽略，并在 docs/07 §4 记一笔\n'
  exit 0
fi
printf '%s全部通过%s\n' "$G" "$N"
exit 0
