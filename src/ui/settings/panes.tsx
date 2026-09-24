/**
 * 偏好设置的四个分节：外观、文档主题、编辑器、Markdown。
 *
 * # 界面的两条轴在这里，文档主题只在这儿"露个名字"
 *
 * **界面外观**（风格 × 明暗）改的是整个应用；**文档主题**只改编辑区
 * （用户 2026-09-23 划的线，原话「这是文档风格，不是界面风格，不应该影响到UI主题」）。
 * 所以「文档主题」这一节**只显示现在用的是哪套**、以及去哪儿换，
 * 它自己不含选择器——放一个下拉在这儿就会和「主题」菜单变成两个真相源。
 *
 * # 改了立刻生效，没有「确定」
 *
 * 外观必须边看边调。每次改动直接进 `App.tsx` 的 `updateSettings`（先改内存
 * 再写盘），这个框只是个面板，唯一的按钮是「完成」，作用等于关掉。
 *
 * ⚠️ **不要**给它加「取消」。改动既然即时生效，一个「取消」要么是撒谎
 * （撤销不了已经写盘的东西），要么就得再做一套"暂存-回滚"，为一行没有价值
 * 的按钮不值得。
 */

import { useEffect, useState } from "react";

import type { DocThemeInfo, Settings, UiStyle, ViewMode } from "@/bridge/ipc";
import { resolveAppearance } from "@/styles/applyTheme";
import { VIEW_MODE_LABELS, VIEW_MODE_ORDER } from "@/ui/view-modes";
import { Range, SettingRow, SettingsGroup, Select, Toggle, Value } from "./primitives";

/**
 * 界面风格的显示名和一句说明。⚠️ 与 `settings.rs` 的 `UiStyle` **一一对应**，
 * 加值时要同时改：那里、`theme.css`、`applyTheme.ts` 的探测表、`docs/04`。
 *
 * `hint` 不是装饰：「GitHub」和「Adwaita」光看名字猜不出差别，而这里选错了
 * 整个应用都会变样。
 *
 * ⚠️ 写成 `Record<UiStyle, …>` 而不是数组是**故意的**：数组里少写一个风格，
 * 症状是"那个风格在下拉里不存在"——不报错。写成 Record，`UiStyle` 一加值
 * 这里就编译不过，**想漏都漏不掉**（`ui_style` 是联合类型，少一个键不是合法值）。
 */
const STYLES: Record<UiStyle, { label: string; hint: string }> = {
  auto: { label: "跟随系统", hint: "按当前桌面环境自动选一套" },
  adwaita: { label: "Adwaita", hint: "GNOME 原生" },
  ghub: { label: "GitHub", hint: "紧凑、冷灰蓝边框" },
  plasma: { label: "KDE Plasma", hint: "Breeze，方正偏圆" },
  macos: { label: "macOS", hint: "大圆角，层次靠阴影" },
  windows: { label: "Windows", hint: "Windows 11 的小圆角" },
  yaru: { label: "Yaru", hint: "Ubuntu，橙色强调" },
  "yaru-blue": { label: "Yaru 蓝", hint: "Ubuntu 的蓝色强调色档，其余同 Yaru" },
};

/** 上面那张表的显示顺序（Record 的键没有顺序可言，所以另立一条）。 */
const STYLE_ORDER: UiStyle[] = [
  "auto",
  "adwaita",
  "ghub",
  "plasma",
  "macos",
  "windows",
  "yaru",
  "yaru-blue",
];

const AUTOSAVE: Array<{ value: string; label: string }> = [
  { value: "0", label: "关闭" },
  { value: "30", label: "30 秒" },
  { value: "60", label: "1 分钟" },
  { value: "300", label: "5 分钟" },
];

/**
 * 编辑模式那个下拉的选项。
 *
 * ⚠️ 名字**从 `ui/view-modes.ts` 取**，不在这儿另写一份：状态栏里那一格
 * 用的是同一张表（那边取短名，这边取全名）。
 */
const VIEW_MODES: Array<{ value: ViewMode; label: string }> = VIEW_MODE_ORDER.map((value) => ({
  value,
  label: VIEW_MODE_LABELS[value].full,
}));

/**
 * 解析出来的那两条轴（`auto` 已经落成具体值）。
 *
 * ⚠️ 得有 state，不能只在 render 里算一次：`ui_mode = "auto"` 时用户在系统里
 * 切了深浅，应用本身跟着变（`applyTheme` 订阅了 `matchMedia`），**预览也得
 * 跟着变**——否则框开着的时候，缩略图和应用说着两套话。
 */
function useResolvedAppearance(settings: Settings) {
  const [appearance, setAppearance] = useState(() => resolveAppearance(settings));

  useEffect(() => {
    const paint = () => setAppearance(resolveAppearance(settings));
    paint();

    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq || settings.ui_mode !== "auto") return;
    mq.addEventListener("change", paint);
    return () => mq.removeEventListener("change", paint);
  }, [settings]);

  return appearance;
}

/**
 * 一张「明暗」缩略图：**一页缩小版的界面**——底色、字色、一道强调色横杠。
 *
 * ⚠️ 颜色**不是画上去的**：这一层自带 `data-ui-style` / `data-ui-mode`
 * 两个属性，`theme.css` 里那两段是裸属性选择器，于是它取到的是**真正的
 * 那套 token**（连该风格的识别色都对）。写死两个色值的话，换风格时缩略图
 * 就成了唯一没跟着变的地方——而那正是用户拿来做判断的东西。
 */
function ModeSwatch({
  mode,
  label,
  style,
  active,
  onPick,
}: {
  mode: "light" | "dark";
  label: string;
  style: string;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className="stg-swatch"
      data-active={active}
      aria-pressed={active}
      aria-label={label}
      onClick={onPick}
    >
      <span className="stg-swatch-page" data-ui-style={style} data-ui-mode={mode}>
        <span className="stg-swatch-ink">Aa</span>
        <span className="stg-swatch-rule" />
      </span>
      <span className="stg-swatch-name">{label}</span>
    </button>
  );
}

/** 外观：界面那两条轴。**文档主题不在这一节。** */
export function AppearancePane({ settings, onChange }: PaneProps) {
  const { style } = useResolvedAppearance(settings);
  const current = STYLES[settings.ui_style];
  const auto = settings.ui_mode === "auto";

  return (
    <>
      <SettingsGroup title="主题">
        <SettingRow
          label="界面风格"
          description={`当前 ${current.label}：${current.hint}。整个应用的样子都跟着它走。`}
        >
          <Select
            value={settings.ui_style}
            options={STYLE_ORDER.map((value) => ({ value, label: STYLES[value].label }))}
            onChange={(ui_style) => onChange({ ui_style })}
          />
        </SettingRow>

        <SettingRow label="明暗" description="点一张缩略图切过去，改动立刻生效。">
          <div className="stg-swatches">
            <ModeSwatch
              mode="light"
              label="浅色"
              style={style}
              active={!auto && settings.ui_mode === "light"}
              onPick={() => onChange({ ui_mode: "light" })}
            />
            <ModeSwatch
              mode="dark"
              label="深色"
              style={style}
              active={!auto && settings.ui_mode === "dark"}
              onPick={() => onChange({ ui_mode: "dark" })}
            />
          </div>
        </SettingRow>

        <SettingRow label="跟随系统偏好" description="勾上之后，上面那两格跟着系统的深浅走。">
          <Toggle
            checked={auto}
            onChange={(on) => onChange({ ui_mode: on ? "auto" : "light" })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="界面">
        <SettingRow label="界面字号" description="只管外壳（菜单、侧栏、对话框），正文的字号归文档主题。">
          <Range
            value={settings.ui_font_size}
            min={12}
            max={20}
            suffix="px"
            onChange={(ui_font_size) => onChange({ ui_font_size })}
          />
        </SettingRow>
      </SettingsGroup>
    </>
  );
}

/** 文档主题：**只读**。换主题去「主题」菜单。 */
export function DocThemePane({ settings, docThemes, onOpenThemesDir }: PaneProps) {
  const current = docThemes.find((t) => t.id === settings.document_theme);
  const name = settings.document_theme ? (current?.name ?? settings.document_theme) : "无主题（内置）";

  return (
    <SettingsGroup title="文档主题">
      <SettingRow label="当前主题" description="只作用在编辑区，不影响外壳的样子。">
        <Value>{name}</Value>
      </SettingRow>

      <SettingRow
        label="主题文件夹"
        description="自己放一份 .css 进去就能用；和内置的重名会盖掉内置那份。"
      >
        {/* ⚠️ 这一行故意**没有** `htmlFor`：`<button>` 不是可标注控件，
            点标签文字触发一次「打开文件夹」是纯粹的惊吓（见 `primitives.tsx`）。 */}
        <button type="button" className="btn" onClick={onOpenThemesDir}>
          打开…
        </button>
      </SettingRow>

      <p className="stg-note">
        换主题在「主题」菜单里——那边是唯一的入口，这里只是让你知道现在是哪套。
      </p>
    </SettingsGroup>
  );
}

/** 编辑器。 */
export function EditorPane({ settings, onChange }: PaneProps) {
  return (
    <SettingsGroup title="编辑器">
      <SettingRow label="编辑模式" description="和「视图」菜单里那三条是同一个开关，改哪边都一样。">
        <Select
          value={settings.view_mode}
          options={VIEW_MODES}
          onChange={(view_mode) => onChange({ view_mode })}
        />
      </SettingRow>

      <SettingRow label="正文宽度" description="编辑区正文那一栏的最大宽度，太宽了读起来会串行。">
        <Range
          value={settings.content_width}
          min={480}
          max={1200}
          step={20}
          suffix="px"
          onChange={(content_width) => onChange({ content_width })}
        />
      </SettingRow>

      <SettingRow label="自动保存" description="停笔这么久之后自动写盘。没存过的文档不在此列。">
        <Select
          value={String(settings.autosave_seconds)}
          options={AUTOSAVE}
          onChange={(v) => onChange({ autosave_seconds: Number(v) })}
        />
      </SettingRow>

      <SettingRow
        label="关闭前先问我"
        description="有未保存改动时关窗口先确认。关掉则直接丢改动，请谨慎。"
      >
        <Toggle
          checked={settings.confirm_unsaved}
          onChange={(confirm_unsaved) => onChange({ confirm_unsaved })}
        />
      </SettingRow>

      {/* ⚠️ 这一段是**如实告知**，2026-09-24 补的。在这之前上面那个下拉
          看着像已经能用，实际上全仓没有一处读 `autosave_seconds`——除了
          `settings.rs` 的字段与这里的下拉本身（`docs/07` 第 20 项记着
          "后端没接"）。一个拨了不生效的开关比没有这个开关更糟：用户会以为
          自己已经安全了，直到丢过一次东西。
          接线（把定时器接上 `api.doc.save`）做完之后**删掉这一段**。 */}
      <p className="stg-note">
        ⚠️「自动保存」这一项**目前还没接上**：值会存进设置里，但停笔之后不会
        真的写盘。在接好之前请照常用 Ctrl+S。
      </p>
    </SettingsGroup>
  );
}

/**
 * Markdown：**正文语法**的口径。两组：「标题」与「数学公式」。
 *
 * ⚠️ 这一节**不是外观轴**——它改的是"正文怎么解析、怎么渲染"，所以放不进
 * 「编辑器」那一节里（那边管的是摆几个窗格、多宽、多久存一次盘）。
 * 对标 Typora 的「偏好设置 → Markdown」那一页（见 `docs/10` §11.3），
 * 但那页的其余几组（语法扩展开关、代码块、空格与换行）我们**还没做**，
 * 缺哪几条逐条列在 `docs/10` §12。
 */
export function MarkdownPane({ settings, onChange }: PaneProps) {
  return (
    <>
      <SettingsGroup title="标题">
        <SettingRow
          label="严格模式"
          description="开了之后，标题的井号后面必须有空格：# 标题 才算标题。默认关。关着时 #标题 也算标题——正文里按标题的样子排版，大纲和标签页也认它，但不会动那几个字：文件里原来写的是 #标题，存下去还是 #标题。改了立刻重新解析当前文档，不用重启。"
        >
          <Toggle
            checked={settings.strict_markdown}
            onChange={(strict_markdown) => onChange({ strict_markdown })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="数学公式">
        <SettingRow
          label="physics 宏包"
          description="开启后可用 \\qty、\\dv、\\braket、\\comm 这类 physics 宏包的写法。⚠️ 它会重定义 \\div、\\Re、\\Im 三个原本就有的命令——这正是 physics 本身的行为，所以默认不开。"
        >
          <Toggle
            checked={settings.enable_physics}
            onChange={(enable_physics) => onChange({ enable_physics })}
          />
        </SettingRow>

        <p className="stg-note">
          这套命令是 Nota 自己写的宏定义——数学渲染用的是 KaTeX，而它官方没有
          physics。改完立刻重排当前文档，不用重启。
        </p>
      </SettingsGroup>
    </>
  );
}

/** 四个分节共用的入参。 */
export interface PaneProps {
  settings: Settings;
  /** 改一项。**即时生效**，见文件头。 */
  onChange: (patch: Partial<Settings>) => void;
  /** 只读：用来在「文档主题」那一行显示当前是哪套。 */
  docThemes: DocThemeInfo[];
  onOpenThemesDir: () => void;
}
