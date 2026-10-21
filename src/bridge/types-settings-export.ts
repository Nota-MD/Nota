/** 可选择设置包（`.nota-backup`，标准 ZIP）的 IPC 形状。 */

export interface SettingsExportItem {
  id: string;
  available: boolean;
  files: number;
  bytes: number;
  sensitive: boolean;
}

export interface PluginSettingsExportItem {
  id: string;
  name: string;
  settings_bytes: number;
  data_files: number;
  data_bytes: number;
}

export interface SettingsExportInventory {
  program: SettingsExportItem[];
  plugins: PluginSettingsExportItem[];
}

export interface PluginSettingsExportChoice {
  id: string;
  settings: boolean;
  data: boolean;
}

export interface SettingsExportRequest {
  destination: string;
  include: string[];
  plugins: PluginSettingsExportChoice[];
}

export interface SettingsExportReport {
  path: string;
  files: number;
  bytes: number;
  skipped_symlinks: number;
}
