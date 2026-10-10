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

import { useState } from "react";

import type { LineEnding } from "@/bridge/ipc";
import { useT } from "@/i18n";
import {
  NumberInput,
  Radio,
  Range,
  Select,
  SettingRow,
  SettingsGroup,
  TextInput,
  Toggle,
} from "../primitives";
import { paneWriter, type PaneProps } from "./props";

/**
 * 「自定义语言」那一档在下拉里用的记号。
 *
 * ⚠️ 它**不是**一个合法的语言标签（标签长 `en_US` 那样），所以撞不上真值。
 */
const 自定义档 = "custom";

/**
 * 拼写检查能给的那几个语言。
 *
 * ⚠️ 写法**必须是 enchant/hunspell 那套 `语言_地区`**（`zh_CN` 而不是 `zh-CN`）——
 * WebKitGTK 拿这些字符串去 `enchant_broker_dict_exists()` 查词典，写成连字符时
 * 查不到，而症状是**一个字都不检查**（理由与出处见 `commands/webview.rs` 文件头）。
 *
 * ⚠️ 这里**只是候选**，不是"这台机器上装着的词典"——WebKitGTK 没有枚举词典的接口
 * （`docs/10` 那一行记着）。表里没有的语言走「自定义」自己敲，比如 `ca_ES`。
 *
 * ⚠️ 名字**用英文**（不写汉语/日语那种本地写法）：界面文案的主语言是英语，
 * 而 `tools/i18n-check.sh` 第 ④ 栏不许代码里出现中文界面文字（见 `src/i18n/index.ts`
 * 文件头）。这些是专有名词，不进 `t()`。
 */
const 语言候选: ReadonlyArray<{ value: string; label: string }> = [
  { value: "en_US", label: "English (US)" },
  { value: "en_GB", label: "English (UK)" },
  { value: "zh_CN", label: "Chinese (Simplified)" },
  { value: "zh_TW", label: "Chinese (Traditional)" },
  { value: "ja_JP", label: "Japanese" },
  { value: "ko_KR", label: "Korean" },
  { value: "fr_FR", label: "French" },
  { value: "de_DE", label: "German" },
  { value: "es_ES", label: "Spanish" },
  { value: "pt_BR", label: "Portuguese (Brazil)" },
  { value: "ru_RU", label: "Russian" },
  { value: "it_IT", label: "Italian" },
  { value: "nl_NL", label: "Dutch" },
  { value: "pl_PL", label: "Polish" },
  { value: "tr_TR", label: "Turkish" },
  { value: "sv_SE", label: "Swedish" },
];

export function EditorPane({ settings, onChange }: PaneProps) {
  // 订阅语言（宿主报来语言之后这一块要重画，见 `i18n/index.ts::useT`）。
  // 局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const 写 = paneWriter(settings, onChange, "editor");
  const e = settings.editor;
  /**
   * 用户是不是在下拉里挑了「自定义」。
   *
   * ⚠️ 光看"这个值在不在候选表里"不够：点了「自定义」那一刻值还没变
   * （要等用户敲字），而那时输入框就得已经出现——所以除了下面那条**推导出来**的
   * 判据，还需要这一格**记下来**的状态。
   */
  const [自定义, 设自定义] = useState(false);
  const 不在候选里 =
    e.spellcheck_lang !== "" && !语言候选.some((o) => o.value === e.spellcheck_lang);
  const 用自定义 = 自定义 || 不在候选里;

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
          <SettingRow label={t("Language")}>
            <Select
              value={用自定义 ? 自定义档 : e.spellcheck_lang}
              options={[
                { value: "", label: t("Follow the system") },
                ...语言候选,
                { value: 自定义档, label: t("Custom") },
              ]}
              onChange={(值) => {
                if (值 === 自定义档) {
                  设自定义(true);
                  return;
                }
                设自定义(false);
                写({ spellcheck_lang: 值 });
              }}
            />
          </SettingRow>
        )}
        {e.spellcheck && 用自定义 && (
          <SettingRow label={t("Language tag")}>
            {/* ⚠️ `placeholder` 里那个例子就是格式本身（`en_US`）：这一格填错了
                不会报错，只会静默地什么也不检查，所以格式得当场看得见。 */}
            <TextInput
              value={e.spellcheck_lang}
              placeholder="en_US"
              onChange={(spellcheck_lang) => 写({ spellcheck_lang })}
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
