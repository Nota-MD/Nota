/**
 * 「关于 → 软件更新」。
 *
 * 更新命令由宿主执行；前端不能交 URL，也不能选择资产。页面只展示宿主判定后的
 * 安装类型、可用版本与结果。实验阶段默认手动触发安装，避免用户启动应用时
 * 突然被提权或替换文件。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";

import {
  api,
  events,
  on,
  type UpdateDownloadProgress,
  type UpdatePackageKind,
  type UpdateStatus,
} from "@/bridge/ipc";
import { useT } from "@/i18n";

export function SoftwareUpdatePane({ autoCheck = true }: { autoCheck?: boolean } = {}) {
  const t = useT();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(autoCheck);
  const [installing, setInstalling] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [progress, setProgress] = useState<UpdateDownloadProgress | null>(null);
  const safeInstallMiddle = useRef(false);
  const cancelRequested = useRef(false);
  const hundredShareCompare =
    progress?.total && progress.total > 0
      ? Math.min(100, Math.max(0, Math.round((progress.downloaded / progress.total) * 100)))
      : null;

  const check = useCallback(async () => {
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      setStatus(await api.update.check());
    } catch (e) {
      setError(String(e));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (autoCheck) void check();
  }, [autoCheck, check]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let activeActive = true;
    void on<UpdateDownloadProgress>(events.updateProgress, setProgress).then((un) => {
      if (activeActive) unsubscribe = un;
      else un();
    });
    return () => {
      activeActive = false;
      unsubscribe?.();
    };
  }, []);

  const install = useCallback(async () => {
    if (safeInstallMiddle.current) return;
    safeInstallMiddle.current = true;
    setInstalling(true);
    setCanceling(false);
    cancelRequested.current = false;
    setError(null);
    setProgress(null);
    try {
      const installed = await api.update.install();
      if (installed.restartRequired) {
        setResult(t("Nota will now close and restart to finish installing the update."));
        window.setTimeout(() => {
          void getCurrentWindow().close().catch((closeError: unknown) => {
            setError(t("Could not restart Nota: {0}", String(closeError)));
          });
        }, 700);
      } else {
        setResult(installed.message);
      }
    } catch (e) {
      if (cancelRequested.current) {
        setResult(t("Update download canceled."));
      } else {
        setError(String(e));
      }
    } finally {
      safeInstallMiddle.current = false;
      setInstalling(false);
      setCanceling(false);
    }
  }, [t]);

  const cancel = useCallback(async () => {
    if (!installing || canceling) return;
    cancelRequested.current = true;
    setCanceling(true);
    setError(null);
    try {
      await api.update.cancel();
    } catch (e) {
      cancelRequested.current = false;
      setCanceling(false);
      setError(String(e));
    }
  }, [canceling, installing]);

  if (checking && status === null) {
    return <p className="about-lead">{t("Checking for updates…")}</p>;
  }

  return (
    <>
      {status && (
        <table className="about-table update-table">
          <tbody>
            <tr>
              <th scope="row">{t("Current version")}</th>
              <td>{status.currentVersion}</td>
            </tr>
            <tr>
              <th scope="row">{t("Latest version")}</th>
              <td>{status.latestVersion}</td>
            </tr>
            <tr>
              <th scope="row">{t("Installation type")}</th>
              <td>{safeInstallDescription(status.packageKind, t).label}</td>
            </tr>
            <tr>
              <th scope="row">{t("Update method")}</th>
              <td>
                {status.packageKind === "dev" ? (
                  <code className="update-command">{status.installCommand}</code>
                ) : (
                  safeInstallDescription(status.packageKind, t).action
                )}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {status?.available === false && (
        <p className="about-lead">{t("Nota is up to date.")}</p>
      )}
      {status?.available && !status.canInstall && status.packageKind !== "dev" && (
        <p className="about-err">
          {t("The update repository has no package for this installation type.")}
        </p>
      )}

      {error && <p className="about-err">{t("Update failed: {0}", error)}</p>}
      {result && <p className="about-lead">{result}</p>}

      {installing && (
        <div className="about-update-progress" aria-live="polite">
          <div
            className={`about-update-progress-track${progress?.total ? "" : " is-indeterminate"}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress?.total ? 100 : undefined}
            aria-valuenow={hundredShareCompare ?? undefined}
          >
            <span
              style={
                hundredShareCompare !== null
                  ? { width: `${hundredShareCompare}%` }
                  : undefined
              }
            />
          </div>
          <div className="about-update-progress-head">
            <p className="about-lead">
              {progress?.phase === "installing"
                ? t("Download complete. Installing the update…")
                : hundredShareCompare !== null
                  ? t("Downloading update: {0}%", hundredShareCompare)
                  : t("Downloading update…")}
            </p>
            {progress && progress.phase !== "installing" && hundredShareCompare !== null && (
              <span className="about-update-progress-size">
                {byte(progress.downloaded)} / {byte(progress.total)}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="about-update-actions">
        <button type="button" className="btn" disabled={checking || installing} onClick={() => void check()}>
          {checking
            ? t("Checking…")
            : status
              ? t("Check Again")
              : t("Check for Updates")}
        </button>
        {status?.canInstall && (
          <button type="button" className="btn btn-primary" disabled={installing} onClick={() => void install()}>
            {installing ? t("Downloading…") : t("Download and Install")}
          </button>
        )}
        {installing && progress?.phase !== "installing" && (
          <button
            type="button"
            className="btn"
            disabled={canceling}
            onClick={() => void cancel()}
          >
            {canceling ? t("Canceling…") : t("Cancel Download")}
          </button>
        )}
        {status?.releaseUrl && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              void openUrl(status.releaseUrl).catch((e) => {
                setError(t("Could not open the link: {0}", String(e)));
              });
            }}
          >
            {t("Open Release Page")}
          </button>
        )}
      </div>
    </>
  );
}

function byte(value2: number | null | undefined): string {
  if (!value2 || value2 <= 0) return "0 B";
  const singlePosition = ["B", "KB", "MB", "GB"];
  const level = Math.min(singlePosition.length - 1, Math.floor(Math.log(value2) / Math.log(1024)));
  const number2 = value2 / 1024 ** level;
  return `${number2 >= 10 || level === 0 ? number2.toFixed(0) : number2.toFixed(1)} ${singlePosition[level]}`;
}

function safeInstallDescription(
  kind: UpdatePackageKind,
  t: (source: string, ...parameter: (string | number)[]) => string,
): { label: string; action: string } {
  switch (kind) {
    case "deb":
      return {
        label: t("Debian package (.deb)"),
        action: t("Install with the system package manager after authorization."),
      };
    case "rpm":
      return {
        label: t("RPM package (.rpm)"),
        action: t("Install with the system package manager after authorization."),
      };
    case "appimage":
      return {
        label: t("AppImage"),
        action: t("Replace this AppImage after Nota exits, then restart it."),
      };
    case "exe":
      return {
        label: t("Windows portable build"),
        action: t("Extract and replace the portable application folder after Nota exits."),
      };
    case "exeinstall":
      return {
        label: t("Windows installer"),
        action: t("Run the new installer in silent overwrite mode."),
      };
    case "dev":
      return {
        label: t("Development build"),
        action: t("Rebuild from source; development builds are not replaced automatically."),
      };
  }
}
