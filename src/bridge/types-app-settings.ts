/**
 * 整份 `Settings` 的根形状。
 *
 * 2026-10-21 从 `types.ts` 拆出：那一份再次超过 1000 行硬线。这里只描述
 * `settings.toml` 的顶层对象，分页表仍在 `types-settings.ts`；两者通过
 * `types.ts` 的再导出对调用方保持透明。
 */

import type {
  DocumentSettings,
  FocusSettings,
  KeysSettings,
  UiMode,
  UiStyle,
} from "./types";
import type {
  AppearanceSettings,
  DownloadSettings,
  EditorSettings,
  ExportSettings,
  FilesSettings,
  GeneralSettings,
  ImageSettings,
  MarkdownSettings,
  UpdateSettings,
} from "./types-settings";

export interface Settings {
  ui_style: UiStyle;
  ui_mode: UiMode;
  document_theme: string;
  ui_font_size: number;
  content_width: number;
  /** 只有开着时 `content_width` 才生效。默认关＝正文铺满编辑区。 */
  limit_text_width: boolean;
  confirm_unsaved: boolean;
  autosave_seconds: number;
  /** 严格 Markdown：ATX 标题的井号后必须有空格。 */
  strict_markdown: boolean;
  /** KaTeX 的 physics 宏。默认关，避免改变既有公式语义。 */
  enable_physics: boolean;

  files: FilesSettings;
  editor: EditorSettings;
  image: ImageSettings;
  markdown: MarkdownSettings;
  export: ExportSettings;
  appearance: AppearanceSettings;
  general: GeneralSettings;
  download: DownloadSettings;
  /** 「更新设置」页。见 `settings/updates.rs`。 */
  updates: UpdateSettings;
  /** 强制专注。见 `settings/focus.rs`。 */
  focus: FocusSettings;
  /** 文档主题里的行距、段距、字体与字号覆盖项。 */
  document: DocumentSettings;
  /** 快捷键覆盖表；只存与默认值的差量。 */
  keys: KeysSettings;
}
