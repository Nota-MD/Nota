/**
 * 面板内容的**白名单**：宿主发来的那一份 JSON 在这里被收成
 * `PanelNode[]`，之后渲染层拿到的是一份**字段全齐**的类型。
 *
 * # ⚠️ 为什么校验在这一层，不在宿主
 *
 * 宿主（`src-tauri/src/lua/api/ui.rs::面板内容`）保证两件事：**是 JSON**、
 * **有大小上限**（文本多长、一层几项、嵌套几层）。它**不校验形状**，
 * 也不知道 `kind` 有哪些取值。
 *
 * 这么分是刻意的：形状的真相源**只能在渲染这一侧**——因为最终决定
 * "这个 `kind` 画成什么"的代码就在这儿。宿主也存一份枚举的话，两边就是
 * 又一对"改一处忘一处"，而症状是**内容静默地不显示**（认不出的 kind
 * 被宿主扔掉），比在这儿看得见地画一句"不认识这种内容块"难查得多。
 *
 * # 三条规矩
 *
 * 1. **认不出的 `kind` 如实显示**，不静默丢掉，更不猜它是哪种；
 * 2. **字段类型不对就用默认值**（`text` 是数字 → 空串）。缺一个字段让整块
 *    消失是最糟的处理：用户看到的界面和插件作者以为的对不上；
 * 3. **只产出这里定义的字段**——插件塞的别的键一概**不往 DOM 上带**。
 *    这条是"不许注入"的落点：没有任何一条路能把字符串变成 HTML 或属性。
 *
 * ⚠️ 这里**没有**（也永远不该有）`dangerouslySetInnerHTML`。
 */

import { t } from "@/i18n";
import type { PluginPrompt } from "@/bridge/ipc";
import { 读刻度 } from "@/ui/chart-ticks";
import type { 刻度 } from "@/ui/chart-ticks";
import { 读热力记录, 算热力 } from "@/ui/heatmap";
import type { 热力图 } from "@/ui/heatmap";

/** 一块内容的语气。渲染层按它上色。 */
export type PanelTone = "normal" | "muted" | "success" | "warn" | "danger";

export interface PanelField {
  label: string;
  value: string;
  tone: PanelTone;
}

export interface PanelListItem {
  title: string;
  subtitle: string;
  badge: string;
  tone: PanelTone;
}

export interface PanelButton {
  label: string;
  /** 点了调这个插件的哪条命令。**空串 = 这块按钮不可用**（会画成灰的）。 */
  command: string;
  /** 传给命令的参数（`args`）。 */
  args: unknown;
  /** 非空 = 点之前先用宿主的输入框问一句，答案放进 `args[prompt.arg]`。 */
  prompt: PluginPrompt | null;
  style: "normal" | "primary" | "danger";
  disabled: boolean;
}

/**
 * 一行上的一颗"点得动的东西"（`kind = "graph"` 用，2026-09-26 加）。
 *
 * 与 `PanelButton` 的差别只有两处，都是有意的：
 * - **没有 `label`**——提交树上那串字是**内容**（哈希 + 标题），不是按钮名，
 *   所以它走 `PanelGraphLine.text`，`title` 只当鼠标提示；
 * - **没有 `prompt`**——树上的点击都是"看一眼"，没有需要先问一句的。
 *   （真需要问的时候，那一条路是 `buttons`，别再往这儿加字段。）
 */
export interface PanelAction {
  command: string;
  args: unknown;
  /** 鼠标停上去的那句话。**空串 = 没有提示**（不画 `title` 属性）。 */
  title: string;
}

/**
 * 提交树里的一行（`kind = "graph"`）。
 *
 * ⚠️ 一行的**两头是两颗不同的东西**，这正是加这个 `kind` 的全部理由：
 * 左边那截图线（`art`）是"键"——它通向某个提交；右边那串字（`text`）是
 * 提交本身。`buttons` 那种一块按钮表达不了"一行上两颗"，而把两者合成一颗
 * 又会逼出一个二选一：点一下到底是"看这一条键通向什么"还是"选中它"。
 *
 * - `art`：图线前缀，**等宽原样画**（`* `、`|\`、`| |`）。空格是它的一部分。
 * - `text`：哈希 + 分支标签 + 标题。**纯连接线行是空串**（那一行只有键）。
 * - `picked`：这一行的提交是不是被选中的（界面自己画底色或标记）。
 * - `bond` / `pick`：两颗动作，**各自可以为 `null`**（那颗就画成纯文字，
 *   不是灰按钮——画成灰的会让人以为"这里本来能点，只是现在不能"）。
 */
export interface PanelGraphLine {
  art: string;
  text: string;
  tone: PanelTone;
  bond: PanelAction | null;
  pick: PanelAction | null;
  picked: boolean;
}

export type PanelNode =
  | { kind: "heading"; text: string }
  | { kind: "text"; text: string; tone: PanelTone }
  | { kind: "fields"; items: PanelField[] }
  | { kind: "list"; items: PanelListItem[] }
  | { kind: "buttons"; items: PanelButton[] }
  | { kind: "empty"; text: string }
  | { kind: "separator" }
  /**
   * 对话框里的一条消息（2026-09-24 加，AI 插件那张「对话框」用的）。
   *
   * ⚠️ `from` **只认 `user` / `ai`**，别的一律当 `ai`：多出来的第三种
   * 只会在样式表里没有落点（画出来跟 AI 一样），不如在类型上就说清楚。
   */
  | { kind: "message"; from: PanelFrom; text: string }
  /** 一块改动（见 `PanelDiffLine`）。**只画，不应用**——应用得插件自己去点。 */
  | { kind: "diff"; items: PanelDiffLine[] }
  /**
   * 一棵提交树（`kind = "graph"`，2026-09-26 加，git 插件要的）。
   *
   * 这是**唯一一种带交互位置**的内容块：别的块要么整块不能点（`text` /
   * `list` / `diff`），要么整块就是一个按钮（`buttons`）。提交树上"一行的
   * 左边是键、右边是提交"，两者得分开点（见 `PanelGraphLine`）。
   *
   * ⚠️ 它**不是画布**：条目的内容（图线、文字）全是插件给的字符串，由 React
   * 转义后按等宽排版，没有任何一条路能把它们变成 HTML 或属性。这一点与
   * 上面「三条硬规矩」的第 1 条完全一致——"有点击位置"不等于"能注入"。
   */
  | { kind: "graph"; items: PanelGraphLine[] }
  /** 一行输入框 ＋ 一个提交按钮。**面板里唯一能打字的地方。** */
  | { kind: "input"; spec: PanelInput }
  /**
   * 嵌一块**本机开发服务器**的画面（`kind = "frame"`）。
   *
   * ⚠️ `url` **只能是宿主填的**。插件在自己的 `render` 里写 `url` 没用——
   * 宿主会把它抹掉再按"这个插件自己那场会话"填（`lua/api/devserver.rs::填_frame`）。
   * 所以这里**再判一次**不是为了防插件，而是因为这份 JSON 也可能来自别处
   * （手改过的数据、测试、以后别的前端入口）：只认 `http://localhost:…`，
   * 别的当"没有地址"。
   *
   * 这一条是本仓唯一一处"把外部内容嵌进 DOM"的地方，所以口子开在这儿、
   * 也只开到这么大：`src-tauri/tauri.conf.json` 的 CSP 里 `frame-src` 只列了
   * `http://localhost:*` 和 `http://127.0.0.1:*`，别的地址**浏览器那头也不认**。
   */
  | { kind: "frame"; url: string; alive: boolean; height: number }
  /**
   * 一块**会动的数字与曲线**（`kind = "chart"`，2026-09-26 加，写作统计要的）。
   *
   * 数字在上（大号）、曲线在下——这是**一块**，不是"`fields` ＋ 图"两块：
   * 它们说的是同一件事的两个面（"现在多快"和"刚才一路多快"），拆成两块
   * 就意味着插件要自己保证两块对得上，而它们本来就是同一次采样算出来的。
   *
   * ⚠️ **它和 `graph` 不是一回事**，尽管名字像：`graph` 画的是 git 那棵提交树
   * （一行的两头各有一颗可点的东西，是**排版**），这里画的是**数值曲线**。
   * 两条唯一的共同点是"都用了'图'这个字"。
   *
   * ⚠️ 曲线是 React 直接生成的 `<svg>`（`PanelBody.tsx`），**不是 canvas、
   * 更不是 HTML 字符串**：`points` 里那些数只会变成路径指令里的数字，
   * 没有任何一条路能变成标签或属性（那三条规矩的第 1 条）。
   */
  | { kind: "chart"; spec: PanelChart }
  /**
   * 一张**分享卡**（`kind = "share"`，2026-09-27 加，写作统计要的）。
   *
   * 与 `chart` 的区别不是画法而是**用途**：`chart` 是"此刻这一屏上的一块"，
   * `share` 是"要**带走**的一张图"——同一份数据，两种去处。所以它自带宽高
   * （1080×1350 的一张海报）、自己的品牌与页脚，渲染层还给它配了两颗按钮
   * （存 PNG / 复制到剪贴板）。
   *
   * ⚠️ **画的是宿主**（`ui/share-card.ts`），插件只给字段：Lua 沙箱里没有
   * 剪贴板、也生成不了图片（`docs/10` §11.2 那张边界表）。所以这一块的字段
   * 全是"文案与数"，一个像素都不由插件说了算——插件想换版式得改宿主。
   */
  | { kind: "share"; spec: PanelShare }
  /**
   * 一张**热力图**（`kind = "heatmap"`，2026-09-27 加，写作统计要的）。
   *
   * 用户原话：「加一个功能，类似 Contribution Graph 那样的热力图，记录长期数据。
   * 仅记录打字数。」——一格一天、一列一周，看的是**几个月到一年**的勤快程度。
   *
   * ⚠️ 与 `chart` 的分工是**时间尺度**，不是画法：`chart` 画的是"刚才这几分钟"
   * （采样点，一秒一个），`heatmap` 画的是"这半年每一天"（一天一格）。两者
   * 共用一页，因为它们是同一个问题的两个尺度——"现在多快"和"长期写了多少"。
   *
   * ⚠️ 记录走的是**一个字符串**而不是数组：宿主的 `面板节点上限`（200）是按
   * "一层里的项数"算的，而一年 365 天。理由与格式写在 `ui/heatmap.ts` 头上，
   * 那是这个字段唯一的解析处。
   */
  | { kind: "heatmap"; spec: PanelHeatmap }
  /**
   * 认不出的 `kind`。**带着原始 JSON 的简写**，画一句"不认识"——
   * 静默丢掉的话，插件作者看到的是"面板少了一块"，而没有任何线索。
   */
  | { kind: "unknown"; raw: string };

/** 一条消息是谁说的。 */
export type PanelFrom = "user" | "ai";

/**
 * 差异里一行是哪一种。
 *
 * ⚠️ 这五个字面量**必须和宿主 `unified_diff.rs::种类到op` 一一对上**。
 * 那边多一个、这里少一个，后果不是"少画一行"，而是**静默变色**——
 * 下面认不出的 op 一律当 `add`（见 `差异op()`）。用户不会把这种 bug 报上来，
 * 他只会觉得"这行明明删了怎么画成绿的"。
 */
export type PanelDiffOp = "del" | "add" | "ctx" | "hunk" | "meta";

/**
 * 改动块里的一行。
 *
 * - `del` / `add`：被换掉的原行 / 换上来的新行；
 * - `hunk`：`@@ -1,4 +1,4 @@`，只标"改在文件的哪一段"，不是内容；
 * - `meta`：`diff --git` / `index` / `---` / `+++` / `\ No newline …` 这类文件信息；
 * - `ctx`：hunk 里**没变**的那部分（上下文）。
 *
 * ⚠️ 后三种是 2026-09-26 加的（对齐 Folio 的 Git 拓展那个差异视图）。
 * 在那之前只画增删，代价是**看不出"改在哪一段"**——紧挨着改动的那几行是谁，
 * 正是判断"这一改对不对"要看的东西。
 *
 * ⚠️ `text` 对加/删/上下文**不含行首标记**（界面自己补 `+`/`-`/空格），
 * 对 `hunk`/`meta` 是**整行原样**（`@@ …` 那串要原样留着）。
 */
export interface PanelDiffLine {
  op: PanelDiffOp;
  text: string;
}

/** 面板里的输入框（`kind = "input"`）。 */
export interface PanelInput {
  /** 用户敲的内容放进 `args[arg]` 传给 `submit` 那条命令。空串 = 这个框不可用。 */
  arg: string;
  /** 点了调哪条命令。空串 = 画成灰的。 */
  submit: string;
  submitLabel: string;
  placeholder: string;
  hint: string;
  /** 多行输入（默认单行）。谈话类用它。 */
  multiline: boolean;
}

/**
 * 面板里的那块数字与曲线（`kind = "chart"`，写作统计要的）。
 *
 * ⚠️ **`value` 是字符串，不是数**：怎么格式化是插件的事（`"128"`、`"1.2k"`、
 * `"才刚开始"` 都合法）。收成数字的话，"小数点几位、要不要千分位"这些排版
 * 自由就得在这儿定死——而这儿是渲染层，不是插件作者那支笔。
 * 代价是它**不会被这里校验成"看起来像个数"**：那是故意的，插件要写什么写什么。
 */
export interface PanelChart {
  /** 大号数字。**空串 = 这一格没数**（画个破折号，而不是画个 0）。 */
  value: string;
  /** 数字右边的小字（`字/分钟`）。空串就不画。 */
  unit: string;
  /** 数字上面那行小标题（`写作速度`）。空串不画那一行。 */
  label: string;
  /** 曲线下面那行小字（`最近 2 分钟`）。空串不画。 */
  caption: string;
  /**
   * 曲线上的点，**按时间从早到晚**。空数组 = 只画数字、不画图。
   *
   * ⚠️ 这里只留**最后 `每块上限` 个**：插件把一整场写作的采样点全给过来也画得出，
   * 但一块 260px 宽的面板里 200 个点已经比像素还密，再多是白给。
   * 切掉的是**最旧**那一头——图上最右边那段才是"刚才"。
   */
  points: number[];
  /**
   * **横轴**的刻度（`{ { at = 0, label = "-3 分" }, … }`），**2026-09-27 加**。
   *
   * ⚠️ 横轴只有插件标得出来：曲线上一个点对应哪一刻，是插件自己定的
   * （心电图一秒一个点、git 的图一次提交一个点）。不写就是**没有横轴刻度**，
   * 那是正常状态，不是坏掉。
   */
  xTicks: 刻度[];
  /**
   * **纵轴**的刻度。**通常不用写**——不写时宿主按 `points` 的极值推三档
   * （见 `ui/chart-ticks.ts` 文件头那张表）。写给那些"纵轴不是数据本身"的图。
   */
  yTicks: 刻度[];
}

/** 分享卡上那一格指标（`kind = "share"` 的 `stats`）。 */
export interface PanelShareStat {
  /** 上面那行小标题（`总字数`）。 */
  k: string;
  /** 那个数（`1284`）。⚠️ 字符串，不是数：怎么格式化是插件的事（同 `PanelChart.value`）。 */
  v: string;
  /** 数后面那个小单位（`字` / `字/分`）。空串不画。 */
  small: string;
}

/**
 * 一张分享卡（`kind = "share"`，2026-09-27 加，写作统计要的）。
 *
 * ⚠️ 这里**只有文案与数**：版式、配色、品牌在 `ui/share-card.ts`（插件说
 * **什么**、宿主说**怎么显示**，理由同 `PanelChart` 上面那段）。
 *
 * ⚠️ 几个字段是**成对**用的，缺一个那一块就不画：`value` 空 → 画破折号、
 * `unit` 空 → 不画单位；`date` / `foot` 空 → 那两处不画（拿不到时间来源时
 * 就是这个样子，见 `plugins/stats/main.lua` 的 `date_text`）。
 */
export interface PanelShare {
  /** 卡片标题（`写作统计`）。 */
  title: string;
  /** 标题下面那行小字（`Writing Stats`）。 */
  subtitle: string;
  /** 右上角的日期时间（`2026年9月27日 22:07`）。空串不画。 */
  date: string;
  /** 大数字上面那行小标题（`本轮平均速度`）。 */
  label: string;
  /** 那个大数字。空串 = 这一格没数（画破折号，不画 0）。 */
  value: string;
  /** 大数字右边那颗单位（`字 / 分钟`）。 */
  unit: string;
  /** 曲线上的点（`字/分钟`）。与 `PanelChart.points` 同规矩：切掉最旧的、只留 200 个。 */
  points: number[];
  /** 横轴刻度。**卡片只有横轴刻度**：纵轴被幂函数压过（`ui/share-card.ts`），刻度位置由宿主自己推。 */
  xTicks: 刻度[];
  /**
   * 横轴上相邻两档刻度之间**再分几小格**（没字的短线），`0` = 不分。**2026-09-27 加**。
   *
   * 用户当天要的是「温度计、弹簧测力计这样的测量仪器的标尺」——仪器上不是只有
   * 几个有字的数，数之间还有一排小格。纵轴那一半由宿主自己分（范围是它推的），
   * 横轴这一半只有插件知道"一格主刻度是几分钟"，所以让它报一句。
   *
   * ⚠️ **只在两档之间分，两头不补**：主刻度是插件摆的，往两头续就要求"主刻度
   * 是等距的"，而"开始 / 峰值 / 结束"这种摆法并不等距。夹在 0~10。
   */
  xMinor: number;
  /**
   * 中间那块图画哪一种。**2026-09-27 加**（用户原话：「分享图包含热力图和写作图」）。
   *
   * - `"curve"`：**写作图**——这一轮/今天的速度曲线（`points` ＋ 两轴刻度）；
   * - `"heat"`：**热力图**——长期那本账铺成的小方格（`heat` ＋ 下面那排标尺）。
   *
   * ⚠️ **两种形态共用一张卡的其余部分**（标题、大数字、三格指标、页脚），因为
   * 它们是同一件事的两个尺度——"这次写了多快"和"这半年写得勤不勤"。各画一张
   * 卡等于把品牌、页脚、配色抄两遍。
   * ⚠️ 认不出的值一律当 `"curve"`：老插件（这个字段都没有）走的正是那条路。
   */
  shape: "curve" | "heat";
  /**
   * `shape === "heat"` 时那幅热力图（宿主按 `days` / `to` / `weeks` 现算）。
   * 其它形态是 `null`——曲线那张卡没有格子。
   *
   * ⚠️ 与 `PanelHeatmap.grid` 是**同一份**算出来的：算的动作在 `ui/heatmap.ts`。
   */
  heat: 热力图 | null;
  /** 热力图右下角那排深浅标尺两头的字（`少` / `多`）。空串不画。 */
  less: string;
  more: string;
  /** 下面那三格指标。最多三格（多出来的丢掉——版式就是三格）。 */
  stats: PanelShareStat[];
  /** 页脚左边那句话（`这一轮，你写下了 1284 个字`）。空串不画。 */
  foot: string;
  /** 保存时的**建议**文件名（`nota-stats-day-2026-09-27.png`）。⚠️ 渲染层还要消毒一遍。 */
  file: string;
}

/**
 * 一张热力图（`kind = "heatmap"`）。
 *
 * ⚠️ 插件给的是**两个字段**（`days` 字符串 ＋ `weeks` 列数），这里给渲染层的是
 * **算好的格子**（`grid`）：算的动作在 `ui/heatmap.ts`，一份纯函数、单独测
 * （`tests/heatmap.test.ts`）。面板拿到的那一份里，"哪一格是哪天"已经定死了。
 */
export interface PanelHeatmap {
  /** 块上面那行小标题（`长期记录`）。空串不画。 */
  title: string;
  /** 那行小字里的单位（`字`）。空串就不写单位。 */
  unit: string;
  /**
   * 算好的格子。`grid.列` 是空数组 = **不画**（一条记录都没有）。
   *
   * ⚠️ 空图与"全是 0 档的图"是两件事：前者没数据、后者有数据但那几天没写，
   * 渲染层按 `列.length` 判，不看 `总计`（总计 0 也可能是"窗口里正好没写字"）。
   */
  grid: 热力图;
}

/** 一块内容最多这么多项（和宿主的 `面板节点上限` 同量级，但**各自把关**）。 */
const 每块上限 = 200;

/** 分享卡上最多几格指标。多出来的丢掉：版式只有三格，第四格没地方放。 */
const 指标上限 = 3;

/**
 * 热力图铺多少列。**8~53 由 `算热力` 夹**，这里只负责"把 `weeks` 变成数"，
 * 认不出来给 0（= 没写，那边用默认的半年）。
 *
 * ⚠️ 不在这里夹一次的理由：夹了之后**两个地方各有一个范围**，改一个忘一个
 * 就成了另一对能对不上的数。范围与理由都在 `ui/heatmap.ts`（那是唯一知道
 * "一列是几天"的地方）。
 */
function 周数(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** 文本兜底上限。宿主已经截过一刀，这是防手改过的数据。 */
const 文本上限 = 4000;

/**
 * 一条**消息**的兜底上限，比别的块宽得多。
 *
 * ⚠️ 对话面板里的一条消息就是**一段完整的回答**（一节稿子、一份翻译），
 * 4000 字会把正经内容从中间劈掉，而截断只留一个 `…`，用户会以为模型就
 * 写到那儿。宿主那边同样是 20000（`ui.rs::面板文本上限`），两处对齐。
 */
const 消息上限 = 20000;

function 文本(v: unknown, 上限 = 文本上限): string {
  if (typeof v === "string") return v.length > 上限 ? `${v.slice(0, 上限)}…` : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function 语气(v: unknown): PanelTone {
  switch (v) {
    case "muted":
    case "success":
    case "warn":
    case "danger":
      return v;
    // 别名。宿主的通知层级用的是 `info`/`error`/`warning`（见 `ui.rs`
    // 的 `normalise_level`），插件作者很容易照着抄过来。
    // **两处都认**，免得一个 `tone = "info"` 变成静默的 normal。
    case "info":
      return "normal";
    case "error":
      return "danger";
    case "warning":
      return "warn";
    default:
      return "normal";
  }
}

function 是表(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * 一条差异行的 op。认不出的一律当 `add`。
 *
 * ⚠️ 这个兜底**不是**"宽容"，它是一条看得见的坏味道：宿主或插件多出来一种
 * 新 op 时，界面上会有一类行**画成绿的**，而不是整块消失——**颜色错了比
 * 内容没了更难查**，但也比悄悄吞掉强（见本文件顶上三条规矩里的第 1 条）。
 * 所以它和宿主那五个字面量之间是**两份手抄的清单**，改一处必须改两处。
 */
function 差异op(v: unknown): PanelDiffOp {
  switch (v) {
    case "del":
    case "add":
    case "ctx":
    case "hunk":
    case "meta":
      return v;
    default:
      return "add";
  }
}

/** 把一张表的某个键读成"表数组"。不是数组就空。 */
function 表数组(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return [];
  return v.filter(是表).slice(0, 每块上限);
}

/**
 * 一颗动作（`kind = "graph"` 的行上那两颗）。
 *
 * **没有 `command` 就是 `null`**（那一头画成纯文字），不是"一颗点了没事发生的
 * 按钮"——与 `buttons` 那条"少写了一根线要看得见"的规矩**不同**，差别是有理由
 * 的：按钮那块里一颗灰按钮是"这里本该有东西"的信号，而提交树上"这一头没有
 * 动作"是**正常状态**（纯连接线行就没有右边的提交）。画成灰的会让整棵树
 * 布满灰块，反而看不出哪一头是真的能点。
 */
function 动作(v: unknown): PanelAction | null {
  if (!是表(v)) return null;
  const command = 文本(v.command);
  if (!command) return null;
  return { command, args: v.args, title: 文本(v.title) };
}

function 图行(v: Record<string, unknown>): PanelGraphLine {
  return {
    // ⚠️ `art` 的**空格不能 trim**：那是图线的一部分（`| ` 和 `  ` 不同），
    // 去掉了整棵树就散架。`文本()` 本来就不动首尾空白，这里只是写明白。
    art: 文本(v.art),
    text: 文本(v.text),
    tone: 语气(v.tone),
    bond: 动作(v.bond),
    pick: 动作(v.pick),
    picked: v.picked === true,
  };
}

function 提示(v: unknown): PluginPrompt | null {
  if (!是表(v)) return null;
  const arg = 文本(v.arg);
  // 没有 `arg` 的提示是空的——问了也送不出去。宁可当没写，
  // 也不要弹一个"填完什么都不会发生"的框。
  if (!arg) return null;
  // 第二个字段：**键名和标签两个都给才算数**，与 Rust 的 `读提示` 同一套判据。
  // 宿主的 `PromptDialog` 是"给了 `secondLabel` 才画第二行"，所以标签为空时
  // 让 `secondArg` 也跟着空——否则值会被悄悄丢掉（框都没画，哪来的值）。
  const secondArg = 文本(v.secondArg);
  const secondLabel = 文本(v.secondLabel);
  const 两个都给 = Boolean(secondArg && secondLabel);
  return {
    arg,
    label: 文本(v.label) || t("请输入"),
    placeholder: 文本(v.placeholder),
    hint: 文本(v.hint),
    secret: v.secret === true,
    secondArg: 两个都给 ? secondArg : "",
    secondLabel: 两个都给 ? secondLabel : "",
    secondPlaceholder: 两个都给 ? 文本(v.secondPlaceholder) : "",
  };
}

/**
 * 读一个输入框。
 *
 * ⚠️ **没有 `arg` 或没有 `submit` 时仍然画出来**（画成灰的、不能提交）：
 * 这与 `buttons` 那条规矩一致——少写了一根线要**看得见**，
 * 而不是让整块消失。`提示()` 那边相反（没有 `arg` 就当没写），因为那时
 * 弹出来的框"填完什么都不会发生"，多一个框比少一个框更坏。
 */
function 输入框(raw: Record<string, unknown>): PanelInput {
  return {
    arg: 文本(raw.arg),
    submit: 文本(raw.submit),
    submitLabel: 文本(raw.submit_label) || t("提交"),
    placeholder: 文本(raw.placeholder),
    hint: 文本(raw.hint),
    multiline: raw.multiline === true,
  };
}

/**
 * `chart` 块（`kind = "chart"`）。
 *
 * ⚠️ **`NaN` / `Infinity` 必须在这里滤掉，不能留给渲染层**：它们进了 SVG 的
 * 路径指令就变成 `M NaN 12`，浏览器要么整条线不画、要么画出一根穿过面板的
 * 怪线——而症状看着像"图画错了"，其实是数据里有一个坏点。
 * ⚠️ 顺带把非数字的项也滤掉（`"12"` 这种字符串不认）：曲线上的点只能是数，
 * 而"字符串能不能当数"这种判据放这儿一次就够了，别让渲染层再猜一遍。
 */
function 图块(raw: Record<string, unknown>): PanelChart {
  const 原 = Array.isArray(raw.points) ? raw.points : [];
  const points = 原
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    // ⚠️ 切的是**前面**（最旧的），`slice(-n)` 留的是尾巴——理由见 `PanelChart` 上那条。
    .slice(-每块上限);
  return {
    value: 文本(raw.value),
    unit: 文本(raw.unit),
    label: 文本(raw.label),
    caption: 文本(raw.caption),
    points,
    // 刻度走 `ui/chart-ticks.ts`：坏项在那儿丢掉、位置在那儿夹到 0~1。
    // ⚠️ 纵轴**这里不推**：推的那一步要拿到 `points` 的极值，而那是渲染层
    // 才知道的事（它才是按极值归一化的那一方）。见那个文件头那张分工表。
    xTicks: 读刻度(raw.x_ticks),
    yTicks: 读刻度(raw.y_ticks),
  };
}

/**
 * `share` 块（`kind = "share"`）。
 *
 * ⚠️ 与 `图块` 共用同一条"数字才收"的判据（`NaN` / `Infinity` / 字符串都滤掉）：
 * 一个坏点进了卡片的路径指令，整条曲线就不画了，而那一头看着像"数据是空的"。
 * ⚠️ 文案一律走 `文本()`（长度上限 ＋ 类型收窄），**一个字都不进 HTML 或属性**：
 * 它们最后会进 SVG 的 `<text>`，而 SVG 是**XML**——`&` 和 `<` 在里面是有含义的
 * （`ui/share-card.ts` 那边还会再转义一次，两道都在，谁漏了都不至于出洞）。
 */
function 分享卡(raw: Record<string, unknown>): PanelShare {
  const 原 = Array.isArray(raw.points) ? raw.points : [];
  const points = 原
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    .slice(-每块上限);

  const stats: PanelShareStat[] = [];
  if (Array.isArray(raw.stats)) {
    for (const 项 of raw.stats.slice(0, 指标上限)) {
      if (typeof 项 !== "object" || 项 === null) continue;
      const t = 项 as Record<string, unknown>;
      stats.push({ k: 文本(t.k), v: 文本(t.v), small: 文本(t.small) });
    }
  }

  return {
    title: 文本(raw.title),
    subtitle: 文本(raw.subtitle),
    date: 文本(raw.date),
    label: 文本(raw.label),
    value: 文本(raw.value),
    unit: 文本(raw.unit),
    points,
    // ⚠️ 卡片这里**自己给上限**（默认那 8 档是给面板一块 260px 宽的图定的）：
    // 全日那张卡的横轴是**钟点**，8 小时都标不满一天，而两档之间还有小格。
    xTicks: 读刻度(raw.x_ticks, 卡刻度上限),
    xMinor: 横细分数(raw.x_minor),
    // 中间那块图画哪一种。⚠️ 判据是 `raw.shape === "heat"`（而不是"有没有给
    // `days`"）：哪天热力图多一个字段、或者插件手滑多发了一个 `days`，都没有
    // "这块该画什么"来得要紧。
    shape: raw.shape === "heat" ? "heat" : "curve",
    heat:
      raw.shape === "heat"
        ? 算热力(读热力记录(raw.days), 文本(raw.to), 周数(raw.weeks))
        : null,
    less: 文本(raw.less),
    more: 文本(raw.more),
    stats,
    foot: 文本(raw.foot),
    file: 文本(raw.file),
  };
}

/**
 * 分享卡横轴的主刻度最多几档。比面板那 8 档宽——理由见上面那一句。
 */
const 卡刻度上限 = 13;

/**
 * `x_minor` 读成一个 0~10 的整数。认不出来就是 0（= 不画小格）。
 *
 * ⚠️ **取整而不是照抄**：`2.5` 格没法画，而"照抄之后画出来的是 2 格"这种账
 * 不如在入口就说清楚。⚠️ 也不接受负数——负的格数会让下面那个循环一次都不跑，
 * 结果与 0 相同，但"设置里写了个 -1"是个该被发现的手误。
 */
function 横细分数(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(10, Math.floor(raw)));
}

/**
 * `frame` 块只认**本机**的地址。不是本机的 → 空串（渲染层当"没地址"处理）。
 *
 * ⚠️ 判据是**协议 + 主机名**，两样都要对：
 * - 协议必须 `http:`（开发服务器都是 http；`https:` 指向本机反而少见，
 *   真出现了再加，不要先放一个用不上的口子）；
 * - 主机名必须 `localhost` / `127.0.0.1` / `[::1]`——**不能只看"以 http:// 开头"**，
 *   `http://evil.example/` 也满足那个前缀。
 *
 * 宿主那边填出来的一定是 `http://localhost:<port>/`，所以这条**正常情况下
 * 一次都不会触发**；它的用处是在数据不是宿主填的那种情况下兜底。
 */
function 本机地址(v: unknown): string {
  const s = 文本(v);
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "http:") return "";
    if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(u.hostname)) return "";
    return s;
  } catch {
    // 连 URL 都解析不出来（`new URL` 会抛）——当没地址。
    return "";
  }
}

/**
 * `frame` 块的高度。**只认数字，且夹在 120–2000 之间**。
 *
 * 两头都要夹：太小（一块 10px 的框）看不清任何东西，用户只会以为坏了；
 * 太大（有人写 99999）会把面板撑成一整屏、把别的块挤到看不见的地方。
 * 这个范围是"一块画布"的尺寸，不是"页面该多高"的规格。
 */
function 高度(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 480;
  return Math.min(2000, Math.max(120, Math.round(n)));
}

function 一块(raw: Record<string, unknown>): PanelNode {
  const kind = 文本(raw.kind);
  switch (kind) {
    case "heading":
      return { kind: "heading", text: 文本(raw.text) };
    case "text":
      return { kind: "text", text: 文本(raw.text), tone: 语气(raw.tone) };
    case "fields":
      return {
        kind: "fields",
        items: 表数组(raw.items).map((it) => ({
          label: 文本(it.label),
          value: 文本(it.value),
          tone: 语气(it.tone),
        })),
      };
    case "list":
      return {
        kind: "list",
        items: 表数组(raw.items).map((it) => ({
          title: 文本(it.title),
          subtitle: 文本(it.subtitle),
          badge: 文本(it.badge),
          tone: 语气(it.tone),
        })),
      };
    case "buttons":
      return {
        kind: "buttons",
        items: 表数组(raw.items).map((it) => ({
          label: 文本(it.label),
          command: 文本(it.command),
          // `args` **原样带着**：它的形状由插件和它自己的命令约定，
          // 宿主和这里都不解析。`undefined` 也是一种合法的"没有参数"。
          args: it.args,
          prompt: 提示(it.prompt),
          style: it.style === "primary" || it.style === "danger" ? it.style : "normal",
          disabled: it.disabled === true,
        })),
      };
    case "empty":
      return { kind: "empty", text: 文本(raw.text) };
    case "separator":
      return { kind: "separator" };
    case "message":
      return {
        kind: "message",
        from: raw.from === "user" ? "user" : "ai",
        text: 文本(raw.text, 消息上限),
      };
    case "diff":
      return {
        kind: "diff",
        items: 表数组(raw.items).map((it) => ({
          op: 差异op(it.op),
          text: 文本(it.text),
        })),
      };
    case "graph":
      return { kind: "graph", items: 表数组(raw.items).map(图行) };
    case "input":
      return { kind: "input", spec: 输入框(raw) };
    case "chart":
      return { kind: "chart", spec: 图块(raw) };
    case "share":
      return { kind: "share", spec: 分享卡(raw) };
    case "heatmap":
      return {
        kind: "heatmap",
        spec: {
          title: 文本(raw.title),
          unit: 文本(raw.unit),
          // ⚠️ `to` 走 `文本()`：它不是给人看的字，但也要是同一种收窄
          // （数字/布尔会被 `String()` 掉，日期本来就不该长成那样）。
          grid: 算热力(读热力记录(raw.days), 文本(raw.to), 周数(raw.weeks)),
        },
      };
    case "frame":
      return {
        kind: "frame",
        url: 本机地址(raw.url),
        alive: raw.alive === true,
        height: 高度(raw.height),
      };
    default: {
      const 名 = kind || t("（没写 kind）");
      return { kind: "unknown", raw: 名 };
    }
  }
}

/**
 * 宿主发来的一份 JSON → 一串能渲染的内容块。
 *
 * 不认识的顶层项（不是表的）**丢掉**——它连 `kind` 都没有，没有任何可说的。
 * 认不出的 `kind` 留着（见上面那条）。
 */
export function normalise(raw: unknown): PanelNode[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(是表)
    .slice(0, 每块上限)
    .map(一块);
}
