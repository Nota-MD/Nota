/**
 * 「编辑器」那一页。
 *
 * 第一组（正文宽度）是 **Nota 自己的**：内容区多宽由这一格说了算。
 * ⚠️ 2026-10-09 起它**默认关着**（`settings.limit_text_width`）——关着时正文列
 * 铺满编辑区，滑杆不画。**开着才画滑杆**，理由写在 `settings/mod.rs` 那个字段上
 * （用户报的"右侧还是有空隙……应该两边边距一样"）。
 *
 * ⚠️ **「编辑模式」那一格 2026-10-07 已从这里删掉**：模式改成**会话内状态**、
 * 不落盘（用户原话「请设置默认启动为 WYSIWYG」）——每次启动一律所见即所得，
 * 切换走菜单「视图 → 所见即所得 / 源码 / 分屏」或状态栏那颗 `</>`。
 * 那个设置项本身也已从 `Settings` 里退休（前后端一起）。
 *
 * ⚠️ 这一页里**没有**「字体大小」「缩放」（那是外壳的，在外观页）、
 * 也**没有**「自动保存」「关闭前先问我」（挪到文件页的「保存 & 恢复」组了）。
 * 两者在界面上位置相近，但不属于本页。
 *
 * ⚠️ 字段全在 `[editor]` 表里，**只有两个例外、都在顶层**：`content_width`
 * （2026-09-22 就在那儿，搬进表里会让老设置文件的值静默丢回默认）与
 * `limit_text_width`（2026-10-09 加的那颗开关——它与 `content_width` 是**一对**，
 * 拆成"一个顶层一个表里"只会让人以为它们不是一件事）。
 */

import type { LineEnding } from "@/bridge/ipc";
import { useT } from "@/i18n";
import {
  NumberInput,
  Radio,
  Range,
  SettingRow,
  SettingsGroup,
  Toggle,
} from "../primitives";
import { paneWriter, type PaneProps } from "./props";
import { SpellLangPicker } from "./SpellLangPicker";

export function EditorPane({ settings, onChange }: PaneProps) {
  // 订阅语言（宿主报来语言之后这一块要重画，见 `i18n/index.ts::useT`）。
  // 局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const 写 = paneWriter(settings, onChange, "editor");
  const e = settings.editor;

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
      <SettingsGroup title={t("Text width")}>
        <SettingRow label={t("Limit text width")}>
          <Toggle
            checked={settings.limit_text_width}
            onChange={(limit_text_width) => onChange({ limit_text_width })}
          />
        </SettingRow>
        {/* ⚠️ 关着时**不画滑杆**（不是画成灰的）：那一位的值这时候不生效，
            画出来就得解释"为什么拖了没反应"。 */}
        {settings.limit_text_width && (
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
        )}
      </SettingsGroup>

      <SettingsGroup title={t("Default indent")}>
        <SettingRow>
          <NumberInput
            value={e.default_indent}
            min={1}
            max={8}
            onChange={(default_indent) => 写({ default_indent })}
          />
        </SettingRow>
        <SettingRow label={t("Aligned indent")}>
          <Toggle checked={e.align_indent} onChange={(align_indent) => 写({ align_indent })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("First-line indent")}>
        <SettingRow>
          <Toggle
            checked={e.paragraph_indent}
            onChange={(paragraph_indent) => 写({ paragraph_indent })}
          />
        </SettingRow>
        <SettingRow label={t("Indent width")}>
          <NumberInput
            value={e.paragraph_indent_chars}
            min={1}
            max={8}
            disabled={!e.paragraph_indent}
            onChange={(paragraph_indent_chars) => 写({ paragraph_indent_chars })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Smart symbol completion")}>
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

      <SettingsGroup title={t("Line endings")}>
        <SettingRow>
          <Radio
            value={e.line_ending}
            options={LINE_ENDINGS}
            onChange={(line_ending) => 写({ line_ending })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Spell check")}>
        <SettingRow>
          <Toggle checked={e.spellcheck} onChange={(spellcheck) => 写({ spellcheck })} />
        </SettingRow>
        {/* ⚠️ 关着时**不画**下面这两行（同上面「正文宽度」那条滑杆的口径）：
            开关关着的时候语言不发生任何作用，摆在那儿就得解释"为什么选了没反应"。 */}
        {e.spellcheck && (
          // ⚠️ **可以同时勾几门**（2026-10-10 晚，"多语言"那一批）：控件与
          // 它的两半候选表在 `./SpellLangPicker.tsx`（那边写着为什么候选分
          // "这台机器装着的" 与 "写死的那张表" 两半）。
          <SettingRow
            label={t("Languages")}
            description={t(
              "More than one can be checked at once — words are checked against all of them. Nota ships no dictionaries; if a language has none on this machine, it will say so.",
            )}
          >
            <SpellLangPicker
              value={e.spellcheck_langs}
              onChange={(spellcheck_langs) => 写({ spellcheck_langs })}
            />
          </SettingRow>
        )}
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
