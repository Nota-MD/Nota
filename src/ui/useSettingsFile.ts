/**
 * 设置文件的两件事：**打开它所在的文件夹**、**恢复出厂默认**
 * （从 `App.tsx` 搬出来的，2026-09-24，和 `useDocTheme.ts` 同一个理由：
 * 那个文件顶着行数上限）。
 *
 * 这两件事是「偏好设置 → 通用 → 高级设置」那一组的落点。外部编辑器那边是
 * 另开一个窗口编辑它的配置文件（对照表见 `settings/general.rs` 顶上），
 * 本仓不造第二个设置界面，改成"打开这份 TOML / 一键恢复默认"两颗按钮。
 * 摆在一起，那条决定就有一个看得见的落点。
 *
 * # ⚠️ 「恢复默认」为什么必须用后端返回的那一份
 *
 * 默认值是**后端说了算**的（`Settings::default()`），前端一个字都不知道。
 * 所以这里不能自己拼一个新对象，也不能改完再 `get` 一次：
 *
 * - 自己拼：两边各有一份默认值，改了一边另一边不跟着变，症状是"恢复默认之后
 *   有几项还是老值"——而且**只在那几项上**，看着像随机故障；
 * - 改完再 `get`：中间那一小段窗口里界面还是旧的，而且多一次往返。
 *
 * 命令把新的那一份**当返回值给出来**，这里直接拿去 `setSettings`。
 */

import { useCallback } from "react";

import { api, type Settings } from "@/bridge/ipc";
import { useT } from "@/i18n";
import type { Toast } from "@/ui/Toasts";

export interface settingsFileWiring {
  /** 把整份设置写回内存（不落盘——落盘后端已经做完了）。 */
  setSettings: (settings: Settings) => void;
  toast: (message: string, level?: Toast["level"]) => void;
}

export interface settingsFileApi {
  /** 打开设置文件所在的目录（一般是 `~/.config/nota`）。 */
  openConfigDir: () => Promise<void>;
  /** 恢复出厂默认，并把新的一份写回内存。 */
  resetSettings: () => Promise<void>;
}

export function useSettingsFile(w: settingsFileWiring): settingsFileApi {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const { setSettings, toast } = w;

  const openConfigDir = useCallback(async () => {
    try {
      // ⚠️ **不在这里拼 `~/.config/nota`、也不在这里开**：路径的取法与"打开"
      // 这一步都在后端那一条命令里（`paths.rs` 的文件头写着"路径拼接为什么
      // 不许散落各处"；"打开"为什么也得在宿主，见 `nota_settings_open_dir`
      // 那段——前端拿路径去调 plugin-opener 会撞 Tauri 的 ACL，BUG-27）。
      await api.settings.openDir();
    } catch (e) {
      toast(t("Could not open the settings folder: {0}", String(e)), "error");
    }
  }, [toast]);

  const resetSettings = useCallback(async () => {
    try {
      setSettings(await api.settings.reset());
      toast(t("Settings reset to defaults."), "success");
    } catch (e) {
      toast(t("Could not reset to defaults: {0}", String(e)), "error");
    }
  }, [setSettings, toast]);

  return { openConfigDir, resetSettings };
}
