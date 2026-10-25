/**
 * 「Markdown」那一页：十一页中组数最多的一页，共七组。
 *
 * 分组与顺序：
 *
 * ```text
 * Markdown 语法偏好  ← 严格模式 / 标题样式 / 无序列表 / 有序列表
 * Markdown 扩展语法  ← 自动识别链接 / 内联公式 / 下标 / 上标 / 高亮 / 警报框 / 图表
 * 智能标点          ← 模式 / 引号 / 破折号 / Unicode 标点
 * 代码块            ← 行号 / 自动换行 / Shift+Tab / 缩进 / 默认语言 / 自动加语言
 * 公式              ← 行内公式(与上面同一个) / 定界符 / 代码块公式 / physics / 兼容 / 编号 / 输出
 * 空格与换行         ← 首行缩进 / 显示 <br/> / 编辑时 / 导出与打印
 * ```
 *
 * ⚠️ 两项读写**顶层字段**（`strict_markdown`、`enable_physics`），不在
 * `[markdown]` 表内：二者自 2026-09-22 / 09-24 起就在顶层，移入表内会使旧设置
 * 文件中的值静默恢复默认。界面不体现这一区别，改这块代码的人需要知道。
 *
 * ⚠️ 「内联公式」出现在两处（扩展语法组与公式组），是版式安排而非两个设置，
 * 两者操作同一个 `inline_math`。
 */

import type {
  AutoLanguage,
  BulletMark,
  DashStyle,
  EquationNumbering,
  HeadingStyle,
  MathOutput,
  OrderedMark,
  QuoteStyle,
  SmartPunctuation,
  WhitespaceMode,
} from "@/bridge/ipc";
import { useT } from "@/i18n";
import {
  NumberInput,
  Select,
  SettingRow,
  SettingsGroup,
  TextInput,
  Toggle,
} from "../primitives";
import { paneWriter, type PaneProps } from "./props";

export function MarkdownPane({ settings, onChange }: PaneProps) {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();

  // ⚠️ 下面这几张表**在组件里现建**，不能留在模块级：模块级求值时语言还没定，
  // 而且之后**没有任何东西会通知它重画**（同上）；`tools/i18n-check.sh` 数的
  // 是源码里**字面写出来**的 `t("…")`，表留在模块级这些键就不算被调用。
  // 同一件事的先例见 `PluginDock.tsx::能力名` 那张表。
  const HEADING: Array<{ value: HeadingStyle; label: string }> = [
    { value: "atx", label: t("ATX (## Heading)") },
    { value: "setext", label: t("Setext (heading + ===/---)") },
  ];

  const BULLET: Array<{ value: BulletMark; label: string }> = [
    { value: "dash", label: t("- Hyphen") },
    { value: "star", label: t("* Asterisk") },
    { value: "plus", label: t("+ Plus") },
  ];

  const ORDERED: Array<{ value: OrderedMark; label: string }> = [
    { value: "dot", label: "1. 2. 3." },
    { value: "paren", label: "1) 2) 3)" },
  ];

  const SMART: Array<{ value: SmartPunctuation; label: string }> = [
    { value: "off", label: t("Close") },
    { value: "render", label: t("Convert for display only (file unchanged)") },
    { value: "input", label: t("Convert as you type") },
  ];

  const QUOTE: Array<{ value: QuoteStyle; label: string }> = [
    { value: "curly", label: t("Curly “ ” ‘ ’") },
    { value: "straight", label: t("Straight \" '") },
  ];

  const DASH: Array<{ value: DashStyle; label: string }> = [
    { value: "en-em", label: t("-- → –, --- → —") },
    { value: "em", label: t("-- and --- both → —") },
  ];

  const AUTO_LANG: Array<{ value: AutoLanguage; label: string }> = [
    { value: "on-markdown-insert", label: t("When a ```language code block is inserted") },
    { value: "never", label: t("Never") },
  ];

  const EQUATION: Array<{ value: EquationNumbering; label: string }> = [
    { value: "none", label: t("Off") },
    { value: "ams", label: t("AMS style (equation environments only)") },
  ];

  const MATH_OUT: Array<{ value: MathOutput; label: string }> = [
    { value: "svg", label: "SVG" },
    { value: "mathml", label: "MathML" },
  ];

  const WS: Array<{ value: WhitespaceMode; label: string }> = [
    { value: "preserve", label: t("Preserve consecutive spaces and single line breaks") },
    { value: "preserve-all", label: t("Preserve all spaces and line breaks") },
    { value: "as-html", label: t("Treat as HTML (collapse to a single space)") },
  ];

  const write = paneWriter(settings, onChange, "markdown");
  const m = settings.markdown;
  const smartAblePunctuationCloseActive = m.smart_punctuation === "off";

  return (
    <>
      <SettingsGroup title={t("Markdown syntax preferences")}>
        <SettingRow label={t("Strict mode")}>
          <Toggle
            checked={settings.strict_markdown}
            onChange={(strict_markdown) => onChange({ strict_markdown })}
          />
        </SettingRow>

        <SettingRow label={t("Heading style")}>
          <Select
            value={m.heading_style}
            options={HEADING}
            onChange={(heading_style) => write({ heading_style })}
          />
        </SettingRow>

        <SettingRow label={t("Bullet list marker")}>
          <Select
            value={m.bullet_mark}
            options={BULLET}
            onChange={(bullet_mark) => write({ bullet_mark })}
          />
        </SettingRow>

        <SettingRow label={t("Ordered list marker")}>
          <Select
            value={m.ordered_mark}
            options={ORDERED}
            onChange={(ordered_mark) => write({ ordered_mark })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Markdown extensions")}>
        <SettingRow label={t("Autodetect links")}>
          <Toggle checked={m.autolink} onChange={(autolink) => write({ autolink })} />
        </SettingRow>

        <SettingRow label={t("Inline math")}>
          <Toggle checked={m.inline_math} onChange={(inline_math) => write({ inline_math })} />
        </SettingRow>

        <SettingRow label={t("Subscript")}>
          <Toggle checked={m.subscript} onChange={(subscript) => write({ subscript })} />
        </SettingRow>

        <SettingRow label={t("Superscript")}>
          <Toggle checked={m.superscript} onChange={(superscript) => write({ superscript })} />
        </SettingRow>

        <SettingRow label={t("Highlight")}>
          <Toggle checked={m.highlight} onChange={(highlight) => write({ highlight })} />
        </SettingRow>

        <SettingRow label={t("GitHub alerts")}>
          <Toggle checked={m.github_alerts} onChange={(github_alerts) => write({ github_alerts })} />
        </SettingRow>

        <SettingRow label={t("Diagrams")}>
          <Toggle checked={m.diagrams} onChange={(diagrams) => write({ diagrams })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Smart punctuation")}>
        <SettingRow label={t("Mode")}>
          <Select
            value={m.smart_punctuation}
            options={SMART}
            onChange={(smart_punctuation) => write({ smart_punctuation })}
          />
        </SettingRow>

        <SettingRow label={t("Smart quotes")}>
          <Toggle
            checked={m.smart_quotes}
            onChange={(smart_quotes) => write({ smart_quotes })}
          />
        </SettingRow>

        <SettingRow label={t("Double-quote glyph")}>
          <Select
            value={m.smart_quotes_double}
            options={QUOTE}
            onChange={(smart_quotes_double) => write({ smart_quotes_double })}
          />
        </SettingRow>

        <SettingRow label={t("Single-quote glyph")}>
          <Select
            value={m.smart_quotes_single}
            options={QUOTE}
            onChange={(smart_quotes_single) => write({ smart_quotes_single })}
          />
        </SettingRow>

        <SettingRow label={t("Smart dashes")}>
          <Toggle
            checked={m.smart_dashes}
            onChange={(smart_dashes) => write({ smart_dashes })}
          />
        </SettingRow>

        <SettingRow label={t("Dash glyph")}>
          <Select
            value={m.dash_style}
            options={DASH}
            onChange={(dash_style) => write({ dash_style })}
          />
        </SettingRow>

        <SettingRow label={t("Allow converting Unicode punctuation")}>
          <Toggle
            checked={m.unicode_punctuation}
            disabled={smartAblePunctuationCloseActive}
            onChange={(unicode_punctuation) => write({ unicode_punctuation })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Auto-correct")}>
        <SettingRow label={t("Auto-correct misspelled English words")}>
          <Toggle checked={m.auto_correct} onChange={(auto_correct) => write({ auto_correct })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Code Block")}>
        <SettingRow label={t("Show line numbers")}>
          <Toggle
            checked={m.code_line_numbers}
            onChange={(code_line_numbers) => write({ code_line_numbers })}
          />
        </SettingRow>

        <SettingRow label={t("Word wrap")}>
          <Toggle checked={m.code_wrap} onChange={(code_wrap) => write({ code_wrap })} />
        </SettingRow>

        <SettingRow label={t("Show toolbar")}>
          <Toggle
            checked={m.code_toolbar}
            onChange={(code_toolbar) => write({ code_toolbar })}
          />
        </SettingRow>

        <SettingRow label={t("Show language picker")}>
          <Toggle
            checked={m.code_language_picker}
            onChange={(code_language_picker) => write({ code_language_picker })}
          />
        </SettingRow>

        <SettingRow label={t("Use Shift+Tab to indent selected code")}>
          <Toggle
            checked={m.code_shift_tab_indent}
            onChange={(code_shift_tab_indent) => write({ code_shift_tab_indent })}
          />
        </SettingRow>

        <SettingRow label={t("Indent width")}>
          <NumberInput
            value={m.code_indent}
            min={1}
            max={8}
            onChange={(code_indent) => write({ code_indent })}
          />
        </SettingRow>

        <SettingRow label={t("Default language")}>
          <TextInput
            value={m.code_default_language}
            width="md"
            placeholder={t("Empty = write nothing")}
            onChange={(code_default_language) => write({ code_default_language })}
          />
        </SettingRow>

        <SettingRow label={t("When to add a language")}>
          <Select
            value={m.code_auto_language}
            options={AUTO_LANG}
            onChange={(code_auto_language) => write({ code_auto_language })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Math")}>
        <SettingRow label={t("Inline math")}>
          <Toggle checked={m.inline_math} onChange={(inline_math) => write({ inline_math })} />
        </SettingRow>

        <SettingRow label={t("Recognize the \\\\( \\\\) and \\\\[ \\\\] delimiters")}>
          <Toggle
            checked={m.latex_delimiters}
            onChange={(latex_delimiters) => write({ latex_delimiters })}
          />
        </SettingRow>

        <SettingRow label={t("Treat ```math blocks as math")}>
          <Toggle
            checked={m.code_block_math}
            onChange={(code_block_math) => write({ code_block_math })}
          />
        </SettingRow>

        <SettingRow label={t("physics package")}>
          <Toggle
            checked={settings.enable_physics}
            onChange={(enable_physics) => onChange({ enable_physics })}
          />
        </SettingRow>

        <SettingRow label={t("Use the legacy inline math parser")}>
          <Toggle
            checked={m.legacy_inline_math}
            onChange={(legacy_inline_math) => write({ legacy_inline_math })}
          />
        </SettingRow>

        <SettingRow label={t("Number equations")}>
          <Select
            value={m.equation_numbering}
            options={EQUATION}
            onChange={(equation_numbering) => write({ equation_numbering })}
          />
        </SettingRow>

        <SettingRow label={t("What to give when copying or exporting")}>
          <Select
            value={m.math_output}
            options={MATH_OUT}
            onChange={(math_output) => write({ math_output })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Spaces and line breaks")}>
        <SettingRow label={t("First-line indent")}>
          <Toggle
            checked={m.first_line_indent}
            onChange={(first_line_indent) => write({ first_line_indent })}
          />
        </SettingRow>

        <SettingRow label={t("Show <br/> while editing")}>
          <Toggle checked={m.show_br} onChange={(show_br) => write({ show_br })} />
        </SettingRow>

        <SettingRow label={t("While editing")}>
          <Select
            value={m.whitespace_editing}
            options={WS}
            onChange={(whitespace_editing) => write({ whitespace_editing })}
          />
        </SettingRow>

        <SettingRow label={t("When exporting or printing")}>
          <Select
            value={m.whitespace_export}
            options={WS}
            onChange={(whitespace_export) => write({ whitespace_export })}
          />
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
