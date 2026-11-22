



















export type DocId = number;

export interface Document {
  id: DocId;
  path: string | null;
  title: string;
  text: string;

  draft_id: string;

  encoding: string;

  line_ending: string;
  dirty: boolean;
  revision: number;
}


export interface DraftInfo {
  id: string;
  path: string | null;
  title: string;
  updated_at: number;
}










export type PathKindClass = "dir" | "file" | "missing";










export interface CombineWriteWordDictionary {

  tag: string;
  comeSource: "user" | "system";

  itemRecord: string;
}










export interface TreeNode {
  name: string;

  path: string;
  is_dir: boolean;
  children: TreeNode[] | null;
}


export interface WorkspaceExcerpt {
  path: string;
  title: string | null;
  detail: string | null;
}


export interface PickerPlace {
  kind: string;
  path: string;
}


export interface PickerEntry {
  name: string;
  path: string;
  isDir: boolean;
  isSymlink: boolean;
  size: number;
  modifiedMs: number | null;
  hidden: boolean;
}












export interface TreeOptions {
  sort?: TreeSort;
  filter?: FileFilter;
  showHidden?: boolean;
}










export interface MeetingSpeech {

  open: string[];

  active: string | null;

  recent: string[];

  scroll: Record<string, number>;







  workspace: string | null;

  file: string | null;
}














export type BuiltinUiStyle = "adwaita";













export type UiStyle = BuiltinUiStyle | (string & {});







export interface UiStyleInfo {

  id: string;





  builtin: boolean;
}
export type UiMode = "auto" | "light" | "dark";




















export type ViewMode = "wysiwyg" | "source" | "split";

import type { PandocImportFormatInfo } from "./types-runtime";
export type { PandocImport, UpdateDownloadProgress } from "./types-runtime";









export type PandocProbeState = "ready" | "missing" | "unknown";






export interface PandocFormatInfo {

  id: string;

  name: string;

  extension: string;
}


export interface PandocProbe {
  state: PandocProbeState;

  command: string;

  version: string | null;

  message: string;

  detail: string;






  pdf_engine: string | null;

  fallback_pdf: boolean;

  formats: PandocFormatInfo[];

  import_formats: PandocImportFormatInfo[];
}


export type PandocRoute = "pandoc" | "nota";


export interface PandocExport {

  path: string;
  route: PandocRoute;

  note: string;
}





import type {
  FileFilter,
  TreeSort,
} from "./types-settings";

export * from "./types-app-settings";













export interface KeysSettings {
  overrides: Record<string, string>;
}


export type DocFont = "sans" | "serif" | "mono";













export interface DocumentSettings {

  custom_line_height: boolean;

  line_height: number;

  custom_paragraph_gap: boolean;

  paragraph_gap: number;

  custom_font: boolean;

  font: DocFont;

  custom_font_size: boolean;

  font_size: number;
}







export interface FocusSettings {

  total_minutes: number;

  alarm_minutes: number;

  gain_per_minute: number;

  drain_per_minute: number;

  grace_seconds: number;

  sound: boolean;

  introduced: boolean;
}







export interface FocusState {

  running: boolean;

  balance_ms: number;

  cap_ms: number;







  phase: "focusing" | "away" | "alarm";

  away_ms: number;

  grace_ms: number;

  elapsed_ms: number;

  focused_ms: number;

  away_total_ms: number;

  alarms: number;
}











export * from "./types-settings";


export type UpdatePackageKind =
  | "deb"
  | "rpm"
  | "appimage"
  | "exe"
  | "exeinstall"
  | "dev";


export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string;
  packageKind: UpdatePackageKind;
  available: boolean;
  canInstall: boolean;
  releaseUrl: string;
  notes: string;
  assetName: string | null;
  installCommand: string;
}


export interface UpdateInstallResult {
  message: string;
  restartRequired: boolean;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  api: string;
  host_api: string;
  api_supported: boolean;
  description: string;
  authors: string[];
  license: string;
  capabilities: string[];
  entry: string;
  dir: string;
  state: "loaded" | "failed" | "disabled";
  error: string | null;







  origin: "builtin" | "user";







  signature: "verified" | "unknown" | "unsigned" | null;

  key_id: string | null;

  removable: boolean;




  langs: string[];




  lang: string | null;







  lang_ok: boolean;







  settings: PluginSetting[];

  setting_locks: string[];
}


export interface PluginUpdateInfo {
  id: string;
  name: string;
  currentVersion: string;
  latestVersion: string | null;
  available: boolean;
  assetName: string | null;
  notes: string;
  error: string | null;
}


export interface PluginUpdateResult {
  id: string;
  fromVersion: string;
  toVersion: string;
}















export interface PluginSetting {

  key: string;

  kind: "range" | "text" | "toggle";

  label: string;

  help: string;
  min: number;
  max: number;
  step: number;

  unit: string;

  value: number;

  text: string;

  on: boolean;

  secret: boolean;

  placeholder: string;

  multiline: boolean;
}







export interface AppLang {

  setting: string;

  effective: string;





  available: { tag: string; label: string }[];
}


export interface trustRecord {
  key_id: string;

  name: string;
}







export interface exportReport {
  id: string;

  files: number;

  bytes: number;











  signature: "kept" | "dropped" | "none";

  path: string;
}




export interface PluginPanel {

  plugin: string;

  id: string;
  title: string;
  icon: string | null;











  location: string;








  wide: boolean;












  live: boolean;
}


export interface PluginPanelFocusPayload {
  plugin: string;
  id: string;
}




















export type PluginReview = PluginReviewPanel | PluginReviewDiff;







export interface PluginReviewPanel {
  kind: "panel";

  plugin: string;

  panel: string;
}










export interface PluginReviewDiff {
  kind: "diff";
  plugin: string;

  title: string;

  text: string;






  accept: PluginReviewAction | null;

  reject: PluginReviewAction | null;
}


export interface PluginReviewAction {

  label: string;

  command: string;
}








export interface PluginMenuItem {
  plugin: string;
  label: string;

  command: string;
  menu: string;
  accelerator: string | null;








  prompt: PluginPrompt | null;
}












export interface PluginPrompt {

  arg: string;

  label: string;
  placeholder: string;
  hint: string;






  secret: boolean;

  secondArg: string;
  secondLabel: string;
  secondPlaceholder: string;
}







export interface DocThemeInfo {

  id: string;

  name: string;

  builtin: boolean;
}


export interface ThemeImportReport {
  ui: string[];
  document: string[];
}







export interface NativeMenuNode {

  sep?: boolean;
  id?: string;
  label?: string;

  accel?: string;
  enabled?: boolean;

  checked?: boolean;
  submenu?: NativeMenuNode[];
}








export * from "./payloads";










export interface DiffLine {

  op: "ctx" | "add" | "del" | "hunk";

  text: string;
}













export interface Diagnostics {


  version: string;

  build_time: number;
  build_host: string;

  build_platform: string;

  target: string;

  profile: string;

  rustc: string;
  cargo: string;
  node: string;
  npm: string;

  tauri: string;
  webkit_crate: string;
  gtk_crate: string;
  mlua: string;


  os_pretty: string;
  kernel: string;
  arch: string;

  gtk_runtime: string;
  webkit_runtime: string;
}

export interface WindowRegistrySnapshot {
  id: number;
  ids: number[];
  pickerActive: boolean;
}

export interface WindowTransferRequest {
  requestId: string;
  sourceId: number;
  path: string | null;
  text: string | null;
  titleHint: string | null;
  focusTarget: boolean;
}







export interface PrinterInfo {
  name: string;
  description: string;
  is_default: boolean;
}


export interface PrintEnvironment {

  cups_available: boolean;

  problem: string | null;
  printers: PrinterInfo[];
}









export interface PrintPreview {

  pdf: string;

  engine: string;
  page_count: number;
  pages: string[];
  truncated: boolean;
}








export type PrintBackend = "pdf" | "browser";

export * from "./types-table";
