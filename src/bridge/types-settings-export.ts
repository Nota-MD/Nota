

import type { Settings } from "./types-app-settings";

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
  package_available: boolean;
}

export interface SettingsExportInventory {
  program: SettingsExportItem[];
  plugins: PluginSettingsExportItem[];
}

export interface PluginSettingsExportChoice {
  id: string;
  settings: boolean;
  data: boolean;
  package: boolean;
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

export interface SettingsImportItem {
  id: string;
  files: number;
  bytes: number;
  sensitive: boolean;
  restart_required: boolean;
}

export interface SettingsPackageInventory {
  app_version: string;
  created_at_epoch: number;
  total_files: number;
  total_bytes: number;
  items: SettingsImportItem[];
}

export interface SettingsImportRequest {
  package: string;
  include: string[];
}

export interface SettingsImportReport {
  package: string;
  backup: string;
  files: number;
  bytes: number;
  imported: string[];
  restart_required: boolean;
  settings: Settings | null;
}
