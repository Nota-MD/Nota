

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


export const open = (options: Omit<FilePickerRequest, "mode"> = {}) =>
  options.directory ? chooseDirectory(options) : openFile(options);


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
