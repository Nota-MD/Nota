#!/usr/bin/env bash
#
# doc-sync-check.sh —— 文档同步与行数上限的启发式自检
#
# 规则与判据写在 docs/09-doc-sync-policy.md §3。**改这里之前先改那里。**
#
# 查五件事：
#   ① 行数上限   任何 .rs/.ts/.tsx/.lua/.css/.sh 不得 >= 1000 行
#   ② 文档新鲜度 §2 映射表里的源文件改了、映射到的文档没跟
#   ③ 引用存在性 代码/AGENTS.md 里 docs/NN-*.md 的引用必须指到真文件
#   ④ 编号存在性 代码里「docs/07 第 N 项」与「BUG-N」的编号必须在 docs/07 里存在
#   ⑤ 文件已登记 每个源文件都要在 AGENTS.md §2 或 docs/09 §2 里出现过
#
# 为什么用 mtime 而不是 git diff：**本仓库当前不是 git 仓库**，
# `git status` 直接失败。mtime 是近似，拉取/检出/touch 都会让它误报——
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
  "src-tauri/src/commands/theme.rs                02,04,10"
  "src-tauri/src/themes.rs                        02,03,08"
  "src-tauri/src/plugin/mod.rs                    01,02,11"
  "src-tauri/src/plugin/manifest.rs               03,11,12"
  "src-tauri/src/lua/mod.rs                       01,12"
  "src-tauri/src/lua/api/mod.rs                   12,13"
  "src-tauri/src/lua/api/document.rs              13,05"
  "src-tauri/src/lua/api/fs.rs                    13"
  "src-tauri/src/lua/api/git.rs                   13,11"
  "src-tauri/src/lua/api/ui.rs                    13,04"
  # 前端
  "src/main.tsx                                   06"
  "src/App.tsx                                    02,04"
  "src/bridge/ipc.ts                              02,05"
  "src/editor/create.ts                           05"
  "src/editor/instant-render.ts                   05,04,10"
  "src/editor/task-list.ts                        05,04,10"
  "src/editor/code-block.ts                       05,04,10"
  "src/ui/EditorPane.tsx                          05"
  "src/ui/Sidebar.tsx                             04"
  "src/ui/MenuBar.tsx                             04,10"
  "src/ui/commands.ts                             04,05"
  "src/ui/PluginDock.tsx                          04,10,02"
  "src/ui/ConfirmDialog.tsx                       04,02"
  "src/ui/Home.tsx                                04,10"
  "src/ui/StatusBar.tsx                           04"
  "src/ui/Toasts.tsx                              04"
  "src/ui/ErrorBoundary.tsx                       04"
  "src/ui/outline.ts                              05"
  "src/styles/theme.css                           04,08"
  "src/styles/applyTheme.ts                       04"
  "src/styles/typora-theme.ts                     04,05,08"
  "src/styles/app.css                             04"
  "src/styles/editor.css                          04"
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
