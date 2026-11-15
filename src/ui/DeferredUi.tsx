/**
 * 只在真正打开时才加载的大型界面。
 *
 * 设置十页与右侧拓展栏都不参与“主窗口首帧可编辑”。把它们从入口 chunk 拆出，
 * 用户第一次打开对应界面时再取；`Suspense` 的空白时长是一次本地模块读取。
 */

import { lazy, Suspense, useEffect, useState, useSyncExternalStore, type ComponentProps } from "react";

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
const LazyAboutDialog = lazy(() =>
  import("@/ui/AboutDialog").then((m) => ({ default: m.AboutDialog })),
);
const LazyFirstRunGuide = lazy(() =>
  import("@/ui/FirstRunGuide").then((m) => ({ default: m.FirstRunGuide })),
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

export function DeferredPluginDock({ open, ...props }: DockProps & { open: boolean }) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <LazyPluginDock {...props} collapsed={!open} />
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

export function DeferredAboutDialog(
  props: ComponentProps<(typeof import("@/ui/AboutDialog"))["AboutDialog"]>,
) {
  return (
    <Suspense fallback={null}>
      <LazyAboutDialog {...props} />
    </Suspense>
  );
}

export function DeferredFirstRunGuide(
  props: ComponentProps<(typeof import("@/ui/FirstRunGuide"))["FirstRunGuide"]>,
) {
  return (
    <Suspense fallback={null}>
      <LazyFirstRunGuide {...props} />
    </Suspense>
  );
}
