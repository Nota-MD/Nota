#!/usr/bin/env bash
#
# 界面文案的账：**代码里 `t("…")` 的那些键，与 `src/i18n/en.ts` 里的键对得上吗。**
#
# # 为什么要有它
#
# 这套写法（`i18n/en.ts` 顶上那段）把"键"和"原文"合成了一样东西，代价是
# **改了原文就等于改了一个键**，而失效的样子是**静默退回中文**——不报错、
# 界面上看着也挺正常，只是英文没了。没有这道闸，那种事要等一个用英文的用户
# 来报才发现。
#
# # 三条判据
#
# 1. **`t("…")` 的键在 `en.ts` 里没有** —— 不是错，是"这条还没翻译"，
#    列出来当账看（数量是要写进 `docs/07` 的那个数）；
# 2. **`en.ts` 里的键在代码里找不到** —— ⚠️ 这才是**要命的那一类**：
#    它意味着某句原文被改过（或者键打错了、多了一个字），那条英文**已经废了**；
# 3. 插件的 `lang/*.toml`：键是不是插件代码里 `T("…")` 真写过的原文（同上一条
#    的判据），外加两条硬伤——声明了 `langs` 却没有 `lang/en.toml`、有表却没声明
#    `langs`（宿主不会读）。细节见下面第 ③ 段。
#
# 跑法：`bash tools/i18n-check.sh`（没有配 `bash` 时 `sh tools/i18n-check.sh` 也行）。
set -u

# ⚠️ **变量名一律用 ASCII**（和 `doc-sync-check.sh` 一样）。踩过一次：
# 写成 `根=…` 时这台机器上的 bash 把整行当成**命令**去执行（报
# "根=/…: 没有那个文件或目录"），因为它的标识符不许有非 ASCII 字符。
# 中文只出现在注释和输出里。
#
# ⚠️ `readlink -f` 把 `$0` 变成绝对路径再用：脚本可能从子目录里被喊起来
# （`bash ../tools/i18n-check.sh`），那样 `dirname "$0"` 是**相对的**，
# 直接 `cd` 就找不到——而"找不到"的表现是它静默地在**当前目录**里扫了一圈。
HERE="$(dirname "$(readlink -f "$0")")"
cd "$HERE/.." || exit 1

python3 - "$@" <<'PY'
import glob
import os
import re
import sys

# ── 要扫的代码：前端那一面（`t("…")` 的调用者）────────────────────────────
界面文件 = sorted(
    glob.glob("src/**/*.ts", recursive=True) + glob.glob("src/**/*.tsx", recursive=True)
)
# `en.ts` 自己是表，不是调用方。
调用方 = [f for f in 界面文件 if not f.endswith("i18n/en.ts")]

def 去注释_前端(源: str) -> str:
    """把 `//` 与 `/* */` 注释去掉，免得注释里举例写的 `t("…")` 被算成调用。"""
    出 = []
    i, n = 0, len(源)
    状态 = None  # None / "//" / "/*" / '"' / "'" / "`"
    while i < n:
        c = 源[i]
        下 = 源[i + 1] if i + 1 < n else ""
        if 状态 is None:
            if c == "/" and 下 == "/":
                状态 = "//"; i += 2; continue
            if c == "/" and 下 == "*":
                状态 = "/*"; i += 2; continue
            if c in "\"'`":
                状态 = c
            出.append(c); i += 1; continue
        if 状态 == "//":
            if c == "\n":
                状态 = None; 出.append(c)
            i += 1; continue
        if 状态 == "/*":
            if c == "*" and 下 == "/":
                状态 = None; i += 2; continue
            i += 1; continue
        # 字符串里：转义跳过，同级引号收尾（模板串里 `${}` 不展开，够用了）
        if c == "\\":
            出.append(源[i:i + 2]); i += 2; continue
        if c == 状态:
            状态 = None
        出.append(c); i += 1
    return "".join(出)

def 解转义(字面量: str) -> str:
    """把源码里那条字面量的转义还原成**字符串本身的值**。

    ⚠️ 别用 `codecs` / `.encode().decode("unicode_escape")`：它按 latin-1
    解字节，**中文键会被打成一团乱码**。这套写法里键大多是中文，那是致命的——
    而且两边（代码与表）会**一起**变成同一团乱码，于是比较"照样通过"，
    错得无声无息（本脚本踩过一次，2026-09-25）。这里只认这套写法真会写出来的
    两种转义：`\"` 与 `\\`。别的（`\n` 之类）在键里不会出现。
    """
    return 字面量.replace('\\"', '"').replace("\\\\", "\\")


# ── ① 代码里的键 ──────────────────────────────────────────────────────────
调用键: set[str] = set()
for f in 调用方:
    文本 = 去注释_前端(open(f, encoding="utf-8").read())
    for m in re.finditer(r'\bt\(\s*"((?:[^"\\]|\\.)*)"', 文本):
        调用键.add(解转义(m.group(1)))

# ⚠️ **文案表文件**（2026-09-26 补）：这些文件里存的**就是键**，渲染时才翻。
#
# 为什么需要这条：菜单那张表（`ui/commands.ts` 的 `MENUS`）是**模块级常量**，
# import 时就求值——那时语言还没定，而且求值完没有任何东西会通知它重画
#（理由与 `i18n/index.ts::useT` 顶上那段同一条）。所以规矩是**"表存键、
# 渲染时翻"**：`ui/MenuBar.tsx` / `ui/MenuPopup.tsx` / `ui/nativeMenu.ts` /
# `ui/settings/panes/ShortcutsPane.tsx` 各自 `t(menu.label)`。
#
# ⚠️ 那样写出来是 `t(` **变量** `)`，上面那条正则**数不到**。不补这条的后果是
# 双向的：`en.ts` 里那 100 多条会算"废键"（FAIL，把人骗去删没错的东西），
# 而真漏翻的时候这里又不吭声。这与插件那边认 `label = "…"` 是**同一个道理**
#（见下面第 ③ 段那段注释），只是这边按**整个文件**认。
#
# ⚠️ 判据是"这个文件里含中文的字面量**都是**给人看的字"。加文件之前先确认
# 这一点——往里塞一个"中文当数据的表"（比如 id → 中文名的映射），
# 那条数据就会被算成键。
文案表文件 = ["src/ui/commands.ts", "src/ui/view-modes.ts", "src/editor/slash.ts"]
for f in 文案表文件:
    文本 = 去注释_前端(open(f, encoding="utf-8").read())
    # ① 含中文的字面量。`view-modes.ts` 那三行（`short` / `full`）全靠这条。
    for m in re.finditer(r'"((?:[^"\\]|\\.)*)"', 文本):
        值 = 解转义(m.group(1))
        if re.search(r"[一-鿿]", 值):
            调用键.add(值)
    # ② `label: "…"` —— 菜单项的原文。⚠️ 这一类**不能按"含中文"认**：
    #    `Epub…` / `OpenOffice (.odt)…` / `Markdown` / `YAML Front Matter`
    #    这些标签的原文本来就是 ASCII，可它们照样是键（英文表里 `Epub…`
    #    要改成 `EPUB…`、`OpenOffice (.odt)…` 要改成 `OpenDocument (.odt)…`）。
    #    按"含中文"认的话，这几条在表里会被算成**废键**，把人骗去删没错的东西
    #    ——2026-09-26 加这批译文时当场撞上（正好是这条规则要防的那种失效）。
    #    判据因此换成"写在 `label:` 后面"，与文字本身长什么样无关。
    # ⚠️ 只认带引号的那种写法。`themeEntries` 里那个三元（`label: th.builtin ? …`）
    #    匹配不到，但它里面那句 `t("{0}（已自定义）", …)` 被上面第 ① 段收了。
    for m in re.finditer(r'\blabel:\s*"((?:[^"\\]|\\.)*)"', 文本):
        调用键.add(解转义(m.group(1)))

# ── ② 英文表里的键 ────────────────────────────────────────────────────────
#
# ⚠️ 这张表**不止一个文件**（2026-09-26 拆的）：`src/i18n/en.ts` 是汇总，
# 真正的条目在 `en-ui.ts` / `en-settings.ts` / `en-runtime.ts` 里
# ——拆的理由是 `doc-sync-check.sh` 那条 1000 行硬上限，加到 985 行时
# 眼看要撞。所以这里按 `en*.ts` 认，**不能只读 `en.ts`**：
# 只读它的话 500 多条会一起算成"废键"（FAIL），而真漏翻的地方又不吭声。
#
# 判据是"取第一个 `= {` 后面的东西"：几个文件都是
# `export const 某某表: Record<string, string> = { … }` 这个形状，
# 表体前面的文件头注释因此天然被排除掉。⚠️ 文件头里**不要**出现 `= {`
# （包括注释里拿代码举例），出现了就会从那儿切。
表键: set[str] = set()
for 路径 in sorted(glob.glob("src/i18n/en*.ts")):
    英文表体 = open(路径, encoding="utf-8").read().split("= {", 1)[-1]
    for m in re.finditer(
        r'^\s*(?:"((?:[^"\\]|\\.)*)"|([^\s"\'`:/]+))\s*:', 英文表体, re.M
    ):
        表键.add(解转义(m.group(1) or m.group(2)))

未翻译 = sorted(调用键 - 表键)
废键 = sorted(表键 - 调用键)

print(f"界面 t() 的键 {len(调用键)} 条，英文表里 {len(表键)} 条")
if 未翻译:
    print(f"\n还没翻译（{len(未翻译)} 条，不算错，是欠账）：")
    for k in 未翻译:
        print(f"  · {k}")
if 废键:
    print(f"\n⚠️ 废掉的键（{len(废键)} 条）：代码里找不到这句原文——"
          f"要么原文改过、要么键打错了。那条英文**没有生效**：")
    for k in 废键:
        print(f"  · {k}")

# ── ③ 插件：与 `T("…")` 的调用对齐 ────────────────────────────────────────
#
# 插件那边的键也是原文（`T("主题")`），所以判据与前端那两条**一模一样**：
# 表里有、代码里没有 = 废键（FAIL）；代码里有、表里没有 = 欠账（列出来，不算错）。
#
# ⚠️ 插件比前端多两条**硬伤**：
# 1. `plugin.toml` 里声明了 `langs` 却没有 `lang/en.toml` —— 英语是没命中时的
#    兜底，缺了它"支持的语言清单"就是空头支票（宿主侧只拦"清单里没有 en"，
#    拦不住"有 en 但没有那份表"）；
# 2. 有 `lang/*.toml` 却没声明 `langs` —— 宿主**根本不会读**那张表，作者会
#    对着一个"翻译了但没生效"的插件找半天。

def 去注释_lua(源: str) -> str:
    """把 `--` 行注释去掉。字符串里的 `--` 不算（`assets/dir--x` 这种会踩）。

    ⚠️ 长括号（`--[[ … ]]`）没处理：那玩意儿在插件里没出现过，真出现了也只是
    **多留**一段文字（可能多算一条键），不会漏判。
    """
    出 = []
    i, n = 0, len(源)
    状态 = None  # None / "--" / '"' / "'"
    while i < n:
        c = 源[i]
        下 = 源[i + 1] if i + 1 < n else ""
        if 状态 is None:
            if c == "-" and 下 == "-":
                状态 = "--"; i += 2; continue
            if c in "\"'":
                状态 = c
            出.append(c); i += 1; continue
        if 状态 == "--":
            if c == "\n":
                状态 = None; 出.append(c)
            i += 1; continue
        if c == "\\":
            出.append(源[i:i + 2]); i += 2; continue
        if c == 状态:
            状态 = None
        出.append(c); i += 1
    return "".join(出)


def 读表(路径: str) -> set[str]:
    """一张 `lang/*.toml` 里的键。只认"一行一条"这种写法（本仓的表都这么写）。

    ⚠️ **不能按第一个 `=` 切**：键里就有 `=`（`"差异（红 = 删掉的行…）"`），
    那样切出来的是半句话——而且它看着像一条"废键"，会把人骗去改没错的地方
    （本脚本踩过一次，2026-09-25）。带引号的键按**收尾引号**找，别的不带引号。
    """
    def 取键(行: str) -> str:
        if 行.startswith('"') or 行.startswith("'"):
            引 = 行[0]
            for i in range(1, len(行)):
                if 行[i] == "\\":
                    continue  # 跳过被转义的那个字符
                if 行[i] == 引:
                    return 行[1:i].replace('\\"', '"').replace("\\\\", "\\")
            return 行  # 引号没闭合：这行本身就坏了，原样丢回去让人看见
        return 行.split("=", 1)[0].strip()

    出: set[str] = set()
    for 行 in open(路径, encoding="utf-8"):
        行 = 行.strip()
        if not 行 or 行.startswith("#") or "=" not in 行:
            continue
        出.add(取键(行.strip()))
    return 出


废插件键: list[str] = []
插件硬伤: list[str] = []
欠账: dict[str, list[str]] = {}
插件对 = 0

# **保留键**：宿主认得、不必出现在代码里的那两条——它们盖掉清单里的
# `name` / `description`（见 `src-tauri/src/lua/api/i18n.rs::语言包`）。
# ⚠️ 2026-09-27 从只有 `name` 变成两条：那天用户报「拓展语言混杂」，
# 根因是简介不能随语言变（标题英语、简介中文）。加键时**这里要同批加**，
# 不然它会以"代码里找不到这句原文"的样子报出来（那正是它该报的形状）。
保留键 = {"name", "description"}

for 目录 in sorted(glob.glob("plugins/*")):
    清单 = f"{目录}/plugin.toml"
    if not os.path.isfile(清单):
        continue
    代码 = ""
    for lua in glob.glob(目录 + "/**/*.lua", recursive=True):
        代码 += 去注释_lua(open(lua, encoding="utf-8").read())
    # 相邻字面量的拼接（`"前半" .. "后半"`）在运行时是一条键，这里先接起来
    # 再看——不然长句（本仓的句子大多是几段拼的）全都对不上。
    代码 = re.sub(r'"\s*\.\.\s*"', "", 代码)
    用的键 = {
        解转义(m.group(1))
        for m in re.finditer(r'\bT\(\s*(?:\n\s*)?"((?:[^"\\]|\\.)*)"', 代码)
    }
    # ⚠️ **还有一类原文压根不在 `T(` 里**（2026-09-26 补）：`PRESETS` 那种
    # "表里存原文、用的时候才 `T(PRESETS[id].label)`"的写法。它**只能**这么写——
    # 模块级求值时 `T` 还是占位符（见 `plugins/ai/main.lua` 的 `local T`），
    # 写成 `T("润色")` 等于把没翻的原文存进表里。
    # ⚠️ 所以这里多认一个写法：`label = "…"`。**全仓插件里这是唯一一处间接文案**
    # （`grep -rn 'label = "' plugins/` 实测只捞出那 5 条预设名）。
    # ⚠️ 这条规则只会**多**算出键 —— 也就是说它只会少报"废键"，不会让真废键藏起来。
    # 加它之前先确认那句 grep 捞出来的确实都是文案；哪天插件里出现别的间接写法，
    # 要在这里补，别去改插件把它掰成 `T("…")`。
    for m in re.finditer(r'\blabel\s*=\s*"((?:[^"\\]|\\.)*)"', 代码):
        用的键.add(解转义(m.group(1)))
    表们 = sorted(glob.glob(目录 + "/lang/*.toml"))
    for toml in 表们:
        键们 = 读表(toml)
        插件对 += len(键们 - 保留键)
        for 键 in sorted(键们 - 保留键 - 用的键):
            废插件键.append(f"{toml} · {键}")
    声明 = re.search(r"^\s*langs\s*=", open(清单, encoding="utf-8").read(), re.M)
    if 声明:
        if f"{目录}/lang/en.toml" not in 表们:
            插件硬伤.append(f"{目录}：声明了 `langs` 却没有 `lang/en.toml`（英语是兜底）")
        else:
            没翻 = sorted(用的键 - 读表(f"{目录}/lang/en.toml"))
            if 没翻:
                欠账[目录] = 没翻
    elif 表们:
        插件硬伤.append(f"{目录}：有 `lang/` 表却没声明 `langs`——宿主不会读它")

if 插件对 or 废插件键 or 插件硬伤 or 欠账:
    print(f"\n插件文案表：核了 {插件对} 条")
    for x in 废插件键:
        print(f"  ⚠️ 代码里找不到这句原文：{x}")
    for x in 插件硬伤:
        print(f"  ⚠️ {x}")
    for 目录, 没翻 in 欠账.items():
        print(f"  · {目录}：还有 {len(没翻)} 条原文没进 lang/en.toml（不算错，是欠账）")
        for k in 没翻:
            print(f"      · {k}")

# ── ④ 硬编码中文泄漏 ──────────────────────────────────────────────────────
#
# 上面三条判据只管**已经 `t(...)` 起来的**那些句子。真正会漏网的是**压根没包**
# 的那一类：它不会出现在"还没翻译"里（那条判据要求代码里先有 `t("…")`），
# 于是英文界面上冒出一句中文，而**没有任何地方记着这件事**。
#
# 判据只认四种"一眼就是给人看的"写法（全是**故意从宽**的启发式——宁可漏，
# 不可误报：误报会把人训练成无视这一栏）：
#
# 1. JSX 文本节点 `>…中文…<`；
# 2. 几个明确的文案属性（`title` / `aria-label` / `placeholder` / `alt` /
#    `label` / `help`）的**字面量**取值——写成 `label={t(…)}` 的不算；
# 3. JSX 里直接塞的中文字面量 `{"中文"}`；
# 4. `toast("中文…` / `alert(` / `confirm(` 那种一句话的调用（源码模式与
#    表格那两处就是这么写的通知）。
#
# ⚠️ 只扫 `.tsx`。`.ts` 里中文常是**数据**（命令 id 的中文名、正则），
# 误报率太高。`.tsx` 里也不是没有——真出现误报就在下面 `例外` 里加一条，
# **别去改判据**（改宽了等于关掉这一栏）。
文案属性 = r"(?:title|aria-label|placeholder|alt|label|help)"
# JSX 文本节点里不会有的字符。⚠️ **这道闸不能省**：本仓大量拿中文当变量名
# （`const 正文 = …`）、也大量用中文当函数名（`跳到标题(目标)`），而箭头函数
# 的 `=>` 里就有一个 `>`——不加闸时规则 1 会把 `=>` 后面那一整段**代码**
# 当成"文本节点"，一次误报上百条（2026-09-26 实测：98 条里绝大多数是这个）。
代码标点 = set("=;()[]\"'`\\")
泄漏: dict[str, list[str]] = {}
for f in glob.glob("src/**/*.tsx", recursive=True):
    文本 = 去注释_前端(open(f, encoding="utf-8").read())
    命中: list[str] = []
    for 模式 in (
        r">([^<>{}]*[一-鿿][^<>{}]*)",
        rf'{文案属性}\s*=\s*"([^"]*[一-鿿][^"]*)"',
        r'\{\s*"([^"]*[一-鿿][^"]*)"\s*\}',
        r'\b(?:toast|alert|confirm)\(\s*"([^"]*[一-鿿][^"]*)"',
    ):
        for m in re.finditer(模式, 文本):
            值 = 解转义(m.group(1)).strip()
            # ⚠️ 只有标点的"文本"（`）。` 这种）不算——它是句子之间的接缝，
            # 翻不翻都不影响阅读，报了只是噪音。
            if not 值 or not re.search(r"[一-鿿]", 值):
                continue
            if not re.search(r"[^，。、；：！？（）「」…·—\s]", 值):
                continue
            # 散文闸：带代码标点的**一律放过**（宁可漏，不可误报）。
            # 只对规则 1 用——另外三条的取值本来就是引号里的一句话。
            if 模式.startswith(">") and set(值) & 代码标点:
                continue
            命中.append(值)
    if 命中:
        泄漏[f] = sorted(set(命中))

if 泄漏:
    总数 = sum(len(v) for v in 泄漏.values())
    print(f"\n⚠️ 没包 `t(...)` 的中文（{总数} 条，{len(泄漏)} 个文件）——"
          f"这几句**不会**出现在上面的「还没翻译」里，因为那条判据要求先有 `t(\"…\")`：")
    for f, 们 in sorted(泄漏.items(), key=lambda kv: -len(kv[1])):
        print(f"  {f}（{len(们)}）")
        for v in 们[:3]:
            print(f"      · {v[:60]}")
        if len(们) > 3:
            print(f"      · …还有 {len(们) - 3} 条")

# ⚠️ 2026-09-26：这一栏**从"只打印"改成计入 FAIL**。改的时机是有讲究的——
# 加这条判据的那天全仓还有两条真漏网（`FormatBar.tsx` 的 `aria-label="格式化"`、
# `EditorPane.tsx` 的 `正在准备编辑器…`），当场把它们包上 `t(...)` 才算清账。
# 留着"只打印"的后果是：这条判据永远只有出报告那天被人看一眼，之后
# 谁也说不清新冒出来的一条是"刚写的"还是"祖传的"——**闸门不拦的规矩等于没这条规矩**。
失败 = bool(废键 or 废插件键 or 插件硬伤 or 泄漏)
print("\n" + ("FAIL" if 失败 else "OK"))
sys.exit(1 if 失败 else 0)
PY
