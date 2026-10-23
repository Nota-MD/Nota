/** 应用内文件选择器的请求队列。 */

import { api } from "@/bridge/ipc";

export interface FileFilter {
  name: string;
  extensions: string[];
}

export type FilePickerMode = "open" | "save" | "directory";

export interface FilePickerRequest {
  title?: string;
  mode: FilePickerMode;
  defaultPath?: string;
  filters?: FileFilter[];
  confirmLabel?: string;
  multiple?: boolean;
  directory?: boolean;
}

interface Pending {
  request: FilePickerRequest;
  resolve: (path: string | null) => void;
}

let pending: Pending | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

function pickInApp(request: FilePickerRequest): Promise<string | null> {
  pending?.resolve(null);
  return new Promise((resolve) => {
    pending = { request, resolve };
    emit();
  });
}

/**
 * 先问系统原生选择器。GNOME/KDE 的搜索、最近文件与书签，以及 Windows 的
 * 常用位置都由操作系统负责；只有这次 IPC 本身失败时才打开应用内回退。
 * 用户点取消会正常返回 `null`，不会再弹第二层选择器。
 */
export async function pickFile(request: FilePickerRequest): Promise<string | null> {
  try {
    const paths = await api.picker.native({
      mode: request.mode,
      title: request.title,
      defaultPath: request.defaultPath,
      filters: request.filters,
      multiple: request.multiple,
    });
    return paths?.[0] ?? null;
  } catch (error) {
    console.warn("[nota] Native file dialog unavailable; using in-app picker.", error);
    return pickInApp(request);
  }
}

export function subscribeFilePicker(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function currentFilePicker(): Pending | null {
  return pending;
}

export function settleFilePicker(path: string | null): void {
  const current = pending;
  if (!current) return;
  pending = null;
  emit();
  current.resolve(path);
}

export const openFile = (options: Omit<FilePickerRequest, "mode">) =>
  pickFile({ ...options, mode: "open" });

export const saveFile = (options: Omit<FilePickerRequest, "mode">) =>
  pickFile({ ...options, mode: "save" });

export const chooseDirectory = (options: Omit<FilePickerRequest, "mode"> = {}) =>
  pickFile({ ...options, mode: "directory" });

/** `@tauri-apps/plugin-dialog` 兼容入口；内部永远走应用内选择器。 */
export const open = (options: Omit<FilePickerRequest, "mode"> = {}) =>
  options.directory ? chooseDirectory(options) : openFile(options);

/** `@tauri-apps/plugin-dialog` 兼容入口；内部永远走应用内选择器。 */
export const save = (options: Omit<FilePickerRequest, "mode"> = {}) =>
  saveFile(options);

export function pathDirectory(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  if (normalized === "/" || /^[A-Za-z]:\/$/.test(normalized)) return path;
  if (/^\/\/[^/]+\/[^/]+$/.test(normalized)) return path;
  const cut = normalized.lastIndexOf("/");
  if (cut < 0) return "";
  if (cut === 0) return "/";
  const directory = path.slice(0, cut);
  return /^[A-Za-z]:$/.test(directory) ? `${directory}\\` : directory;
}

export function pathBase(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

export function joinPath(directory: string, name: string): string {
  const separator = directory.includes("\\") && !directory.includes("/") ? "\\" : "/";
  if (directory.endsWith("/") || directory.endsWith("\\")) return `${directory}${name}`;
  return `${directory}${separator}${name}`;
}

export function parentPath(path: string): string | null {
  const dir = pathDirectory(path);
  return !dir || dir === path ? null : dir;
}

/** 文件名是否命中选择器中的任一筛选组；`*` 表示不过滤。 */
export function matchesFileFilters(name: string, filters: FileFilter[]): boolean {
  if (!filters.length) return true;
  const lower = name.toLowerCase();
  return filters.some((filter) =>
    filter.extensions.some((extension) => {
      const normalized = extension.trim().toLowerCase().replace(/^\*\./, "").replace(/^\./, "");
      return normalized === "*" || lower.endsWith(`.${normalized}`);
    }),
  );
}

/**
 * 保存框最终写出的路径。
 *
 * 文件名没有可识别后缀时补第一个具体筛选后缀；`All files (*)` 这类通配筛选
 * 不参与补全。这样设置包的 `nota-backup, zip` 也会得到 `.nota-backup`，而不是
 * 一个只有基础名的文件。
 */
export function resolveSavePath(
  directory: string,
  fileName: string,
  filters: FileFilter[],
): string {
  const name = fileName.trim();
  if (!name) return "";
  const target = joinPath(directory, name);
  const base = pathBase(target);
  const dot = base.lastIndexOf(".");
  if (dot > 0 && dot < base.length - 1) return target;
  for (const filter of filters) {
    for (const extension of filter.extensions) {
      const normalized = extension
        .trim()
        .toLowerCase()
        .replace(/^\*\./, "")
        .replace(/^\./, "");
      if (normalized && normalized !== "*") return `${target}.${normalized}`;
    }
  }
  return target;
}
