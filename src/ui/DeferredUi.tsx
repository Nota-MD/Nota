/**
 * 只在真正打开时才加载的大型界面。
 *
 * 设置十页与右侧拓展栏都不参与“主窗口首帧可编辑”。把它们从入口 chunk 拆出，
 * 用户第一次打开对应界面时再取；`Suspense` 的空白时长是一次本地模块读取。
 */

import { lazy, Suspense, useSyncExternalStore, type ComponentProps } from "react";

import { currentFilePicker, subscribeFilePicker } from "@/ui/file-picker";

const LazySettingsDialog = lazy(() =>
  import("@/ui/settings/SettingsDialog").then((m) => ({ default: m.SettingsDialog })),
);
const LazyPluginDock = lazy(() =>
  import("@/ui/PluginDock").then((m) => ({ default: m.PluginDock })),
);
const LazyFilePickerDialog = lazy(() =>
  import("@/ui/FilePickerDialog").then((m) => ({ default: m.FilePickerDialog })),
);

type DockProps = ComponentProps<(typeof import("@/ui/PluginDock"))["PluginDock"]>;
type SettingsProps = ComponentProps<(typeof import("@/ui/settings/SettingsDialog"))["SettingsDialog"]>;

export function DeferredSettingsDialog(props: SettingsProps) {
  return (
    <Suspense fallback={null}>
      <LazySettingsDialog {...props} />
    </Suspense>
  );
}

export function DeferredPluginDock(props: DockProps) {
  return (
    <Suspense fallback={null}>
      <LazyPluginDock {...props} />
    </Suspense>
  );
}

export function DeferredFilePickerDialog() {
  const pending = useSyncExternalStore(subscribeFilePicker, currentFilePicker, currentFilePicker);
  if (!pending) return null;
  return (
    <Suspense fallback={null}>
      <LazyFilePickerDialog />
    </Suspense>
  );
}
