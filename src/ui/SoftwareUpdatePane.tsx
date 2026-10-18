/**
 * 「关于 → 软件更新」。
 *
 * 更新命令由宿主执行；前端不能交 URL，也不能选择资产。页面只展示宿主判定后的
 * 安装类型、可用版本与结果。实验阶段默认手动触发安装，避免用户启动应用时
 * 突然被提权或替换文件。
 */

import { useCallback, useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

import { api, type UpdatePackageKind, type UpdateStatus } from "@/bridge/ipc";
import { useT } from "@/i18n";

export function SoftwareUpdatePane() {
  const t = useT();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<string | null>(null);

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
    void check();
  }, [check]);

  const install = async () => {
    setInstalling(true);
    setError(null);
    try {
      const installed = await api.update.install();
      setResult(installed.message);
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(false);
    }
  };

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

      <div className="about-update-actions">
        <button type="button" className="btn" disabled={checking || installing} onClick={() => void check()}>
          {checking ? t("Checking…") : t("Check Again")}
        </button>
        {status?.canInstall && (
          <button type="button" className="btn btn-primary" disabled={installing} onClick={() => void install()}>
            {installing ? t("Installing…") : t("Download and Install")}
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
