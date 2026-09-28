/**
 * 「编辑器」那一页。
 *
 * 前两组（编辑模式、正文宽度）是 **Nota 自己的**：Nota 有「所见即所得 / 源码 /
 * 预览」三种模式可分，这两种偏好由此而来。
 *
 * ⚠️ 这一页里**没有**「字体大小」「缩放」（那是外壳的，在外观页）、
 * 也**没有**「自动保存」「关闭前先问我」（挪到文件页的「保存 & 恢复」组了）。
 * 两者在界面上位置相近，但不属于本页。
 *
 * ⚠️ 字段全在 `[editor]` 表里，**只有两个例外**：`view_mode` 和 `content_width`
 * ——它们是 2026-09-22 就在顶层的，搬进表里会让老设置文件的值静默丢回默认。
 */

import type { LineEnding, ViewMode } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { VIEW_MODE_LABELS, VIEW_MODE_ORDER } from "@/ui/view-modes";
import {
  NumberInput,
  Radio,
  Range,
  Select,
  SettingRow,
  SettingsGroup,
  Toggle,
} from "../primitives";
import { paneWriter, type PaneProps } from "./props";

export function EditorPane({ settings, onChange }: PaneProps) {
  // 订阅语言（宿主报来语言之后这一块要重画，见 `i18n/index.ts::useT`）。
  // 局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const 写 = paneWriter(settings, onChange, "editor");
  const e = settings.editor;

  /**
   * 编辑模式那三个名字。⚠️ **从 `ui/view-modes.ts` 取**，不在这儿另写一份
   * （同「状态栏」那一格）。
   *
   * ⚠️ 表**在组件里现建**（2026-09-26 从模块级搬进来）：`view-modes.ts` 那张表
   * 里存的也是**键**（英文原文，见那儿顶上的注释），所以这里必须翻一次——
   * 而且必须在下拉**画出来那一刻**翻，不能在模块级求值时翻。
   */
  const VIEW_MODES: Array<{ value: ViewMode; label: string }> = VIEW_MODE_ORDER.map(
    (value) => ({ value, label: t(VIEW_MODE_LABELS[value].full) }),
  );

  /**
   * 换行符那两个名字。⚠️ **字面写在 .tsx 里**（`LF（\n）` 那种全角括号），
   * 所以它也是键：留在模块级就没法翻，英文界面上会原样露出全角括号。
   */
  const LINE_ENDINGS: Array<{ value: LineEnding; label: string }> = [
    { value: "lf", label: t("LF (\\n)") },
    { value: "crlf", label: t("CRLF (\\r\\n)") },
  ];

  return (
    <>
      <SettingsGroup
        title={t("Editing mode")}
        help={t("The same switch as the three items in the View menu — changing either one is the same.")}
      >
        <SettingRow>
          <Select
            value={settings.view_mode}
            options={VIEW_MODES}
            onChange={(view_mode) => onChange({ view_mode })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("Text width")}
        help={t("Maximum width of the text column in the editing area. Too wide and lines are easy to lose track of — you cannot find the start of the next line.")}
      >
        <SettingRow>
          <Range
            value={settings.content_width}
            min={480}
            max={1200}
            step={20}
            suffix="px"
            onChange={(content_width) => onChange({ content_width })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("Default indent")}
        help={t(
          "⚠ This controls the indent generated for lists, blockquotes and indented blocks — not indentation inside code blocks. Code-block indentation lives on the Markdown page and defaults to 4. The two are independent preferences and are not merged.",
        )}
      >
        <SettingRow>
          <NumberInput
            value={e.default_indent}
            min={1}
            max={8}
            onChange={(default_indent) => 写({ default_indent })}
          />
        </SettingRow>
        <SettingRow
          label={t("Aligned indent")}
          help={t("Child items align with the first line of their parent instead of indenting by a fixed width. The difference is obvious on long entries that wrap.")}
        >
          <Toggle checked={e.align_indent} onChange={(align_indent) => 写({ align_indent })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("First-line indent")}
        help={t(
          "Indents the first line of a body paragraph by a few characters — “leave two spaces at the start of a paragraph” in Chinese typography. ⚠ It is display only: not one space is written into the file, so source mode, other editors and exports all still see the original text.",
        )}
      >
        <SettingRow>
          <Toggle
            checked={e.paragraph_indent}
            onChange={(paragraph_indent) => 写({ paragraph_indent })}
          />
        </SettingRow>
        <SettingRow
          label={t("Indent width")}
          help={t(
            "Measured in characters (one full-width ideograph counts as one). Applies to body paragraphs only: paragraphs inside blockquotes, list items, table cells and code blocks are not indented — those blocks already have their own left margin.",
          )}
        >
          <NumberInput
            value={e.paragraph_indent_chars}
            min={1}
            max={8}
            disabled={!e.paragraph_indent}
            onChange={(paragraph_indent_chars) => 写({ paragraph_indent_chars })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("Smart symbol completion")}
        help={t(
          "Typing a symbol immediately inserts its other half: brackets and quotes (including `[`), a pair of `*`, Tab to step past the closing half, and Backspace between an empty pair deletes both. ⚠ One switch covers all four — they lean on each other, so turning it off means the whole thing is off, not “completes a little less”. ⚠ It replaces the two old switches “Match brackets and quotes” and “Match Markdown characters”: those saved a value that no code ever read, so flipping them did nothing at all.",
        )}
      >
        <SettingRow>
          <Toggle
            checked={e.smart_symbols}
            onChange={(smart_symbols) => 写({ smart_symbols })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Emoji autocomplete")}>
        <SettingRow>
          <Toggle
            checked={e.emoji_autocomplete}
            onChange={(emoji_autocomplete) => 写({ emoji_autocomplete })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Show the Markdown source of the current block")}>
        <SettingRow>
          <Toggle
            checked={e.show_block_source}
            onChange={(show_block_source) => 写({ show_block_source })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Copy Markdown source when copying as plain text")}>
        <SettingRow>
          <Toggle
            checked={e.copy_markdown_source}
            onChange={(copy_markdown_source) => 写({ copy_markdown_source })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Copy/cut the whole line when nothing is selected")}>
        <SettingRow>
          <Toggle
            checked={e.copy_line_when_empty}
            onChange={(copy_line_when_empty) => 写({ copy_line_when_empty })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("Line endings")}
        help={t(
          "⚠ Only affects new, empty documents. Existing files are written back with their own line endings — choosing CRLF here will not rewrite an LF file from end to end (that would produce whole-file diff noise and change the file's bytes).",
        )}
      >
        <SettingRow>
          <Radio
            value={e.line_ending}
            options={LINE_ENDINGS}
            onChange={(line_ending) => 写({ line_ending })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Spell check")}>
        <SettingRow
          help={t(
            "Spell check is provided by WebKitGTK and its language follows the system. Nota offers no language picker for it — only this switch.",
          )}
        >
          <Toggle checked={e.spellcheck} onChange={(spellcheck) => 写({ spellcheck })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Typewriter Mode")}>
        <SettingRow label={t("Keep the cursor in the middle of the screen")}>
          <Toggle
            checked={e.typewriter_keep_caret_centered}
            onChange={(typewriter_keep_caret_centered) => 写({ typewriter_keep_caret_centered })}
          />
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
