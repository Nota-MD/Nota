/**
 * 偏好设置的原语：一行、一组、下拉、开关、滑杆、搜索框、图标。
 *
 * # 为什么单独一个文件
 *
 * 这一套**照着 VMark 的偏好面板抄的版式**（用户 2026-09-23 的要求：
 * 「你将那个偏好列表搞得和 Vmark 一样的布局」）。那边同一层原语铺在
 * `src/pages/settings/{layout,inputs,components}.tsx` 三个文件里，这边
 * 合成一个——我们只有五个分节，拆三个文件是给文件数看的，不是给读的人看的。
 *
 * 版式的三句话：
 *
 * 1. 左栏是**分节清单**（带图标 + 搜索框），右栏是当前分节的内容；
 * 2. 右栏里一**行** = 左边标签（可带一行小字说明）+ 右边控件，控件**靠右定宽**；
 * 3. 若干行归一个**组**，组有标题、组间留白大。
 *
 * # ⚠️ 搜索是"就地过滤"，不是"另建索引"
 *
 * 查询非空时，五个分节**全部叠着渲染**，每一行自己拿标签和说明去比，
 * 比不中的**返回 `null` 不进 DOM**；于是某一组如果一行都没留下，CSS 的
 * `:has()` 把整组也收掉（`settings.css` 里的 `.stg-group:not(:has(.stg-row))`）。
 *
 * 这比"另写一份搜索索引"稳：索引和界面是**两份要同时维护的清单**，
 * 加了控件忘了加索引，症状是"搜得到但点不过去"——不报错的那种。
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
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from "react";

/** 当前搜索词（已 `trim().toLowerCase()`）。空串 = 不过滤。 */
const QueryContext = createContext("");

export const QueryProvider = QueryContext.Provider;

export const useQuery = () => useContext(QueryContext);

/** 这一行/这一组的标签和说明里有没有查询词。空查询一律算中。 */
export function hits(query: string, label: string, description?: string): boolean {
  if (!query) return true;
  return `${label} ${description ?? ""}`.toLowerCase().includes(query);
}

/**
 * 一行「标签 + 控件」。
 *
 * # ⚠️ 标签是不是 `<label>`，判据是**控件能不能被标注**
 *
 * `htmlFor` 指向一个不是表单元素的东西是**悬空引用**——点了没反应，
 * 而且不报错。更糟的一种是它指向一个 `<button>`：点标签文字会**真的触发
 * 那个动作**（「打开主题文件夹」这种一次性按钮上，这是纯粹的惊吓）。
 * 所以只有下面这张表里的才算「可标注」，其余一律退化成 `<span>` +
 * `aria-labelledby`（VMark 那边同一个坑，同一套解法）。 */
const LABELABLE_TAGS = new Set(["input", "select", "textarea"]);

export function SettingRow({
  label,
  description,
  searchText,
  children,
}: {
  label: string;
  /** 标签下面那一行小字。**算进搜索**（搜到的字看得见，才是好搜索）。 */
  description?: ReactNode;
  /** **只算进搜索、不画出来**的字。
   *  给"每行都挂一遍会变成噪音、可它确实是用户会搜的词"用——
   *  快捷键那一节的组名（「文件」）就是这种：组标题已经写着它了。 */
  searchText?: string;
  children: ReactNode;
}) {
  const query = useQuery();
  const id = useId();
  const labelId = `${id}-label`;
  const descId = `${id}-desc`;

  const descText = typeof description === "string" ? description : undefined;
  const childEl = isValidElement(children)
    ? (children as ReactElement<Record<string, unknown>>)
    : null;

  // 我们自己的控件（它们把 id 透到真正的表单元素上）算可标注；DOM 标签按
  // 白名单；其余（`<div>` 包一小组按钮、`<kbd>` 这种展示物）都不算。
  const labelable =
    childEl !== null &&
    (typeof childEl.type !== "string"
      ? childEl.type === Toggle || childEl.type === Select || childEl.type === Range
      : LABELABLE_TAGS.has(childEl.type));

  if (!hits(query, [label, descText, searchText].filter(Boolean).join(" "))) return null;

  const control =
    childEl === null
      ? children
      : cloneElement(childEl, {
          id,
          "aria-labelledby": labelId,
          ...(descText ? { "aria-describedby": descId } : {}),
        });

  return (
    <div className="stg-row">
      <div className="stg-row-text">
        {labelable ? (
          <label id={labelId} className="stg-row-label" htmlFor={id}>
            {label}
          </label>
        ) : (
          <span id={labelId} className="stg-row-label">
            {label}
          </span>
        )}
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

/** 一组行。组标题是**小标题**不是正文标题（VMark 那边也一样）。 */
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="stg-group">
      <h3 className="stg-group-title">{title}</h3>
      {children}
    </section>
  );
}

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

/** 开关。iOS 那种胶囊。检查项一律用它，不用复选框。 */
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

/** 左栏顶上的搜索框。 */
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
  return (
    <span className="stg-search-wrap">
      <input
        type="search"
        className="stg-search"
        value={value}
        placeholder="搜索设置…"
        aria-label="搜索设置"
        onChange={(e) => onChange(e.target.value)}
      />
      {value !== "" && (
        <button
          type="button"
          className="stg-search-clear"
          aria-label="清空搜索"
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

/* ── 图标 ────────────────────────────────────────────────────────────────
 *
 * 手写的四枚细线图标。⚠️ **不引图标库**——为四个图标装一个包、再让它跟着
 * 上游的树摇策略走，换不来什么。路径是 Lucide 那种画法（24 格、描边不填充、
 * `currentColor`）。
 *
 * 尺寸和颜色交给 CSS（`.stg-nav-icon`），所以换「界面风格」时它跟着走。 */
const PATHS = {
  appearance: [
    "M12 3a9 9 0 1 0 0 18h1.6a1.9 1.9 0 0 0 0-3.8h-1.2a2 2 0 0 1 0-4h5.4A3.2 3.2 0 0 0 21 10C21 6.1 17 3 12 3Z",
    "M7.5 9.6h.01",
    "M10.5 6.6h.01",
    "M15 6.9h.01",
  ],
  doc: ["M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z", "M14 3v5h5", "M9 13h6", "M9 17h4"],
  editor: ["M4 6.5V5h16v1.5", "M12 5v14", "M9 19h6"],
  keys: ["M3 7h18v10H3z", "M7 11h.01", "M11 11h.01", "M15 11h.01", "M7.5 14.5h9"],
  // 一个方框里画两竖两横 = 井号（Markdown 的标题标记），别的节都没用这个形状。
  markdown: ["M4 5h16v14H4z", "M9.5 8.5v7", "M14.5 8.5v7", "M7.5 11h9", "M7.5 13h9"],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="stg-nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
