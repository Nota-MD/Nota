







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

  limit_text_width: boolean;
  confirm_unsaved: boolean;
  autosave_seconds: number;

  strict_markdown: boolean;

  enable_physics: boolean;

  files: FilesSettings;
  editor: EditorSettings;
  image: ImageSettings;
  markdown: MarkdownSettings;
  export: ExportSettings;
  appearance: AppearanceSettings;
  general: GeneralSettings;
  download: DownloadSettings;

  updates: UpdateSettings;

  focus: FocusSettings;

  document: DocumentSettings;

  keys: KeysSettings;
}
