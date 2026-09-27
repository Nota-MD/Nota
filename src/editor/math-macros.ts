/**
 * 数学公式的**宏表**：physics 宏包那一套命令（`\qty`、`\dv`、`\braket`…）。
 *
 * # 为什么是手工宏表，而不是引一个扩展
 *
 * 数学渲染走 KaTeX，而 **KaTeX 官方只有四个扩展**（auto-render / copy-tex /
 * mathtex-script-type / mhchem），**没有 physics**（`katex.org/docs/libs` 那张
 * 官方清单与 `contrib/` 目录都可以对着看）。社区只有 `katex-physics` 一个包，
 * 2019 年后再没发过版本、仓库里连 LICENSE 文件都没有（npm 元数据写 MIT、
 * GitHub 那边报 null，两边对不上）。**不引它**：一份停更七年、许可说不清的
 * 依赖不该进公式这条路。
 *
 * 所以这一份是**照着 physics 的语义自己写的宏定义**（命令名对齐、行为对齐），
 * 不是它的移植。⚠️ 没覆盖到的命令逐条列在 `docs/10` §11.1——这张表是
 * "能用哪些命令"的唯一真相，**一条都不能漏**。
 *
 * # 三条实现上的硬约束（改之前先读）
 *
 * 1. **参数用花括号**。physics 的 `\qty(\frac{a}{b})`（拿下一个字符当分隔符）
 *    在 KaTeX 的宏里做不到——字符串宏吃不到"下一个 token 是什么"。
 *    所以 `\qty{x}` 固定展开成圆括号，方括号/花括号那些写法用等价的
 *    `\bqty{}` / `\Bqty{}`。physics 文档自己也把 `\pqty` 那套写成
 *    "robust and more LaTeX-friendly" 的推荐写法，本仓照这个写法做。
 * 2. **可选参数只能走 `\renewcommand{\x}[n][默认]{}`**。这是试出来的：
 *    `\newcommand` 会报 "attempting to redefine"（KaTeX 里这些名字已经存在），
 *    直接用 `\def` 风格的可选参会掉进 "Too many expansions"。
 * 3. **星号不吃**。`\abs*{x}`（不缩放）那种写法 KaTeX 的宏语法表达不了，
 *    星号会被当成正文打出来。要"不缩放"就自己写 `|x|`。
 *
 * # 和 KaTeX 内置命令打架的两条
 *
 * `\div` 与 `\Re` / `\Im` **KaTeX 本来就有定义**（除号、实部 ℜ、虚部 ℑ）。
 * physics 会重定义它们，本仓照做——**但这一档默认是关的**
 * （`Settings.enable_physics`），理由见 `settings/mod.rs` 里那个字段的注释：
 * 一开就改了别人既有公式的意思，这种事不该默认发生。
 * 关着时 `\div` 还是除号，开着时才是散度算子。
 */

/**
 * ⚠️ **这一行是副作用导入**：它把 KaTeX 官方的 mhchem 扩展挂上，
 * 「化学式」的 `\ce{H2O}` 与 `\pu{123 kJ}` 才有定义——少这一行这两条命令没有定义。
 *
 * 它和 physics 那一档**无关**（不跟着那个开关走）：KaTeX 官方清单里
 * mhchem 就是它自带的四个扩展之一，`\ce` 属于内置命令，不需要用户拨开关。
 * 实测它**不碰任何既有命令**（`\div` 引它之后还是除号），所以"一直开着"是安全的。
 *
 * ⚠️ 只在**这一个文件**里引：它改的是 katex 那个模块实例，引两遍是无害的
 * 重复，但"到底谁把它打开的"会变得没人说得清。
 */
import "katex/dist/contrib/mhchem.mjs";
import type { KatexOptions } from "katex";

/**
 * 宏表。键是命令名（含反斜杠），值是展开式；`#1` / `#2` 是参数。
 *
 * ⚠️ 每条后面标了 physics 文档里对应的命令，方便对着查。**加新命令时
 * 必须同时在下面 `PHYSICS_SAMPLES` 里给一条用例**——那张表写成
 * `Record<keyof typeof PHYSICS_MACROS, string>`，漏了编译不过，
 * 而试验台的 `#math` 场景会把每条用例真渲染一遍（见 `tools/menu-harness`）。
 */
export const PHYSICS_MACROS = {
  // ── 括号族 ──────────────────────────────────────────────────────────
  // physics §2.1。`\qty` 收一个花括号参数、固定圆括号；方/花/竖线用下面几个。
  "\\qty": "\\left(#1\\right)",
  "\\pqty": "\\left(#1\\right)",
  "\\bqty": "\\left[#1\\right]",
  "\\vqty": "\\left|#1\\right|",
  "\\Bqty": "\\left\\{#1\\right\\}",
  "\\absolutevalue": "\\left|#1\\right|",
  "\\abs": "\\left|#1\\right|",
  "\\norm": "\\left\\|#1\\right\\|",
  // 求值竖线：`\eval{x}_0^\infty` → `x|_0^∞`。
  // ⚠️ 用 `\left.` 配 `\right|`：只在一侧画竖线，这个配对写法是 LaTeX 的常规做法。
  "\\evaluated": "\\left.#1\\right|",
  "\\eval": "\\left.#1\\right|",
  "\\order": "O\\left(#1\\right)",
  "\\commutator": "\\left[#1,#2\\right]",
  "\\comm": "\\left[#1,#2\\right]",
  "\\anticommutator": "\\left\\{#1,#2\\right\\}",
  "\\acomm": "\\left\\{#1,#2\\right\\}",
  // physics 文档注明 `\poissonbracket` 与 `\anticommutator` 展开一样（都是花括号）。
  "\\poissonbracket": "\\left\\{#1,#2\\right\\}",
  "\\pb": "\\left\\{#1,#2\\right\\}",

  // ── 导数 ────────────────────────────────────────────────────────────
  // physics §2.5。⚠️ **2026-09-24 修过一轮**：这几条原来写成
  // `d#1` / `\renewcommand{\dv}[2][]{…}`，看着像照抄 physics，实际**两处都错**：
  //
  // ① `\dd` 在 physics 里是**零参**命令（`\DeclareDocumentCommand\dd{}{\differential}`），
  //    而写成 `d#1` 就变成"吃下一个 token"。于是 `\dd` 单独用报错、
  //    `a\dd+b` 把加号当参数吃掉画成 `ad+b`——**都不报错、都看不出是宏的错**。
  // ② `\dv`/`\pdv` 那一族用了 `[2][]` 那套可选参写法。**KaTeX 的宏完全不支持可选参**
  //    （字符串宏和 `\def` 风格都不行，实测过），于是 `\dv{f}{x}` 渲染成
  //    `]dxfdfx` 这种垃圾——**而且不红字**，用户只会以为公式本来就长这样。
  //
  // 所以一律回到"**参数写成花括号、不带可选参**"这一档：`\dv{f}{x}` → `df/dx`。
  // ⚠️ 代价：`\dv[2]{f}{x}`（二阶导）**做不到**了，那条写不进这张表——
  // 用户要二阶导就手写 `\frac{d^{2}f}{dx^{2}}`。这一条记在 `docs/10` §11.1。
  // ⚠️ 判据不能只是"能不能渲染"：上面那两条**都能渲染**，只是画错了。
  // 试验台 `#math` 里那张 `PHYSICS_EQUIVALENTS` 是专门盯这个的（见文件末尾）。
  "\\differential": "\\mathrm{d}",
  "\\dd": "\\mathrm{d}",
  "\\derivative": "\\frac{d#1}{d#2}",
  "\\dv": "\\frac{d#1}{d#2}",
  "\\partialderivative": "\\frac{\\partial #1}{\\partial #2}",
  "\\pderivative": "\\frac{\\partial #1}{\\partial #2}",
  "\\pdv": "\\frac{\\partial #1}{\\partial #2}",
  "\\functionalderivative": "\\frac{\\delta #1}{\\delta #2}",
  "\\fdv": "\\frac{\\delta #1}{\\delta #2}",
  // ⚠️ 同上：physics 的 `\variation` / `\var` 也是零参（就是 `\delta`），
  // 不是"吃一个参数"。原来写成 `\delta#1`，`\var` 单独用一样会报错。
  "\\variation": "\\delta",
  "\\var": "\\delta",
  // 平排分数（不增高）。`\dv*` 那种星号写法见文件头第 3 条。
  "\\flatfrac": "#1/#2",

  // ── 向量记法 ────────────────────────────────────────────────────────
  // physics §2.2。⚠️ `\vb*`（斜体/希腊）不吃星号，见文件头第 3 条；
  // 要斜体向量直接写 `\boldsymbol{\theta}`。
  "\\vectorbold": "\\mathbf{#1}",
  "\\vb": "\\mathbf{#1}",
  "\\vectorarrow": "\\vec{#1}",
  "\\va": "\\vec{#1}",
  "\\vectorunit": "\\hat{#1}",
  "\\vu": "\\hat{#1}",
  // ⚠️ 短名只能是 `\vdot` / `\cross`：`\dp` 是 TeX 的原始命令（physics 文档专门注了这条）。
  "\\dotproduct": "\\boldsymbol{\\cdot}",
  "\\vdot": "\\boldsymbol{\\cdot}",
  "\\crossproduct": "\\boldsymbol{\\times}",
  "\\cross": "\\boldsymbol{\\times}",
  "\\cp": "\\boldsymbol{\\times}",
  // 向量算子。physics 的「长形式」（`\grad{\Psi}` 自动加括号）本仓没有——
  // 这几个定义成**零参**，于是 `\div\vb{a}` 这种写法自然就是 `∇·a`。
  "\\gradient": "\\boldsymbol{\\nabla}",
  "\\grad": "\\boldsymbol{\\nabla}",
  // ⚠️ 这一条**重定义 KaTeX 内置的除号**，与 physics 一致。见文件头上半段。
  "\\divergence": "\\boldsymbol{\\nabla}\\cdot",
  "\\div": "\\boldsymbol{\\nabla}\\cdot",
  "\\curl": "\\boldsymbol{\\nabla}\\times",
  "\\laplacian": "\\nabla^{2}",

  // ── 算子名 ──────────────────────────────────────────────────────────
  // physics §2.3。⚠️ physics 还会把三角函数族重定义成"自动加括号 + 可选幂"
  // （`\sin(x)`、`\sin[2](x)`），**本仓不做**——那要动 KaTeX 内置的 `\sin` 一大家子，
  // 收益小、踩坏的地方多。要幂就直接写 `\sin^{2}(x)`。
  "\\trace": "\\operatorname{tr}",
  "\\tr": "\\operatorname{tr}",
  "\\Trace": "\\operatorname{Tr}",
  "\\Tr": "\\operatorname{Tr}",
  "\\rank": "\\operatorname{rank}",
  "\\erf": "\\operatorname{erf}",
  "\\principalvalue": "\\operatorname{P}",
  "\\pv": "\\operatorname{P}",
  "\\PV": "\\operatorname{P.V.}",
  // ⚠️ 这两条也**重定义内置命令**（ℜ / ℑ 那两个花体字母被换成 `Re`/`Im`），
  // 与 physics 一致：physics 把旧的挪去了 `\real` / `\imaginary`。
  "\\Re": "\\operatorname{Re}",
  "\\Im": "\\operatorname{Im}",

  // ── Dirac 记法 ──────────────────────────────────────────────────────
  // physics §2.6。⚠️ physics 的 `\bra{\phi}\ket{\psi}` 会自动收缩成 ⟨φ|ψ⟩，
  // 本仓**不做**——收缩要宏能回头看前一个 token，KaTeX 的宏语法表达不了。
  // 想要收缩的样子就打 `\braket{\phi}{\psi}`（下一条），那正是它的用途。
  "\\ket": "\\left|#1\\right\\rangle",
  "\\bra": "\\left\\langle #1\\right|",
  // ⚠️⚠️ **这一条改了 KaTeX 内置命令的"参数量"**，是整张表里唯一一处会让人
  // 迷惑的覆盖：KaTeX 自己就有 `\braket`，但它吃的是一参、竖线写在里面
  // （`\braket{a|b}` → ⟨a|b⟩）；physics 写的是两参（`\braket{a}{b}`）。
  // 开着 physics 时按 physics 来——一参的写法对应 `\Braket{a|b}`
  // （KaTeX 的另一个名字，本仓没覆盖它；试验台里实测过它照常工作）。
  // ⚠️ `\ket` / `\bra` 也覆盖了内置的，但那两条**渲染结果更好**：内置的分隔符
  // 是固定尺寸，physics 这一套是自动尺寸（试验台量的 HTML 差 45% 的字节数）。
  "\\innerproduct": "\\left\\langle #1\\middle|#2\\right\\rangle",
  "\\braket": "\\left\\langle #1\\middle|#2\\right\\rangle",
  "\\ip": "\\left\\langle #1\\middle|#2\\right\\rangle",
  "\\outerproduct": "\\left|#1\\right\\rangle\\left\\langle #2\\right|",
  "\\dyad": "\\left|#1\\right\\rangle\\left\\langle #2\\right|",
  "\\ketbra": "\\left|#1\\right\\rangle\\left\\langle #2\\right|",
  "\\op": "\\left|#1\\right\\rangle\\left\\langle #2\\right|",
  // 期望值：**只做一参**（⟨A⟩）。physics 的两参形式（显式写态）用 `\mel` 代替，
  // 见下一条与 `docs/10` §11.1。
  "\\expectationvalue": "\\left\\langle #1\\right\\rangle",
  "\\expval": "\\left\\langle #1\\right\\rangle",
  "\\ev": "\\left\\langle #1\\right\\rangle",
  "\\matrixelement": "\\left\\langle #1\\middle|#2\\middle|#3\\right\\rangle",
  "\\matrixel": "\\left\\langle #1\\middle|#2\\middle|#3\\right\\rangle",
  "\\mel": "\\left\\langle #1\\middle|#2\\middle|#3\\right\\rangle",

  // ── 矩阵 ────────────────────────────────────────────────────────────
  // physics §2.7 的**分隔符那一半**：`\mqty{a & b \\ c & d}` 这类能直接当宏参数
  // 收进来（`&` 与 `\\` 在展开之后才落到 matrix 环境里，所以是对的）。
  // ⚠️ **生成元素的那一半不做**（`\dmat` / `\imat` / `\xmat` / `\zmat` /
  // `\pmat` / `\admat`）：那几个要按参数拼出 n 行 n 列，宏语法拼不出来。
  // 逐条写在 `docs/10` §11.1。
  "\\matrixquantity": "\\begin{matrix}#1\\end{matrix}",
  "\\mqty": "\\begin{matrix}#1\\end{matrix}",
  "\\pmqty": "\\left(\\begin{matrix}#1\\end{matrix}\\right)",
  "\\Pmqty": "\\left(\\begin{matrix}#1\\end{matrix}\\right)",
  "\\bmqty": "\\left[\\begin{matrix}#1\\end{matrix}\\right]",
  "\\vmqty": "\\left|\\begin{matrix}#1\\end{matrix}\\right|",
  "\\smallmatrixquantity": "\\begin{smallmatrix}#1\\end{smallmatrix}",
  "\\smqty": "\\begin{smallmatrix}#1\\end{smallmatrix}",
  "\\spmqty": "\\left(\\begin{smallmatrix}#1\\end{smallmatrix}\\right)",
  "\\sbmqty": "\\left[\\begin{smallmatrix}#1\\end{smallmatrix}\\right]",
  "\\matrixdeterminant": "\\left|\\begin{matrix}#1\\end{matrix}\\right|",
  "\\mdet": "\\left|\\begin{matrix}#1\\end{matrix}\\right|",

  // ── 文本 / 条件 ─────────────────────────────────────────────────────
  // physics §2.4。左右各一个 `\quad`（星号那种"只右侧"的形式不吃，见文件头第 3 条）。
  "\\qqtext": "\\quad\\text{#1}\\quad",
  "\\qq": "\\quad\\text{#1}\\quad",
  "\\qcomma": ",\\quad",
  "\\qc": ",\\quad",
  "\\qcc": "\\quad\\text{c.c.}\\quad",
  "\\qif": "\\quad\\text{if}\\quad",
  "\\qthen": "\\quad\\text{then}\\quad",
  "\\qelse": "\\quad\\text{else}\\quad",
  "\\qotherwise": "\\quad\\text{otherwise}\\quad",
  "\\qunless": "\\quad\\text{unless}\\quad",
  "\\qgiven": "\\quad\\text{given}\\quad",
  "\\qusing": "\\quad\\text{using}\\quad",
  "\\qassume": "\\quad\\text{assume}\\quad",
  "\\qsince": "\\quad\\text{since}\\quad",
  "\\qlet": "\\quad\\text{let}\\quad",
  "\\qfor": "\\quad\\text{for}\\quad",
  "\\qall": "\\quad\\text{all}\\quad",
  "\\qeven": "\\quad\\text{even}\\quad",
  "\\qodd": "\\quad\\text{odd}\\quad",
  "\\qinteger": "\\quad\\text{integer}\\quad",
  "\\qand": "\\quad\\text{and}\\quad",
  "\\qor": "\\quad\\text{or}\\quad",
  "\\qas": "\\quad\\text{as}\\quad",
  "\\qin": "\\quad\\text{in}\\quad",
} as const satisfies Record<string, string>;

/**
 * 每条命令的**用例**，给试验台的 `#math` 场景用（那条场景把每一条都真渲染一遍）。
 *
 * ⚠️ 写成 `Record<keyof typeof PHYSICS_MACROS, string>` 是故意的：宏表里加了
 * 一条而这里没给用例**编译不过**。理由和 `panes/AppearancePane.tsx` 里 `Record<UiStyle, …>`
 * 那份一样——宏表写错不会在编译期报出来，只会在用户打出来的时候炸，
 * 所以"想漏都漏不掉"这件事得靠类型。
 */
export const PHYSICS_SAMPLES: Record<keyof typeof PHYSICS_MACROS, string> = {
  "\\qty": "\\qty{\\frac{a}{b}}",
  "\\pqty": "\\pqty{a+b}",
  "\\bqty": "\\bqty{a+b}",
  "\\vqty": "\\vqty{a+b}",
  "\\Bqty": "\\Bqty{a+b}",
  "\\absolutevalue": "\\absolutevalue{x}",
  "\\abs": "\\abs{\\frac{a}{b}}",
  "\\norm": "\\norm{\\psi}",
  "\\evaluated": "\\eval{x}_0^\\infty",
  "\\eval": "\\eval{x}_0^\\infty",
  "\\order": "\\order{x^2}",
  "\\commutator": "\\comm{A}{B}",
  "\\comm": "\\comm{A}{B}",
  "\\anticommutator": "\\acomm{A}{B}",
  "\\acomm": "\\acomm{A}{B}",
  "\\poissonbracket": "\\pb{A}{B}",
  "\\pb": "\\pb{A}{B}",
  "\\differential": "\\dd{x}",
  "\\dd": "\\dd{x}",
  "\\derivative": "\\derivative{f}{x}",
  "\\dv": "\\dv{f}{x}",
  "\\partialderivative": "\\partialderivative{f}{x}",
  "\\pderivative": "\\pderivative{f}{x}",
  "\\pdv": "\\pdv{f}{x}",
  "\\functionalderivative": "\\fdv{F}{g}",
  "\\fdv": "\\fdv{F}{g}",
  "\\variation": "\\var{F[g(x)]}",
  "\\var": "\\var{F[g(x)]}",
  "\\flatfrac": "\\flatfrac{a}{b}",
  "\\vectorbold": "\\vb{a}",
  "\\vb": "\\vb{a}",
  "\\vectorarrow": "\\va{a}",
  "\\va": "\\va{a}",
  "\\vectorunit": "\\vu{a}",
  "\\vu": "\\vu{a}",
  "\\dotproduct": "\\vb{a}\\vdot\\vb{b}",
  "\\vdot": "\\vb{a}\\vdot\\vb{b}",
  "\\crossproduct": "\\vb{a}\\cross\\vb{b}",
  "\\cross": "\\vb{a}\\cross\\vb{b}",
  "\\cp": "\\vb{a}\\cp\\vb{b}",
  "\\gradient": "\\grad\\Psi",
  "\\grad": "\\grad\\Psi",
  "\\divergence": "\\div\\vb{a}",
  "\\div": "\\div\\vb{a}",
  "\\curl": "\\curl\\vb{a}",
  "\\laplacian": "\\laplacian\\Psi",
  "\\trace": "\\tr\\rho",
  "\\tr": "\\tr\\rho",
  "\\Trace": "\\Tr\\rho",
  "\\Tr": "\\Tr\\rho",
  "\\rank": "\\rank M",
  "\\erf": "\\erf(x)",
  "\\principalvalue": "\\pv{\\int f(z)\\dd{z}}",
  "\\pv": "\\pv{\\int f(z)\\dd{z}}",
  "\\PV": "\\PV{\\int f(z)\\dd{z}}",
  "\\Re": "\\Re{z}",
  "\\Im": "\\Im{z}",
  "\\ket": "\\ket{\\psi}",
  "\\bra": "\\bra{\\phi}",
  "\\innerproduct": "\\braket{\\phi}{\\psi}",
  "\\braket": "\\braket{\\phi}{\\psi}",
  "\\ip": "\\ip{\\phi}{\\psi}",
  "\\outerproduct": "\\dyad{a}{b}",
  "\\dyad": "\\dyad{a}{b}",
  "\\ketbra": "\\ketbra{a}{b}",
  "\\op": "\\op{a}{b}",
  "\\expectationvalue": "\\expval{A}",
  "\\expval": "\\expval{A}",
  "\\ev": "\\ev{A}",
  "\\matrixelement": "\\mel{n}{A}{m}",
  "\\matrixel": "\\mel{n}{A}{m}",
  "\\mel": "\\mel{n}{A}{m}",
  "\\matrixquantity": "\\mqty{a & b \\\\ c & d}",
  "\\mqty": "\\mqty{a & b \\\\ c & d}",
  "\\pmqty": "\\pmqty{a & b \\\\ c & d}",
  "\\Pmqty": "\\Pmqty{a & b \\\\ c & d}",
  "\\bmqty": "\\bmqty{a & b \\\\ c & d}",
  "\\vmqty": "\\vmqty{a & b \\\\ c & d}",
  "\\smallmatrixquantity": "\\smqty{a & b \\\\ c & d}",
  "\\smqty": "\\smqty{a & b \\\\ c & d}",
  "\\spmqty": "\\spmqty{a & b \\\\ c & d}",
  "\\sbmqty": "\\sbmqty{a & b \\\\ c & d}",
  "\\matrixdeterminant": "\\mdet{a & b \\\\ c & d}",
  "\\mdet": "\\mdet{a & b \\\\ c & d}",
  "\\qqtext": "\\qq{for all}",
  "\\qq": "\\qq{for all}",
  "\\qcomma": "a\\qc b",
  "\\qc": "a\\qc b",
  "\\qcc": "z\\qcc",
  "\\qif": "x\\qif y>0",
  "\\qthen": "\\qthen",
  "\\qelse": "\\qelse",
  "\\qotherwise": "\\qotherwise",
  "\\qunless": "\\qunless",
  "\\qgiven": "\\qgiven",
  "\\qusing": "\\qusing",
  "\\qassume": "\\qassume",
  "\\qsince": "\\qsince",
  "\\qlet": "\\qlet",
  "\\qfor": "\\qfor",
  "\\qall": "\\qall",
  "\\qeven": "\\qeven",
  "\\qodd": "\\qodd",
  "\\qinteger": "\\qinteger",
  "\\qand": "\\qand",
  "\\qor": "\\qor",
  "\\qas": "\\qas",
  "\\qin": "\\qin",
};

/**
 * **对照表**：一条宏写法，配一句"手写的等价 TeX"。两边渲染出来的**可见文本必须一样**。
 *
 * ⚠️ **这张表是 2026-09-24 补的，它补的是一个判据上的窟窿**：`#math` 场景原来只问
 * "这条宏**能不能渲染**"，而 `\dv{f}{x}` / `\dd` 那几条**能渲染、只是画错了**
 * （`\dv{f}{x}` 画成 `]dxfdfx`）——**光看"有没有报错"永远发现不了**。
 * 那张表混过去整整一轮，直到有人拿真的 physics 语义逐条对照才露出来。
 *
 * 所以判据改成：**宏写法的渲染结果 == 手写 TeX 的渲染结果**（比 KaTeX 输出里
 * 那段可见文本，不比整段 HTML——`\frac` 的 DOM 有随机 id 之类的东西，比不得）。
 *
 * ⚠️ 加新宏时**一并加一条对照**，尤其是"展开成好几个 token"的那类；
 * 只加进 `PHYSICS_SAMPLES` 是不够的——那只证明它不炸。
 */
export const PHYSICS_EQUIVALENTS: Record<string, string> = {
  // 导数那一族：上一版就是这里五条全错、全不报错。
  "\\dv{f}{x}": "\\frac{df}{dx}",
  "\\derivative{f}{x}": "\\frac{df}{dx}",
  "\\pdv{f}{x}": "\\frac{\\partial f}{\\partial x}",
  "\\pderivative{f}{x}": "\\frac{\\partial f}{\\partial x}",
  "\\partialderivative{f}{x}": "\\frac{\\partial f}{\\partial x}",
  "\\fdv{F}{g}": "\\frac{\\delta F}{\\delta g}",
  // 零参缩写：`\dd` 后面**不许**再接东西（接了就是"吃掉一个 token"那个老毛病）。
  "\\dd": "\\mathrm{d}",
  "\\dd{x}": "\\mathrm{d}x",
  "a\\dd+b": "a\\mathrm{d}+b",
  "\\var": "\\delta",
  // 括号族：定界符是画出来的，对照的是"里面那个东西原样出来"。
  "\\qty{\\frac{a}{b}}": "\\left(\\frac{a}{b}\\right)",
  "\\abs{x}": "\\left|x\\right|",
  "\\eval{x}_0^\\infty": "\\left.x\\right|_0^\\infty",
  "\\braket{\\phi}{\\psi}": "\\left\\langle \\phi\\middle|\\psi\\right\\rangle",
  "\\expval{A}": "\\left\\langle A\\right\\rangle",
};

/**
 * 交给 KaTeX 的选项。**两档都返回一份**（关着时给空宏表），
 * 这样"开关关掉"是一条明确的动作，而不是"没人设过"。
 *
 * ⚠️ `throwOnError: false` 是本仓**特意盖掉**的：KaTeX 的默认是 `true`，
 * 而 `@milkdown/plugin-math` 传进去的是一份**空选项**——于是用户打到一半的
 * `$x^{` 会在 `toDOM` 里抛出去（那是在 Prosemirror 的渲染路径上，抛出去
 * 不是"画个红字"那么客气）。`false` 时 KaTeX 把错误渲染成红字提示，
 * 公式变成一个能看见的错误块。
 *
 * ⚠️ 每次**新建一份宏表**（不是把 `PHYSICS_MACROS` 直接递过去）：
 * KaTeX 会往它拿到的那个对象里塞定义，同一份被多个实例共用会互相串。
 */
export function katexOptionsFor(enablePhysics: boolean): KatexOptions {
  return {
    throwOnError: false,
    macros: enablePhysics ? { ...PHYSICS_MACROS } : {},
  };
}
