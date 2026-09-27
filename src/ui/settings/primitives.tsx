/**
 * 偏好设置的原语：一组、一行、下拉、开关、单选、滑杆、输入框、多行文本、
 * 动作按钮、「?」气泡、搜索框。
 *
 * # 版式：**两栏 + 一列控件**
 *
 * ```text
 * ┌───────────────┬────────────────┬──────────────────────┐
 * │ 组标题        │ 子标签         │ 控件                 │
 * │ （左栏，粗）  │ （中间，细）   │ （右栏）             │
 * ├───────────────┼────────────────┼──────────────────────┤
 * │ 启动选项      │                │ [下拉 ▾]             │
 * │ 保存 & 恢复   │ 自动保存       │ ( ●—)                │
 * │               │ 切换文件时     │ ( ●—)                │
 * └───────────────┴────────────────┴──────────────────────┘
 * ```
 *
 * 关键的一条：**没有子标签的行，控件顶到中间那一栏**（截图里「启动选项」就是
 * 这样——组标题本身就是这一项的说明）。所以「组标题」在两种情况下含义不同：
 * 组里有一堆子行时它是**分类名**，只有一行时它就是**那一行的标签**。
 *
 * ⚠️ 三栏靠 CSS grid + `.stg-row { display: contents }` 对齐。用 `display:
 * contents` 是因为行必须是一个**能被 `:has()` 数到、能被搜索整行丢掉**的元素，
 * 但它自己不能参与布局（一参与，每一行的列宽就各算各的，左边的字全对不齐）。
 * `.stg-row` 是个没有语义的 `<div>`，`display: contents` 丢掉的就是"一个 div"，
 * 没有可访问性损失。
 *
 * # ⚠️ 搜索是"就地过滤"，不是"另建索引"
 *
 * 查询非空时**十一个分节全部叠着渲染**，每一行自己拿标签、说明、**所属组的标题**
 * 去比，比不中的返回 `null` 不进 DOM；某一组一行都没留下时，CSS 的 `:has()`
 * 把整组也收掉（`settings.css` 里的 `.stg-group:not(:has(.stg-row))`）。
 *
 * 把**组标题**也算进去是 2026-09-24 加的：在那之前搜「代码块」搜不到「行号」
 * ——而用户往往是照着屏幕上印着的分组名在搜。组标题通过
 * `GroupContext` 传下来，见 `SettingsGroup`。
 *
 * 这比"另写一份搜索索引"稳：索引和界面是**两份要同时维护的清单**，加了控件
 * 忘了加索引，症状是"搜得到但点不过去"——不报错的那种。
 *
 * ⚠️ 代价：这一套**必须**包在 `QueryProvider` 里（`SettingsDialog.tsx` 负责）。
 * 漏了不炸，只会让搜索框失灵。
 */

import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useId,
  useState,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from "react";

import { useT } from "@/i18n";

/** 当前搜索词（已 `trim().toLowerCase()`）。空串 = 不过滤。 */
const QueryContext = createContext("");

/** 当前组的标题。**只用来扩大搜索面**，不画在行上。 */
const GroupContext = createContext("");

export const QueryProvider = QueryContext.Provider;

export const useQuery = () => useContext(QueryContext);

/** 这一行/这一组的标签和说明里有没有查询词。空查询一律算中。 */
export function hits(query: string, label: string, description?: string): boolean {
  if (!query) return true;
  return `${label} ${description ?? ""}`.toLowerCase().includes(query);
}

/**
 * 把一段 JSX 里的**文字**抠出来——只给搜索用。
 *
 * 为什么需要它：`Note` 的正文是一段 JSX（里面夹着 `<strong>` / `<code>`），
 * 手里没有可以拿去匹配的字符串。而 `Note` 又**不经过 `SettingRow`**，
 * 没有别的机会参与过滤。
 *
 * ⚠️ 只穿透 `children`，不做任何渲染。`Note` 里的字全是明文，
 * 所以这够用；哪天要放一个"字数由 props 算出来"的节点进来，这里得跟着改。
 */
function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) {
    return nodeText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

/* ── 控件 ──────────────────────────────────────────────────────────────
 *
 * 下面这些都是**本仓自己的控件**，共同点：把 `SettingRow` 塞进来的 `id` /
 * `aria-*` **透到真正的那个元素上**（表单元素，或 `role="radiogroup"` 那一层）。
 * 于是 `SettingRow` 能判定"这一行可以被标注"，标签才画成 `<label htmlFor>`。
 *
 * ⚠️ 加一个新控件时，必须同时把它的名字加进下面的 `OWN_CONTROLS`。
 * 漏了的症状是：这一行的标签退化成 `<span>`，**点了没反应**——
 * 不报错、不显示异常，只是"别的行点标签能切换，这行不能"。
 */

const LABELABLE_TAGS = new Set(["input", "select", "textarea"]);

/**
 * 下拉选择。
 *
 * ⚠️ 外层那个 `<span>` 是**必须的**：原生的箭头外观去不掉（`appearance: none`
 * 之后得自己画一根），而 `<select>` 上挂不住可靠的伪元素，所以箭头画在
 * 包裹层上，见 `settings.css`。
 *
 * 多出来的 `...rest` 就是给 `SettingRow` 塞 `id` / `aria-*` 用的，
 * 直接摊到 `<select>` 上——**别摊到外层 `<span>` 上**，那样 id 就指错了地方。
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  ...rest
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
} & Omit<ComponentPropsWithoutRef<"select">, "value" | "onChange" | "children">) {
  return (
    <span className="stg-select">
      <select
        {...rest}
        className="stg-select-native"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/**
 * 开关。iOS 那种胶囊。
 *
 * ⚠️ **开关用胶囊，不用复选框**——这是 2026-09-23 按用户要求
 * 定下来的设计语言（`primitives.tsx` 从 VMark 那套版式搬过来时就是这样），
 * 全仓四十多处检查项一个样式。用户 2026-09-24 的抱怨是「每一栏只抄了一个选项」
 * （**内容**不够），不是「勾的样式不对」。**内容是照着补的，控件样式没换。**
 */
export function Toggle({
  checked,
  onChange,
  ...rest
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
} & Omit<ComponentPropsWithoutRef<"button">, "onChange" | "children">) {
  return (
    <button
      {...rest}
      type="button"
      role="switch"
      aria-checked={checked}
      className="stg-switch"
      onClick={() => onChange(!checked)}
    >
      <span className="stg-switch-knob" />
    </button>
  );
}

/**
 * 单选。**和 `Select` 的分工**：选项只有两三个、而且需要一眼看见全部备选时才用
 * 它（换行符 LF/CRLF、字号"自动 / 自定义"）；五个以上一律 `Select`。
 *
 * ⚠️ 互斥是**靠 React 的受控值**做到的（点了就 `onChange`，父层改 `value`，
 * 其余的 `checked` 自然变 false），**不是**靠 DOM 的 `name` 分组。`name` 在这里
 * 只为可访问性服务（读屏要知道"这几个是一组"），所以不给也有默认值。
 */
export function Radio<T extends string>({
  value,
  options,
  onChange,
  name,
  ...rest
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  /** 可访问性用的组名。不给就自动生成一个。 */
  name?: string;
} & Omit<ComponentPropsWithoutRef<"span">, "onChange" | "children">) {
  const auto = useId();
  const group = name ?? auto;

  return (
    <span {...rest} className="stg-radio" role="radiogroup">
      {options.map((o) => (
        <label key={o.value} className="stg-radio-item">
          <input
            type="radio"
            name={group}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </span>
  );
}

/**
 * 单行文本。宽度从 `width` 取（`sm` 三个字、`lg` 一条路径），
 * **不写死像素**——写死的那个数换一套界面风格就不对了。
 */
export function TextInput({
  value,
  onChange,
  width = "md",
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  width?: "sm" | "md" | "lg";
} & Omit<ComponentPropsWithoutRef<"input">, "value" | "onChange" | "type" | "children">) {
  return (
    <input
      {...rest}
      type="text"
      className={`stg-input stg-input-${width}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * 多行文本。今天只有一处在用：上传服务器的**请求头**那一栏
 * （一行一条 `名字: 值`，可能有好几条，单行框里挤不下也看不清）。
 *
 * ⚠️ 它是**受控**的、`onChange` 每敲一个键就往外送，与 `TextInput` 一样：
 * 这一栏存的是字符串本身，没有 `NumberInput` 那种"打到一半不是个数"的问题。
 * 代价是每敲一键就写一次盘（`nota_image_upload_set` 整份写）——一次几百字节的
 * 小文件，比"攒着等失焦"的另一个状态机划算。
 *
 * ⚠️ `mono` 给的是等宽字体：「一行一条 `名字: 值`」这种内容，**是不是一行**
 * 本身就是信息（缩进错一格就整条不生效），比例字体看不出来。
 */
export function TextArea({
  value,
  onChange,
  rows = 4,
  mono = false,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  /** 行数。给的是"初始高度"，用户能拖右下角（CSS `resize: vertical`）。 */
  rows?: number;
  /** 等宽。见上面那段。 */
  mono?: boolean;
} & Omit<
  ComponentPropsWithoutRef<"textarea">,
  "value" | "onChange" | "children" | "rows"
>) {
  return (
    <textarea
      {...rest}
      rows={rows}
      className={`stg-input stg-textarea${mono ? " stg-textarea-mono" : ""}`}
      value={value}
      // ⚠️ 拼写检查要去掉：这一栏里全是 `Bearer`、`X-Api-Key` 这种词，
      // 红线一拉满屏都是，而它一条都不该改。
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * 数字输入。**收敛在 `min`/`max` 上**：不是装饰，是为了挡住"缩进宽度填了 0"
 * 这类能存进设置、能让排版算出一堆 NaN 的值。
 */
export function NumberInput({
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
  ...rest
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  /** 输入框**里面**跟的单位（`%`）。没有就不画。 */
  suffix?: string;
  onChange: (value: number) => void;
} & Omit<ComponentPropsWithoutRef<"input">, "value" | "onChange" | "type" | "children">) {
  // ⚠️ **草稿态**（2026-09-25，用户体验评估抓出来的）。原来是每敲一个键就
  // `Math.min(max, Math.max(min, n))` 夹一次、当场写回设置，于是"把阅读速度
  // 改成 150"会变成 1000：第一个键 `1` 立刻被夹成 `100` 并让 React 把输入框
  // 重写成 `100`，后面的 `50` 变成往它屁股后面追加 → `10050` → 夹成 1000。
  // **用户输入的数和看到的数不是一个数**，而且那个错的数已经落盘了。
  //
  // 现在 `draft` 只在"这一格正在被编辑"期间存在，原样显示用户打的字；
  // 只有**失焦或回车**（＝"打完了"）才夹紧并往外送。中间态允许越界、允许为空：
  // "还没打完"本来就不该被当成一个值。
  //
  // ⚠️ 别把这里改回"输入即生效"。想一边打一边见效果的话，见 `Range`——
  // 滑杆拖到哪儿就是哪儿，没有中间态。
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    setDraft(null); // 先放开，让下面那个值说了算（夹紧了要能看出来）
    const n = Number(draft);
    // 空串／打成半个数的（`-`、`1e`）：什么都不改，保留原值。
    if (draft.trim() === "" || !Number.isFinite(n)) return;
    onChange(Math.min(max, Math.max(min, n)));
  };

  return (
    <span className="stg-number">
      <input
        {...rest}
        type="number"
        className="stg-input stg-input-num"
        min={min}
        max={max}
        step={step}
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          commit();
          e.currentTarget.blur();
        }}
      />
      {suffix && <span className="stg-number-suffix">{suffix}</span>}
    </span>
  );
}

/** 滑杆 + 右边一个读数。字号、正文宽度这种连续量用它，不用下拉。 */
export function Range({
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
  ...rest
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  /** 读数后面跟的单位，比如 `px`。 */
  suffix?: string;
  onChange: (value: number) => void;
} & Omit<ComponentPropsWithoutRef<"input">, "value" | "onChange" | "type" | "children">) {
  return (
    <span className="stg-range">
      <input
        {...rest}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {/* 读数放在右边**定宽**：数字变宽变窄时滑杆不会跟着抖。 */}
      <span className="stg-range-value">
        {value}
        {suffix}
      </span>
    </span>
  );
}

/**
 * 灰边动作按钮。**不是设置项**——按下去做一件事，不存任何值。
 *
 * ⚠️ `disabled` 是有意义的用法，不是占位：「清除历史文件记录」
 * 在没有历史时就是灰的。「这一条还没做」也用它——**灰着比藏起来诚实**，
 * 藏起来用户会以为是自己没找到。
 */
export function ActionButton({
  children,
  onClick,
  disabled,
  title,
  danger,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** 悬停提示。没做的按钮在这儿写清楚"为什么没做"。 */
  title?: string;
  /**
   * 危险动作（**不可逆**的那一类，现在是「拓展」页的「卸载」）。
   *
   * ⚠️ 用它的时候确认框**必须**先问一句——颜色只让人多看一眼，拦不住手快的人。
   * 用法与 `ui/useDialogs.ts::askConfirm` 的 `danger: true` 是同一件事的两半
   * （那一半管框，这一半管按钮）。
   */
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={danger ? "btn stg-action stg-action-danger" : "btn stg-action"}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

/**
 * 「?」气泡：把长解释**收起来**，点/悬停才出。
 *
 * # 为什么需要它
 *
 * 每一组标题右边都有一颗 `?`。它不是为了
 * 好看：设置项的解释常常是三五句话（"智能标点为什么不算改用户字节"那种），
 * 全摊在行下面，一页就变成一堵字墙，**该看的那一行反而看不见了**。
 *
 * ⚠️ **不是 `title` 属性**。原生 `title` 键盘到不了、读屏器不一定读，
 * 而且没法换行。这里是一颗真按钮 + 一个 `role="tooltip"` 的气泡，
 * 靠 `:hover` / `:focus-within` 显示（`settings.css`），键盘 Tab 得到。
 *
 * ⚠️ 气泡是**绝对定位**的，而设置框内容区是 `overflow: auto`——贴着右边缘的
 * 那颗气泡会被裁掉一点。所以 CSS 里把它往左靠（`right: 0`），
 * 宽度也限死。别把 `?` 放到会横向溢出的地方。
 */
export function HelpDot({ text }: { text: ReactNode }) {
  // 订阅语言（宿主报来语言之后这一块要重画，见 `i18n/index.ts::useT`）。
  const t = useT();
  const id = useId();
  return (
    <span className="stg-help">
      <button type="button" className="stg-help-dot" aria-describedby={id} aria-label={t("说明")}>
        ?
      </button>
      <span id={id} role="tooltip" className="stg-help-pop">
        {text}
      </span>
    </span>
  );
}

/* ── 行与组 ──────────────────────────────────────────────────────────── */

/** 本仓自己的、可标注的控件（见文件头那段 ⚠️）。 */
const OWN_CONTROLS: unknown[] = [
  Toggle,
  Select,
  Range,
  Radio,
  TextInput,
  NumberInput,
  TextArea,
];

/**
 * 一行「子标签 + 控件」。
 *
 * `label` **可以不给**：不给就是"这一组只有这一项，组标题就是它的标签"，
 * 控件会顶到中间那一栏（版式见文件头）。
 *
 * # ⚠️ 标签是不是 `<label>`，判据是**控件能不能被标注**
 *
 * `htmlFor` 指向一个不是表单元素的东西是**悬空引用**——点了没反应，
 * 而且不报错。更糟的一种是它指向一个 `<button>`：点标签文字会**真的触发
 * 那个动作**（「打开主题文件夹」这种一次性按钮上，这是纯粹的惊吓）。
 * 所以只有 `LABELABLE_TAGS` 里那几个 + `OWN_CONTROLS` 才算「可标注」，
 * 其余一律退化成 `<span>` + `aria-labelledby`。
 */
export function SettingRow({
  label,
  description,
  searchText,
  help,
  children,
}: {
  /** 中间那一栏的子标签。**不给就是"没有子标签"**，见文件头。 */
  label?: string;
  /** 标签下面那一行小字。**算进搜索**（搜到的字看得见，才是好搜索）。
   *  ⚠️ 传字符串时**只当纯文本画**，里面写 `**加粗**` 会原样显示出四个星号
   *  （2026-09-24 目检抓到过，全仓 72 处）。要强调就传 JSX 的 `<strong>`；
   *  另外它还必须**是字符串**才会接上 `aria-describedby`（见下面 `descText`）。 */
  description?: ReactNode;
  /** **只算进搜索、不画出来**的字。
   *  给"每行都挂一遍会变成噪音、可它确实是用户会搜的词"用——
   *  快捷键那一节的组名（「文件」）就是这种：组标题已经写着它了。 */
  searchText?: string;
  /** 有它就在标签后面跟一颗 `?`。长解释走这里，别塞 `description`。
   *  ⚠️ 同 `description`：字符串是纯文本，`**` 不会变成粗体。
   *  ⚠️ 字符串里**不许有半角双引号**——它是 JSX 属性值，`"` 会把属性提前关掉
   *  （`tsc` 会报 `TS1003`）。引「词」请用「」。 */
  help?: ReactNode;
  children: ReactNode;
}) {
  const query = useQuery();
  const group = useContext(GroupContext);
  const id = useId();
  const labelId = `${id}-label`;
  const descId = `${id}-desc`;

  const descText = typeof description === "string" ? description : undefined;
  const childEl = isValidElement(children)
    ? (children as ReactElement<Record<string, unknown>>)
    : null;

  const labelable =
    childEl !== null &&
    (typeof childEl.type !== "string"
      ? OWN_CONTROLS.some((c) => c === childEl.type)
      : LABELABLE_TAGS.has(childEl.type));

  // ⚠️ 组标题也算进来：用户是**照着屏幕上的分组名**在搜的。
  if (!hits(query, [group, label, descText, searchText].filter(Boolean).join(" "))) return null;

  // ⚠️ 没有子标签时**换成 `aria-label`**，不能用 `aria-labelledby`：
  // 那一行的标签格子里是空的（`stg-row-text` 整个被 CSS 收掉），指向它的
  // `aria-labelledby` 会算出一个**空名字**——读屏器念出来就是"按钮"。
  // 名字从组标题来：这种行的组标题就是它的标签（版式见文件头）。
  const control =
    childEl === null
      ? children
      : cloneElement(childEl, {
          id,
          ...(label !== undefined
            ? { "aria-labelledby": labelId }
            : group
              ? { "aria-label": group }
              : {}),
          ...(descText ? { "aria-describedby": descId } : {}),
        });

  return (
    <div className="stg-row" data-flat={label === undefined ? "true" : undefined}>
      <div className="stg-row-text">
        {label !== undefined &&
          (labelable ? (
            <label id={labelId} className="stg-row-label" htmlFor={id}>
              {label}
            </label>
          ) : (
            <span id={labelId} className="stg-row-label">
              {label}
            </span>
          ))}
        {help && <HelpDot text={help} />}
        {description && (
          <span id={descId} className="stg-row-desc">
            {description}
          </span>
        )}
      </div>
      <div className="stg-row-control">{control}</div>
    </div>
  );
}

/**
 * 一组行。
 *
 * ⚠️ `title` 的两种含义见文件头：组里有多行时它是分类名，只有一行时它就是
 * 那一行的标签。**这件事没法用类型表达**，靠写的人掌握——判据是
 * "这一组里的行有没有子标签"。
 *
 * `description` 画在标题下面（左栏），`help` 是一颗靠到最右的 `?`。
 * 两者都在**左栏**，与行里那个 `description`（中间栏）不是一回事。
 */
export function SettingsGroup({
  title,
  description,
  help,
  children,
}: {
  title: string;
  /** 组标题下面的一段话。**在左栏**，不占中间栏的宽度。 */
  description?: ReactNode;
  /** 靠最右那颗 `?`。整组的解释放这儿。 */
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="stg-group">
      <div className="stg-group-head">
        <h3 className="stg-group-title">{title}</h3>
        {help && <HelpDot text={help} />}
      </div>
      {description && <p className="stg-group-desc">{description}</p>}
      <GroupContext.Provider value={title}>
        <div className="stg-group-body">{children}</div>
      </GroupContext.Provider>
    </section>
  );
}

/* ── 零碎 ────────────────────────────────────────────────────────────── */

/** 左栏顶上的搜索框。
 *
 * # ⚠️ 那个「×」是自己画的，不能用 `<input type="search">` 自带的那颗
 *
 * 原生那颗在 WebKitGTK 里**点了不清空**：它会抹掉输入框的 DOM 值、也会让输入框
 * 失焦，但**不派发 `input` 事件**——于是 React 那边的 `value` 一尘不染，
 * 下一次渲染又把旧字写了回去。实测（Xvfb，2026-09-23）：点它 → 蓝框消失、
 * 字还在。这也是一类"看起来能用"的假货：按钮画得出来、点得下去、就是不生效。
 * 所以：① CSS 里把原生那颗 `appearance: none` 掉，② 自己画一颗、
 * 挂 `onClick` 显式 `onChange("")`。 */
export function SearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  // 订阅语言（宿主报来语言之后这一块要重画，见 `i18n/index.ts::useT`）。
  const t = useT();
  return (
    <span className="stg-search-wrap">
      <input
        type="search"
        className="stg-search"
        value={value}
        placeholder={t("搜索设置…")}
        aria-label={t("搜索设置")}
        onChange={(e) => onChange(e.target.value)}
      />
      {value !== "" && (
        <button
          type="button"
          className="stg-search-clear"
          aria-label={t("清空搜索")}
          onClick={() => onChange("")}
        >
          ×
        </button>
      )}
    </span>
  );
}

/** 行右侧的只读文本（比如「现在用的是哪套主题」）。**不是可标注控件**。 */
export function Value({ children }: { children: ReactNode }) {
  return <span className="stg-value">{children}</span>;
}

/** 一小段灰字说明，落在**整组下面**（行里那条走 `SettingRow` 的 `description`）。
 *
 * ⚠️ **它自己参与搜索过滤**，这件事不能省。`Note` 里的字不经过 `SettingRow`，
 * 不过滤的话搜索时它一直画着：搜「缩进」会把「图像」页那段「这一页的两半存在
 * 两个文件里」、「导出」页那段「没有 Pandoc」一起带出来——**别的页的注记混进了
 * 结果里**，而用户没法判断它们为什么在这儿。2026-09-24 目检抓到。
 *
 * ⚠️ 与之相对，**组说明**（`SettingsGroup` 的 `description`）**不过滤**：
 * 它跟着自己那一组走，组里还有匹配的行才画得出来，混不了。
 *
 * ⚠️ 位置也有讲究：说**某一组**的注记要放进那一组里（`.stg-group-body > .stg-note`
 * 会跨两栏对齐）；说**整页**的才摆在外面——那时它是整页宽、贴着最左边。
 * 摆错位置的症状是"看着像下一组的标题"。 */
export function Note({ children }: { children: ReactNode }) {
  const query = useQuery();
  if (!hits(query, nodeText(children))) return null;
  return <p className="stg-note">{children}</p>;
}
