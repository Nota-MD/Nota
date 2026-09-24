/**
 * 面板内容的**白名单**：宿主发来的那一坨 JSON 在这里被收成
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

import type { PluginPrompt } from "@/bridge/ipc";

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
  /** 一行输入框 ＋ 一个提交按钮。**面板里唯一能打字的地方。** */
  | { kind: "input"; spec: PanelInput }
  /**
   * 认不出的 `kind`。**带着原始 JSON 的简写**，画一句"不认识"——
   * 静默丢掉的话，插件作者看到的是"我的面板少了一块"，而没有任何线索。
   */
  | { kind: "unknown"; raw: string };

/** 一条消息是谁说的。 */
export type PanelFrom = "user" | "ai";

/** 改动块里的一行。`del` 是被换掉的原行，`add` 是换上来的新行。 */
export interface PanelDiffLine {
  op: "del" | "add";
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

/** 一块内容最多这么多项（和宿主的 `面板节点上限` 同量级，但**各自把关**）。 */
const 每块上限 = 200;

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
    // 的 `normalise_level`），插件作者很容易顺手抄过来。
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

/** 把一张表的某个键读成"表数组"。不是数组就空。 */
function 表数组(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return [];
  return v.filter(是表).slice(0, 每块上限);
}

function 提示(v: unknown): PluginPrompt | null {
  if (!是表(v)) return null;
  const arg = 文本(v.arg);
  // 没有 `arg` 的提示是空的——问了也送不出去。宁可当没写，
  // 也不要弹一个"填完什么都不会发生"的框。
  if (!arg) return null;
  return {
    arg,
    label: 文本(v.label) || "请输入",
    placeholder: 文本(v.placeholder),
    hint: 文本(v.hint),
    secret: v.secret === true,
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
    submitLabel: 文本(raw.submit_label) || "提交",
    placeholder: 文本(raw.placeholder),
    hint: 文本(raw.hint),
    multiline: raw.multiline === true,
  };
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
        // 只认 `del` / `add` 两种 op；别的一律当 `add`（宁可多画一行，
        // 也不要静默吞掉——吞掉的正是插件作者以为会显示的那一行）。
        items: 表数组(raw.items).map((it) => ({
          op: it.op === "del" ? ("del" as const) : ("add" as const),
          text: 文本(it.text),
        })),
      };
    case "input":
      return { kind: "input", spec: 输入框(raw) };
    default: {
      const 名 = kind || "（没写 kind）";
      return { kind: "unknown", raw: 名 };
    }
  }
}

/**
 * 宿主发来的一坨 JSON → 一串能渲染的内容块。
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
