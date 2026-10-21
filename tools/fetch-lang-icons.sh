#!/usr/bin/env bash
#
# 把**语言图标**从 vscode-icons 抓进 `src/assets/lang-icons/`，并刷新 `SHA256SUMS`。
#
# # 为什么要有这个脚本（而不是"当时 cp 了一下"）
#
# 那一批 SVG 是**上游的东西**，不是本仓自绘的。要证明"搬进来的一个字节没改"，
# 就得有办法**重新拿一份来对**——没有脚本的话，"上游那一份"只存在于当时那次
# 会话的终端记录里，谁也复现不了。这与 `src/assets/icons/`（Folio 那一套，
# 见 `THIRD-PARTY.md` §5）是同一个道理，只是那一套的上游是本机上的另一个仓库。
#
# # 跑法
#
# ```sh
# bash tools/fetch-lang-icons.sh            # 抓一遍，重写 SHA256SUMS
# bash tools/fetch-lang-icons.sh --verify   # 只核对本地文件与 SHA256SUMS 对不对
# ```
#
# `--verify` **不联网**，是"这些文件有没有被人手改过"的判据。⚠️ 抓取的那一遍
# 只要上游那个 tag 没动，结果就应当逐字节相同；不同就是上游改了 tag（那件事
# 本身要记进 `THIRD-PARTY.md` 并换 tag）。
#
# # 名称表：`file_type_<名字>.svg`
#
# ⚠️ **这张表是"哪些图标有"，不是"哪些语言有图标"**——语言 id 到图标的映射
# 在 `src/editor/lang-icons-real.ts` 里（那边一个图标可以对应好几个语言 id，
# 比如 `js` 与 `javascript`）。两边对不上的话，`tests/lang-icons.test.ts` 会红。
#
# ⚠️ **这张表里没有的，不代表语言没有图标可用**：`refractor` 里一共 400 个
# 语言 id，任何图标集都覆盖不全，查不到的一律回落到首字母徽章
# （`src/editor/lang-icon.ts`）。所以**少一个名字不是错**，只是那个语言少一颗图。
#
# ⚠️ 有几个名字是"vscode-icons 里就叫这个、和语言名不一样"的，别照语言名猜：
#   - `dartlang` 不是 `dart`      - `shell` 不是 `bash`
#   - `reactjs` / `reactts`       - `objectivec` 不是 `objc`
#   - `text` 不是 `plaintext`     - `tex` 不是 `latex`
# 换句话说：**这张表里的名字要先在仓库里查到再加**，猜出来的名字会 404。
#   （`csv`、`makefile`、`swift`… 这些都**没有**对应的图，本仓故意留着不抓。）
#
# ⚠️ **反过来的坑也要知道**：图有了，可**语言 id 那边没有对应的名字**，
# 那颗图就只能删掉（留着是死文件，`tests/lang-icons.test.ts` 第一组会红）。
# 2026-09-26 抓完第一版就撞了三个：
#   - `nunjucks` —— `refractor` 里根本没有这个语言 id，整颗图删了；
#   - `bat`      —— 语言 id 叫 **`batch`**（图名才是 `bat`）；
#   - `assembly` —— 语言 id 里没有这么笼统的名，只有 `nasm` / `armasm` /
#                   `asm6502` / `arm-asm`（图还是这颗图，罩四个 id）。
# 判据一律是"`refractor.listLanguages()` 里有没有"，**不是**"这个名字看着对不对"。
set -u

# ⚠️ 变量名一律用 ASCII（与 `doc-sync-check.sh` / `i18n-check.sh` 同一条教训）：
# bash 的标识符不许有非 ASCII 字符，写成中文会被当成命令去执行。中文只出现在
# 注释与输出里。
#
# ⚠️ 用 `readlink -f` 把 `$0` 变成绝对路径再取目录：脚本可能从子目录里被喊起来，
# 那样 `dirname "$0"` 是相对的，`cd` 就会落到别处——而"落到别处"的表现是它安安静静
# 地在错误的目录里下载了一堆文件。
HERE="$(dirname "$(readlink -f "$0")")"
cd "$HERE/.." || exit 1

# ⚠️ **钉在 tag 上，不钉 `master`**：`master` 每天都在动，那样"重跑一遍对一对"
# 就永远对不上，这个脚本也就失去了唯一的那点用处。换 tag 时要同批改
# `THIRD-PARTY.md` §6 里写着的版本号。
TAG="v12.19.0"
BASE="https://raw.githubusercontent.com/vscode-icons/vscode-icons/$TAG/icons"
OUT="src/assets/lang-icons"

NAMES="js reactjs reactts typescript css scss sass less html xml svg json yaml toml ini \
excel c cpp csharp java kotlin scala groovy gradle python ruby php perl lua r julia matlab \
go rust swift dartlang zig elixir erlang haskell clojure lisp ocaml elm nim crystal fortran \
cobol ada prolog vhdl verilog wasm solidity qsharp fsharp sql graphql nginx docker cmake \
shell powershell bat diff git http tex mermaid markdown text objectivec assembly racket tcl \
awk pug haml stylus jinja handlebars mustache twig rest protobuf vim glsl hlsl erb \
ejs plantuml asciidoc vb"

MODE="${1:-fetch}"

if [ "$MODE" = "--verify" ]; then
  # ⚠️ `sha256sum -c` 要在**它自己那个目录**里跑：`SHA256SUMS` 里的路径是相对的。
  #     少一个文件、多一个文件它都会报出来。
  cd "$OUT" || { echo "$OUT does not exist; run a normal fetch first"; exit 1; }
  if sha256sum -c SHA256SUMS --quiet; then
    echo "OK: $OUT: $(wc -l < SHA256SUMS) files match SHA256SUMS byte-for-byte"
  else
    echo "FAIL: $OUT does not match SHA256SUMS (differences are listed above)" >&2
    echo "  These files are copied verbatim from upstream. The byte-for-byte guarantee" >&2
    echo "  is what makes them auditable; see THIRD-PARTY.md §6." >&2
    exit 1
  fi
  exit 0
fi

mkdir -p "$OUT" || exit 1
FAIL=0
for name in $NAMES; do
  url="$BASE/file_type_$name.svg"
  dst="$OUT/file_type_$name.svg"
  # ⚠️ `-f` 让 HTTP 404 变成非零退出码：不加的话 404 的响应体是一篇 HTML 错误页，
  # 存下来是个「.svg 后缀的 HTML」，而它照样能被浏览器渲染成"一片空白"——那种
  # 坏法在界面上看不出原因。
  if ! curl -fsS --max-time 30 -o "$dst" "$url"; then
    echo "FAIL: could not fetch file_type_$name.svg ($url)" >&2
    FAIL=1
    continue
  fi
  # 只认 `<svg` 开头的（前面可能有 BOM / XML 声明 / 注释，所以不按字节 0 判）。
  if ! head -c 200 "$dst" | grep -q "<svg"; then
    echo "FAIL: file_type_$name.svg is not SVG (upstream may have renamed or changed format)" >&2
    FAIL=1
  fi
done

if [ "$FAIL" != 0 ]; then
  echo "Some files are missing; SHA256SUMS was NOT updated. This avoids publishing an incomplete icon set." >&2
  exit 1
fi

# ⚠️ 每次抓完**重写**整份清单，不是追加：这张表就是"这一版到底搬了哪几个文件"。
#     `LC_ALL=C` 是为了排序稳定——不同 locale 下 `sort` 的顺序不同，重跑一次
#     就会得到一份"内容一样但行序不同"的 SHA256SUMS，那种 diff 全是噪音。
( cd "$OUT" && LC_ALL=C ls file_type_*.svg | sort | xargs sha256sum > SHA256SUMS )

echo "OK: $OUT: $(printf '%s\n' $NAMES | wc -l) files; SHA256SUMS rewritten"
echo "  Source: vscode-icons $TAG (MIT); full attribution is in THIRD-PARTY.md §6"
