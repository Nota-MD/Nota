/**
 * LaTeX **命令候选表**（公式源码框里敲 `\` 弹出来的那个列表），以及配套的**纯判断**：
 * "光标现在在哪个命令里"、"该显示哪几条"、"收下之后源码框变成什么"。
 *
 * # 用户要的是什么
 *
 * 2026-10-04 用户拿四张 Typora 截图点的第三条：**行内公式源码框里敲 `\` 弹命令候选、
 * 带渲染预览的补全弹窗**。截图里那一格就是 Typora 的样子：候选一行一条，
 * 左边是命令名、右边是渲染出来的一小段。
 *
 * # 为什么这张表是手工的（不是从 KaTeX 里问出来的）
 *
 * **KaTeX 0.16 不给命令清单**：`katex` 那个包导出的只有 `render` / `renderToString` /
 * `ParseError` 那几样，没有 `supportedCommands`、`__parse` 之类的接口，
 * 发布出来的 `dist/` 里也没有 `macros.js`（源码里那份清单在 `src/macros.js`，
 * 不随包发）。所以"有哪些命令"这件事**问不出来**——只能自己列一份。
 *
 * ⚠️ 代价说在明处：**这份表是"我们推荐你先试试这些"，不是"KaTeX 支持这些"**。
 * 表里没有的命令照旧能敲（KaTeX 认不认是它的事），只是不弹提示。
 * 这份表与 `math-macros.ts` 那份宏表**不是一回事**：那份是"physics 语义的宏定义"
 * （真的改了 KaTeX 的行为），这份纯粹是"给个提示"。
 *
 * # 与 physics 那一档的关系（唯一一处会变的）
 *
 * `physics` 那些命令（`\dv`、`\braket`…）**只在开关打开时才进候选表**：
 * 关着的时候它们是**未定义命令**，候选里摆出来、一收下就渲染成红字，
 * 那比没有提示更坏。所以 [`建命令表`] 收一个 `有 physics` 的布尔值，
 * 由 `math-view.ts` 按 `katexOptionsCtx` 里有没有宏表推出来。
 *
 * ⚠️ 那条路的**参数个数**是**从宏定义自己数出来的**（`\dv` 展开式里有 `#1` `#2`
 * ⇒ 插入 `\dv{}{}`）：physics 那 90 多条命令一个一个手写参数个数，
 * 早晚会跟 `PHYSICS_MACROS` 岔开，而岔开的症状是"收下之后渲染报错"。
 *
 * # 判据：光标是不是停在"一个命令名中间"
 *
 * 只有**从光标往前一路都是字母、再往前正好一颗反斜杠**才算（见 [`找当场`]）。
 * 于是下面这几种**不弹**：
 *
 * - `\\`（矩阵里的换行）：那是**两颗**反斜杠，第二颗是它的转义，不新起一个命令；
 * - `\text{你好}` 里的中文：往前扫不到字母就停，光标在 `{` 后面时不算在命令里；
 * - 数学模式里的普通文字：没有反斜杠，本来就不弹。
 *
 * # 表里**故意没有**的几条
 *
 * - **`\\`**（矩阵里分行）：判据第二条就把它挡在外面（两颗反斜杠不是命令头），
 *   所以摆进来也永远弹不出来。要换行直接敲两颗反斜杠。
 * - **`\sqrt[n]{}`**（带次数的根号）：与 `\sqrt{}` 同名，两条候选摆在一起
 *   （一条带 `[]` 一条不带）只会让人多看一眼。要次数自己补 `[n]`。
 * - **`\end{}`** 之类"收尾那一半"：能敲出来的都收在表里（`right` 就在），
 *   但环境名本身（`matrix` / `cases`…）**不在候选里**——它是 `\begin{}` 的参数，
 *   不是命令，而这一层只认命令名。
 *
 * ⚠️ 另有一类**不是故意没有、而是被顶掉的**：`\div` 这种"手写表与 physics 宏表
 * 同名"的（手写那张是除号、physics 那张是散度）。开着 physics 时它由 physics
 * 那条顶上，理由与代价写在 [`建命令表`]。
 *
 * # 这一份里**没有** DOM
 *
 * 三条纯函数（[`找当场`] / [`挑候选`] / [`套用`]）不碰文档、不碰元素，
 * 所以 `tests/math-commands.test.ts` 直接喂字符串就能验。弹窗那一层在
 * `math-suggest.ts`。
 */

import { PHYSICS_MACROS, PHYSICS_SAMPLES } from "./math-macros";

/**
 * 一条候选。
 *
 * ⚠️ `命令` **带**反斜杠（表里、弹窗里、写进文档里的都是这一份），`词` 那一侧
 * 不带——`找当场` 与 `挑候选` 的边界就在这里，别在两边各写一遍。
 */
export type candidate = {
  command: string;
  /** 一句话说明（中文，弹窗右边那一列）。 */
  description: string;
  /** 收下之后**写进源码框**的东西。有参数的命令在这里带 `{}`，光标落在头一个里面。 */
  insert: string;
  /** 弹窗里那一小段渲染预览用的源码。 */
  sample: string;
  /** `词` 还空着（刚敲下 `\`）时要不要露脸。 */
  normalUse: boolean;
  /** 从哪来的（弹窗上那个小角标）。 */
  family: "命令" | "physics";
};

/**
 * 手写的一条：`[名字(不带反斜杠), 插入, 样本, 说明]`。
 *
 * ⚠️ **插入／样本写空串就是"跟名字一样"**：`["times", "", "", "乘号 ×"]` 那一行
 * 等于"插入 `\times`、样本 `\times`"。这样纯符号那几十条不必把 `\times` 写三遍
 * ——表一大，重复的那几遍就是抄错的来源。
 */
type HandWriteItem = readonly [name3: string, insert: string, sample: string, description: string];

/** 敲 `\` 还没接着敲时，露脸的那几条。⭐ 挑的是"最常用来起手"的那些。 */
const normalUseName = new Set([
  "frac",
  "sqrt",
  "sum",
  "int",
  "lim",
  "alpha",
  "theta",
  "left",
  "right",
  "text",
]);

/**
 * 手写的那一张表。**分族排的**（结构 → 希腊 → 符号 → 装饰 → 排版），
 * 这个顺序也是 [`挑候选`] 在 `词` 空着时的依据之一（同前缀长度时按表里的先后）。
 */
const handWriteTable: readonly HandWriteItem[] = [
  // ── 结构：带参数的那些，收下之后光标落进头一个 `{}` ────────────────────
  ["frac", "\\frac{}{}", "\\frac{a}{b}", "分数"],
  ["dfrac", "\\dfrac{}{}", "\\dfrac{a}{b}", "分数（大号，行间也撑开）"],
  ["sqrt", "\\sqrt{}", "\\sqrt{x}", "平方根"],
  ["sum", "\\sum_{}^{}", "\\sum_{i=1}^{n} a_i", "求和（大算子）"],
  ["prod", "\\prod_{}^{}", "\\prod_{i=1}^{n} a_i", "连乘（大算子）"],
  ["int", "\\int_{}^{}", "\\int_{a}^{b} f(x)\\,dx", "定积分"],
  ["iint", "\\iint_{}^{}", "\\iint_{D} f\\,dA", "二重积分"],
  ["oint", "\\oint", "\\oint_C f\\,dz", "环路积分"],
  ["lim", "\\lim_{}", "\\lim_{x \\to 0} \\frac{\\sin x}{x}", "极限"],
  ["binom", "\\binom{}{}", "\\binom{n}{k}", "组合数"],
  ["begin", "\\begin{}", "\\begin{matrix} a & b \\\\ c & d \\end{matrix}", "环境（matrix / cases / aligned…）"],
  ["left", "\\left(\\right)", "\\left( \\frac{a}{b} \\right)", "自动大小的括号"],
  // ⚠️ `\right` **不能**留空串吃"跟名字一样"那条兜底（2026-10-04 目检，见
  //    `docs/07` BUG-64）：`\right` 单独立不住（KaTeX 要它跟一个 `\left` 配对），
  //    兜底出来的样本 `\right` 画不出来 ⇒ 弹窗里那一行是**红的报错字**。
  //    样本写成 `\left. x \right)`：`.` 是"没有左括号"，于是这一格画出来的
  //    正好是"一个自己找大小的右括号"，也就是这条命令干的事。
  ["right", "", "\\left. x \\right)", "自动大小的括号（收尾那一半）"],
  ["text", "\\text{}", "\\text{其中 } x > 0", "公式里的正文"],
  ["operatorname", "\\operatorname{}", "\\operatorname{tr} A", "自定义算子名（直立）"],
  ["boldsymbol", "\\boldsymbol{}", "\\boldsymbol{\\theta}", "粗体（希腊字母也吃）"],
  ["mathrm", "\\mathrm{}", "\\mathrm{d}", "直立体"],

  // ── 希腊字母（小写 24 个 ＋ 常用的几个大写）────────────────────────────
  // 说明与样本都由字形推出来，别手写（同一条命令两处写，早晚岔开）。
  ["alpha", "", "", "希腊字母 α"],
  ["beta", "", "", "希腊字母 β"],
  ["gamma", "", "", "希腊字母 γ"],
  ["delta", "", "", "希腊字母 δ"],
  ["epsilon", "", "", "希腊字母 ϵ"],
  ["varepsilon", "", "", "希腊字母 ε"],
  ["zeta", "", "", "希腊字母 ζ"],
  ["eta", "", "", "希腊字母 η"],
  ["theta", "", "", "希腊字母 θ"],
  ["vartheta", "", "", "希腊字母 ϑ"],
  ["iota", "", "", "希腊字母 ι"],
  ["kappa", "", "", "希腊字母 κ"],
  ["lambda", "", "", "希腊字母 λ"],
  ["mu", "", "", "希腊字母 μ"],
  ["nu", "", "", "希腊字母 ν"],
  ["xi", "", "", "希腊字母 ξ"],
  ["pi", "", "", "希腊字母 π"],
  ["rho", "", "", "希腊字母 ρ"],
  ["sigma", "", "", "希腊字母 σ"],
  ["tau", "", "", "希腊字母 τ"],
  ["phi", "", "", "希腊字母 ϕ"],
  ["varphi", "", "", "希腊字母 φ"],
  ["chi", "", "", "希腊字母 χ"],
  ["psi", "", "", "希腊字母 ψ"],
  ["omega", "", "", "希腊字母 ω"],
  ["Gamma", "", "", "大写希腊字母 Γ"],
  ["Delta", "", "", "大写希腊字母 Δ"],
  ["Theta", "", "", "大写希腊字母 Θ"],
  ["Lambda", "", "", "大写希腊字母 Λ"],
  ["Pi", "", "", "大写希腊字母 Π"],
  ["Sigma", "", "", "大写希腊字母 Σ"],
  ["Phi", "", "", "大写希腊字母 Φ"],
  ["Psi", "", "", "大写希腊字母 Ψ"],
  ["Omega", "", "", "大写希腊字母 Ω"],

  // ── 运算符 ────────────────────────────────────────────────────────────
  ["times", "", "", "乘号 ×"],
  ["div", "", "", "除号 ÷"],
  ["pm", "", "", "正负号 ±"],
  ["mp", "", "", "负正号 ∓"],
  ["cdot", "", "", "点乘 ·"],
  ["ast", "", "", "星号 ∗"],
  ["circ", "", "", "圈 ∘"],
  ["oplus", "", "", "直和 ⊕"],
  ["otimes", "", "", "张量积 ⊗"],
  ["partial", "", "", "偏导符号 ∂"],
  ["nabla", "", "", "梯度算子 ∇"],
  ["infty", "", "", "无穷 ∞"],

  // ── 关系与集合 ────────────────────────────────────────────────────────
  ["le", "", "", "小于等于 ≤"],
  ["ge", "", "", "大于等于 ≥"],
  ["ne", "", "", "不等于 ≠"],
  ["approx", "", "", "约等于 ≈"],
  ["equiv", "", "", "恒等于 ≡"],
  ["sim", "", "", "相似 ∼"],
  ["propto", "", "", "正比于 ∝"],
  ["in", "", "", "属于 ∈"],
  ["notin", "", "", "不属于 ∉"],
  ["subset", "", "", "真子集 ⊂"],
  ["subseteq", "", "", "子集 ⊆"],
  ["cup", "", "", "并集 ∪"],
  ["cap", "", "", "交集 ∩"],
  ["forall", "", "", "任意 ∀"],
  ["exists", "", "", "存在 ∃"],

  // ── 箭头 ──────────────────────────────────────────────────────────────
  ["to", "", "", "右箭头 →"],
  ["rightarrow", "", "", "右箭头 →"],
  ["leftarrow", "", "", "左箭头 ←"],
  ["leftrightarrow", "", "", "双向箭头 ↔"],
  ["Rightarrow", "", "", "推出 ⇒"],
  ["Leftarrow", "", "", "反向推出 ⇐"],
  ["Leftrightarrow", "", "", "等价 ⇔"],
  ["mapsto", "", "", "映射 ↦"],

  // ── 点、装饰 ──────────────────────────────────────────────────────────
  ["cdots", "", "", "居中的省略号 ⋯"],
  ["ldots", "", "", "底部的省略号 …"],
  ["vdots", "", "", "竖向省略号 ⋮"],
  ["ddots", "", "", "斜向省略号 ⋱"],
  ["hat", "\\hat{}", "\\hat{x}", "一个字符的帽子"],
  ["bar", "\\bar{}", "\\bar{x}", "一个字符的上横线"],
  ["vec", "\\vec{}", "\\vec{a}", "向量箭头"],
  ["dot", "\\dot{}", "\\dot{x}", "一阶导点"],
  ["ddot", "\\ddot{}", "\\ddot{x}", "二阶导点"],
  ["tilde", "\\tilde{}", "\\tilde{x}", "波浪号"],
  ["overline", "\\overline{}", "\\overline{AB}", "上横线（可跨多字符）"],
  ["underline", "\\underline{}", "\\underline{AB}", "下横线"],
  ["widehat", "\\widehat{}", "\\widehat{ABC}", "帽子（可跨多字符）"],
  ["overrightarrow", "\\overrightarrow{}", "\\overrightarrow{AB}", "长箭头（可跨多字符）"],

  // ── 排版：字号、间距、换行 ────────────────────────────────────────────
  ["displaystyle", "", "", "按行间公式的字号排"],
  ["textstyle", "", "", "按行内公式的字号排"],
  ["quad", "", "", "一颗大空格"],
  ["qquad", "", "", "两颗大空格"],
  ["limits", "", "", "把上下标挪到算子正上/正下"],
  ["nolimits", "", "", "把上下标放回算子右边"],
];

/**
 * 一次最多弹几条。
 *
 * ⚠️ **这个数是照 [`常用名`] 的条数定的**（十）：写在 `常用名` 里却被上限切掉的
 * 名字等于白写——用户永远看不见它，而代码里看着"有"。`tests/math-commands.test.ts`
 * 第一组最后一条盯着这个关系。
 * ⚠️ 与 `math.css` 那条配套：那边的框**故意不写 `max-height`**，高度由这里
 * 这个数管（2026-10-04 目检量过：一条 24.7px ⇒ 十条约 264px）。
 * 两边都记一个数正是 BUG-63 的来由，别再加第二条。
 */
export const candidateLimit = 10;

/**
 * 一条手写条 → 候选。`插入` / `样本` 写空串就是"跟名字一样"。
 *
 * ⚠️ 那条兜底**只对"单独立得住"的命令成立**：`\alpha` 退回样本 `\alpha` 画出来
 * 就是 α（好），`\right` 退回去画出来是一句红色的 KaTeX 报错
 * （2026-10-04 目检抓到的，见 `docs/07` BUG-64）。所以凡是离了配对标不出东西的
 * 命令，`样本` 得自己写一条**能独立渲染**的。
 */
function handWriteCandidate(item4: HandWriteItem): candidate {
  const [name3, insert, sample, description] = item4;
  const command = `\\${name3}`;
  const assertValueInsert = insert === "" ? command : insert;
  return {
    command,
    description,
    insert: assertValueInsert,
    sample: sample === "" ? assertValueInsert : sample,
    normalUse: normalUseName.has(name3),
    family: "命令",
  };
}

/**
 * 从宏定义里数出**最多用到第几个参数**（`#1` `#2` ⇒ 2）。
 *
 * ⚠️ 数的是**最大下标**不是出现次数：`\div` 那种零参宏展开式里一个 `#` 都没有，
 * 于是插入就是命令本身（`\div\vb{a}` 这么用，physics 文档里就是这么写的）。
 */
function numberParameter(expand2: string): number {
  let large = 0;
  for (const match2 of expand2.matchAll(/#(\d)/g)) {
    const ordinal = Number(match2[1]);
    if (ordinal > large) large = ordinal;
  }
  return large;
}

/**
 * physics 那一族：命令名、参数个数、用例**全部从 `math-macros.ts` 现推**。
 *
 * ⚠️ 样本来自 `PHYSICS_SAMPLES`——那张表写成 `Record<keyof typeof PHYSICS_MACROS, string>`，
 * 宏表加一条而用例没跟上就**编译不过**（理由在那个文件里）。所以这里不必担心
 * 样本缺失；`?? 命令` 只是给 TypeScript 看的兜底。
 */
function physicsCandidatePlural(): candidate[] {
  const output2: candidate[] = [];
  for (const [command, expand2] of Object.entries(PHYSICS_MACROS)) {
    const parameterMeasure = numberParameter(expand2);
    output2.push({
      command,
      description: parameterMeasure ? `physics 宏（${parameterMeasure} 个参数）` : "physics 宏（不需要参数）",
      insert: command + "{}".repeat(parameterMeasure),
      sample: PHYSICS_SAMPLES[command as keyof typeof PHYSICS_SAMPLES] ?? command,
      normalUse: false,
      family: "physics",
    });
  }
  return output2;
}

/**
 * physics 宏表里那些命令名（带反斜杠）。
 *
 * ⚠️ 只为一个用途：**[`建命令表`] 拿它去重**——physics 开着的时候，名字撞上的
 * 那条**手写的要让位**（理由见 [`建命令表`]）。
 */
const physicsName = new Set(Object.keys(PHYSICS_MACROS));

/**
 * 那张表。⚠️ 每次新建一份数组（调用方可能 `sort`，共用一份会串）。
 *
 * # 重名的让位规则（2026-10-04 写表时发现的真冲突）
 *
 * 手写表里有一条 `\div`（除号 `÷`），而 physics 的宏表里**也有一条 `\div`**
 * （散度 `\nabla\cdot`）。KaTeX 的 `macros` 选项是**压过内置命令**的，所以
 * `enable_physics` 一开，`\div` 就不再是 `÷` 了——那一行候选（说明写着"除号"）
 * 会变成一句**假话**，用户照着收下只会得到散度。
 *
 * 所以：**physics 开着时，同名的那条手写的直接不出现在候选里**，由 physics
 * 那条顶上（它的说明是从宏定义推的，说的是真话）。
 *
 * ⚠️ 代价说在明处：开了 physics 就**没有 `÷` 的提示**了（KaTeX 里那个符号本身
 * 还在，只是不弹提示）。一条不弹的提示，比一条弹出来骗人的提示好。
 * ⚠️ 反过来（physics 关着）时 physics 那些命令一条都不进表，不存在这个问题。
 */
export function createCommandTable(hasphysics: boolean): candidate[] {
  const handWrite = handWriteTable.map(handWriteCandidate);
  const output2 = hasphysics ? handWrite.filter((item4) => !physicsName.has(item4.command)) : handWrite;
  if (hasphysics) output2.push(...physicsCandidatePlural());
  return output2;
}

/** 光标现在停在一个命令里吗；停着的话，那颗反斜杠在哪、已经敲了哪几个字母。 */
export type WhenScene = {
  /** 那颗反斜杠在源码里的下标（收下时从这里开始替换）。 */
  start5: number;
  /** 已经敲下的那几个字母（不带反斜杠）。⚠️ **可以是空串**（刚敲下 `\`）。 */
  word: string;
};

/** 字母判据。⚠️ 只认 ASCII 字母：命令名里不会有别的（KaTeX 的宏名全是字母）。 */
const isCharacterMother = (character2: string): boolean => /^[A-Za-z]$/.test(character2);

/**
 * 光标**现在**是不是停在一个命令里。不是就返回 `null`（不弹窗）。
 *
 * 走法：从光标往前一路吃字母，停下来之后看**前一颗**是不是反斜杠。
 * 三种"看着像其实不是"的情况在这里挡掉：
 *
 * 1. **`\\`**（矩阵里的换行）：反斜杠前面还是反斜杠 ⇒ 不是一个命令的头，
 *    往前数连着的反斜杠，**奇数个**才说明这一颗是被转义的（照 LaTeX 的规矩）。
 * 2. **光标在命令后面**（`\frac{a}{b}|`）：往前是 `}` ⇒ 不是字母 ⇒ `null`。
 * 3. **段首一颗 `\`**：起 = 0，正常弹（词是空串）。
 */
export function findCurrent(source3: string, cursor: number): WhenScene | null {
  if (cursor <= 0 || cursor > source3.length) return null;

  let i = cursor;
  // ⚠️ `charAt` 而不是 `源[i - 1]`：本仓开着 `noUncheckedIndexedAccess`，
  //    下标取出来是 `string | undefined`，`是字母` 收的是 `string`。
  //    `charAt` 越界给空串，`是字母("")` 是假——判据一样，类型干净。
  while (i > 0 && isCharacterMother(source3.charAt(i - 1))) i--;
  if (i === 0) return null;
  if (source3[i - 1] !== "\\") return null;

  // 反斜杠前面还有几颗连着的反斜杠（见上第 1 条）。
  let connectActiveOf = 0;
  while (i - 2 - connectActiveOf >= 0 && source3[i - 2 - connectActiveOf] === "\\") connectActiveOf++;
  if (connectActiveOf % 2 === 1) return null;

  return { start5: i - 1, word: source3.slice(i, cursor) };
}

/**
 * 挑出该显示的那几条。
 *
 * 两条路：
 *
 * - **`词` 空着**（刚敲下 `\`）：给 [`常用名`] 那几条，按表里的先后。
 *   这几条是"最常用来起手"的，不是"最常用的命令"——`\frac` `\sqrt` `\sum`
 *   这种。⚠️ 不列全表：一屏几十条，敲 `\` 那一下屏幕上会盖住半篇文章。
 * - **`词` 非空**：**前缀匹配**（不区分大小写），短的在前（`\int` 比 `\integer` 更像
 *   "想打 int"），再按名字排序（同一长度的那些有个稳定次序，不至于每次敲都换位置）。
 *
 * ⚠️ **只做前缀，不做模糊**：`frc` 不该匹配 `\frac`。理由与 `slash.ts` 那条一样
 * ——模糊匹配在**一个字母就能分叉出十几条**的列表里会把人读晕，而这里敲的是
 * 半行命令名，多敲两个字母的成本远小于"候选列表跳来跳去"。
 */
export function pickCandidate(table2: readonly candidate[], word: string, limit = candidateLimit): candidate[] {
  if (word === "") return table2.filter((item4) => item4.normalUse).slice(0, limit);

  const smallWord = word.toLowerCase();
  const middle = table2.filter((item4) => item4.command.slice(1).toLowerCase().startsWith(smallWord));
  return [...middle]
    .sort((alpha, beta) => alpha.command.length - beta.command.length || alpha.command.localeCompare(beta.command))
    .slice(0, limit);
}

/** 收下一条候选之后：源码框里该是什么、光标该落在哪。 */
export type ReceiveBelow = {
  source3: string;
  /** 光标位置。⚠️ 有 `{}` 的命令落在**头一个 `{}` 里面**，没有就落在末尾。 */
  cursor: number;
};

/**
 * 把光标处那一截（`\` ＋已敲的字母）换成候选的**插入体**。
 *
 * ⚠️ 替换的区间是 `当场.起` 到 `光标`（**不是到词尾**）：光标可能在词中间
 * （`\fra|` 之后又按了左键），那时右边的字母得原样留着，否则用户会看见字被吃掉。
 *
 * ⚠️ 只把光标放进**头一个** `{}`：`\sum_{}^{}` 收下之后停在第一个洞里，
 * 第二个洞（上标）要自己按右键过去。做"Tab 依次跳洞"就得在本层存一份
 * "正在补的是哪一条"、还要跟文档变化对齐——那是另一件事，没做。
 */
export function setUse(source3: string, cursor: number, WhenScene: WhenScene, item4: candidate): ReceiveBelow {
  const newValueSource2 = source3.slice(0, WhenScene.start5) + item4.insert + source3.slice(cursor);
  const hole = item4.insert.indexOf("{}");
  return {
    source3: newValueSource2,
    cursor: WhenScene.start5 + (hole >= 0 ? hole + 1 : item4.insert.length),
  };
}
