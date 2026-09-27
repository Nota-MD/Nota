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
   * 里存的也是**键**（中文原文，见那儿顶上的注释），所以这里必须翻一次——
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
    { value: "lf", label: t("LF（\\n）") },
    { value: "crlf", label: t("CRLF（\\r\\n）") },
  ];

  return (
    <>
      <SettingsGroup
        title={t("编辑模式")}
        help={t("和「视图」菜单里那三条是同一个开关，改哪边都一样。")}
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
        title={t("正文宽度")}
        help={t("编辑区正文栏的最大宽度。过宽时阅读容易串行，一行读完难以回到行首。")}
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
        title={t("默认缩进")}
        help={t(
          "⚠ 本项控制列表 / 引用 / 缩进块自动生成的缩进，不是代码块内的缩进——代码块缩进在「Markdown」页，默认 4。两者是相互独立的偏好，不合并。",
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
          label={t("对齐缩进")}
          help={t("子项的文字与父项首行对齐，而不是按固定宽度缩进。折行的长条目上差别很明显。")}
        >
          <Toggle checked={e.align_indent} onChange={(align_indent) => 写({ align_indent })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("段首缩进")}
        help={t(
          "正文段落的第一行空出几个字符，中文排版里说的「段首空两格」。⚠ 它只是**看着**缩进，一个空格都不会写进文件——源码模式、别的编辑器、导出拿到的都还是原来那些字。",
        )}
      >
        <SettingRow>
          <Toggle
            checked={e.paragraph_indent}
            onChange={(paragraph_indent) => 写({ paragraph_indent })}
          />
        </SettingRow>
        <SettingRow
          label={t("缩进宽度")}
          help={t(
            "以字符为单位（一个汉字宽算一个）。只作用于正文段落：引用、列表项、表格格子、代码块里的段落都不缩——那些块自己本来就有左边距。",
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

      <SettingsGroup title={t("匹配括号和引号")}>
        <SettingRow>
          <Toggle
            checked={e.match_brackets}
            onChange={(match_brackets) => 写({ match_brackets })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("匹配 Markdown 字符")}>
        <SettingRow
          help={t(
            "输入 `**` 时自动补出后面的两个星号。⚠ 默认关闭：需要输入粗体的人要先删掉多出来的两个星号，比手动补齐多一步。",
          )}
        >
          <Toggle
            checked={e.match_markdown}
            onChange={(match_markdown) => 写({ match_markdown })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Emoji 自动补全")}>
        <SettingRow>
          <Toggle
            checked={e.emoji_autocomplete}
            onChange={(emoji_autocomplete) => 写({ emoji_autocomplete })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("显示当前块的 Markdown 源码")}>
        <SettingRow>
          <Toggle
            checked={e.show_block_source}
            onChange={(show_block_source) => 写({ show_block_source })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("复制纯文本时复制 Markdown 源码")}>
        <SettingRow>
          <Toggle
            checked={e.copy_markdown_source}
            onChange={(copy_markdown_source) => 写({ copy_markdown_source })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("没有选中文字时整行复制 / 剪切")}>
        <SettingRow>
          <Toggle
            checked={e.copy_line_when_empty}
            onChange={(copy_line_when_empty) => 写({ copy_line_when_empty })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("换行符")}
        help={t(
          "⚠ 只作用于新建的空文档。已经存在的文件按其原有的换行符写回——此处选 CRLF 不会使一个 LF 的旧文件整体改变（那会产生全文件级的 diff 噪音，并且改动了文件字节）。",
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

      <SettingsGroup title={t("拼写检查")}>
        <SettingRow
          help={t(
            "拼写检查由 WebKitGTK 提供，检查所用语言跟随系统，Nota 不提供「选择语言」这一项，只有一个开关。",
          )}
        >
          <Toggle checked={e.spellcheck} onChange={(spellcheck) => 写({ spellcheck })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("打字机模式")}>
        <SettingRow label={t("让光标始终停在屏幕中间")}>
          <Toggle
            checked={e.typewriter_keep_caret_centered}
            onChange={(typewriter_keep_caret_centered) => 写({ typewriter_keep_caret_centered })}
          />
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
