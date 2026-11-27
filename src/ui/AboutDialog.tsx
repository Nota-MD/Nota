import DOMPurify from "dompurify";
import { useEffect, useRef, useState } from "react";


import { getVersion } from "@tauri-apps/api/app";


import { openUrl } from "@tauri-apps/plugin-opener";

import { api, type DistributionLegal } from "@/bridge/ipc";
import { distribution } from "@/distribution";
import { sendThanksNameSingle } from "@/ui/credits";
import type { Diagnostics } from "@/bridge/types";
import { useT } from "@/i18n";
import { DialogClose } from "@/ui/DialogClose";
import { LicenseText, licenseShortName } from "@/ui/LicenseDialog";
import { SoftwareUpdatePane } from "@/ui/SoftwareUpdatePane";


import { markRecognize, markRecognizeView } from "@/ui/nota-mark";


type AboutPage =
  | null
  | "softwareUpdate"
  | "troubleshooting"
  | "permissions"
  | "credits"
  | "legal"
  | "license";


const netStation = distribution.identity.website;
const feedback = distribution.identity.supportUrl;


interface ExternalChainLine {

  key: string;
  label: string;
  url: string;
}


interface ChildPageLine {
  key: string;
  label: string;
  page: Exclude<AboutPage, null>;
}


const emptyValue = "—";


function orDash(v: string): string {
  return v.trim() === "" ? emptyValue : v;
}

export function AboutDialog({
  onClose,
  debugMode,
  onSetDebugMode,
  presentation = "embedded",
  standalone = false,
  onOpenGuide,
}: {
  onClose: () => void;
  debugMode: boolean;
  onSetDebugMode: (enabled: boolean) => void;
  presentation?: "embedded" | "full";
  standalone?: boolean;
  onOpenGuide?: () => void;
}) {


  const t = useT();

  const [versionLocal, setVersionLocal] = useState(() => t("Unknown"));
  const [page, setPage] = useState<AboutPage>(null);

  const headOneToken = useRef<HTMLButtonElement>(null);


  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);

  const [diagnosticsFailed, setDiagnosticsFailed] = useState(false);


  const [linkError, setLinkError] = useState<string | null>(null);
  const [distributionLegal, setDistributionLegal] = useState<DistributionLegal | null>(null);
  const [distributionBranding, setDistributionBranding] = useState<{
    logo_svg: string | null;
    primary_color: string | null;
  } | null>(null);
  const versionClicks = useRef<number[]>([]);
  const [configureTryNotice, setConfigureTryNotice] = useState<string | null>(null);

  useEffect(() => {
    let returnAt = true;
    getVersion()
      .then((v) => {
        if (returnAt) setVersionLocal(v);
      })
      .catch(() => {

      });
    return () => {
      returnAt = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void api.distribution
      .branding()
      .then((value) => {
        if (alive) setDistributionBranding(value);
      })
      .catch(() => {
        if (alive) setDistributionBranding(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void api.distribution
      .legal()
      .then((value) => {
        if (alive) setDistributionLegal(value);
      })
      .catch(() => {
        if (alive) setDistributionLegal(null);
      });
    return () => {
      alive = false;
    };
  }, []);


  useEffect(() => {
    if (page !== "troubleshooting" || diagnostics !== null || diagnosticsFailed) return;
    let returnAt = true;
    api.diagnostics
      .collect()
      .then((d) => {
        if (returnAt) setDiagnostics(d);
      })
      .catch(() => {
        if (returnAt) setDiagnosticsFailed(true);
      });
    return () => {
      returnAt = false;
    };
  }, [page, diagnostics, diagnosticsFailed]);


  useEffect(() => {
    const keypress = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();


      onClose();
    };
    window.addEventListener("keydown", keypress);
    return () => window.removeEventListener("keydown", keypress);
  }, [onClose]);


  useEffect(() => {
    headOneToken.current?.focus();
  }, [page]);


  const sendThanks = sendThanksNameSingle(t);
  const distributionNotice = distributionLegal?.notice
    ? DOMPurify.sanitize(distributionLegal.notice, {
        FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "link", "meta"],
        FORBID_ATTR: ["srcdoc"],
      })
    : "";
  const distributionLogo = distributionBranding?.logo_svg
    ? DOMPurify.sanitize(distributionBranding.logo_svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
      })
    : "";


  const rightLimit: readonly { name3: string; description: string }[] = [
    {
      name3: t("Managing its own window"),
      description: t(
        "Dragging the window, changing the title-bar text, the full-screen toggle, page zoom, and opening the developer tools (core:window:* and core:webview:* in capabilities/default.json). These apply only to Nota's own window; they cannot touch other applications.",
      ),
    },
    {
      name3: t("File and folder selection"),
      description: t(
        "Open files, Save As and folder selection use Nota's in-app file picker. The app reads only the directory listing you navigate and the path you confirm.",
      ),
    },
    {
      name3: t("Open links with the default application"),
      description: t(
        "Handing external links in the document to the system (opener:allow-open-url ＋ opener:allow-default-urls, which only lets http, https, mailto and tel through); no web page is ever opened inside Nota.",
      ),
    },
    {
      name3: t("Reading images under your home folder (read-only)"),
      description: t(
        "Image files in the home, Documents, Desktop, and Downloads folders can be read and displayed in a document (assetProtocol.scope). Note: this range is wider than the opened folder because images may use any absolute path. Files are read as images only and are never written, modified, or transmitted.",
      ),
    },
    {
      name3: t("The interface layer cannot go online on its own"),
      description: t(
        "The content security policy allows connect-src only for itself and internal IPC (tauri.conf.json's csp), so even if someone slipped code into the interface, it could not send a request.",
      ),
    },
    {
      name3: t("Reading and writing the files and folders you open"),
      description: t(
        "Open, edit, save, and Save As. Within a workspace folder, file changes are also monitored (inotify) so changes made by another program can be reported. Only the opened folder is monitored.",
      ),
    },
    { name3: t("Clipboard"), description: t("Copy, cut, and paste.") },
    {
      name3: t("Starting external processes"),
      description: t(
        "Export formats use pandoc when installed; the Git extension uses git; Force Focus uses a system notification sound when an alarm is triggered (canberra-gtk-play or aplay). These processes are short-lived and do not remain resident.",
      ),
    },
    {
      name3: t("Networking (only when you have configured it)"),
      description: t(
        "Only an extension you have enabled that explicitly asks for the nota.http capability, and only to an address that passes its own allowlist, will make a network request. The core features themselves send nothing.",
      ),
    },
    {
      name3: t("The three things Force Focus uses"),
      description: t(
        "① Detecting whether Nota's own window is active; ② displaying a full-screen, always-on-top window; ③ playing a sound. These capabilities are used only after selecting View → Force Focus. Force Focus does not read the keyboard, capture screenshots, or inspect other applications.",
      ),
    },
  ];


  const pageMarkTitle: Record<Exclude<AboutPage, null>, string> = {
    softwareUpdate: t("Software Update"),
    troubleshooting: t("Troubleshooting"),
    permissions: t("Permissions"),
    credits: t("Credits"),
    legal: t("Legal"),
    license: t("{0} License", licenseShortName),
  };

  const ChildPageLine: readonly ChildPageLine[] = [
    { key: "u", label: t("Software Update"), page: "softwareUpdate" },
    { key: "t", label: t("Troubleshooting"), page: "troubleshooting" },
    { key: "p", label: t("Permissions"), page: "permissions" },
    { key: "c", label: t("Credits"), page: "credits" },
    { key: "l", label: t("Legal"), page: "legal" },
  ];


  const ExternalChainLine: readonly ExternalChainLine[] = [
    { key: "w", label: t("Website"), url: netStation },
    { key: "r", label: t("Report an Issue"), url: feedback },
  ].filter((line3) => line3.url !== "");


  const editTranslateLine: readonly (readonly [string, string])[] = diagnostics
    ? [
        ["Package version", orDash(diagnostics.version)],


        ["Build time", new Date(diagnostics.build_time * 1000).toISOString()],
        ["Build host", orDash(diagnostics.build_host)],
        ["Build platform", orDash(diagnostics.build_platform)],
        ["Target triple", orDash(diagnostics.target)],
        ["Build profile", orDash(diagnostics.profile)],
        ["rustc", orDash(diagnostics.rustc)],
        ["cargo", orDash(diagnostics.cargo)],
        ["node", orDash(diagnostics.node)],
        ["npm", orDash(diagnostics.npm)],
        ["tauri", orDash(diagnostics.tauri)],
        ["webkit2gtk", orDash(diagnostics.webkit_crate)],
        ["gtk", orDash(diagnostics.gtk_crate)],
        ["mlua", orDash(diagnostics.mlua)],
      ]
    : [];


  const localMachineLine: readonly (readonly [string, string])[] = diagnostics
    ? [
        ["Operating system", orDash(diagnostics.os_pretty)],
        ["Kernel", orDash(diagnostics.kernel)],
        ["Architecture", orDash(diagnostics.arch)],
        ...(/Windows/i.test(navigator.userAgent)
          ? ([
              [
                "WebView2",
                orDash(/(?:Edg|WebView2)\/([\d.]+)/i.exec(navigator.userAgent)?.[1] ?? ""),
              ],
            ] as const)
          : []),
        ...(/Linux|X11/i.test(navigator.userAgent) && !/Windows/i.test(navigator.userAgent)
          ? ([
              ["GTK runtime", orDash(diagnostics.gtk_runtime)],
              ["WebKitGTK runtime", orDash(diagnostics.webkit_runtime)],
            ] as const)
          : []),
      ]
    : [];


  const valueTable = (line3: readonly (readonly [string, string])[]) => (
    <table className="about-table">
      <tbody>
        {line3.map(([label, value2]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{value2}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  type LineRecordNumber = "next" | "external" | "back";


  const lineShell = (
    line3: { key: string; label: string },
    recordNumber: Exclude<LineRecordNumber, "back">,
    point: () => void,
  ) => (
    <button type="button" className="about-row" accessKey={line3.key} onClick={point}>
      <span className="about-row-label">
        {line3.label}
        {
                                                      }
        <span className="about-row-key">({line3.key.toUpperCase()})</span>
      </span>
      <span className={`about-mark about-mark-${recordNumber}`} aria-hidden="true" />
    </button>
  );

  return (
    <>

      <div
        className="confirm-backdrop"
        data-window-presentation={presentation}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="confirm-dialog about-dialog"
          data-window-presentation={presentation}
          data-window-standalone={standalone || undefined}
          role="dialog"
          aria-modal="true"
          aria-label={t("About {0}", distribution.identity.productName)}
        >

          {!standalone && (
            <DialogClose ref={page === null ? headOneToken : undefined} onClose={onClose} />
          )}

          {page === null ? (
            <div className="about-home">





              {distributionLogo ? (
                <div
                  className="about-icon about-custom-icon"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: distributionLogo }}
                />
              ) : (
                <svg
                  className="about-icon"
                  width={128}
                  height={128}
                  viewBox={markRecognizeView}
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: markRecognize(0, 0, 1254, "about") }}
                />
              )}


              <div
                className="about-name"
                role="img"
                aria-label={distribution.identity.productName}
              />





              <div className="about-developer">{distribution.identity.publisher}</div>
              <button
                type="button"
                className="about-version"
                title={t("Version")}
                onClick={() => {
                  const now = Date.now();
                  versionClicks.current = versionClicks.current.filter((time) => now - time < 2500);
                  versionClicks.current.push(now);
                  if (versionClicks.current.length < 5) return;
                  versionClicks.current = [];
                  const enable = !debugMode;
                  onSetDebugMode(enable);
                  setConfigureTryNotice(
                    enable ? t("Developer mode enabled.") : t("Developer mode disabled."),
                  );
                }}
              >
                {versionLocal}
              </button>
              {configureTryNotice && (
                <div className="about-debug-hint" role="status">
                  {configureTryNotice}
                </div>
              )}


              {ExternalChainLine.length > 0 && (
                <div className="about-rows">
                  {ExternalChainLine.map((line3) =>
                    lineShell(line3, "external", () => {
                      void openUrl(line3.url).catch(() => {


                      });
                    }),
                  )}
                </div>
              )}

              {onOpenGuide && (
                <div className="about-rows">
                  {lineShell({ key: "g", label: t("Getting started") }, "next", onOpenGuide)}
                </div>
              )}

              <div className="about-rows">
                {ChildPageLine.map((line3) => lineShell(line3, "next", () => setPage(line3.page)))}
              </div>
            </div>
          ) : (
            <div className="about-page">
              <div className="about-page-head">
                <button
                  type="button"
                  className="about-back"
                  ref={headOneToken}
                  onClick={() => setPage(page === "license" ? "legal" : null)}
                >
                  <span className="about-mark about-mark-back" aria-hidden="true" />
                  {t("Back")}
                </button>
                <span className="about-page-title">{pageMarkTitle[page]}</span>
              </div>

              <div className="about-page-body">
                {page === "softwareUpdate" && <SoftwareUpdatePane />}

                {page === "troubleshooting" && (
                  <>
                    {diagnosticsFailed ? (
                      <p className="about-lead">{t("Could not read the information.")}</p>
                    ) : diagnostics === null ? (
                      <p className="about-lead">{t("Loading…")}</p>
                    ) : (
                      <>
                        <div className="about-sub">Build information</div>
                        {valueTable(editTranslateLine)}
                        <div className="about-sub">This machine</div>
                        {valueTable(localMachineLine)}
                      </>
                    )}
                  </>
                )}

                {page === "permissions" && (
                  <table className="about-table about-table-2col">
                    <thead>
                      <tr>
                        <th>{t("Permission")}</th>
                        <th>{t("Notes")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rightLimit.map((item4) => (
                        <tr key={item4.name3}>
                          <td className="about-cell-name">{item4.name3}</td>
                          <td>{item4.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {page === "credits" &&
                  sendThanks.map((item4) => (
                    <div className="about-item" key={item4.name3}>
                      <div className="about-item-name">

                        <button
                          type="button"
                          className="about-link"
                          title={item4.link}
                          onClick={() => {

                            setLinkError(null);
                            void openUrl(item4.link).catch((e) => {

                              setLinkError(t("Could not open the link: {0}", String(e)));
                            });
                          }}
                        >
                          {item4.name3}
                        </button>
                      </div>
                      <div className="about-item-text">{item4.purpose}</div>
                      <div className="about-item-text about-item-license">{item4.license}</div>
                    </div>
                  ))}


                {page === "credits" && linkError && (
                  <div className="about-item-text about-err">{linkError}</div>
                )}

                {page === "legal" && (
                  <>
                    <div className="about-item">
                      <div className="about-item-name">
                        <button
                          type="button"
                          className="about-link"
                          onClick={() => setPage("license")}
                        >
                          {t("{0} License", licenseShortName)}
                        </button>
                      </div>
                      <div className="about-item-text">
                        {distributionLegal?.copyright ?? "Copyright (c) 2026, Leo Lee"}
                      </div>
                    </div>
                    {distributionLegal?.distribution_license && (
                      <section className="about-item about-distribution-legal">
                        <h3>{t("Distribution terms")}</h3>
                        <pre className="lic-text">{distributionLegal.distribution_license}</pre>
                      </section>
                    )}
                    {distributionNotice && (
                      <section className="about-item about-distribution-legal">
                        <h3>{t("Distribution notice")}</h3>
                        <div
                          className="about-item-text"
                          dangerouslySetInnerHTML={{ __html: distributionNotice }}
                        />
                      </section>
                    )}
                  </>
                )}


                {page === "license" && (
                  <div className="about-license-text">
                    <LicenseText />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
