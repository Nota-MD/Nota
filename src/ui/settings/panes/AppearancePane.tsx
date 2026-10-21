/**
 * 「外观」那一页。组依次是：界面风格 / 明暗 / 跟随系统偏好 / 字体大小 /
 * 缩放 / 显示状态栏 / 字数统计 / 格式化工具栏 / 深色模式。
 *
 * ⚠️⚠️ **这一页有一半的东西不在这张表里，在顶层**：
 *
 * - `ui_style`（界面风格）、`ui_mode`（明暗）—— 顶层，对应「界面风格」「明暗」两组
 * - `ui_font_size`（界面字号）—— 顶层，对应「字体大小」那一组
 *
 * 它们是 2026-09-22 / 09-23 定下来的**三条互相独立的外观轴**。搬进
 * `[appearance]` 表会让**老设置文件里的值静默丢回默认**——用户选好的 macOS
 * 深色，升级之后变回跟随系统，而他的配置文件一个字都没动。
 *
 * 所以这一页的**界面**是完整的，但它读写的是两个地方：老的三条走顶层，
 * `[appearance]` 那几条走表。界面不关心这件事，看代码的人得知道。
 *
 * ⚠️ **文档主题不在这儿**，它有自己的那一页。2026-09-23 划的线：
 * 「这是文档风格，不是界面风格，不应该影响到 UI 主题」。
 */

import type { AppearanceSettings, BuiltinUiStyle, UiStyleInfo } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { accentVars, parseAccent } from "@/styles/accent";
import { resolveStyle } from "@/styles/applyTheme";
import { useUiMode } from "@/ui/useUiMode";
import { ActionButton, NumberInput, Radio, Range, Select, SettingRow, SettingsGroup, Toggle } from "../primitives";
import { paneWriter, type PaneProps } from "./props";

/**
 * **内置**那几档的显示顺序（`Record` 的键没有顺序可言，所以另立一条）。
 *
 * ⚠️ 这张表是**三份抄本之一**（另两份：`theme/shape.css` 里的
 * `[data-ui-style="…"]` 段、`src-tauri/src/ui_styles.rs` 的 `BUILTIN_IDS`）。
 * `tools/doc-sync-check.sh` 的 ⑦ 查三者一致——改一处就要改三处。
 *
 * ⚠️ 它同时是**兜底清单**：后端那份 `nota_ui_styles` 还没回来（或拉失败）时，
 * 下拉里就按这个顺序摆内置那几档——用户导入的那些这时**看不见**，
 * 但选中的那档照旧生效（`data-ui-style` 由 `applyTheme` 写，与本页无关）。
 */
const STYLE_ORDER: BuiltinUiStyle[] = [
  "adwaita",
];

/**
 * 解析出来的那两条轴（`auto` 已经落成具体值）。
 *
 * ⚠️ 「明暗」那一半**必须有订阅**，不能只在 render 里算一次：`ui_mode = "auto"`
 * 时用户在系统里切了深浅，应用本身跟着变（`applyTheme` 订阅了 `matchMedia`），
 * **预览也得跟着变**——否则面板打开期间，缩略图与应用呈现的状态会不一致。
 *
 * ⚠️ 2026-09-25 之前这份订阅是**本文件私有的**（一个 `useResolvedAppearance`），
 * 而 `useDocTheme` 那边为了同一件事又写了一份：同一个 `matchMedia` 查询被问了
 * 两遍。现在两边都走 `ui/useUiMode.ts`（那边也是"文档主题该取深色那一套还是
 * 浅色那一套"的判据来源），「界面风格」那一半是纯函数，不需要 state。
 */
function useResolvedAppearance(settings: PaneProps["settings"]) {
  const mode = useUiMode(settings.ui_mode);
  return { style: resolveStyle(settings.ui_style), mode };
}

/**
 * 一张「明暗」缩略图：**界面的缩小版**——底色、字色、一道强调色横杠。
 *
 * ⚠️ 颜色**不是写死的**：这一层自带 `data-ui-style` / `data-ui-mode`
 * 两个属性，`theme.css` 里那两段是裸属性选择器，于是它取到的是**真正的
 * 那套 token**（连该风格的识别色都对）。写死两个色值的话，换风格时缩略图
 * 就成了唯一没跟着变的地方——而那正是用户拿来做判断的东西。
 */
function ModeSwatch({
  mode,
  label,
  style,
  accent,
  active,
  onPick,
}: {
  mode: "light" | "dark";
  label: string;
  style: string;
  /** 设置里那一格（原样传进来，**不预先解析**）——空串 = 跟随风格。 */
  accent: string;
  active: boolean;
  onPick: () => void;
}) {
  // ⚠️ **必须显式再写一遍**，不能指望它从 `<html>` 继承下来：缩略图自己带
  // `data-ui-mode`，而 `theme/color.css` 里 `[data-ui-mode="light"]` 那一段
  // **又声明了一次 `--accent`**——于是继承被截断，缩略图上那道横杠永远是
  // 风格自带的色，用户换了主题色这里却不变。而那正是他拿来做判断的地方。
  const 强调 = accentVars(accent);
  return (
    <button
      type="button"
      className="stg-swatch"
      data-active={active}
      aria-pressed={active}
      aria-label={label}
      onClick={onPick}
    >
      <span className="stg-swatch-page" data-ui-style={style} data-ui-mode={mode} style={强调 ?? undefined}>
        <span className="stg-swatch-ink">Aa</span>
        <span className="stg-swatch-rule" />
      </span>
      <span className="stg-swatch-name">{label}</span>
    </button>
  );
}

/**
 * 此刻**真正生效**的那个强调色（`#rrggbb`）。给「主题色」那一格的颜色选择器当值。
 *
 * 两条判据，顺序有讲究：
 *
 * 1. **用户设了** → 就是它；
 * 2. **跟随风格** → **现读 `<html>` 上的 `--accent` 计算值**。
 *
 * ⚠️ 判据 2 **不能在 TS 里抄一份颜色表**：那 16 个值在 `theme/color.css` 里，
 * 抄过来就有两份抄本，改了 CSS 而忘了 TS 的症状是"颜色选择器显示的颜色和
 * 应用里真正在用的不一样"——**一个不会报错、只会让人不信这个界面的错**。
 * 同一件事的先例见 `ModeSwatch` 上面那段（缩略图也是现取 token）。
 *
 * ⚠️ 在 render 里读 `getComputedStyle` 是**纯读**、不改 DOM，所以不违反
 * 渲染函数该是纯的这条；而且这个值只在设置变化时变，而那时候本组件必然重画。
 * 打开这个面板时 `applyTheme` 早就画完了（它是启动时跑的）。
 *
 * ⚠️ 两条都不成立时（认不出来的 id 风格／那份 CSS 里根本没写 `--accent`）返回
 * 空串，调用方自己挑一个兜底值——**不要在这里编一个颜色**。
 */
function 有效强调色(a: AppearanceSettings): string {
  const 设了 = parseAccent(a.accent);
  if (设了) return 设了;
  const 读到的 = getComputedStyle(document.documentElement).getPropertyValue("--accent");
  return parseAccent(读到的) ?? "";
}

export function AppearancePane({
  settings,
  onChange,
  uiStyles,
  onOpenStylesDir,
  // ⚠️ 这两样是**文档主题**那一组的（本页最底下「深色下用哪套」）——
  // 它们和上面的 `uiStyles` / `onOpenStylesDir` 是两个不同的东西：
  // 一个是正文的主题、一个是外壳的风格。两个目录也是分开的（`paths.rs`）。
  docThemes,
  onOpenThemesDir,
}: PaneProps) {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();

  // ⚠️ 下面这几张表**在组件里现建**，不能留在模块级：模块级求值时语言还没定，
  // 而且之后**没有任何东西会通知它重画**（同上）；`tools/i18n-check.sh` 数的
  // 是源码里**字面写出来**的 `t("…")`，表留在模块级这些键就不算被调用。
  // 同一件事的先例见 `PluginDock.tsx::能力名` 那张表。
  /**
   * 界面风格的显示名和一句说明。⚠️ 与 `settings/mod.rs` 的 `UiStyle` **一一对应**，
   * 加值时要同时改：那里、`theme.css`、`applyTheme.ts` 的探测表、`docs/04`。
   *
   * `hint` 不是装饰：仅看「GitHub」和「Adwaita」这两个名字无法分辨差别，而这里
   * 选错了整个应用都会变样。
   *
   * ⚠️ 写成 `Record<UiStyle, …>` 而不是数组是**故意的**：数组里少写一个风格，
   * 症状是"那个风格在下拉里不存在"——不报错。写成 Record，`UiStyle` 一加值
   * 这里就编译不过，**想漏都漏不掉**。
   */
  /**
   * 每一档的显示名与一句话说明。
   *
   * ⚠️ **`label` 与序列化到磁盘的那个值（键名）是两回事。**
   * `plasma` 这一格的键名叫 `plasma`（用户设置文件里存的是它），
   * 但**显示名是 `Breeze`**——用户 2026-09-26 点着名要的（「Kde的那个名字
   * 改成breeze」）。**没有把键名一起改掉**：改了之后，已经存过
   * `ui_style = "plasma"` 的设置会反序列化失败、当场掉回默认风格——
   * 用户会看到"我什么都没动，样式自己变了"。`ghub` 显示成 `GitHub` 是同一个
   * 先例（键名从来就不是显示名）。
   *
   * ⚠️ **只写品牌名的不套 `t()`**（Adwaita / GitHub / Breeze / macOS /
   * Windows 11 / Windows 10 / Yaru）：专有名词没有译文，套了只会在中文表里
   * 躺一条"A → A"的死键。带解释的那半句一律要 `t()`。
   */
  const STYLES: Record<BuiltinUiStyle, { label: string; hint: string }> = {
    adwaita: { label: "Adwaita", hint: t("GNOME native — flat, depth from shadows") },
  };

  const 写 = paneWriter(settings, onChange, "appearance");
  const { style, mode: 当前明暗 } = useResolvedAppearance(settings);
  const auto = settings.ui_mode === "auto";
  const a = settings.appearance;

  /**
   * 设置里那一格**非空但认不出来**（用户手改 `settings.toml` 敲错了）。
   *
   * ⚠️ 判据是"非空 **且** 解析不出来"，不是单看解析结果：空串是**正常值**
   * （= 跟随风格），把它也算成"认不出"会让默认状态下就挂着一句警告。
   */
  const 认不出 = a.accent !== "" && parseAccent(a.accent) === null;

  /**
   * 一档风格在界面上的名字。三条判据，顺序有讲究：
   *
   * 1. **内置档** → 用 `STYLES` 里的名字（中文 / 品牌名）；
   * 2. **被覆盖的内置档**（用户放了个同名 `.css`，`builtin: false` 但 id 在
   *    `STYLES` 里）→ **仍然用那个名字，另加一个标记**。⚠️ 一定不能只显示
   *    id：那样"Adwaita"会变成"adwaita"，用户会以为多出来一档新风格，
   *    而实际上他改的是内置那套。"我放的文件到底生效没有"是放完文件之后
   *    第一个会问的问题，标记就是回答它用的；
   * 3. 其余（用户新加的）→ **id 本身当名字**。没有更好的选择：显示名写在
   *    用户的文件里，而我们**不解析 CSS**（`styles/ui-style.ts` 顶上写了
   *    为什么不做解析）——想在界面上看到中文名，就得先在写文件的那一刻
   *    接受"文件名就是它在界面上的名字"。
   *
   * ⚠️ 与 `STYLES` 一样**在组件里现建**，理由同上面那段（`t()` 要能订阅语言）。
   */
  const 档名 = (s: UiStyleInfo) => {
    const 内置 = STYLES[s.id as BuiltinUiStyle];
    if (!内置) return s.id;
    return s.builtin ? 内置.label : `${内置.label} · ${t("overridden")}`;
  };

  /**
   * 下拉里摆什么。
   *
   * ⚠️ **以宿主那份清单为准，拉不到才用 `STYLE_ORDER` 兜底**：清单里多出来的
   * 就是用户导入的风格（`builtin: false`），它们**只能从后端知道**。
   */
  const 清单: { value: string; label: string }[] =
    uiStyles.length > 0
      ? uiStyles.map((s) => ({ value: s.id, label: 档名(s) }))
      : STYLE_ORDER.map((v) => ({ value: v, label: STYLES[v].label }));

  /**
   * ⚠️ **设置里记着一个清单里没有的 id**（用户删了那份 `.css`、或者手改
   * `settings.toml` 拼错了）时，把它**补进选项里**而不是让下拉空着。
   *
   * `Select` 拿到一个选项表里没有的 value 会显示空白——那比显示一个
   * 报错的名字更坏：用户会以为"当前没有选中任何风格"。补一条写着 id 的选项，
   * 至少说清了"生效的是这个东西、而它找不到"。
   *
   * ⚠️ 只在**清单已经拉到**时才补：还没拉到时所有导入档都不在选项里，
   * 那时补一条等于每次启动都闪一下"找不到"。
   */
  const 选项 = [...清单];
  if (uiStyles.length > 0 && !选项.some((o) => o.value === settings.ui_style)) {
    选项.push({ value: settings.ui_style, label: t("(“{0}” not found)", settings.ui_style) });
  }

  const current = STYLES[settings.ui_style as BuiltinUiStyle];

  return (
    <>
      <SettingsGroup
        title={t("Interface style")}
        help={
          // ⚠️ 导入档没有 `hint`（那句话是我们给内置档写的），所以这里分两种说法：
          // 内置档报"当前 X：一句话"，导入档报"当前用的是你自己导入的 X"。
          // 硬拼成一句会在导入档上露出 `undefined`。
          current
            ? t("Current {0}: {1}. The appearance of the whole interface follows.", current.label, current.hint)
            : t("Currently using “{0}”, the style you imported. The whole interface follows it.", settings.ui_style)
        }
      >
        {/* ⚠️ 这两格是**入口**，不是设置项：加一档风格的办法就是往那个目录里丢一个
            `<名字>.css`（用户 2026-09-26：「本来主题应该就是拆成多个文件的。
            加一个就是允许用户导入」）。没有这个按钮，那条路只存在于文档里——
            而"要读文档才发现"的入口等于没有。同「文档主题」那页的「主题文件夹…」。 */}
        <SettingRow>
          <div className="stg-inline">
            <Select value={settings.ui_style} options={选项} onChange={(ui_style) => onChange({ ui_style })} />
            <ActionButton onClick={onOpenStylesDir} title={t("Open the styles folder. Drop a <name>.css in it to add a style.")}>
              {t("Styles folder…")}
            </ActionButton>
          </div>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Light/Dark")}>
        <SettingRow>
          <div className="stg-swatches">
            <ModeSwatch
              mode="light"
              label={t("Light")}
              style={style}
              accent={a.accent}
              active={!auto && settings.ui_mode === "light"}
              onPick={() => onChange({ ui_mode: "light" })}
            />
            <ModeSwatch
              mode="dark"
              label={t("Dark")}
              style={style}
              accent={a.accent}
              active={!auto && settings.ui_mode === "dark"}
              onPick={() => onChange({ ui_mode: "dark" })}
            />
          </div>
        </SettingRow>
      </SettingsGroup>

      {/* ⚠️ 「主题色」放在「明暗」后面、「字体大小」前面：它和上面两条**同属
          "整个外壳长什么样"**，而下面那几组是排版与功能开关。用户 2026-09-26
          把它说成一条独立的轴（「这个主题只包含一个 UI 的设计样式……而不包含
          主题颜色」），摆在这儿才对得上那句话。 */}
      <SettingsGroup title={t("Accent color")}>
        <SettingRow>
          <div className="stg-inline">
            {/* ⚠️ 用原生 `<input type="color">`，**不自己写一个取色器**：系统取色器
                能吸屏幕上的颜色、能存色板、能在装了无障碍工具时被念出来，
                自己画一个这三样白送。这里的类名只负责尺寸与边框。 */}
            <input
              type="color"
              className="stg-color"
              aria-label={t("Accent color")}
              // ⚠️ `type="color"` **只认 `#rrggbb`**，给空串它自己会退回黑色——
              // 那会让"跟随风格"看起来像"用户选了黑"，所以这里退到此刻真正在用的
              // 那个色（`有效强调色`），让色块**始终显示当前生效的颜色**。
              value={有效强调色(a) || "#000000"}
              onChange={(e) => 写({ accent: e.target.value })}
            />
            <ActionButton
              onClick={() => 写({ accent: "" })}
              disabled={a.accent === ""}
              title={t("Go back to the accent that the current style ships with.")}
            >
              {t("Follow the style")}
            </ActionButton>
            {/* ⚠️⚠️ 这句话**必须画在控件旁边**，不能塞进 `help`（那颗 `?` 的
                悬停提示）。
                2026-09-26 目检当场抓到过：塞进 `help` 的那一版**开窗根本看不见**
                ——整页的 `help` 都是 tooltip，而"我手改 settings.toml 敲了个
                `red`、颜色一点没变"正是最需要**不用悬停**就看到的一句。
                与「界面风格」下拉里那条「（找不到「…」）」同一个套路：说出
                "生效的是这个东西、而它没被认出来"，而不是让用户对着一个
                看起来正常的色块猜。 */}
            {认不出 && (
              <span className="stg-warn">{t("(Unrecognized: {0} — falling back to following the style)", a.accent)}</span>
            )}
          </div>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Follow the system preference")}>
        <SettingRow>
          {/* ⚠️ 取消勾选时落到**此刻正在看的这一套**（`当前明暗`），不是写死的
              浅色（2026-09-25 改，用户体验评估抓出来的）。原来写的是 `"light"`：
              用户先选了深色、再来取消"跟随系统"，界面会当场变浅——一个纯取消
              勾选的动作把另一个选择抹掉了，而且没有任何提示。 */}
          <Toggle checked={auto} onChange={(on) => onChange({ ui_mode: on ? "auto" : 当前明暗 })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Font size")}>
        <SettingRow>
          <Radio
            value={a.custom_font_size ? "custom" : "auto"}
            options={[
              { value: "auto", label: t("Automatic (Recommended)") },
              { value: "custom", label: t("Custom") },
            ]}
            onChange={(v) => 写({ custom_font_size: v === "custom" })}
          />
        </SettingRow>

        <SettingRow label={t("Interface font size")}>
          <Range
            value={settings.ui_font_size}
            min={12}
            max={20}
            suffix="px"
            disabled={!a.custom_font_size}
            onChange={(ui_font_size) => onChange({ ui_font_size })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Zoom")}>
        <SettingRow>
          <NumberInput
            value={a.zoom}
            min={50}
            max={300}
            step={10}
            suffix="%"
            onChange={(zoom) => 写({ zoom })}
          />
        </SettingRow>

        <SettingRow label={t("Use the scroll wheel while holding Ctrl")}>
          <Toggle
            checked={a.ctrl_wheel_zoom}
            onChange={(ctrl_wheel_zoom) => 写({ ctrl_wheel_zoom })}
          />
        </SettingRow>

        <SettingRow label={t("What the wheel changes")}>
          <Radio
            value={a.ctrl_wheel_target}
            options={[
              { value: "font_size", label: t("Font size") },
              { value: "zoom", label: t("Interface zoom") },
            ]}
            onChange={(ctrl_wheel_target) => 写({ ctrl_wheel_target })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Show menu bar")}>
        <SettingRow>
          <Toggle
            checked={a.show_menu_bar}
            onChange={(show_menu_bar) => 写({ show_menu_bar })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Show status bar")}>
        <SettingRow>
          <Toggle
            checked={a.show_status_bar}
            onChange={(show_status_bar) => 写({ show_status_bar })}
          />
        </SettingRow>
      </SettingsGroup>

      {/* 「窗口」那一组（2026-10-04，第 45 项，照 VMark 的窗口版加的）。
          ⚠️ 这一格**只影响原生窗口标题**（`ui/useWindowTitle.ts`）——标签栏上
          那几条页签、状态栏里那份路径都不动；那句 help 就是干这个的。 */}
      <SettingsGroup title={t("Window")}>
        <SettingRow label={t("Show the file name in the title bar")}>
          <Toggle
            checked={a.show_filename_in_titlebar}
            onChange={(show_filename_in_titlebar) => 写({ show_filename_in_titlebar })}
          />
        </SettingRow>
      </SettingsGroup>

      {/* 「专注模式」那一组。⚠️ 只管**压暗强度**——"把外壳收起来"是另一条
          （`F8` 那条写作模式，见 `editor/writing-modes.ts` 的文件头）：
          收不收外壳与"别处的字压多暗"互不影响，别在这一组的说明里混着讲。 */}
      <SettingsGroup title={t("Focus Mode")}>
        <SettingRow label={t("Dimming strength")}>
          <Radio
            value={a.focus_mode_dim}
            options={[
              { value: "standard", label: t("Standard") },
              { value: "strong", label: t("Strong") },
              { value: "stronger", label: t("Stronger") },
            ]}
            onChange={(focus_mode_dim) => 写({ focus_mode_dim })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Word count")}>
        <SettingRow label={t("Reading speed")}>
          <NumberInput
            value={a.reading_speed}
            min={100}
            max={1000}
            step={1}
            onChange={(reading_speed) => 写({ reading_speed })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Formatting Toolbar")}>
        <SettingRow>
          {/* ⚠️ 三档用 `Radio`，**不用 `Toggle`**（2026-09-25 从布尔改成三档）：
              中间那档（悬停显示）的两种状态属于同一个设置值，一个勾表达不了。
              这一页里「字体大小」那组是同一个写法（自动 / 自定义）。 */}
          <Radio
            value={a.toolbar}
            options={[
              { value: "always", label: t("Always Show") },
              { value: "hover", label: t("Show on Hover") },
              { value: "never", label: t("Never Show") },
            ]}
            onChange={(toolbar) => 写({ toolbar })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Dark mode")}>
        <SettingRow label={t("Use a separate set of document themes")}>
          <Toggle
            checked={a.dark_theme_separate}
            onChange={(dark_theme_separate) => 写({ dark_theme_separate })}
          />
        </SettingRow>

        <SettingRow label={t("Which set to use in dark mode")}>
          <div className="stg-inline">
            <Select
              value={a.dark_document_theme}
              options={[
                { value: "", label: t("Follow the light theme") },
                // ⚠️ 回调参数**不能叫 `t`**：那是上面 `useT()` 的译文函数。
                ...docThemes.map((主题) => ({ value: 主题.id, label: 主题.name })),
              ]}
              disabled={!a.dark_theme_separate}
              onChange={(dark_document_theme) => 写({ dark_document_theme })}
            />
            <ActionButton onClick={onOpenThemesDir} title={t("Open the themes folder. Put a .css file in it and it becomes selectable.")}>
              {t("Themes folder…")}
            </ActionButton>
          </div>
        </SettingRow>

        {/* ⚠️ 第 43 项（2026-10-04）：「要改内置主题」这条路机制上是通的
            （同名覆盖，`src-tauri/src/themes.rs` 文件头），但界面上一个字
            都没提，用户多半以为内置的三套动不了。这一段只**说明**、不**代办**
            ——不做成"点一下就悄悄写文件"，那是替用户做主。 */}
      </SettingsGroup>
    </>
  );
}
