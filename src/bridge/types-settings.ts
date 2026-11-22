












































export type StartupAction = "new-file" | "last-file" | "last-session";


export type DropAction = "open-in-app" | "open-in-file-manager" | "ignore";


export type ImportAction = "import-file" | "open-in-file-manager" | "ignore";


export type FileFilter = "supported" | "all";








export type TreeSort = "name" | "modified" | "created";

export interface FilesSettings {
  startup: StartupAction;
  outline_collapsible: boolean;

  default_extension: string;
  autosave_on_switch: boolean;
  remember_recent: boolean;
  drop_folder: DropAction;
  drop_markdown: DropAction;
  drop_importable: ImportAction;
  show_hidden: boolean;
  tree_filter: FileFilter;






  tree_sort: TreeSort;
}


export type LineEnding = "lf" | "crlf";

export interface EditorSettings {

  default_indent: number;







  paragraph_indent: boolean;

  paragraph_indent_chars: number;

  auto_pair: boolean;

  keyboard_experience: boolean;

  spreadsheet_tables: boolean;
  emoji_autocomplete: boolean;
  line_ending: LineEnding;

  spellcheck: boolean;













  spellcheck_langs: string[];
}








export type InsertImageAction =
  | "none"
  | "copy-to-current-dir"
  | "copy-to-assets"
  | "copy-to-doc-assets"
  | "copy-to-custom";

export interface ImageSettings {
  insert_action: InsertImageAction;

  custom_dir: string;
  apply_to_local: boolean;
  apply_to_remote: boolean;





  prefer_relative: boolean;

  add_dot_slash: boolean;
  escape_url: boolean;








}











export interface ImageUploadSettings {

  enabled: boolean;




  auto: boolean;

  url: string;

  method: ImageUploadMethod;

  field: string;





  headers: string;

  url_path: string;




  remote_field: string;
}

export type ImageUploadMethod = "post" | "put";


export interface ImageUploadSnapshot {
  settings: ImageUploadSettings;





  canUpload: boolean;




  willAutoUpload: boolean;
}


export interface ImageUploaded {
  url: string;
}







export type ImageUploadOutcome =
  | { kind: "ok"; url: string }
  | { kind: "failed"; error: string };







export type ImageSourceArg =
  | { kind: "path"; path: string }
  | { kind: "url"; url: string }
  | { kind: "base64"; data: string; ext?: string | null };





export type ImageDid = "kept" | "copied" | "downloaded" | "written" | "existing";


export interface ImagePlaced {

  src: string;

  savedTo: string | null;
  did: ImageDid;





  action: InsertImageAction;





  upload: ImageUploadOutcome | null;
}

export type HeadingStyle = "atx" | "setext";
export type BulletMark = "dash" | "star" | "plus";
export type OrderedMark = "dot" | "paren";









export type SmartPunctuation = "off" | "render" | "input";
export type QuoteStyle = "curly" | "straight";
export type DashStyle = "en-em" | "em";
export type AutoLanguage = "never" | "on-markdown-insert";
export type EquationNumbering = "none" | "ams";
export type MathOutput = "svg" | "mathml";
export type WhitespaceMode = "preserve" | "preserve-all" | "as-html";

export interface MarkdownSettings {

  heading_style: HeadingStyle;
  bullet_mark: BulletMark;
  ordered_mark: OrderedMark;



  autolink: boolean;

  inline_math: boolean;
  subscript: boolean;
  superscript: boolean;
  highlight: boolean;
  github_alerts: boolean;
  diagrams: boolean;


  smart_punctuation: SmartPunctuation;
  smart_quotes: boolean;
  smart_quotes_double: QuoteStyle;
  smart_quotes_single: QuoteStyle;
  smart_dashes: boolean;
  dash_style: DashStyle;









  auto_correct: boolean;














  code_line_numbers: boolean;
  code_wrap: boolean;

  code_language_picker: boolean;
  code_shift_tab_indent: boolean;

  code_indent: number;

  code_default_language: string;
  code_auto_language: AutoLanguage;


  latex_delimiters: boolean;
  code_block_math: boolean;
  legacy_inline_math: boolean;
  equation_numbering: EquationNumbering;
  math_output: MathOutput;



  first_line_indent: boolean;
  show_br: boolean;
  whitespace_editing: WhitespaceMode;
  whitespace_export: WhitespaceMode;
}

export interface ExportSettings {

  default_folder: string;
  open_after_export: boolean;











  pandoc_args: string;





  custom_exporters: CustomExporter[];






}

export interface CustomExporter {
  id: string;
  name: string;

  format: string;
  args: string;

  base_args: string;

  style_file: string;
  open_after_export: boolean;
}







export type ToolbarMode = "always" | "hover" | "never";










export type CtrlWheelTarget = "font_size" | "zoom";











export type StatusMetric = "words" | "characters" | "lines" | "minutes";












export type FocusModeDim = "standard" | "strong" | "stronger";

export type SettingsWindowStyle = "full" | "embedded" | "external";


export type MenuBarRenderer = "nota" | "system";

export interface AppearanceSettings {

  custom_font_size: boolean;

  zoom: number;

  ctrl_wheel_zoom: boolean;

  ctrl_wheel_target: CtrlWheelTarget;
  show_status_bar: boolean;






  status_metric: StatusMetric;









  show_menu_bar: boolean;

  menu_renderer: MenuBarRenderer;

  force_nota_menu_when_expanded: boolean;

  reading_speed: number;

  toolbar: ToolbarMode;
  dark_theme_separate: boolean;

  dark_document_theme: string;











  accent: string;











  sidebar_width: number;






  dock_width: number;








  focus_mode_dim: FocusModeDim;







  show_filename_in_titlebar: boolean;

  focus_after_window_transfer: boolean;

  settings_window_style: SettingsWindowStyle;
}

export interface GeneralSettings {










  language: string;

  onboarding_seen: boolean;

  debug_mode: boolean;




  extensions_enabled: boolean;




  element_inspector: boolean;

  lua_hot_reload: boolean;




  select_ui_text: boolean;

  webview_default_shortcuts: boolean;

  dev_bridge_enabled: boolean;
  dev_bridge_port: number;
  dev_bridge_whitelist: string[];


}

export interface DevBridgeStatus {
  running: boolean;
  port: number;
  whitelist: string[];
  sessions: number;
  password_set: boolean;
}


export interface DownloadSettings {

  replacements: string;
}


export type NotificationPosition = "top-center" | "bottom-right";


export interface UpdateSettings {

  check_on_startup: boolean;

  notify_when_available: boolean;




  notification_position: NotificationPosition;
}
