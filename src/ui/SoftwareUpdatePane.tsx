/**
 * 「关于 → 软件更新」。
 *
 * 更新命令由宿主执行；前端不能交 URL，也不能选择资产。页面只展示宿主判定后的
 * 安装类型、可用版本与结果。实验阶段默认手动触发安装，避免用户启动应用时
 * 突然被提权或替换文件。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

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
  const [result, setResult] = useState<string | null>(null);
  const [progress, setProgress] = useState<UpdateDownloadProgress | null>(null);
  const 安装中 = useRef(false);
  const 百分比 =
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
    let 退订: (() => void) | undefined;
    let 活着 = true;
    void on<UpdateDownloadProgress>(events.updateProgress, setProgress).then((un) => {
      if (活着) 退订 = un;
      else un();
    });
    return () => {
      活着 = false;
      退订?.();
    };
  }, []);

  const install = useCallback(async () => {
    if (安装中.current) return;
    安装中.current = true;
    setInstalling(true);
    setError(null);
    setProgress(null);
    try {
      const installed = await api.update.install();
      setResult(installed.message);
    } catch (e) {
      setError(String(e));
    } finally {
      安装中.current = false;
      setInstalling(false);
    }
  }, []);

  if (checking && status === null) {
    return <p className="about-lead">{t("Checking for updates…")}</p>;
  }

  return (
    <>
      <p className="about-lead">
        {t(
          "Application updates are experimental. Nota verifies the published SHA-256 digest before handing a package to the operating system.",
        )}
      </p>

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
              <td>{安装说明(status.packageKind, t).label}</td>
            </tr>
            <tr>
              <th scope="row">{t("Update method")}</th>
              <td>
                {status.packageKind === "dev" ? (
                  <code className="update-command">{status.installCommand}</code>
                ) : (
                  安装说明(status.packageKind, t).action
                )}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {status?.notes && <p className="about-update-notes">{status.notes}</p>}

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
            aria-valuenow={百分比 ?? undefined}
          >
            <span
              style={
                百分比 !== null
                  ? { width: `${百分比}%` }
                  : undefined
              }
            />
          </div>
          <div className="about-update-progress-head">
            <p className="about-lead">
              {progress?.phase === "installing"
                ? t("Download complete. Installing the update…")
                : 百分比 !== null
                  ? t("Downloading update: {0}%", 百分比)
                  : t("Downloading update…")}
            </p>
            {progress && progress.phase !== "installing" && 百分比 !== null && (
              <span className="about-update-progress-size">
                {字节(progress.downloaded)} / {字节(progress.total)}
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

function 字节(值: number | null | undefined): string {
  if (!值 || 值 <= 0) return "0 B";
  const 单位 = ["B", "KB", "MB", "GB"];
  const 档 = Math.min(单位.length - 1, Math.floor(Math.log(值) / Math.log(1024)));
  const 数 = 值 / 1024 ** 档;
  return `${数 >= 10 || 档 === 0 ? 数.toFixed(0) : 数.toFixed(1)} ${单位[档]}`;
}

function 安装说明(
  kind: UpdatePackageKind,
  t: (原文: string, ...参数: (string | number)[]) => string,
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
