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

  const 写 = paneWriter(settings, onChange, "markdown");
  const m = settings.markdown;
  const 智能标点关着 = m.smart_punctuation === "off";

  return (
    <>
      <SettingsGroup
        title={t("Markdown syntax preferences")}
        description={t("Only decides the form Nota writes when generating Markdown; files that already exist are never rewritten")}
      >
        <SettingRow
          label={t("Strict mode")}
          help={t("When on, a heading's hashes must be followed by a space for `# Heading` to count. Off by default. While off, `#Heading` counts too: the text is laid out as a heading and the outline and tabs agree, but the characters are untouched — a file that said `#Heading` still says `#Heading` after saving. The current document is re-parsed immediately; no restart needed")}
        >
          <Toggle
            checked={settings.strict_markdown}
            onChange={(strict_markdown) => onChange({ strict_markdown })}
          />
        </SettingRow>

        <SettingRow
          label={t("Heading style")}
          help={t("⚠ Setext covers only levels 1 and 2; from level 3 up there is no such form, so `### Heading` is still generated")}
        >
          <Select
            value={m.heading_style}
            options={HEADING}
            onChange={(heading_style) => 写({ heading_style })}
          />
        </SettingRow>

        <SettingRow label={t("Bullet list marker")}>
          <Select
            value={m.bullet_mark}
            options={BULLET}
            onChange={(bullet_mark) => 写({ bullet_mark })}
          />
        </SettingRow>

        <SettingRow label={t("Ordered list marker")}>
          <Select
            value={m.ordered_mark}
            options={ORDERED}
            onChange={(ordered_mark) => 写({ ordered_mark })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("Markdown extensions")}
        help={t("Turning one off shows that syntax as ordinary text; the file is unchanged, the syntax is simply no longer recognized")}
      >
        <SettingRow label={t("Autodetect links")} help={t("A bare address like `https://…` becomes a clickable link")}>
          <Toggle checked={m.autolink} onChange={(autolink) => 写({ autolink })} />
        </SettingRow>

        <SettingRow label={t("Inline math")} help={t("`$LaTeX$`. ⚠ Shares one switch with the same item in the Math group below")}>
          <Toggle checked={m.inline_math} onChange={(inline_math) => 写({ inline_math })} />
        </SettingRow>

        <SettingRow label={t("Subscript")} help={t("`H~2~O`")}>
          <Toggle checked={m.subscript} onChange={(subscript) => 写({ subscript })} />
        </SettingRow>

        <SettingRow label={t("Superscript")} help={t("`X^2^`")}>
          <Toggle checked={m.superscript} onChange={(superscript) => 写({ superscript })} />
        </SettingRow>

        <SettingRow label={t("Highlight")} help={t("`==highlighted==`")}>
          <Toggle checked={m.highlight} onChange={(highlight) => 写({ highlight })} />
        </SettingRow>

        <SettingRow
          label={t("GitHub alerts")}
          help={t("The `> [!NOTE]` / `> [!WARNING]` family, rendered as a tinted callout box. ⚠ Not part of CommonMark: other Markdown editors show it as an ordinary quote block")}
        >
          <Toggle checked={m.github_alerts} onChange={(github_alerts) => 写({ github_alerts })} />
        </SettingRow>

        <SettingRow
          label={t("Diagrams")}
          help={t("Sequence diagrams, flowcharts, Mermaid. ⚠ Diagrams render as you go, so the first scroll through a long document can stutter slightly")}
        >
          <Toggle checked={m.diagrams} onChange={(diagrams) => 写({ diagrams })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("Smart punctuation")}
        help={t("None of the three changes characters already in the document; they differ only in when the conversion happens: Convert for display only writes no bytes at all, so `--` is still `--` after saving; Convert as you type applies only to what you are typing, like an input method's autocorrect. Rewriting every `--` in an old file on save is out of scope")}
      >
        <SettingRow label={t("Mode")}>
          <Select
            value={m.smart_punctuation}
            options={SMART}
            onChange={(smart_punctuation) => 写({ smart_punctuation })}
          />
        </SettingRow>

        <SettingRow label={t("Smart quotes")}>
          <Toggle
            checked={m.smart_quotes}
            onChange={(smart_quotes) => 写({ smart_quotes })}
          />
        </SettingRow>

        <SettingRow
          label={t("Double-quote glyph")}
          help={t("⚠ Only two forms are offered. Quote glyphs for other locales (English / French / German) are not implemented yet and are listed in the to-do table in `docs/10-feature-matrix.md`")}
        >
          <Select
            value={m.smart_quotes_double}
            options={QUOTE}
            onChange={(smart_quotes_double) => 写({ smart_quotes_double })}
          />
        </SettingRow>

        <SettingRow label={t("Single-quote glyph")}>
          <Select
            value={m.smart_quotes_single}
            options={QUOTE}
            onChange={(smart_quotes_single) => 写({ smart_quotes_single })}
          />
        </SettingRow>

        <SettingRow label={t("Smart dashes")}>
          <Toggle
            checked={m.smart_dashes}
            onChange={(smart_dashes) => 写({ smart_dashes })}
          />
        </SettingRow>

        <SettingRow label={t("Dash glyph")}>
          <Select
            value={m.dash_style}
            options={DASH}
            onChange={(dash_style) => 写({ dash_style })}
          />
        </SettingRow>

        <SettingRow
          label={t("Allow converting Unicode punctuation")}
          help={t("When parsing Markdown, Unicode quotes and dashes count as Markdown markup too. ⚠ Does nothing while Mode is Off, which is why it is greyed out")}
        >
          <Toggle
            checked={m.unicode_punctuation}
            disabled={智能标点关着}
            onChange={(unicode_punctuation) => 写({ unicode_punctuation })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("Auto-correct")}
        help={t("Works from a single fixed table of about forty common English misspellings (`teh` → `the` and the like), fixing the word you just finished the moment you type the space after it. ⚠ It is not a grammar checker, it does not capitalise the start of sentences, and it never touches Chinese. One `Ctrl+Z` puts the original back. ⚠ Text already written into a document is never rewritten")}
      >
        <SettingRow
          label={t("Auto-correct misspelled English words")}
          help={t("Things like `teh` → `the`, `recieve` → `receive`, `dont` → `don't`. ⚠ Only a space or a tab triggers it, so `teh,` waits until you type a space")}
        >
          <Toggle checked={m.auto_correct} onChange={(auto_correct) => 写({ auto_correct })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("Code Block")}
        help={t("These affect only how code blocks look in the WYSIWYG view. They do not change what is written to the file, and they do not affect export.")}
      >
        <SettingRow
          label={t("Show line numbers")}
          help={t(
            "Adds a line-number gutter to the left of a code block. ⚠ Off by default: it pushes the code text about 40px to the right, which is a poor trade on blocks only three or five lines long.",
          )}
        >
          <Toggle
            checked={m.code_line_numbers}
            onChange={(code_line_numbers) => 写({ code_line_numbers })}
          />
        </SettingRow>

        <SettingRow
          label={t("Word wrap")}
          help={t(
            "Long lines fold onto the next line. ⚠ With this off, long lines do not fold — they spill out of the code block, and you have to drag the editing area's horizontal scrollbar to see the second half. Nota draws the language picker outside the code block, and an in-block horizontal scroll would clip it, so there is no in-block scrolling.",
          )}
        >
          <Toggle checked={m.code_wrap} onChange={(code_wrap) => 写({ code_wrap })} />
        </SettingRow>

        <SettingRow
          label={t("Show toolbar")}
          help={t("The “Collapse / Copy” strip below a code block.")}
        >
          <Toggle
            checked={m.code_toolbar}
            onChange={(code_toolbar) => 写({ code_toolbar })}
          />
        </SettingRow>

        <SettingRow
          label={t("Show language picker")}
          help={t("The language picker below a code block. ⚠ You can still change the language by editing the fence in Source mode.")}
        >
          <Toggle
            checked={m.code_language_picker}
            onChange={(code_language_picker) => 写({ code_language_picker })}
          />
        </SettingRow>

        <SettingRow
          label={t("Use Shift+Tab to indent selected code")}
          help={t("With a few lines of code selected, Shift+Tab removes one level of indentation from the whole block. ⚠ Off by default: that key normally moves focus backwards, and turning this on overrides it")}
        >
          <Toggle
            checked={m.code_shift_tab_indent}
            onChange={(code_shift_tab_indent) => 写({ code_shift_tab_indent })}
          />
        </SettingRow>

        <SettingRow
          label={t("Indent width")}
          help={t("⚠ Separate from Default indent on the Editor page: that one controls the indent generated for lists and quotes (2 by default), this one controls code block indentation (4 by default)")}
        >
          <NumberInput
            value={m.code_indent}
            min={1}
            max={8}
            onChange={(code_indent) => 写({ code_indent })}
          />
        </SettingRow>

        <SettingRow
          label={t("Default language")}
          help={t("The language pre-filled in a new code block, written after ```. Empty writes nothing, and the block renders without syntax highlighting")}
        >
          <TextInput
            value={m.code_default_language}
            width="md"
            placeholder={t("Empty = write nothing")}
            onChange={(code_default_language) => 写({ code_default_language })}
          />
        </SettingRow>

        <SettingRow label={t("When to add a language")}>
          <Select
            value={m.code_auto_language}
            options={AUTO_LANG}
            onChange={(code_auto_language) => 写({ code_auto_language })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Math")}>
        <SettingRow label={t("Inline math")} help={t("`$LaTeX$`. ⚠ Shares one switch with the same item in the Extensions group above")}>
          <Toggle checked={m.inline_math} onChange={(inline_math) => 写({ inline_math })} />
        </SettingRow>

        <SettingRow
          label={t("Recognize the \\\\( \\\\) and \\\\[ \\\\] delimiters")}
          help={t("Besides `$…$`, `\\\\( … \\\\)` (inline) and `\\\\[ … \\\\]` (on its own line) also count as math. That form is common in older documents")}
        >
          <Toggle
            checked={m.latex_delimiters}
            onChange={(latex_delimiters) => 写({ latex_delimiters })}
          />
        </SettingRow>

        <SettingRow label={t("Treat ```math blocks as math")}>
          <Toggle
            checked={m.code_block_math}
            onChange={(code_block_math) => 写({ code_block_math })}
          />
        </SettingRow>

        <SettingRow
          label={t("physics package")}
          help={t("Turns on `\\\\qty`, `\\\\dv`, `\\\\braket`, `\\\\comm` and the rest of the physics package. ⚠ It redefines the three existing commands `\\\\div` / `\\\\Re` / `\\\\Im` — behavior of the physics package itself, which is why it is off by default. These commands are defined by Nota: math rendering uses KaTeX, which does not ship physics. The current document is re-typeset immediately")}
        >
          <Toggle
            checked={settings.enable_physics}
            onChange={(enable_physics) => onChange({ enable_physics })}
          />
        </SettingRow>

        <SettingRow
          label={t("Use the legacy inline math parser")}
          help={t("Compatibility mode. ⚠ Off by default: the old parser easily misreads a `$` next to a digit, so `$5 and $6` becomes one formula. Turn it on only to open old documents")}
        >
          <Toggle
            checked={m.legacy_inline_math}
            onChange={(legacy_inline_math) => 写({ legacy_inline_math })}
          />
        </SettingRow>

        <SettingRow
          label={t("Number equations")}
          help={t("⚠ Off by default: most documents do not number equations, and turning it on adds a (1) to the right of every one of them")}
        >
          <Select
            value={m.equation_numbering}
            options={EQUATION}
            onChange={(equation_numbering) => 写({ equation_numbering })}
          />
        </SettingRow>

        <SettingRow
          label={t("What to give when copying or exporting")}
          help={t("Which format math takes when copying as plain HTML or exporting. SVG does not depend on the reader's fonts, so it looks the same everywhere; MathML is text and can be read by screen readers and formula editors")}
        >
          <Select
            value={m.math_output}
            options={MATH_OUT}
            onChange={(math_output) => 写({ math_output })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("Spaces and line breaks")}
        help={t("While editing and When exporting or printing are two separate settings: the two situations usually want opposite things — while editing you need to see the spaces you typed, while exporting they need collapsing")}
      >
        <SettingRow
          label={t("First-line indent")}
          help={t("The Chinese typographic convention: the first line of every paragraph starts two characters in. ⚠ Display only — no spaces are written into the text and the file is unchanged")}
        >
          <Toggle
            checked={m.first_line_indent}
            onChange={(first_line_indent) => 写({ first_line_indent })}
          />
        </SettingRow>

        <SettingRow label={t("Show <br/> while editing")}>
          <Toggle checked={m.show_br} onChange={(show_br) => 写({ show_br })} />
        </SettingRow>

        <SettingRow label={t("While editing")}>
          <Select
            value={m.whitespace_editing}
            options={WS}
            onChange={(whitespace_editing) => 写({ whitespace_editing })}
          />
        </SettingRow>

        <SettingRow label={t("When exporting or printing")}>
          <Select
            value={m.whitespace_export}
            options={WS}
            onChange={(whitespace_export) => 写({ whitespace_export })}
          />
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
