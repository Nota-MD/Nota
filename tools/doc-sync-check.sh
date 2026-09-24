#!/usr/bin/env bash
#
# doc-sync-check.sh —— 文档同步与行数上限的启发式自检
#
# 规则与判据写在 docs/09-doc-sync-policy.md §3。**改这里之前先改那里。**
#
# 查六件事：
#   ① 行数上限   任何 .rs/.ts/.tsx/.lua/.css/.sh 不得 >= 1000 行
#   ② 文档新鲜度 §2 映射表里的源文件改了、映射到的文档没跟
#   ③ 引用存在性 代码/AGENTS.md 里 docs/NN-*.md 的引用必须指到真文件
#   ④ 编号存在性 代码里「docs/07 第 N 项」与「BUG-N」的编号必须在 docs/07 里存在
#   ⑤ 文件已登记 每个源文件都要在 AGENTS.md §2 或 docs/09 §2 里出现过
#   ⑥ 界面无衬线 界面那几份 .css 与 index.html 里不许出现衬线字体栈
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
  "src-tauri/src/error.rs                         02,03"
  "src-tauri/src/paths.rs                         02,03"
  "src-tauri/src/state.rs                         01,03"
  "src-tauri/src/settings.rs                      03,04,10"
  "src-tauri/src/document/mod.rs                  03,05"
  "src-tauri/src/commands/mod.rs                 02"
  "src-tauri/src/commands/document.rs             02,04,10"
  "src-tauri/src/commands/workspace.rs            02,04"
  "src-tauri/src/commands/settings.rs             02,04"
  "src-tauri/src/commands/plugin.rs               02,04"
  "src-tauri/src/commands/menu.rs                 02,04"
  "src-tauri/src/slidev.rs 02,06,07"
  "src-tauri/src/commands/slidev.rs 01,02,04"
  "src-tauri/src/commands/theme.rs                02,04,10"
  "src-tauri/src/commands/export.rs            02,04,05"
  "src-tauri/src/native_menu.rs                   01,02,04"
  "src-tauri/src/themes.rs                        02,03,08"
  "src-tauri/src/plugin/mod.rs                    01,02,11"
  "src-tauri/src/plugin/manifest.rs               03,11,12"
  "src-tauri/src/slidev_probe.rs                  02,06,07"
  "src-tauri/src/lua/mod.rs                       01,12"
  "src-tauri/src/lua/api/mod.rs                   12,13"
  "src-tauri/src/lua/api/document.rs              13,05"
  "src-tauri/src/lua/api/fs.rs                    13"
  "src-tauri/src/lua/api/git.rs                   13,11"
  "src-tauri/src/lua/api/ui.rs                    13,04"
  "src-tauri/src/lua/api/http.rs                  13,12,02,06"
  "src-tauri/src/lua/api/settings.rs              13,12,07"
  # 前端
  "src/main.tsx                                   06"
  "src/App.tsx                                    02,04"
  "src/bridge/ipc.ts                              02,05"
  "src/editor/create.ts                           05"
  "src/editor/atx.ts                              05,03,10"
  "src/editor/lax-heading.ts                      05,03,07"
  "src/editor/command-state.ts                    05,04"
  "src/editor/insert.ts                           05"
  "src/editor/find.ts                             05,04"
  "src/editor/writing-modes.ts                    05,04"
  "src/editor/image-attrs.ts                      05,04"
  "src/editor/math-macros.ts                      05,10,04"
  "src/editor/source.ts                           05,04,10"
  "src/editor/instant-render.ts                   05,04,10"
  "src/editor/task-list.ts                        05,04,10"
  "src/editor/code-block.ts                       05,04,10"
  "src/ui/EditorPane.tsx                          05"
  "src/ui/FormatBar.tsx                           04,05"
  "src/ui/Icon.tsx                                02,04"
  "src/ui/FindBar.tsx                             04,05"
  "src/ui/PromptDialog.tsx                        04,02"
  "src/ui/useMenus.ts                             04,02"
  "src/ui/useDialogs.ts                           04,02"
  "src/ui/Sidebar.tsx                             04"
  "src/ui/MenuBar.tsx                             04,10"
  "src/ui/TopBar.tsx                              04,02"
  "src/ui/TabBar.tsx                              04,02"
  "src/ui/MenuPopup.tsx                           04"
  "src/ui/useMenuRovingFocus.ts                   04"
  "src/ui/useSlidev.ts 02,04,10"
  "src/ui/useExport.ts 02,04,10"
  "src/ui/useDocTheme.ts 02,04,10"
  "src/ui/useEditorCommands.ts 02,04,05"
  "src/editor/export.ts 05,10"
  "src/ui/nativeMenu.ts                           04"
  "src/ui/accel.ts                                04,05"
  "src/ui/commands.ts                             04,05"
  "src/ui/PluginDock.tsx                          04,10,02"
  "src/ui/PanelBody.tsx                           04,11"
  "src/ui/panel-nodes.ts                          11,13"
  "src/ui/pluginMenus.ts                          04,13"
  "src/ui/plugin-prompt.ts                        04,13"
  "src/ui/usePlugins.ts                           02,04"
  "src/ui/SlidevPanel.tsx                         04,02"
  "src/ui/ConfirmDialog.tsx                       04,02"
  "src/ui/Home.tsx                                04,10"
  "src/ui/StatusBar.tsx                           04"
  "src/ui/Toasts.tsx                              04"
  "src/ui/ErrorBoundary.tsx                       04"
  "src/ui/settings/SettingsDialog.tsx             04"
  "src/ui/settings/primitives.tsx                 04"
  "src/ui/settings/panes.tsx                      04"
  "src/ui/settings/ShortcutsPane.tsx              04"
  "src/ui/outline.ts                              05"
  "src/ui/view-modes.ts                           04"
  "src/styles/theme.css                           04,08"
  "src/styles/icons.css                           04"
  "src/styles/applyTheme.ts                       04"
  "src/styles/doc-theme.ts                        04,05,08"
  "src/styles/settings.css                        04"
  "src/styles/app.css                             04"
  "src/styles/sidebar.css                         04"
  "src/styles/editor.css                          04"
  "src/styles/bars.css                            04"
  "src/styles/dock.css                            04"
  "src/styles/slidev.css                          04"
  "src/styles/themes/paper.css                    04"
  "src/styles/themes/blueprint.css                04"
  "src/styles/themes/mist.css                     04"
  "src/styles/themes/print.css                    04"
  "src/styles/themes/ink.css                      04"
  "src/styles/themes/pine.css                     04"
  # 插件与工程
  "plugins/git/plugin.toml                        11"
  "plugins/ai/plugin.toml                         11"
  "plugins/git/main.lua                           11,13"
  "plugins/ai/main.lua                            11,13"
  "src-tauri/Cargo.toml                           06"
  "package.json                                   06"
  "src-tauri/tauri.conf.json                      01,06"
  "vite.config.ts                                 06"
  "tsconfig.json                                  06"
  "index.html                                     06"
  ".github/workflows/release.yml                  06"
)

# 文档编号 → 文件。找不到就说明 docs/ 里缺了这份。
doc_file() {
  local num=$1 hit
  hit=$(find docs -maxdepth 1 -name "${num}-*.md" 2>/dev/null | head -1)
  printf '%s' "${hit:-docs/${num}-MISSING.md}"
}

# ── ① 行数上限 ───────────────────────────────────────────────────────────
head_ "① 行数上限（1000 行）"

OVER=0
while IFS= read -r f; do
  n=$(wc -l <"$f")
  if [ "$n" -ge 1000 ]; then
    fail "$f 有 $n 行，超上限了 —— 就地按职责拆（docs/09 §4）"
    OVER=$((OVER + 1))
  elif [ "$n" -ge 900 ]; then
    warn "$f 有 $n 行，快到 1000 了，该想怎么拆"
  fi
done < <(find src-tauri/src src plugins tools -type f \
           \( -name '*.rs' -o -name '*.ts' -o -name '*.tsx' \
              -o -name '*.lua' -o -name '*.css' -o -name '*.sh' \) 2>/dev/null | sort)

[ "$OVER" -eq 0 ] && ok "没有超限的文件"

# ── ② 文档新鲜度 ─────────────────────────────────────────────────────────
head_ "② 文档新鲜度（源改了、映射到的文档没跟）"

# 容差 120 秒：刚批量创建/生成时源与文档的 mtime 会差几秒到几十秒，
# 那是构建顺序不是漂移。真漂移（改了代码没动文档）间隔远大于此。
TOL=120
STALE=0
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
# 合法的去处只有三个：定义它的 `theme.css`、消费它的 `editor.css`（正文）、
# 以及 `themes/` 自己。别的文件引它 = 拿文档字体画界面。
# ⚠️ **注释行跳过**（`grep -vE ':[0-9]+:[[:space:]]*(/\*|\*)'`）：说清楚
# "这里为什么不能引 `--font-doc`"的那段说明本身就会写着这个名字，
# 不跳过的话这条检查会被自己的解释绊倒——`bars.css` 里那条 ⛔ 注释就是。
# ⚠️ 代价是"把引用写在注释里"查不出来，这是启发式，认了。
DOCFONT=$(grep -rn 'font-doc' src/styles --exclude-dir=themes 2>/dev/null \
  | grep -vE ':[0-9]+:[[:space:]]*(/\*|\*)' \
  | cut -d: -f1 | sort -u | grep -vE '/(theme|editor)\.css$' || true)
if [ -n "$DOCFONT" ]; then
  while IFS= read -r f; do
    [ -n "$f" ] && fail "$f 引了 --font-doc（文档字体），界面里只能用它画正文"
  done <<< "$DOCFONT"
else
  ok "--font-doc 只在 theme.css / editor.css / themes 里出现"
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
