# 菜单试验台

**这是工装，不是产品代码。** 它不会被 `vite build`（根那份配置）打进应用，
也不参与 `package.json` 的任何脚本——只有人要**看菜单/快捷键**的时候才跑。

存在的理由：Nota 本体是 Tauri 应用，而在没装窗口管理器的容器里
`xdotool` 送不进按键（`docs/07` 记过），"按 `↓` 焦点走到哪一项"这类事情
**在容器里根本问不出来**。这个试验台把**真实的** `MenuBar` 挂在一个普通网页里，
用系统 Chrome 无头跑脚本 + 截图，于是：

- 弹层的间距、子菜单飞出的位置、深色下的可读性 —— **看得见**；
- 方向键的落点、`Enter` 命中哪一条、`buildAccelIndex` 有没有告警 —— **问得出来**。

⚠️ **它 import 的是 `src/ui/` 里的真组件**（`@` 别名照抄根配置），
不是复制品。复制品会漂移，截出来的图就不再说明产品长什么样了。
所以**改产品代码时这个试验台会跟着一起新**——这是特性，不是负担。
⚠️⚠️ **但"跟着一起新"不会自动发生**（2026-09-26 撞实了）：它**不在类型检查范围内**，
见下面「改产品组件的 props 之后要跑什么」。

## 怎么跑

在 `tauri-dev` 容器里（宿主的 Fedora 上没有 Node 工具链，见 `docs/06`）：

```bash
# ① 构建（产出 tools/menu-harness/dist/）
npx vite build --config tools/menu-harness/vite.config.ts

# ② 起一个静态服务。⚠️ 根目录就是 dist/，所以 URL 里**不带** dist 这一段
python3 -m http.server 8777 --directory tools/menu-harness/dist

# ③ 在宿主上取 DOM（容器里没有浏览器，宿主有 google-chrome）
google-chrome --headless --disable-gpu --virtual-time-budget=3000 --dump-dom \
  'http://127.0.0.1:8777/#frontmatter'
```

**读结果优先用 `--dump-dom` ＋ 正则，别截图读字**（2026-09-26 起改的读法）。
断言全打进页面上一块 `<pre id="harness-report">`，所以 `--dump-dom` 出来的
是**精确字符串**，可以逐条 grep；截图里那些字只能靠眼睛认。要**看长相**
（弹层间距、子菜单飞出的位置）时再用 `--screenshot`：

```bash
google-chrome --headless --disable-gpu --screenshot=/tmp/x.png \
  --window-size=1280,900 --virtual-time-budget=3000 \
  'http://127.0.0.1:8777/#subopen'
```

⚠️ **抓那块 `<pre>` 时正则要认属性**：它带 `style=`（`<pre id="harness-report" style="…">`），
写成 `<pre id="harness-report">` 会**一条都抓不到**，而报出来的样子跟"场景没跑"
一模一样（2026-09-26 就这么白找了一轮）。用 `<pre id="harness-report"[^>]*>`。

⚠️ **要起真编辑器的场景得给足 `--virtual-time-budget`**：`#frontmatter` 里有一场
是真的 `createEditor`（建实例 ＋ 走一遍 mdast），**8 秒不够**（`--dump-dom`
出来是个空壳），**15 秒够**。纯函数场景（`#accel` / `#native`）3 秒就行。

⚠️ **URL 是 `http://127.0.0.1:8777/#场景名`**。写成
`http://127.0.0.1:8777/tools/menu-harness/dist/#场景名` 会 404——
服务的根已经是 `dist/` 了（这条踩过）。

⚠️ **整页空白 + 控制台一条 `TypeError`，是"试验台腐坏"的典型现场**：
`--dump-dom` 里 `#root` 是空的、`<pre id="harness-report">` 根本没有。
看到这个先别怀疑断言，**去跑下面那条 `tsc`**。

## 改产品组件的 props 之后要跑什么

**改了 `src/ui/` 里任何组件的 props，就顺手跑一次：**

```bash
npx tsc --noEmit -p tools/menu-harness
```

那份 `tsconfig.json`（本目录）只干一件事：把 `tools/` 拉进类型检查（根那份的
`include` 只有 `["src", "vite.config.ts"]`，**不含 `tools/`**，而 `vite build`
**只转译不检查**）。⚠️ 它**故意不进** `npm run typecheck`——那条命令是
"产品代码干不干净"的闸门，工装坏了不该把闸门染红。

⚠️ 容器与宿主**共用网络命名空间**，所以宿主上的 Chrome 能直接连
`127.0.0.1:8777`，不用端口映射。⚠️ 容器与宿主**也共用 PID 命名空间**——
别用 `pkill -f` 之类的模式串去收拾服务，理由见 `docs/06` §3.7。

## 场景（`location.hash`）

`main.tsx` 末尾会往页面上贴一个 `<pre>`，把那几行 `log` 打出来——
**断言就是读这几行**，没有测试框架。

| hash | 干什么 | 看什么 |
|---|---|---|
| `#accel` | 30 条键位 + 9 条 `formatAccel` 显示，外加捕获 `console.warn` | 每条 `KeyboardEvent` 都解析成预期的命令 id；macOS 那套显示成 `⇧⌘S`；`buildAccelIndex` **零告警**。⚠️ 这一场是纯函数，不用等 DOM |
| `#native` | 17 条断言跑 `buildNativeTree` | 推给 Rust 的那棵树形状对不对（分隔线、父项不带 `enabled`/`accel`、`checked` 只给可勾项、主题子目录 9 条里 7 条非分隔线） |
| `#theme` | 点开「主题」栏，读条目数与焦点 | 动态条目真的进来了（后端给的 + 无主题 + 打开文件夹）；`End` 跳到哪一项 |
| `#submenu` | 开「文件」→ 一路 `↓` 到「导出」→ `→` → 再 `↓`/`←` | 子菜单飞得出来、焦点进得去、`←` 收得回 |
| `#subopen` | 同上但**停在飞出那一层** | 截图用：图里要留着子菜单 |
| `#sidebar` | 挂**真的** `Sidebar`（夹具：三级标题的正文 + 一棵带子目录的树）：折大纲第一层、再折第二层、展开回来、切到「文件」页展开目录 | 折叠后剩哪几行、三角转没转、折起来的条数、**右上角那颗 × 在不在、提没提示、有没有被页签挤出栏外**（量的是 `getBoundingClientRect`，不是"查得到"）、点它的回调次数 |
| `#sidebar-empty` | 同上，但**工作区夹具换成 `null`** | 空态那句话 + 里面那颗「打开文件夹…」按钮点得动（回调计数）。⚠️ 夹具里默认页是「大纲」（大纲来自正文、与工作区无关），所以这一场**先切到「文件」页**才看得见空态 |
| `#math` | 把 physics 宏表**每一条**真渲染一遍（108 条 + 一串针对性反例） | 宏表与样例表是不是同一批、缺样例的宏、开着有没有失败的、**对照渲染**（`PHYSICS_EQUIVALENTS`：宏写法 vs 手写等价 TeX，比可见文本）、关着时哪些还能渲染、`\braket` 两个方向的元数变化、`\div`/`\Re`/`\Im` 是否被重定义、`\ce`/`\pu`、坏公式渲不渲染成错误而不抛 |
| `#frontmatter` | **开头那段 YAML front matter**（2026-09-26，BUG-39 的判据）：① 对 `editor/front-matter.ts` 那两个纯函数跑 15 条边界断言；② 起一个**真的** `createEditor`，把一份带 front matter 的文档**进→出**走一遍；③ 再起一个**只读**实例（分屏预览／导出那条路） | ① 纯函数：`---`/`theme: seriph`/`---` 认不认、围栏后那个空行算不算进前置块、CRLF、`...` 收尾、无闭栏、空块 `---\n---`、不在第一行、列表型 `- a`、**"一份全是 `键: 值` 的散文会被误认"那条已知边界**；② **进→出逐字节相同**（⚠️ 这条纯函数断言替不了：正文过一遍 mdast 会不会被规范化，只有真实例答得上来）；③ 只读实例出来的文本**不含 `theme`** |
| `#dark` / `#ghub-dark` | 换外观轴 | 深色下弹层文字还读不读得出来。⚠️ hash 用 `-` 分段（`scene-style`），拼错会静默落回默认外观 |
| （无 / 其他） | 默认场景：开「文件」、验方向键与步数 | 焦点从第一项开始、每按一次 `↓` 走一格 |

⚠️ **`#dark-...` 这种写法的坑**：hash 是按 `-` 切成场景与外观的，
所以 `#dark-file` 会被读成「场景 = dark，外观 = file」——外观那里拿到一个
不存在的值，`data-ui-style` 就落空，**截出来的图既不是深色也不是任何风格**。
要深色 + Adwaita 就写 `#dark-adwaita-dark`。
⚠️ 同一套切法也意味着 **`#sidebar-empty` 会被当成「场景 = sidebar、外观 = empty」**：
外观那一段拿到 `empty`（不存在的风格，落回默认）——**这是无害的**，
`#sidebar-empty` 那一支判的是 `hash.includes("empty")`（不是等于某个串，
否则 `#sidebar-empty-ghub-dark` 这类组合会被漏掉）。报告最后那行
`外观 = empty/light` 就是这件事，不是故障。

## 这个试验台抓到过什么

留个账，省得以后有人觉得"工装嘛，坏了再说"：

- **`CODE_TO_KEY` 漏了 `Digit0`…`Digit9`。** 判键位是 `e.code` 优先、`e.key` 兜底，
  少了数字那一行之后兜底接住了——不带 Shift 时 `e.key` 恰好是 `"1"`，
  于是 `Ctrl+1` 照样能用，**窟窿被完全盖住**，只有 `Ctrl+Shift+1` 会露馅。
  静态读代码看不出来，`#accel` 第一次跑就抓到了。见 `docs/07` §4。
- **`MenuBar` 收了 `currentTheme` 却从没用过**，所以「主题」栏**一个勾都不画**。
  `#theme` 的数对得上，但截图里没有 ✓——是**图**抓到的，不是断言。
- **子菜单被父弹层的滚动容器裁成一条竖线**（`overflow-y: auto` 会把
  `overflow-x` 也算成 `auto`）。`#subopen` 的截图是唯一能看见它的地方。
- **`#math` 的判据曾经太松，放过了五条"能渲染、画错了"的宏。** 它原来只问
  "这条宏炸不炸"，而 physics 那一族 `\dv` / `\pdv` / `\dd` 全都**能渲染、
  只是画成 `]dxfdfx` 这种垃圾**（用了 KaTeX 不支持的可选参写法），
  于是**整整一轮没人发现**。补的判据是 `PHYSICS_EQUIVALENTS`：宏写法的
  **可见文本**必须等于手写等价 TeX 的。⚠️ 加断言时**当场拿旧写法验一遍它会报红**，
  否则没法排除"新断言是摆设"。
- **它自己白屏了两天，没人发现。** `MenuBar` 自 2026-09-24 起要求传 `menus`，
  而这里一直没传——`props.menus.map` 当场抛，**整页空白**。抓不到是因为
  它**不在类型检查范围内**（根 `tsconfig` 的 `include` 不含 `tools/`，
  `vite build` 只转译不检查），编译得过、运行时白屏。2026-09-26 为了加
  `#frontmatter` 场景才发现，同批补了本目录的 `tsconfig.json`。
  ⚠️ 这条对"改产品代码时试验台会跟着一起新"那句话是个反例——**"会"要人推一把**。
- **两处静默失效是同一次开 `tsc` 抓出来的**，一开就报：① `byLabel` 返回
  `HTMLElement`（不是 `HTMLButtonElement`），于是 `exportBtn.disabled` 恒
  `undefined`——**一条永远为真的假断言**；② `Sidebar` 缺 `onJumpOutline`。
  ⚠️ 假断言比没有断言更坏：它把"没验"记成了"验过"。同一条道理对**自己写的样本**
  也成立——那天 `#frontmatter` 里就有一条样本写错（样本里混进一行普通散文，
  当然不匹配），改对了才报红。

⚠️ **反过来也要记**：这个试验台**证明不了**"在真 Tauri 窗口里按下去真响"。
它证明的是"**表推得对、DOM 长对**"。两条都要，别拿一条当另一条。
