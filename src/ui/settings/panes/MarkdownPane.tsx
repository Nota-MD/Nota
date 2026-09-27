/**
 * 「Markdown」那一页：九页中组数最多的一页，共六组。
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
    { value: "atx", label: t("ATX（## 标题）") },
    { value: "setext", label: t("下划线式（标题 + ===/---）") },
  ];

  const BULLET: Array<{ value: BulletMark; label: string }> = [
    { value: "dash", label: t("- 连字符") },
    { value: "star", label: t("* 星号") },
    { value: "plus", label: t("+ 加号") },
  ];

  const ORDERED: Array<{ value: OrderedMark; label: string }> = [
    { value: "dot", label: "1. 2. 3." },
    { value: "paren", label: "1) 2) 3)" },
  ];

  const SMART: Array<{ value: SmartPunctuation; label: string }> = [
    { value: "off", label: t("关闭") },
    { value: "render", label: t("仅显示时转换（存盘内容不动）") },
    { value: "input", label: t("输入时转换") },
  ];

  const QUOTE: Array<{ value: QuoteStyle; label: string }> = [
    { value: "curly", label: t("弯引号 “ ” ‘ ’") },
    { value: "straight", label: t("直引号 \" '") },
  ];

  const DASH: Array<{ value: DashStyle; label: string }> = [
    { value: "en-em", label: t("-- → –，--- → —") },
    { value: "em", label: t("-- 和 --- 都 → —") },
  ];

  const AUTO_LANG: Array<{ value: AutoLanguage; label: string }> = [
    { value: "on-markdown-insert", label: t("写 ```语言 插入代码块时") },
    { value: "never", label: t("从不") },
  ];

  const EQUATION: Array<{ value: EquationNumbering; label: string }> = [
    { value: "none", label: t("不启用") },
    { value: "ams", label: t("AMS 风格（只给 equation 环境编号）") },
  ];

  const MATH_OUT: Array<{ value: MathOutput; label: string }> = [
    { value: "svg", label: "SVG" },
    { value: "mathml", label: "MathML" },
  ];

  const WS: Array<{ value: WhitespaceMode; label: string }> = [
    { value: "preserve", label: t("保留连续空格和单个换行") },
    { value: "preserve-all", label: t("保留所有空格和换行") },
    { value: "as-html", label: t("按 HTML 处理（折成单个空格）") },
  ];

  const 写 = paneWriter(settings, onChange, "markdown");
  const m = settings.markdown;
  const 智能标点关着 = m.smart_punctuation === "off";

  return (
    <>
      <SettingsGroup
        title={t("Markdown 语法偏好")}
        description={t("只决定 Nota 生成 Markdown 时采用哪种写法，不改变已有文件中的写法。")}
      >
        <SettingRow
          label={t("严格模式")}
          help={t("开启后，标题的井号之后必须有空格，`# 标题` 才识别为标题。默认关闭。关闭时 `#标题` 也识别为标题：正文按标题排版，大纲与标签页同样认可，但不修改字符本身——文件中原为 `#标题`，保存后仍是 `#标题`。修改后立即重新解析当前文档，无需重启。")}
        >
          <Toggle
            checked={settings.strict_markdown}
            onChange={(strict_markdown) => onChange({ strict_markdown })}
          />
        </SettingRow>

        <SettingRow
          label={t("标题样式")}
          help={t("⚠ 下划线式（Setext）仅有一级和二级，三级及以上没有对应写法，仍生成 `### 标题`。")}
        >
          <Select
            value={m.heading_style}
            options={HEADING}
            onChange={(heading_style) => 写({ heading_style })}
          />
        </SettingRow>

        <SettingRow label={t("无序列表标记")}>
          <Select
            value={m.bullet_mark}
            options={BULLET}
            onChange={(bullet_mark) => 写({ bullet_mark })}
          />
        </SettingRow>

        <SettingRow label={t("有序列表标记")}>
          <Select
            value={m.ordered_mark}
            options={ORDERED}
            onChange={(ordered_mark) => 写({ ordered_mark })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("Markdown 扩展语法")}
        help={t("关闭某一项后，对应的写法按普通文字显示；文件内容不发生变化，只是不再识别该语法。")}
      >
        <SettingRow label={t("自动识别链接")} help={t("`https://…` 这种裸地址直接变成可点的链接。")}>
          <Toggle checked={m.autolink} onChange={(autolink) => 写({ autolink })} />
        </SettingRow>

        <SettingRow label={t("内联公式")} help={t("`$LaTeX$`。⚠ 与下方「公式」组中的同一项共用开关。")}>
          <Toggle checked={m.inline_math} onChange={(inline_math) => 写({ inline_math })} />
        </SettingRow>

        <SettingRow label={t("下标")} help={t("`H~2~O`。")}>
          <Toggle checked={m.subscript} onChange={(subscript) => 写({ subscript })} />
        </SettingRow>

        <SettingRow label={t("上标")} help={t("`X^2^`。")}>
          <Toggle checked={m.superscript} onChange={(superscript) => 写({ superscript })} />
        </SettingRow>

        <SettingRow label={t("高亮")} help={t("`==重点==`。")}>
          <Toggle checked={m.highlight} onChange={(highlight) => 写({ highlight })} />
        </SettingRow>

        <SettingRow
          label={t("GitHub 警报框")}
          help={t("`> [!NOTE]` / `> [!WARNING]` 这一套写法，渲染为带底色的提示框。⚠ 不属于 CommonMark：用其它 Markdown 编辑器打开时显示为普通引用块。")}
        >
          <Toggle checked={m.github_alerts} onChange={(github_alerts) => 写({ github_alerts })} />
        </SettingRow>

        <SettingRow
          label={t("图表")}
          help={t("序列图、流程图、Mermaid。⚠ 图形需即时渲染，正文很长时初次滚动会有轻微卡顿。")}
        >
          <Toggle checked={m.diagrams} onChange={(diagrams) => 写({ diagrams })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("智能标点")}
        help={t("三个档位都不修改文档中已有的字符，区别只在何时转换：「仅显示时转换」不写入任何字节，保存后仍是 `--`；「输入时转换」只作用于正在输入的字符，效果等同于输入法的自动更正。打开旧文件并在保存时改写其中全部 `--` 的行为不在实现范围内。")}
      >
        <SettingRow label={t("模式")}>
          <Select
            value={m.smart_punctuation}
            options={SMART}
            onChange={(smart_punctuation) => 写({ smart_punctuation })}
          />
        </SettingRow>

        <SettingRow label={t("智能引号")}>
          <Toggle
            checked={m.smart_quotes}
            onChange={(smart_quotes) => 写({ smart_quotes })}
          />
        </SettingRow>

        <SettingRow
          label={t("双引号的字形")}
          help={t("⚠ 仅提供两档。其它语区（英文 / 法文 / 德文）的引号字形尚未实现，记在 `docs/10-feature-matrix.md` 的待办表中。")}
        >
          <Select
            value={m.smart_quotes_double}
            options={QUOTE}
            onChange={(smart_quotes_double) => 写({ smart_quotes_double })}
          />
        </SettingRow>

        <SettingRow label={t("单引号的字形")}>
          <Select
            value={m.smart_quotes_single}
            options={QUOTE}
            onChange={(smart_quotes_single) => 写({ smart_quotes_single })}
          />
        </SettingRow>

        <SettingRow label={t("智能破折号")}>
          <Toggle
            checked={m.smart_dashes}
            onChange={(smart_dashes) => 写({ smart_dashes })}
          />
        </SettingRow>

        <SettingRow label={t("破折号的字形")}>
          <Select
            value={m.dash_style}
            options={DASH}
            onChange={(dash_style) => 写({ dash_style })}
          />
        </SettingRow>

        <SettingRow
          label={t("允许转换 Unicode 标点")}
          help={t("解析 Markdown 时，Unicode 的引号 / 破折号也识别为 Markdown 标记。⚠ 「模式」选「关闭」时本项不生效，因此呈灰色。")}
        >
          <Toggle
            checked={m.unicode_punctuation}
            disabled={智能标点关着}
            onChange={(unicode_punctuation) => 写({ unicode_punctuation })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("自动更正")}
        help={t("只认一张固定的英文错拼表（四十来条，如 `teh` → `the`），在敲下词尾空格那一下改正刚打完的那个词。⚠ 不做语法检查、不做句首自动大写、不碰中文；改正之后按一次 `Ctrl+Z` 就能退回原文。⚠ 已经写进文档的旧文字永远不改。")}
      >
        <SettingRow
          label={t("自动更正英文错拼")}
          help={t("`teh` → `the`、`recieve` → `receive`、`dont` → `don't` 这一类。⚠ 触发字符只有空格与制表符，所以 `teh,` 要等你敲空格才更正。")}
        >
          <Toggle checked={m.auto_correct} onChange={(auto_correct) => 写({ auto_correct })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("代码块")}
        help={t("这几条只管所见即所得里代码块的样子，不影响存进文件的内容，也不影响导出。")}
      >
        <SettingRow
          label={t("显示行号")}
          help={t(
            "在代码块左边加一条行号装订线。⚠ 默认关闭：它会让代码文字整体右移约 40px，三五行的小代码块上不太划算。",
          )}
        >
          <Toggle
            checked={m.code_line_numbers}
            onChange={(code_line_numbers) => 写({ code_line_numbers })}
          />
        </SettingRow>

        <SettingRow
          label={t("自动换行")}
          help={t(
            "长行折到下一行显示。⚠ 关闭后长行不折、直接溢出到代码块外，得拖编辑区的横向滚动条才看得见后半截——Nota 把语言选择框画在代码块外面，块内横向滚动会把那个框裁掉，所以这里没有块内滚动。",
          )}
        >
          <Toggle checked={m.code_wrap} onChange={(code_wrap) => 写({ code_wrap })} />
        </SettingRow>

        <SettingRow
          label={t("显示工具栏")}
          help={t("代码块下面那条「折叠 / 复制」。")}
        >
          <Toggle
            checked={m.code_toolbar}
            onChange={(code_toolbar) => 写({ code_toolbar })}
          />
        </SettingRow>

        <SettingRow
          label={t("显示语言选择框")}
          help={t("代码块下面那颗语言选择框。⚠ 关掉之后仍可在源码模式里改围栏上的语言。")}
        >
          <Toggle
            checked={m.code_language_picker}
            onChange={(code_language_picker) => 写({ code_language_picker })}
          />
        </SettingRow>

        <SettingRow
          label={t("用 Shift+Tab 调整所选代码的缩进")}
          help={t("选中若干行代码后按 Shift+Tab，将整块减少一级缩进。⚠ 默认关闭：该键原本用于反向切换焦点，开启后会覆盖这一行为。")}
        >
          <Toggle
            checked={m.code_shift_tab_indent}
            onChange={(code_shift_tab_indent) => 写({ code_shift_tab_indent })}
          />
        </SettingRow>

        <SettingRow
          label={t("缩进宽度")}
          help={t("⚠ 与「编辑器」页的「默认缩进」是两项独立设置：后者控制列表 / 引用自动生成的缩进（默认 2），本项控制代码块缩进（默认 4）。")}
        >
          <NumberInput
            value={m.code_indent}
            min={1}
            max={8}
            onChange={(code_indent) => 写({ code_indent })}
          />
        </SettingRow>

        <SettingRow
          label={t("默认语言")}
          help={t("新建代码块预填的语言，写入 ``` 之后。留空则不写，渲染时不带语法高亮。")}
        >
          <TextInput
            value={m.code_default_language}
            width="md"
            placeholder={t("留空 = 不写")}
            onChange={(code_default_language) => 写({ code_default_language })}
          />
        </SettingRow>

        <SettingRow label={t("什么时候自动加语言")}>
          <Select
            value={m.code_auto_language}
            options={AUTO_LANG}
            onChange={(code_auto_language) => 写({ code_auto_language })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("公式")}>
        <SettingRow label={t("行内公式")} help={t("`$LaTeX$`。⚠ 与上方「扩展语法」组中的同一项共用开关。")}>
          <Toggle checked={m.inline_math} onChange={(inline_math) => 写({ inline_math })} />
        </SettingRow>

        <SettingRow
          label={t("认 \\\\( \\\\) 和 \\\\[ \\\\] 定界符")}
          help={t("除 `$…$` 之外，`\\\\( … \\\\)`（行内）与 `\\\\[ … \\\\]`（独立成行）也识别为公式。旧文档中这种写法常见。")}
        >
          <Toggle
            checked={m.latex_delimiters}
            onChange={(latex_delimiters) => 写({ latex_delimiters })}
          />
        </SettingRow>

        <SettingRow label={t("```math 代码块当公式")}>
          <Toggle
            checked={m.code_block_math}
            onChange={(code_block_math) => 写({ code_block_math })}
          />
        </SettingRow>

        <SettingRow
          label={t("physics 宏包")}
          help={t("开启后可使用 `\\\\qty`、`\\\\dv`、`\\\\braket`、`\\\\comm` 等 physics 宏包的写法。⚠ 它会重定义 `\\\\div` / `\\\\Re` / `\\\\Im` 三个既有命令，这是 physics 宏包本身的行为，因此默认关闭。这些命令由 Nota 自行定义：数学渲染使用 KaTeX，其官方不含 physics。修改后立即重排当前文档。")}
        >
          <Toggle
            checked={settings.enable_physics}
            onChange={(enable_physics) => onChange({ enable_physics })}
          />
        </SettingRow>

        <SettingRow
          label={t("用旧版的行内公式解析")}
          help={t("兼容模式。⚠ 默认关闭：旧解析在 `$` 与数字相邻时容易误判，`$5 和 $6` 会被当成一个公式。仅在需要打开旧文档时开启。")}
        >
          <Toggle
            checked={m.legacy_inline_math}
            onChange={(legacy_inline_math) => 写({ legacy_inline_math })}
          />
        </SettingRow>

        <SettingRow
          label={t("公式自动编号")}
          help={t("⚠ 默认不启用：大多数文档不使用公式编号，默认开启会在每个公式右侧多出一个 (1)。")}
        >
          <Select
            value={m.equation_numbering}
            options={EQUATION}
            onChange={(equation_numbering) => 写({ equation_numbering })}
          />
        </SettingRow>

        <SettingRow
          label={t("复制 / 导出时给什么")}
          help={t("复制为无格式 HTML 或导出时，公式采用哪种格式。SVG 不依赖接收方的字体，在任何环境下外观一致；MathML 是文本，可被读屏器与公式编辑器识别。")}
        >
          <Select
            value={m.math_output}
            options={MATH_OUT}
            onChange={(math_output) => 写({ math_output })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("空格与换行")}
        help={t("「编辑时」与「导出与打印」是两项独立设置：这两种场合的需求常常相反，编辑时需看见已输入的空格，导出时需将其合并。")}
      >
        <SettingRow
          label={t("首行缩进")}
          help={t("中文排版习惯：每段第一行空两格。⚠ 仅为显示效果，不向正文写入空格，文件内容不发生变化。")}
        >
          <Toggle
            checked={m.first_line_indent}
            onChange={(first_line_indent) => 写({ first_line_indent })}
          />
        </SettingRow>

        <SettingRow label={t("编辑时显示 <br/>")}>
          <Toggle checked={m.show_br} onChange={(show_br) => 写({ show_br })} />
        </SettingRow>

        <SettingRow label={t("编辑时")}>
          <Select
            value={m.whitespace_editing}
            options={WS}
            onChange={(whitespace_editing) => 写({ whitespace_editing })}
          />
        </SettingRow>

        <SettingRow label={t("导出与打印时")}>
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
