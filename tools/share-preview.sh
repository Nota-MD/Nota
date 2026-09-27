#!/usr/bin/env bash
# 分享卡的预览 / 宣传图：`tools/share-preview.ts` → SVG → PNG。
#
# 用法（⚠️ 本机宿主没有工具链，要走容器，见 memory 的 tauri-dev）：
#
#   cd <仓库>
#   podman exec -u 1000 -w "$PWD" tauri-dev bash tools/share-preview.sh [输出目录]
#
# 默认输出到 `/tmp/nota-preview`。⚠️ 别往仓库里写图：这是一次性的宣传素材，
# 而 `plugins/stats/design/` 那两份是**设计稿**（改版式时要连着改的那份），
# 两者不是一回事。
#
# 依赖两样，都不在宿主上：
#   · `npx esbuild`（仓库的 node_modules 里有）
#   · `rsvg-convert`（容器里 `dnf install -y librsvg2-tools` 装的）
# 后者是**光栅化**用的，与线上那条路（浏览器 canvas）不同——所以这张图能证明
# 「版式对不对」，**证明不了**「按"保存 PNG"存出来的和它一模一样」。
# 后者归无头目检（`docs/06` §5.32）。
set -euo pipefail

# ⚠️⚠️ 变量名**一律 ASCII**：bash 的标识符只认 ASCII，`出=$(…)` 那种写法不是
# 赋值，是一句"执行名叫 `出=…` 的命令"——报错长这样，而且看不出是中文名的锅：
#   tools/share-preview.sh: line 21: 出=…: No such file or directory
repo=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo"

out=${1:-/tmp/nota-preview}
tmpstage=/tmp/nota-share-preview
mkdir -p "$tmpstage" "$out"

command -v rsvg-convert >/dev/null || {
  echo "缺 rsvg-convert：dnf install -y librsvg2-tools（容器里用 -u 0 装）" >&2
  exit 1
}

# ⚠️ 两个开关与 `tests/share-card.test.ts` 文件头写的**是同样两个**：`@` 别名
# 与 `.svg` 当文本读（`ui/nota-mark.ts` 里那个 `?raw` 导入）。
npx esbuild tools/share-preview.ts --bundle --platform=node --format=esm \
  --loader:.svg=text --alias:@=./src \
  --outfile="$tmpstage/preview.mjs"

node "$tmpstage/preview.mjs" "$out"

for f in "$out"/*.svg; do
  [ -e "$f" ] || continue
  rsvg-convert -o "${f%.svg}.png" "$f"
done
echo "光栅化完成 → $out/*.png"
