import DOMPurify from "dompurify";
import { useEffect, useMemo, useRef, useState } from "react";

import { api, type DistributionLegal, type DistributionOnboarding } from "@/bridge/ipc";
import { useLanguage, useT } from "@/i18n";
import noticeEn from "@/ui/first-run-notice.en.html?raw";
import noticeZh from "@/ui/first-run-notice.zh.html?raw";
import { DialogClose } from "@/ui/DialogClose";
import { LicenseText, licenseShortName } from "@/ui/LicenseDialog";
import { useModalTrap } from "@/ui/useModalTrap";

export function FirstRunGuide({
  onDone,
  presentation = "embedded",
}: {
  onDone: () => void;
  presentation?: "embedded" | "full";
}) {
  const t = useT();
  const uiLanguage = useLanguage();
  const [page, setPage] = useState(0);
  const [custom, setCustom] = useState<DistributionOnboarding | null>(null);
  const [profileLegal, setProfileLegal] = useState<DistributionLegal | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);

  useModalTrap(root, { onEscape: onDone });

  useEffect(() => {
    let alive = true;
    void api.distribution
      .onboarding()
      .then((next) => {
        if (alive) setCustom(next);
      })
      .catch(() => {
        if (alive) setCustom(null);
      });
    void api.distribution
      .legal()
      .then((next) => {
        if (alive) setProfileLegal(next);
      })
      .catch(() => {
        if (alive) setProfileLegal(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    primary.current?.focus();
  }, [page]);

  const mode = custom?.mode ?? "default";
  const hasCustom =
    mode !== "default" &&
    mode !== "disabled" &&
    Boolean(custom?.html);
  const pageCount = 3 + (hasCustom ? 1 : 0);
  const customPageIndex =
    hasCustom && (mode === "before-default" || mode === "replace-welcome")
      ? 0
      : hasCustom && mode === "after-default"
        ? 3
        : -1;
  const basePageIndex =
    hasCustom && mode === "before-default"
      ? page - 1
      : hasCustom && (mode === "after-default" || mode === "replace-welcome")
        ? page
        : page;
  const showCustom = hasCustom && page === customPageIndex;
  const sanitizedGuide = useMemo(
    () =>
      custom?.html
        ? DOMPurify.sanitize(custom.html, {
            FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "link", "meta"],
            FORBID_ATTR: ["srcdoc"],
          })
        : "",
    [custom?.html],
  );
  const sanitizedLegalNotice = useMemo(
    () =>
      profileLegal?.notice
        ? DOMPurify.sanitize(profileLegal.notice, {
            FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "link", "meta"],
            FORBID_ATTR: ["srcdoc"],
          })
        : "",
    [profileLegal?.notice],
  );

  const finish = () => onDone();
  const next = () => {
    if (page === pageCount - 1) finish();
    else setPage((value) => value + 1);
  };

  return (
      <div
        className="confirm-backdrop"
        data-window-presentation={presentation}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) finish();
        }}
      >
        <div
          ref={root}
          className="confirm-dialog first-run-dialog"
          data-window-presentation={presentation}
          role="dialog"
          aria-modal="true"
          aria-label={t("Getting started with Nota")}
          tabIndex={-1}
          onMouseDown={(event) => event.stopPropagation()}
          data-page={page}
        >
          {presentation !== "full" && <DialogClose onClose={finish} />}
          <div className="first-run-progress" aria-label={t("Step {0} of {1}", page + 1, pageCount)}>
            {Array.from({ length: pageCount }, (_, index) => (
              <span key={index} data-active={index === page || undefined} />
            ))}
          </div>

          {showCustom && (
            <section className="first-run-page first-run-custom-page">
              <p className="first-run-kicker">{custom?.title ?? t("Welcome")}</p>
              <div
                className="first-run-notice-text first-run-custom-html"
                role="document"
                tabIndex={0}
                dangerouslySetInnerHTML={{ __html: sanitizedGuide }}
              />
            </section>
          )}

          {!showCustom && basePageIndex === 0 && (
            <section className="first-run-page">
              <p className="first-run-kicker">{t("A quick look")}</p>
              <h2>{t("Write Markdown. See the document.")}</h2>
              <p className="first-run-lead">
                {t("Nota is a local-first writing app. Your notes stay ordinary Markdown files.")}
              </p>
              <ul className="first-run-points">
                <li>{t("Formatting appears in place while you type.")}</li>
                <li>{t("Themes and extensions are optional and installed separately.")}</li>
                <li>{t("No account and no telemetry. Your writing stays on your device.")}</li>
              </ul>
            </section>
          )}

          {!showCustom && basePageIndex === 1 && (
            <section className="first-run-page">
              <p className="first-run-kicker">{t("Before you begin")}</p>
              <h2>{t("A short notice")}</h2>
              <p className="first-run-lead">
                {t("The complete notice is shown below. It is an explanation, not a replacement for the license.")}
              </p>
              <div
                className="first-run-notice-text"
                aria-label={t("Nota software notice")}
                role="document"
                tabIndex={0}
                dangerouslySetInnerHTML={{
                  __html: uiLanguage.startsWith("zh") ? noticeZh : noticeEn,
                }}
              />
              {sanitizedLegalNotice && (
                <div
                  className="first-run-notice-text first-run-custom-html"
                  dangerouslySetInnerHTML={{ __html: sanitizedLegalNotice }}
                />
              )}
            </section>
          )}

          {!showCustom && basePageIndex === 2 && (
            <section className="first-run-page">
              <p className="first-run-kicker">{t("Rights and credits")}</p>
              <h2>{t("License and third-party notices")}</h2>
              <p className="first-run-lead">
                {t("The full BSD-2-Clause text is included with Nota. Third-party components keep their own licenses and appear under About → Credits.")}
              </p>
              <div
                className="first-run-notice-text first-run-license-text"
                aria-label={t("{0} License", licenseShortName)}
                role="document"
                tabIndex={0}
              >
                <h1>{t("{0} License", licenseShortName)}</h1>
                <LicenseText />
              </div>
              {profileLegal?.distribution_license && (
                <div className="first-run-notice-text first-run-license-text">
                  <h2>{t("Distribution terms")}</h2>
                  <pre>{profileLegal.distribution_license}</pre>
                </div>
              )}
            </section>
          )}

          <div className="first-run-actions">
            {page < pageCount - 1 ? (
              <button type="button" className="btn first-run-skip" onClick={finish}>
                {t("Skip")}
              </button>
            ) : <span />}
            <div className="first-run-next">
              {page > 0 && (
                <button type="button" className="btn" onClick={() => setPage((value) => value - 1)}>
                  {t("Back")}
                </button>
              )}
              <button ref={primary} type="button" className="btn btn-primary" onClick={next}>
                {page === pageCount - 1 ? t("Start writing") : t("Next")}
              </button>
            </div>
          </div>
        </div>
      </div>
  );
}
